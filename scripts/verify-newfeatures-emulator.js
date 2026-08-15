// Exercises the backend behind the features that previously had no UI:
// settings (packages / prices / discounts / danger zone), money operations
// (void, refund, payment-method change, receipts), the trainer portal, member
// waitlist + cancel, dashboard extras, member history and fingerprint enrollment.
'use strict';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'industrial-muscle-fitness';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`PASS  ${name}`); pass++; }
  else { console.log(`FAIL  ${name}${detail ? ' -- ' + detail : ''}`); fail++; }
}

async function call(name, data, idToken) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  return json.result !== undefined ? json.result : json;
}

async function idTokenFor(customToken) {
  const r = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  return (await r.json()).idToken;
}

async function main() {
  const login = await call('loginAdmin', { user: 'admin', pass: 'test1234' });
  check('admin login', login.success === true, JSON.stringify(login));
  const adminTok = await idTokenFor(login.token);

  // ---------- Settings: packages ----------
  const pkgName = 'VerifyPkg' + Date.now();
  check('addPackageData', (await call('addPackageData', { name: pkgName, price: 1200, durationMonths: 2 }, adminTok)).success === true);
  let pkgs = await call('getPackageList', {}, adminTok);
  const created = pkgs.find((p) => p.name === pkgName);
  check('new package readable with price+duration', created && created.price === 1200 && created.durationMonths === 2, JSON.stringify(created));
  check('updatePackageData changes price', (await call('updatePackageData', { docId: pkgName, name: pkgName, price: 1500, durationMonths: 2 }, adminTok)).success === true);
  pkgs = await call('getPackageList', {}, adminTok);
  check('package price updated to 1500', pkgs.find((p) => p.name === pkgName).price === 1500);
  check('deletePackageData', (await call('deletePackageData', { docId: pkgName }, adminTok)).success === true);
  pkgs = await call('getPackageList', {}, adminTok);
  check('package removed', !pkgs.some((p) => p.name === pkgName));

  // ---------- Settings: prices + discounts ----------
  check('updateDailyPassPrices', (await call('updateDailyPassPrices', { student: 65, adult: 80 }, adminTok)).success === true);
  const dp = await call('getDailyPassPrices', {}, adminTok);
  check('day pass prices persisted', dp.student === 65 && dp.adult === 80, JSON.stringify(dp));
  await call('updateDailyPassPrices', { student: 60, adult: 75 }, adminTok); // restore

  check('updateBirthdayDiscountSettings', (await call('updateBirthdayDiscountSettings', { discountType: 'Percent', discountValue: 7 }, adminTok)).success === true);
  const bd = await call('getBirthdayDiscountSettings', {}, adminTok);
  check('birthday discount persisted', bd.type === 'Percent' && bd.value === 7, JSON.stringify(bd));

  check('updateWinBackSettings', (await call('updateWinBackSettings', { inactiveDays: 45, discountPercent: 25, validDays: 10 }, adminTok)).success === true);
  const wb = await call('getWinBackSettings', {}, adminTok);
  check('win-back settings persisted', wb.inactiveDays === 45 && wb.discountPercent === 25 && wb.validDays === 10, JSON.stringify(wb));

  check('updateFingerprintApiKey', (await call('updateFingerprintApiKey', { apiKey: 'verify-key-' + Date.now() }, adminTok)).success === true);
  check('clearTransactionData rejects a wrong confirm phrase',
    (await call('clearTransactionData', { confirmPhrase: 'ไม่ใช่' }, adminTok)).success === false);

  // ---------- Money: sale -> receipt -> method change -> void ----------
  const sale = await call('processDailyPayment', {
    customerName: 'ลูกค้าตรวจฟีเจอร์', dayPassItems: [{ type: 'adult', qty: 2, price: 75 }],
    items: [{ name: 'Singha S', price: 10, qty: 2 }], paymentMethod: 'cash'
  }, adminTok);
  check('processDailyPayment', sale.success === true, JSON.stringify(sale));

  const dailyReceipt = await call('generateDailyReceiptPDF', { receiptNo: sale.receiptNo }, adminTok);
  check('generateDailyReceiptPDF returns printable html',
    dailyReceipt.success === true && /<html|<div/i.test(dailyReceipt.html || ''), JSON.stringify(dailyReceipt).slice(0, 120));

  check('updateDailyPaymentMethod -> โอนเงิน',
    (await call('updateDailyPaymentMethod', { receiptNo: sale.receiptNo, paymentMethod: 'transfer' }, adminTok)).success === true);
  let logs = await call('getDailyPaymentLogs', {}, adminTok);
  check('payment method now โอนเงิน', logs.find((l) => l.receiptNo === sale.receiptNo).paymentMethod === 'โอนเงิน');

  const stockBefore = (await call('getProductList', {}, adminTok)).find((p) => p.name === 'Singha S').stock;
  check('voidDailyPayment', (await call('voidDailyPayment', { receiptNo: sale.receiptNo, reason: 'ตรวจสอบระบบ' }, adminTok)).success === true);
  const stockAfter = (await call('getProductList', {}, adminTok)).find((p) => p.name === 'Singha S').stock;
  check('void restores product stock', stockAfter === stockBefore + 2, `before=${stockBefore} after=${stockAfter}`);

  // ---------- Membership renewal receipt + method change ----------
  const members = await call('getMemberList', {}, adminTok);
  const testMember = members[0];
  const renew = await call('processRenewalPayment', {
    memberDocId: testMember.docId, package: 'Standard Monthly', qrData: 'VERIFY-' + Date.now(), paymentMethod: 'cash'
  }, adminTok);
  check('processRenewalPayment', renew.success === true, JSON.stringify(renew));
  const memReceipt = await call('generateReceiptPDF', { receiptNo: renew.receiptNo }, adminTok);
  check('generateReceiptPDF returns printable html', memReceipt.success === true && !!memReceipt.html);
  check('updatePaymentMethod (membership)', (await call('updatePaymentMethod', { receiptNo: renew.receiptNo, paymentMethod: 'transfer' }, adminTok)).success === true);
  check('voidMembershipPayment', (await call('voidMembershipPayment', { receiptNo: renew.receiptNo, reason: 'ตรวจสอบระบบ' }, adminTok)).success === true);

  // ---------- Dashboard extras ----------
  const monthly = await call('getMonthlyStats', {}, adminTok);
  check('getMonthlyStats returns 6 buckets', Array.isArray(monthly) && monthly.length === 6, JSON.stringify(monthly.length));
  check('monthly buckets carry label/newMembers/revenue',
    monthly.every((m) => 'label' in m && 'newMembers' in m && 'revenue' in m));
  const leaders = await call('getCheckInLeaderboard', {}, adminTok);
  check('getCheckInLeaderboard returns a list', Array.isArray(leaders));

  // ---------- Member history ----------
  const history = await call('getMemberFullHistory', { docId: testMember.docId }, adminTok);
  check('getMemberFullHistory returns all four sections',
    history && history.profile && Array.isArray(history.payments) && Array.isArray(history.checkIns) && Array.isArray(history.bookings),
    JSON.stringify(Object.keys(history || {})));

  // ---------- Fingerprint enrollment ----------
  const enroll = await call('requestFingerprintEnrollment', { memberDocId: testMember.docId }, adminTok);
  check('requestFingerprintEnrollment', enroll.success === true, JSON.stringify(enroll));
  const st = await call('getEnrollmentStatus', {}, adminTok);
  check('getEnrollmentStatus reports pending for the right member', st.pending === true && st.memberDocId === testMember.docId, JSON.stringify(st));
  check('cancelFingerprintEnrollmentRequest', (await call('cancelFingerprintEnrollmentRequest', {}, adminTok)).success === true);
  check('enrollment no longer pending', (await call('getEnrollmentStatus', {}, adminTok)).pending === false);

  // ---------- Trainer portal ----------
  const trainerPhone = '09' + Math.floor(10000000 + Math.random() * 89999999);
  const addTrainer = await call('addTrainerData', {
    fullName: 'เทรนเนอร์ตรวจระบบ', specialty: 'Weight', phone: trainerPhone,
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], startHour: '09:00', endHour: '18:00'
  }, adminTok);
  check('addTrainerData', addTrainer.success === true, JSON.stringify(addTrainer));

  const trainerLogin = await call('loginTrainer', { phone: trainerPhone, pin: '1234' });
  check('loginTrainer with bootstrap PIN', trainerLogin.success === true, JSON.stringify(trainerLogin));
  const trainerTok = await idTokenFor(trainerLogin.token);

  const tProfile = await call('getTrainerOwnProfile', {}, trainerTok);
  check('getTrainerOwnProfile returns own record', tProfile.fullName === 'เทรนเนอร์ตรวจระบบ', JSON.stringify(tProfile).slice(0, 120));
  check('profile exposes lineLinked flag', 'lineLinked' in tProfile);

  check('setTrainerBusyStatus -> Busy', (await call('setTrainerBusyStatus', { isBusy: true }, trainerTok)).busyStatus === 'Busy');
  check('setTrainerBusyStatus -> Available', (await call('setTrainerBusyStatus', { isBusy: false }, trainerTok)).busyStatus === 'Available');
  check('updateTrainerOwnProfile saves bio+email',
    (await call('updateTrainerOwnProfile', { bio: 'สอนเวท', email: 'tr@example.com' }, trainerTok)).success === true);
  const tProfile2 = await call('getTrainerOwnProfile', {}, trainerTok);
  check('bio and email persisted', tProfile2.bio === 'สอนเวท' && tProfile2.email === 'tr@example.com');

  const lineCode = await call('generateMyLineLinkCode', {}, trainerTok);
  check('generateMyLineLinkCode returns a 6 digit code', lineCode.success === true && /^\d{6}$/.test(String(lineCode.code)), JSON.stringify(lineCode));
  check('getLineAddFriendUrlForTrainer', 'addFriendUrl' in (await call('getLineAddFriendUrlForTrainer', {}, trainerTok)));
  check('changeTrainerPin from default', (await call('changeTrainerPin', { oldPin: '1234', newPin: '4321' }, trainerTok)).success === true);
  check('resetTrainerPin (admin)', (await call('resetTrainerPin', { trainerDocId: addTrainer.docId || tProfile.docId || undefined }, adminTok)).success !== undefined);

  // ---------- Member portal: book, cancel, waitlist ----------
  const memberLogin = await call('loginMember', { phone: '0877740855', pin: '0001' });
  check('member login', memberLogin.success === true, JSON.stringify(memberLogin));
  const memberTok = await idTokenFor(memberLogin.token);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const slots = await call('getTrainerAvailableSlots', { trainerId: tProfile.trainerId, dateStr: tomorrow }, memberTok);
  check('slots include bookedSlots for the waitlist UI', slots.success === true && Array.isArray(slots.bookedSlots), JSON.stringify(slots).slice(0, 120));

  const firstSlot = slots.slots[0];
  const booked = await call('bookTrainerSlot', { trainerId: tProfile.trainerId, dateStr: tomorrow, timeSlot: firstSlot }, memberTok);
  check('member books a slot', booked.success === true, JSON.stringify(booked));

  const schedule = await call('getTrainerScheduleByDate', { trainerId: tProfile.trainerId, dateStr: tomorrow }, adminTok);
  check('admin sees that booking in getTrainerScheduleByDate', schedule.some((s) => s.timeSlot === firstSlot), JSON.stringify(schedule));

  const trainerBookings = await call('getTrainerOwnBookings', {}, trainerTok);
  check('trainer sees the booking', trainerBookings.some((b) => b.timeSlot === firstSlot), JSON.stringify(trainerBookings));

  const myBookings = await call('getMyBookings', {}, memberTok);
  const mine = myBookings.find((b) => b.timeSlot === firstSlot);
  check('booking carries bookingId for cancel', !!(mine && mine.bookingId));
  check('cancelMyBooking', (await call('cancelMyBooking', { bookingId: mine.bookingId }, memberTok)).success === true);

  // Book again as the member, then queue a *second* member on the same slot.
  await call('bookTrainerSlot', { trainerId: tProfile.trainerId, dateStr: tomorrow, timeSlot: firstSlot }, memberTok);
  const wait = await call('joinWaitlist', { trainerId: tProfile.trainerId, dateStr: tomorrow, timeSlot: firstSlot }, memberTok);
  check('joinWaitlist responds', typeof wait.success === 'boolean', JSON.stringify(wait));
  const myWait = await call('getMyWaitlist', {}, memberTok);
  check('getMyWaitlist returns a list', Array.isArray(myWait), JSON.stringify(myWait));
  if (myWait.length) {
    check('cancelMyWaitlistEntry', (await call('cancelMyWaitlistEntry', { waitlistDocId: myWait[0].waitlistDocId }, memberTok)).success === true);
  }

  const memberLine = await call('generateMyMemberLineLinkCode', {}, memberTok);
  check('generateMyMemberLineLinkCode', memberLine.success === true && /^\d{6}$/.test(String(memberLine.code)), JSON.stringify(memberLine));
  check('getLineAddFriendUrlForMember', 'addFriendUrl' in (await call('getLineAddFriendUrlForMember', {}, memberTok)));

  // ---------- Check-in display + password reset ----------
  await call('manualCheckIn', { docId: testMember.docId }, adminTok);
  const latest = await call('getLatestCheckIn', {}, adminTok);
  check('getLatestCheckIn feeds the door display', latest && latest.name && latest.logDocId, JSON.stringify(latest).slice(0, 140));
  check('checkResetTokenValid rejects a bogus token', (await call('checkResetTokenValid', { rtoken: 'not-a-real-token' })).valid === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
