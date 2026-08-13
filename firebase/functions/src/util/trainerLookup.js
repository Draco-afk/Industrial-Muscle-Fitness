// Shared helper: trainers are looked up by their human-readable `trainerId`
// code (e.g. "TR1A2B3C") from Bookings/Waitlist, not by Firestore doc ID.
'use strict';
const { db } = require('./admin');

async function getTrainerByCode_(trainerId) {
  const snap = await db.collection('trainers').where('trainerId', '==', trainerId).limit(1).get();
  if (snap.empty) return null;
  return { docId: snap.docs[0].id, ...snap.docs[0].data() };
}

module.exports = { getTrainerByCode_ };
