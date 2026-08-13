// One-time migration: data/members.csv -> the `members` Firestore collection.
// Drops the plaintext "PIN Code" column entirely; "PIN Hash" is copied as-is
// since it's already a sha256 hex digest produced by the exact same
// algorithm as util/hash.js, so existing hashes stay valid.
//
// Usage:
//   node scripts/migrate-members-to-firestore.js            -> local emulator (localhost:8080)
//   node scripts/migrate-members-to-firestore.js --prod      -> real project "industrial-muscle-fitness"
//                                                                 (needs `gcloud auth application-default login` first)
'use strict';
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./lib/parse-csv');

const useProd = process.argv.includes('--prod');

if (useProd) {
  process.env.GCLOUD_PROJECT = 'industrial-muscle-fitness';
} else {
  const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-industrial-muscle';
}

const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const db = getFirestore();

const CSV_PATH = path.join(__dirname, '..', 'data', 'members.csv');

function parseTimestamp(raw) {
  // e.g. "8/1/2026 11:01:43" (M/D/YYYY H:mm:ss) -> Date
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function main() {
  const existing = await db.collection('members').limit(1).get();
  if (!existing.empty) {
    console.error(`Aborting: the "members" collection in ${process.env.GCLOUD_PROJECT} already has data. Re-running would create duplicates.`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvText);
  console.log(`Read ${rows.length} members from ${CSV_PATH}`);

  let written = 0;
  for (const r of rows) {
    const doc = {
      fullName: r['ชื่อ-นามสกุล (Full Name)'] || '',
      phone: (r['เบอร์โทรศัพท์ (Phone)'] || '').replace(/[^0-9]/g, ''),
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
      pinHash: r['PIN Hash'] || '', // copied as-is, same sha256 algorithm as util/hash.js
      dob: r['Date of Birth'] || '',
      lineUserId: r['LINE User ID'] || '',
      lineLinkCode: r['LINE Link Code'] || '',
      expiryLineNotifiedFor: r['Expiry LINE Notified For'] || '',
      birthdayLineNotifiedYear: r['Birthday LINE Notified Year'] || '',
      winbackCouponCode: r['Winback Coupon Code'] || '',
      createdAt: Timestamp.fromDate(parseTimestamp(r['วันที่บันทึก (Timestamp)']))
    };
    await db.collection('members').add(doc);
    written++;
  }

  console.log(`Wrote ${written} members to ${useProd ? 'the REAL Firestore project' : 'the local emulator'}: ${process.env.GCLOUD_PROJECT}`);
  console.log('Note: the plaintext "PIN Code" column from the CSV was intentionally NOT migrated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
