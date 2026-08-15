// Refreshes the `members` collection from a fresh export of the Members sheet.
//
// Unlike migrate-members-to-firestore.js (first import only, refuses to run
// twice), this syncs: existing members are updated in place so their document
// id survives, new rows are added, and rows that vanished from the sheet are
// only reported — never deleted, since a missing row is more often an export
// glitch than a real deletion, and bookings/payments may point at that member.
//
// Dry run by default. Nothing is written until you pass --apply.
//
// Usage:
//   node scripts/refresh-members-from-csv.js                    # preview against the emulator
//   node scripts/refresh-members-from-csv.js --prod             # preview against production
//   node scripts/refresh-members-from-csv.js --prod --apply     # actually write to production
//   node scripts/refresh-members-from-csv.js --prod --apply --csv path/to/export.csv
'use strict';
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./lib/parse-csv');

const args = process.argv.slice(2);
const useProd = args.includes('--prod');
const apply = args.includes('--apply');
const csvArgIdx = args.indexOf('--csv');
const CSV_PATH = csvArgIdx !== -1 && args[csvArgIdx + 1]
  ? path.resolve(args[csvArgIdx + 1])
  : path.join(__dirname, '..', 'data', 'members.csv');

if (useProd) {
  process.env.GCLOUD_PROJECT = 'industrial-muscle-fitness';
} else {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'industrial-muscle-fitness';
}

// firebase-admin is a dependency of the Cloud Functions package, not of the
// repo root, so resolve it from there instead of relying on NODE_PATH.
const FUNCTIONS_DIR = path.join(__dirname, '..', 'firebase', 'functions');
const req = require('module').createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
const admin = req('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { getFirestore, Timestamp } = req('firebase-admin/firestore');
const db = getFirestore();

const normPhone = (s) => (s || '').toString().replace(/[^0-9]/g, '');
const normName = (s) => (s || '').toString().trim().replace(/\s+/g, ' ');
// Phone alone isn't unique in this data (two members already share one), so the
// identity key pairs it with the name.
const keyOf = (phone, name) => `${normPhone(phone)}|${normName(name)}`;

function parseTimestamp(raw) {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

function rowToDoc(r) {
  return {
    fullName: normName(r['ชื่อ-นามสกุล (Full Name)']),
    phone: normPhone(r['เบอร์โทรศัพท์ (Phone)']),
    email: r['อีเมล (Email)'] || '',
    package: r['แพ็กเกจ (Package)'] || '',
    startDate: r['วันเริ่มคุ้มครอง (Start Date)'] || '',
    expiryDate: r['วันหมดอายุ (Expiry Date)'] || '',
    fingerprintId: r['Fingerprint ID'] || '',
    status: r['สถานะ (Status)'] || 'Active',
    checkInCount: parseInt(r['Check-in Count'] || '0', 10) || 0,
    referralCode: r['Referral Code'] || '',
    referredBy: r['Referred By'] || '',
    referralRewardGiven: r['Referral Reward Given'] || '',
    cardChangeCount: parseInt(r['Card Change Count'] || '0', 10) || 0,
    freezeStartDate: r['Freeze Start Date'] || '',
    pinHash: r['PIN Hash'] || '', // already sha256, same algorithm as util/hash.js
    dob: r['Date of Birth'] || '',
    lineUserId: r['LINE User ID'] || '',
    lineLinkCode: r['LINE Link Code'] || '',
    expiryLineNotifiedFor: r['Expiry LINE Notified For'] || '',
    birthdayLineNotifiedYear: r['Birthday LINE Notified Year'] || '',
    winbackCouponCode: r['Winback Coupon Code'] || '',
    createdAt: Timestamp.fromDate(parseTimestamp(r['วันที่บันทึก (Timestamp)']))
  };
}

// Fields worth reporting when they differ; createdAt is excluded because the
// sheet's timestamp format round-trips imprecisely and isn't meaningful to diff.
const TRACKED = ['fullName', 'phone', 'email', 'package', 'startDate', 'expiryDate',
  'fingerprintId', 'status', 'checkInCount', 'pinHash', 'dob', 'lineUserId'];

function diffOf(before, after) {
  const changes = [];
  for (const f of TRACKED) {
    const a = before[f] === undefined ? '' : before[f];
    const b = after[f] === undefined ? '' : after[f];
    if (String(a) !== String(b)) changes.push(`${f}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
  return changes;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Sheet export : ${CSV_PATH}`);
  console.log(`Target       : ${useProd ? 'PRODUCTION (industrial-muscle-fitness)' : 'emulator ' + process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`Mode         : ${apply ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Rows in sheet: ${rows.length}\n`);

  const snap = await db.collection('members').get();
  const byKey = new Map();
  snap.forEach((d) => byKey.set(keyOf(d.data().phone, d.data().fullName), { id: d.id, data: d.data() }));
  console.log(`Members currently in Firestore: ${snap.size}\n`);

  const added = [], updated = [], unchanged = [];
  const seen = new Set();

  for (const r of rows) {
    const doc = rowToDoc(r);
    if (!doc.fullName && !doc.phone) continue; // skip blank trailing rows
    const key = keyOf(doc.phone, doc.fullName);
    seen.add(key);
    const existing = byKey.get(key);

    if (!existing) {
      added.push(doc);
      if (apply) await db.collection('members').add(doc);
      continue;
    }

    const changes = diffOf(existing.data, doc);
    if (!changes.length) { unchanged.push(doc.fullName); continue; }

    updated.push({ name: doc.fullName, changes });
    if (apply) {
      // merge keeps any Firebase-only fields (e.g. a PIN the member changed in
      // the new app) from being dropped by a field the sheet doesn't carry.
      await db.collection('members').doc(existing.id).set(doc, { merge: true });
    }
  }

  const missing = [...byKey.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => v.data.fullName);

  console.log(`--- ADDED (${added.length}) ---`);
  added.forEach((m) => console.log(`  + ${m.fullName} (${m.phone}) ${m.package}`));
  console.log(`\n--- UPDATED (${updated.length}) ---`);
  updated.forEach((u) => { console.log(`  ~ ${u.name}`); u.changes.forEach((c) => console.log(`      ${c}`)); });
  console.log(`\n--- UNCHANGED (${unchanged.length}) ---`);
  console.log(`\n--- IN FIRESTORE BUT NOT IN THE SHEET (${missing.length}) — left untouched ---`);
  missing.forEach((n) => console.log(`  ? ${n}`));

  console.log(`\n${apply ? 'Applied.' : 'Nothing written. Re-run with --apply to write these changes.'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
