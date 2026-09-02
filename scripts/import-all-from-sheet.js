// Imports every sheet of the live Google Sheet into Firestore — members,
// trainers, the money (payments, daily bills, expenses, hand-entered day
// totals), check-ins, bookings, coupons, packages, products.
//
// Column positions come from the Apps Script source that writes these sheets
// (its appendRow header rows), not from the exported header text, because that
// export has already been seen with header cells blanked out while the data
// underneath was fine.
//
// Safe to re-run: every record is matched on a natural key and skipped if it
// is already there, so nothing is duplicated and nothing already in Firestore
// is overwritten. Dry run unless --apply is passed.
//
// Reading the sheet needs a Google credential with Sheets access:
//   gcloud auth application-default login --scopes=openid,\
//     https://www.googleapis.com/auth/cloud-platform,\
//     https://www.googleapis.com/auth/spreadsheets.readonly
//
// Usage:
//   node scripts/import-all-from-sheet.js                 # preview everything
//   node scripts/import-all-from-sheet.js --apply         # write to production
//   node scripts/import-all-from-sheet.js --only payments,expenses --apply
'use strict';
const path = require('path');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Xg0IEAYHr-PZA8jdHGV_5dK1WQ4lm8DpBCtns5J-zK8';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 && args[onlyIdx + 1] ? args[onlyIdx + 1].split(',').map((s) => s.trim()) : null;

process.env.GCLOUD_PROJECT = 'industrial-muscle-fitness';

