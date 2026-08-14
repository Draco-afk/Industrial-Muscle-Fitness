// Ported from apps-script-source-refactored/08_Payments_Membership.js —
// getNextReceiptNumber_. LockService.getScriptLock() -> a Firestore
// transaction on a per-year counter doc (same atomicity guarantee).
'use strict';
const { db } = require('./admin');

async function getNextReceiptNumber_() {
  const yearPart = new Date().getFullYear().toString();
  const ref = db.collection('counters').doc('receipts_' + yearPart);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? snap.data().value : 0) + 1;
    tx.set(ref, { value: current }, { merge: true });
    return 'RC' + yearPart + '-' + ('0000' + current).slice(-4);
  });
}

module.exports = { getNextReceiptNumber_ };
