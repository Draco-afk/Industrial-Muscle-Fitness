// Date helpers ported byte-for-byte (logic-wise) from
// apps-script-source-refactored/05_Packages.js (daysUntil_) and
// apps-script-source-refactored/06_Members.js (isBirthdayMonth_).
// Dates are stored in Firestore as "yyyy-MM-dd" strings (matching what the
// original already formatted for the client), so these accept strings or Date.
'use strict';

function daysUntil_(dateVal) {
  if (!dateVal) return null;
  const expDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(expDate.getTime())) return null;
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expMid = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  return Math.round((expMid - todayMid) / (1000 * 60 * 60 * 24));
}

function isBirthdayMonth_(dobValue) {
  if (!dobValue) return false;
  const dob = dobValue instanceof Date ? dobValue : new Date(dobValue);
  if (isNaN(dob.getTime())) return false;
  const now = new Date();
  return dob.getMonth() === now.getMonth();
}

// ---- Gym-local time ----
//
// Cloud Functions run in UTC, so every bare toTimeString()/toISOString() in
// this codebase was reporting Bangkok events seven hours early: a 12:51
// check-in displayed as 05:51, a receipt printed at 13:00 was stamped 06:00,
// and anything before 07:00 local was dated to the previous day. Thailand has
// no DST, so a fixed offset is exact.
//
// The shifted Date these build is only ever read through its UTC accessors —
// that's what makes its UTC fields read as Bangkok wall-clock.
const GYM_OFFSET_MS = 7 * 60 * 60 * 1000;
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function gymShift_(date) {
  return new Date((date || new Date()).getTime() + GYM_OFFSET_MS);
}

/** "yyyy-MM-dd" for the gym day a moment falls in. */
function gymDayKey_(date) {
  return gymShift_(date).toISOString().slice(0, 10);
}

/** "HH:mm:ss" on the gym's clock. */
function gymTimeStr_(date) {
  return gymShift_(date).toISOString().slice(11, 19);
}

/** "HH:mm" on the gym's clock. */
function gymTimeHM_(date) {
  return gymShift_(date).toISOString().slice(11, 16);
}

/** Minutes past midnight, gym clock — for comparing against booking slots. */
function gymMinutesOfDay_(date) {
  const d = gymShift_(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "4/9/2569" — Thai Buddhist-era date, as printed on receipts. */
function gymDateThai_(date) {
  const d = gymShift_(date);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`;
}

/** "วันนี้" / "เมื่อวาน" / "3 ก.ย." — so a list spanning midnight reads right. */
function gymDayLabel_(date) {
  const key = gymDayKey_(date);
  const todayKey = gymDayKey_(new Date());
  if (key === todayKey) return 'วันนี้';
  if (key === gymDayKey_(new Date(Date.now() - 86400000))) return 'เมื่อวาน';
  const [y, m, d] = key.split('-');
  return `${parseInt(d, 10)} ${THAI_MONTHS[parseInt(m, 10) - 1]}`
    + (y === todayKey.slice(0, 4) ? '' : ` ${(parseInt(y, 10) + 543) % 100}`);
}

module.exports = {
  daysUntil_, isBirthdayMonth_,
  GYM_OFFSET_MS, gymDayKey_, gymTimeStr_, gymTimeHM_, gymMinutesOfDay_,
  gymDateThai_, gymDayLabel_
};
