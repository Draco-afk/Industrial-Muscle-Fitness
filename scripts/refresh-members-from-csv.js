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
const { parseCsvRows } = require('./lib/parse-csv');

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

// Columns are read by position, not by header name: the sheet's export has
// come through with six header cells blank (Check-in Count through Freeze
// Start Date) while the data underneath is intact. Keying by name would merge
// those into one field and silently zero every member's check-in count.
const COL = {
  timestamp: 0, fullName: 1, phone: 2, email: 3, package: 4,
  startDate: 5, expiryDate: 6, fingerprintId: 7, status: 8,
  checkInCount: 9, referralCode: 10, referredBy: 11, referralRewardGiven: 12,
  cardChangeCount: 13, freezeStartDate: 14,
  pinCode: 15, pinHash: 16, dob: 17,
  lineUserId: 18, lineLinkCode: 19, expiryLineNotifiedFor: 20,
  birthdayLineNotifiedYear: 21, winbackCouponCode: 22
};

// Positions are only safe if the headers that *are* present sit where expected,
// so check a few anchors and bail out rather than import into the wrong fields.
function assertLayout(header) {
  const anchors = [
    [COL.fullName, 'Full Name'], [COL.phone, 'Phone'], [COL.package, 'Package'],
    [COL.fingerprintId, 'Fingerprint ID'], [COL.pinHash, 'PIN Hash'], [COL.dob, 'Date of Birth']
  ];
  const bad = anchors.filter(([i, expect]) => !(header[i] || '').includes(expect));
  if (bad.length) {
    console.error('Unexpected column layout in this export — aborting so nothing is imported into the wrong field.');
    bad.forEach(([i, expect]) => console.error(`  column ${i}: expected to contain "${expect}", found ${JSON.stringify(header[i] || '')}`));
    console.error('\nFull header:', JSON.stringify(header));
    process.exit(1);
  }
  const blanks = header.map((h, i) => [h, i]).filter(([h]) => !String(h).trim()).map(([, i]) => i);
  if (blanks.length) {
    console.log(`Note: ${blanks.length} header cell(s) are blank in this export (columns ${blanks.join(', ')}).`);
    console.log('      Reading those by position instead — data is unaffected.\n');
  }
}

function rowToDoc(r) {
  const at = (i) => (r[i] === undefined ? '' : r[i]);
  return {
    fullName: normName(at(COL.fullName)),
    phone: normPhone(at(COL.phone)),
    email: at(COL.email),
    package: at(COL.package),
    startDate: at(COL.startDate),
    expiryDate: at(COL.expiryDate),
    fingerprintId: at(COL.fingerprintId),
    status: at(COL.status) || 'Active',
    checkInCount: parseInt(at(COL.checkInCount) || '0', 10) || 0,
    referralCode: at(COL.referralCode),
    referredBy: at(COL.referredBy),
    referralRewardGiven: at(COL.referralRewardGiven),
    cardChangeCount: parseInt(at(COL.cardChangeCount) || '0', 10) || 0,
    freezeStartDate: at(COL.freezeStartDate),
    pinHash: at(COL.pinHash), // already sha256, same algorithm as util/hash.js
    dob: at(COL.dob),
    lineUserId: at(COL.lineUserId),
    lineLinkCode: at(COL.lineLinkCode),
    expiryLineNotifiedFor: at(COL.expiryLineNotifiedFor),
    birthdayLineNotifiedYear: at(COL.birthdayLineNotifiedYear),
    winbackCouponCode: at(COL.winbackCouponCode),
    createdAt: Timestamp.fromDate(parseTimestamp(at(COL.timestamp)))
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

  const allRows = parseCsvRows(fs.readFileSync(CSV_PATH, 'utf8'));
  assertLayout(allRows[0]);
  const rows = allRows.slice(1);
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