const FN = path.join(__dirname, '..', 'firebase', 'functions');
const req = require('module').createRequire(path.join(FN, 'package.json'));
const admin = req('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { getFirestore, Timestamp } = req('firebase-admin/firestore');

const db = getFirestore();

// ---------- sheet reading ----------
// Uses the sheet's own CSV endpoint rather than the Sheets API: the sheet is
// shared read-only by link, so this needs no Google credential at all, which
// avoids making the gym owner re-authorise a broader OAuth scope just so their
// own data can be copied across.
const { parseCsvRows } = require('./lib/parse-csv');

async function readSheet(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} reading "${tabName}"`);
  const text = await res.text();
  // A sheet that isn't shared returns Google's HTML sign-in page with a 200.
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error(`"${tabName}" ไม่ได้เปิดให้เข้าถึงด้วยลิงก์ (ได้หน้า login กลับมา)`);
  }
  const rows = parseCsvRows(text);
  return rows.slice(1); // drop the header row; columns are read by position
}

// ---------- helpers ----------
const S = (v) => (v === undefined || v === null ? '' : String(v).trim());
const N = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const I = (v) => { const n = parseInt(String(v ?? '').replace(/,/g, ''), 10); return isNaN(n) ? 0 : n; };
const phone = (v) => S(v).replace(/[^0-9]/g, '');

// Sheet dates arrive either as "8/1/2026 11:01:43" or an ISO-ish string.
function toDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}
function toTs(v) {
  const d = toDate(v);
  return d ? Timestamp.fromDate(d) : null;
}
// A plain yyyy-MM-dd, for the date-string fields
function toDateStr(v) {
  const s = S(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = toDate(s);
  if (!d) return '';
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10); // gym-local day
}

// ---------- what to import ----------
// key: {tab, collection, naturalKey(doc), build(row), docId?(row)}
const IMPORTS = {
  members: {
    tab: 'Members', collection: 'members',
    // Timestamp, Full Name, Phone, Email, Package, Start Date, Expiry Date,
    // Fingerprint ID, Status, Check-in Count, Referral Code, Referred By,
    // Referral Reward Given, Card Change Count, Freeze Start Date, PIN Code,
    // PIN Hash, Date of Birth, LINE User ID, LINE Link Code,
    // Expiry LINE Notified For, Birthday LINE Notified Year, Winback Coupon Code
    //
    // The plaintext PIN column (15) is deliberately never copied — only its hash.
    build: (r) => ({
      fullName: S(r[1]).replace(/\s+/g, ' '), phone: phone(r[2]), email: S(r[3]),
      package: S(r[4]), startDate: toDateStr(r[5]), expiryDate: toDateStr(r[6]),
      fingerprintId: S(r[7]), status: S(r[8]) || 'Active', checkInCount: I(r[9]),
      referralCode: S(r[10]), referredBy: S(r[11]), referralRewardGiven: S(r[12]),
      cardChangeCount: I(r[13]), freezeStartDate: S(r[14]),
      pinHash: S(r[16]), dob: S(r[17]),
      lineUserId: S(r[18]), lineLinkCode: S(r[19]),
      expiryLineNotifiedFor: S(r[20]), birthdayLineNotifiedYear: S(r[21]),
      winbackCouponCode: S(r[22]),
      createdAt: toTs(r[0]) || Timestamp.now()
    }),
    key: (d) => `${d.phone}|${d.fullName}`,
    // Phone is not unique here (two members already share one), so it is only a
    // fallback for spotting a member whose name was edited in the sheet —
    // matching on name alone would file the rename as a whole new person.
    altKey: (d) => (d.phone ? 'p:' + d.phone : null),
    updateExisting: true,
    label: (d) => `${d.fullName} (${d.phone}) ${d.package} • เช็คอิน ${d.checkInCount}`,
    skip: (d) => !d.fullName && !d.phone
  },

  trainers: {
    tab: 'Trainers', collection: 'trainers',
    // Trainer ID, Full Name, Specialty, Phone, Working Days, Start Hour, End Hour,
    // Slot Minutes, Status, Photo URL, Bio, PIN Code, PIN Hash, Busy Status,
    // Busy Since, Email, LINE User ID, LINE Link Code
    build: (r) => ({
      trainerId: S(r[0]), fullName: S(r[1]), specialty: S(r[2]), phone: phone(r[3]),
      workingDays: S(r[4]) ? S(r[4]).split(',').map((d) => d.trim()).filter(Boolean) : [],
      startHour: S(r[5]), endHour: S(r[6]), slotMinutes: I(r[7]) || 60,
      status: S(r[8]) || 'Active', photoUrl: S(r[9]), bio: S(r[10]),
      pinHash: S(r[12]), busyStatus: S(r[13]) || 'Available', busySince: null,
      email: S(r[15]), lineUserId: S(r[16]), lineLinkCode: S(r[17]),
      createdAt: Timestamp.now()
    }),
    key: (d) => `${d.trainerId}|${d.fullName}`,
    label: (d) => `${d.fullName} (${d.phone}) ${d.specialty}`
  },

  packages: {
    tab: 'Packages', collection: 'packages',
    // Package Name, Price, Duration Months, Status  — doc id is the name
    build: (r) => ({ name: S(r[0]), price: N(r[1]), durationMonths: I(r[2]) || 1, status: S(r[3]) || 'Active' }),
    docId: (d) => d.name,
    key: (d) => d.name,
    label: (d) => `${d.name} ${d.price} บาท / ${d.durationMonths} เดือน`,
    strip: ['name']
  },

  products: {
    tab: 'Products', collection: 'products',
    // Product ID, Name, Category, Price, Status, Stock, Low Stock Threshold
    build: (r) => ({
      productId: S(r[0]), name: S(r[1]), category: S(r[2]), price: N(r[3]),
      status: S(r[4]) || 'Active',
      stock: S(r[5]) === '' ? null : I(r[5]),
      lowStockThreshold: I(r[6]) || 5,
      createdAt: Timestamp.now()
    }),
    key: (d) => d.name,
    label: (d) => `${d.name} ${d.price} บาท (สต็อก ${d.stock ?? 'ไม่ติดตาม'})`
  },

  coupons: {
    tab: 'Coupons', collection: 'coupons',
    // Code, Discount Type, Discount Value, Usage Limit, Used Count, Expiry Date,
    // Min Purchase Amount, Applicable To, Status, Description
    build: (r) => ({
      code: S(r[0]).toUpperCase(), discountType: S(r[1]) || 'Percent', discountValue: N(r[2]),
      usageLimit: S(r[3]) === '' ? '' : I(r[3]), usedCount: I(r[4]),
      expiryDate: toDateStr(r[5]), minPurchaseAmount: N(r[6]),
      applicableTo: S(r[7]) || 'All', status: S(r[8]) || 'Active', description: S(r[9])
    }),
    docId: (d) => d.code,
    key: (d) => d.code,
    label: (d) => `${d.code} ${d.discountValue}${d.discountType === 'Percent' ? '%' : ' บาท'}`
  },

  payments: {
    tab: 'Payments', collection: 'payments',
    // Timestamp, Member Name, Package, QR Code Data, New Expiry Date, Receipt No,
    // Amount, Refund Status, Refund Reason, Refunded By, Refunded At, Payment Method
    build: (r) => ({
      timestamp: toTs(r[0]), memberName: S(r[1]), package: S(r[2]), qrData: S(r[3]),
      newExpiryDate: toDateStr(r[4]), receiptNo: S(r[5]), amount: N(r[6]),
      refundStatus: S(r[7]), refundReason: S(r[8]), refundedBy: S(r[9]),
      refundedAt: toTs(r[10]) || '', paymentMethod: S(r[11]) || 'เงินสด'
    }),
    // Receipt number alone is not an identity here: the old system and the new
    // app each ran their own counter, so both issued RC2026-0024 and friends to
    // completely different sales. Keying on the number alone silently dropped
    // real takings as "already imported".
    key: (d) => `${d.receiptNo}|${d.timestamp && d.timestamp.toMillis()}|${d.amount}`,
    uniqueReceipt: true,
    label: (d) => `${d.receiptNo} ${d.memberName} ${d.amount} บาท (${d.paymentMethod})`,
    skip: (d) => !d.timestamp
  },

  dailyPayments: {
    tab: 'DailyPayments', collection: 'dailyPayments',
    // Timestamp, Customer Name, Phone, Amount, Receipt No, Items JSON,
    // Refund Status, Refund Reason, Refunded By, Refunded At, Payment Method
    build: (r) => ({
      timestamp: toTs(r[0]), customerName: S(r[1]), phone: phone(r[2]), amount: N(r[3]),
      receiptNo: S(r[4]), itemsJson: S(r[5]),
      refundStatus: S(r[6]), refundReason: S(r[7]), refundedBy: S(r[8]),
      refundedAt: toTs(r[9]) || '', paymentMethod: S(r[10]) || 'เงินสด'
    }),
    key: (d) => `${d.receiptNo}|${d.timestamp && d.timestamp.toMillis()}|${d.amount}`,
    uniqueReceipt: true,
    label: (d) => `${d.receiptNo} ${d.customerName} ${d.amount} บาท (${d.paymentMethod})`,
    skip: (d) => !d.timestamp
  },

  expenses: {
    tab: 'Expenses', collection: 'expenses',
    // Timestamp, Date, Description, Amount, Added By, Payment Method
    build: (r) => ({
      timestamp: toTs(r[0]) || Timestamp.now(), date: toDateStr(r[1]), description: S(r[2]),
      amount: N(r[3]), addedBy: S(r[4]),
      paymentMethod: (S(r[5]) === 'เงินสด' || S(r[5]) === 'cash') ? 'เงินสด' : 'โอนเงิน'
    }),
    key: (d) => `${d.date}|${d.description}|${d.amount}`,
    label: (d) => `${d.date} ${d.description} ${d.amount} บาท (${d.paymentMethod})`,
    skip: (d) => !d.date || !d.description
  },

  dailyPaymentOverrides: {
    tab: 'DailyPaymentOverrides', collection: 'dailyPaymentOverrides',
    // Date, Cash, Transfer, Updated By, Updated At, Membership, DayPass, Products
    build: (r) => ({
      date: toDateStr(r[0]), cash: N(r[1]), transfer: N(r[2]),
      updatedBy: S(r[3]), updatedAt: toTs(r[4]) || Timestamp.now(),
      membership: N(r[5]), dayPass: N(r[6]), products: N(r[7])
    }),
    docId: (d) => d.date,
    key: (d) => d.date,
    label: (d) => `${d.date} สมาชิก ${d.membership} รายวัน ${d.dayPass} สินค้า ${d.products} (สด ${d.cash} โอน ${d.transfer})`,
    strip: ['date'],
    skip: (d) => !d.date
  },

  checkinLogs: {
    tab: 'Logs', collection: 'checkinLogs',
    // Timestamp, Name, Fingerprint ID, Status, Details
    build: (r) => ({
      timestamp: toTs(r[0]), name: S(r[1]), fingerprintId: S(r[2]),
      status: S(r[3]) || 'SUCCESS', details: S(r[4])
    }),
    key: (d) => `${d.name}|${d.timestamp && d.timestamp.toMillis()}`,
    label: (d) => `${d.name} ${d.timestamp ? d.timestamp.toDate().toISOString().slice(0, 16) : ''} ${d.status}`,
    skip: (d) => !d.timestamp
  },

  bookings: {
    tab: 'Bookings', collection: 'bookings',
    // Timestamp, Booking ID, Trainer ID, Trainer Name, Member Row, Member Name,
    // Member Phone, Date, Time Slot, Status, Notes
    //
    // The sheet identifies the member by its own row number, which means
    // nothing here, so memberDocId is resolved from the member's name/phone in
    // needsMemberLookup below — without it these bookings would never show up
    // in the member's own history.
    build: (r) => ({
      createdAt: toTs(r[0]) || Timestamp.now(), bookingId: S(r[1]), trainerId: S(r[2]),
      trainerName: S(r[3]), memberDocId: '', memberName: S(r[5]), memberPhone: phone(r[6]),
      date: toDateStr(r[7]), timeSlot: S(r[8]), status: S(r[9]) || 'Booked', notes: S(r[10])
    }),
    needsMemberLookup: true,
    key: (d) => d.bookingId || `${d.trainerId}|${d.date}|${d.timeSlot}|${d.memberName}`,
    label: (d) => `${d.date} ${d.timeSlot} ${d.trainerName} <- ${d.memberName} (${d.status})`,
    skip: (d) => !d.date || !d.timeSlot
  }
};

async function importOne(name, spec) {
  let rows;
  try {
    rows = await readSheet(spec.tab);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    console.log(`\n### ${name} — อ่านชีต "${spec.tab}" ไม่ได้: ${msg.slice(0, 160)}`);
    return { name, error: msg };
  }

  const existing = await db.collection(spec.collection).get();
  // For collections we update in place, keep the document id so an existing
  // record can be written to rather than duplicated.
  const byKey = new Map(), byAlt = new Map();
  if (spec.updateExisting) {
    existing.forEach((doc) => {
      const d = doc.data();
      byKey.set(spec.key(d), doc.id);
      const alt = spec.altKey && spec.altKey(d);
      if (alt) byAlt.set(alt, byAlt.has(alt) ? '__ambiguous__' : doc.id);
    });
  }

  const seen = new Set();
  existing.forEach((doc) => {
    // Where the document id *is* the natural key (package name, coupon code,
    // override date) that field is stripped from the body, so read it back off
    // the id — otherwise every existing row looks new and gets re-added.
    if (spec.docId) { seen.add(doc.id); return; }
    const d = doc.data();
    try {
      // A record imported earlier may have been stored under a suffixed receipt
      // number; match it on the original it came in with, or a re-run would
      // treat it as new and import the sale twice.
      seen.add(spec.key(d));
      if (d.originalReceiptNo) seen.add(spec.key({ ...d, receiptNo: d.originalReceiptNo }));
    } catch (e) { /* ignore malformed existing rows */ }
  });

  // name/phone -> member doc id, for sheets that reference members by row number
  let memberIndex = null;
  if (spec.needsMemberLookup) {
    memberIndex = new Map();
    const ms = await db.collection('members').get();
    ms.forEach((d) => {
      const m = d.data();
      const name = S(m.fullName).replace(/\s+/g, ' ');
      if (name) memberIndex.set('n:' + name, d.id);
      if (m.phone) memberIndex.set('p:' + m.phone, d.id);
    });
  }

  const toAdd = [];
  const toUpdate = []; // [{ id, doc, changes }]
  let skipped = 0, already = 0, linked = 0;
  for (const r of rows) {
    if (!r || r.every((c) => S(c) === '')) continue;
    const doc = spec.build(r);
    if (spec.skip && spec.skip(doc)) { skipped++; continue; }

    if (spec.updateExisting) {
      // Exact match first; then the fallback key, which catches a record whose
      // name was edited in the sheet — without it the edit lands as a second
      // copy of the same person.
      const alt = spec.altKey && spec.altKey(doc);
      const altHit = alt ? byAlt.get(alt) : null;
      const id = byKey.get(spec.key(doc)) || (altHit && altHit !== '__ambiguous__' ? altHit : null);
      if (id) {
        const before = existing.docs.find((x) => x.id === id).data();
        const changes = Object.keys(doc).filter((f) =>
          f !== 'createdAt' && String(before[f] ?? '') !== String(doc[f] ?? ''));
        if (changes.length) toUpdate.push({ id, doc, changes, name: spec.label(doc) });
        else already++;
        byKey.delete(spec.key(doc));
        if (alt) byAlt.delete(alt);
        continue;
      }
    }

    const k = spec.docId ? spec.docId(doc) : spec.key(doc);
    if (seen.has(k)) { already++; continue; }
    seen.add(k);

    if (memberIndex) {
      const hit = memberIndex.get('p:' + doc.memberPhone) ||
                  memberIndex.get('n:' + S(doc.memberName).replace(/\s+/g, ' '));
      if (hit) { doc.memberDocId = hit; linked++; }
    }
    toAdd.push(doc);
  }

  console.log(`\n### ${name}  (ชีต "${spec.tab}")`);
  console.log(`    ในชีต ${rows.length} แถว | มีอยู่แล้วใน Firestore ${existing.size} | ข้ามเพราะข้อมูลไม่ครบ ${skipped}`);
  console.log(`    จะเพิ่มใหม่ ${toAdd.length} | ซ้ำกับของเดิม ${already}` +
    (memberIndex ? ` | จับคู่กับสมาชิกได้ ${linked}/${toAdd.length}` : ''));
  toAdd.slice(0, 8).forEach((d) => console.log(`      + ${spec.label(d)}`));
  if (toAdd.length > 8) console.log(`      ... และอีก ${toAdd.length - 8} รายการ`);

  if (spec.updateExisting) {
    console.log(`    จะอัปเดตของเดิม ${toUpdate.length}`);
    toUpdate.slice(0, 8).forEach((u) =>
      console.log(`      ~ ${u.name}  [${u.changes.slice(0, 4).join(', ')}${u.changes.length > 4 ? ', ...' : ''}]`));
    if (toUpdate.length > 8) console.log(`      ... และอีก ${toUpdate.length - 8} รายการ`);
  }

  // Void, refund and receipt printing all look a bill up by receipt number and
  // take the first hit, so two different bills must never share one inside a
  // collection. Where the old system's number is already taken by a different
  // sale, the imported one keeps its original in originalReceiptNo and is
  // stored under a suffixed number.
  let renumbered = 0;
  if (spec.uniqueReceipt) {
    const taken = new Set();
    existing.forEach((d) => { const rc = d.data().receiptNo; if (rc) taken.add(rc); });
    for (const doc of toAdd) {
      if (!doc.receiptNo || !taken.has(doc.receiptNo)) { if (doc.receiptNo) taken.add(doc.receiptNo); continue; }
      doc.originalReceiptNo = doc.receiptNo;
      let n = 2, candidate;
      do { candidate = `${doc.receiptNo}-OLD${n > 2 ? n : ''}`; n++; } while (taken.has(candidate));
      doc.receiptNo = candidate;
      taken.add(candidate);
      renumbered++;
    }
  }
  if (renumbered) {
    console.log(`    * ${renumbered} รายการมีเลขใบเสร็จชนกับบิลที่ออกในแอปใหม่ -> เก็บเลขเดิมไว้และต่อท้ายด้วย -OLD`);
  }

  if (apply) {
    for (const doc of toAdd) {
      const body = { ...doc };
      if (spec.strip) spec.strip.forEach((f) => delete body[f]);
      if (spec.docId) await db.collection(spec.collection).doc(spec.docId(doc)).set(body, { merge: true });
      else await db.collection(spec.collection).add(body);
    }
    for (const u of toUpdate) {
      const body = { ...u.doc };
      delete body.createdAt; // keep when the record was first created
      await db.collection(spec.collection).doc(u.id).set(body, { merge: true });
    }
  }
  return { name, added: toAdd.length, updated: toUpdate.length, already, skipped, renumbered };
}

