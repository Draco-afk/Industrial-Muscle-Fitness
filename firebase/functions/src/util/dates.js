// Date helpers ported byte-for-byte (logic-wise) from
// apps-script-source-refactored/05_Packages.js (daysUntil_) and
// apps-script-source-refactored/06_Members.js (isBirthdayMonth_).
// Dates are stored in Firestore as "yyyy-MM-dd" strings (matching what the
// original already formatted for the client), so these accept strings or Date.
'use strict';

/**
 * แปลงค่าวันที่ (สตริงหรือ Date) ให้เป็น "yyyy-MM-dd" ตามวันของยิม
 *
 * สตริง "2026-10-03" ถือเป็นวันนั้นตรง ๆ ไม่ต้องแปลงเขตเวลา ส่วน Date
 * (เช่น timestamp จาก Firestore) ต้องเลื่อนเป็นเวลาไทยก่อนจึงจะได้วันที่ถูก
 */
function toDateKey_(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    const m = dateVal.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(dateVal);
    return isNaN(parsed.getTime()) ? null : gymDayKey_(parsed);
  }
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : gymDayKey_(dateVal);
  }
  return null;
}

/**
 * เหลืออีกกี่วันถึงวันนั้น (ติดลบ = เลยมาแล้ว)
 *
 * นับเป็น "วัน" บนปฏิทินของยิม ไม่ใช่ของเซิร์ฟเวอร์ ของเดิมเทียบวันแบบ UTC
 * ทำให้ช่วงเที่ยงคืนถึง 7 โมงเช้าตามเวลาไทย ยังนับเป็นวันก่อนหน้าอยู่ ผลคือ
 * "เหลืออีกกี่วัน" คลาดไป 1 วันในช่วงเช้ามืด และวันหมดอายุก็เพี้ยนตาม
 */
function daysUntil_(dateVal) {
  const key = toDateKey_(dateVal);
  if (!key) return null;
  const target = Date.parse(`${key}T00:00:00Z`);
  const today = Date.parse(`${gymDayKey_(new Date())}T00:00:00Z`);
  return Math.round((target - today) / 86400000);
}

/**
 * สมาชิกภาพหมดอายุแล้วหรือยัง ณ ตอนนี้
 *
 * ใช้ได้ "ถึงสิ้นวัน" ของวันหมดอายุ — บัตรหมดอายุ 3 ต.ค. ต้องเข้ายิมได้
 * ตลอดวันที่ 3 ต.ค.
 *
 * ของเดิมเทียบ `new Date('2026-10-03') < new Date()` ซึ่ง "2026-10-03"
 * ถูกอ่านเป็นเที่ยงคืน UTC = 7 โมงเช้าเวลาไทย สมาชิกจึงถูกปฏิเสธตั้งแต่
 * 7 โมงเช้าของวันหมดอายุเอง ทั้งที่ยังเหลืออีกทั้งวัน — และเพราะขึ้นกับเวลา
 * ที่มาเช็คอิน อาการจึงเป็น ๆ หาย ๆ (มาเช้ากว่า 7 โมงผ่าน มาสายกว่านั้นไม่ผ่าน)
 */
function isExpired_(expiryValue, now = new Date()) {
  const key = toDateKey_(expiryValue);
  if (!key) return false; // ไม่ได้ระบุวันหมดอายุ = ไม่ถือว่าหมดอายุ
  return gymDayKey_(now) > key;
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
  daysUntil_, isBirthdayMonth_, isExpired_, toDateKey_,
  GYM_OFFSET_MS, gymDayKey_, gymTimeStr_, gymTimeHM_, gymMinutesOfDay_,
  gymDateThai_, gymDayLabel_
};
