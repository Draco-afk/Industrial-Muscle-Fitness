// End-to-end verification for Packages + Trainers + Bookings against the
// running local emulator suite. Same HTTP-direct approach as
// verify-firebase-emulator.js (no client SDK needed).
'use strict';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'industrial-muscle-fitness';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_HOST = 'localhost:8080';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
const admin = require('firebase-admin');
admin.initializeApp({ projectId: PROJECT_ID });

let pass = 0, fail = 0;
function check(name, condition, detail) {
  if (condition) { console.log(`✅ PASS  ${name}`); pass++; }
  else { console.log(`❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function callFunction(name, data, idToken) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data })
  });
  return (await res.json());
}

async function signInWithCustomToken(customToken) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  return (await res.json()).idToken;
}

async function main() {
  // Admin session (assumes admin/admin=test1234 seeded, per README instructions).
  const adminLogin = await callFunction('loginAdmin', { user: 'admin', pass: 'test1234' });
  check('admin login works', adminLogin.result?.success === true, JSON.stringify(adminLogin));
  const adminIdToken = await signInWithCustomToken(adminLogin.result.token);

  // Member session (known seeded phone/PIN pair).
  const memberLogin = await callFunction('loginMember', { phone: '0877740855', pin: '0001' });
  check('member login works', memberLogin.result?.success === true, JSON.stringify(memberLogin));
  const memberIdToken = await signInWithCustomToken(memberLogin.result.token);

  // --- Packages ---
  const pkgName = 'VerifyTestPackage-' + Date.now();
  const addPkg = await callFunction('addPackageData', { name: pkgName, price: 500, durationMonths: 1 }, adminIdToken);
  check('addPackageData succeeds', addPkg.result?.success === true, JSON.stringify(addPkg));
  const pkgList = await callFunction('getPackageList', {}, adminIdToken);
  check('new package appears in getPackageList', pkgList.result?.some((p) => p.name === pkgName), JSON.stringify(pkgList.result?.length));

  // --- Trainers ---
  const trainerName = 'ครูเทรน ทดสอบ';
  const addTrainer = await callFunction('addTrainerData', {
    fullName: trainerName, specialty: 'Weight Training', phone: '0888888899',
    workingDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    startHour: '08:00', endHour: '20:00', slotMinutes: 60
  }, adminIdToken);
  check('addTrainerData succeeds', addTrainer.result?.success === true, JSON.stringify(addTrainer));
  const trainerId = addTrainer.result.trainerId;

  const trainerLoginFail = await callFunction('loginTrainer', { phone: '0888888899', pin: '9999' });
  check('loginTrainer fails with wrong PIN', trainerLoginFail.result?.success === false, JSON.stringify(trainerLoginFail));
  const trainerLogin = await callFunction('loginTrainer', { phone: '0888888899', pin: '1234' });
  check('loginTrainer succeeds with default bootstrap PIN 1234', trainerLogin.result?.success === true, JSON.stringify(trainerLogin));
  const trainerIdToken = await signInWithCustomToken(trainerLogin.result.token);

  const trainerProfile = await callFunction('getTrainerOwnProfile', {}, trainerIdToken);
  check('trainer can read own profile', trainerProfile.result?.fullName === trainerName, JSON.stringify(trainerProfile));

  // --- Bookings ---
  const dateStr = new Date().toISOString().slice(0, 10);
  const slots = await callFunction('getTrainerAvailableSlots', { trainerId, dateStr }, memberIdToken);
  check('member sees available slots for the new trainer', slots.result?.success === true && slots.result.slots.length > 0, JSON.stringify(slots.result));

  const targetSlot = slots.result.slots[slots.result.slots.length - 1]; // pick a late slot, unlikely to be "already passed"
  const book1 = await callFunction('bookTrainerSlot', { trainerId, dateStr, timeSlot: targetSlot }, memberIdToken);
  check('member books a slot successfully', book1.result?.success === true, JSON.stringify(book1));

  const book2 = await callFunction('bookTrainerSlot', { trainerId, dateStr, timeSlot: targetSlot }, memberIdToken);
  check('double-booking the same slot fails', book2.result?.success === false, JSON.stringify(book2));

  const myBookings = await callFunction('getMyBookings', {}, memberIdToken);
  check('booking appears in getMyBookings', myBookings.result?.some((b) => b.timeSlot === targetSlot && b.status === 'Booked'), JSON.stringify(myBookings.result));

  const allBookings = await callFunction('getAllBookings', {}, adminIdToken);
  check('booking appears in admin getAllBookings', allBookings.result?.some((b) => b.timeSlot === targetSlot), JSON.stringify(allBookings.result?.length));

  const trainerBookings = await callFunction('getTrainerOwnBookings', {}, trainerIdToken);
  check('booking appears in trainer own bookings', trainerBookings.result?.some((b) => b.timeSlot === targetSlot), JSON.stringify(trainerBookings.result));

  const bookingId = myBookings.result.find((b) => b.timeSlot === targetSlot).bookingId;
  const cancel = await callFunction('cancelMyBooking', { bookingId }, memberIdToken);
  check('member cancels own booking', cancel.result?.success === true, JSON.stringify(cancel));

  const afterCancel = await callFunction('getMyBookings', {}, memberIdToken);
  check('cancelled booking shows status Cancelled', afterCancel.result?.find((b) => b.bookingId === bookingId)?.status === 'Cancelled', JSON.stringify(afterCancel.result));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