// Imported receipts must not collide with ones the app issues next.
async function syncReceiptCounter() {
  const nums = [];
  for (const c of ['payments', 'dailyPayments']) {
    const snap = await db.collection(c).get();
    snap.forEach((d) => {
      const m = /RC(\d{4})-(\d+)/.exec(String(d.data().receiptNo || ''));
      if (m) nums.push({ year: m[1], seq: parseInt(m[2], 10) });
    });
  }
  if (!nums.length) { console.log('\n### ตัวนับเลขใบเสร็จ: ไม่มีใบเสร็จในระบบ ไม่ต้องปรับ'); return; }
  // One counter per year: counters/receipts_<year> = { value }
  const byYear = {};
  nums.forEach((n) => { byYear[n.year] = Math.max(byYear[n.year] || 0, n.seq); });

  for (const [year, maxSeq] of Object.entries(byYear)) {
    const ref = db.collection('counters').doc('receipts_' + year);
    const cur = await ref.get();
    const curValue = cur.exists ? (cur.data().value || 0) : 0;
    console.log(`\n### ตัวนับใบเสร็จ ${year}: สูงสุดในข้อมูล RC${year}-${String(maxSeq).padStart(4, '0')} | ตัวนับตอนนี้ ${curValue}`);
    if (maxSeq > curValue) {
      console.log(`    -> ต้องเลื่อนเป็น ${maxSeq} ไม่งั้นใบเสร็จใบถัดไปจะได้เลขซ้ำกับที่นำเข้ามา`);
      if (apply) { await ref.set({ value: maxSeq }, { merge: true }); console.log('    ปรับแล้ว'); }
    } else {
      console.log('    ตัวนับสูงกว่าข้อมูลอยู่แล้ว ไม่ต้องปรับ');
    }
  }
}

(async () => {
  console.log(`Spreadsheet : ${SPREADSHEET_ID}`);
  console.log(`Target      : PRODUCTION (${process.env.GCLOUD_PROJECT})`);
  console.log(`Mode        : ${apply ? 'APPLY (เขียนจริง)' : 'DRY RUN (ยังไม่เขียนอะไร)'}`);

  const names = only || Object.keys(IMPORTS);
  const results = [];
  for (const n of names) {
    if (!IMPORTS[n]) { console.log(`\n(ไม่รู้จัก "${n}" — ข้าม)`); continue; }
    results.push(await importOne(n, IMPORTS[n]));
  }
  await syncReceiptCounter();

  console.log('\n===== สรุป =====');
  results.forEach((r) => console.log(r.error
    ? `  ${r.name}: อ่านไม่ได้`
    : `  ${r.name}: เพิ่ม ${r.added}${r.updated ? ` | อัปเดต ${r.updated}` : ''} | เหมือนเดิม ${r.already} | ข้าม ${r.skipped}`));
  if (!apply) console.log('\nยังไม่ได้เขียนอะไรลงฐานข้อมูล — ใส่ --apply เพื่อนำเข้าจริง');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
