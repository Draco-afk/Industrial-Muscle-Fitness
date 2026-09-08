// กันเช็คอินซ้ำในวันเดียวกัน
//
// วิธี: ตั้ง "รหัสเอกสาร" ของ log ให้เป็น <docId ของสมาชิก>__<วันที่ของยิม>
// แล้วใช้ create() ซึ่งจะล้มเหลวถ้ามีเอกสารนั้นอยู่แล้ว
//
// ทำไมถึงเลือกวิธีนี้แทนการ query หาว่า "วันนี้เช็คอินไปหรือยัง":
//
//   1. ปลอดภัยจากการชนกัน — สแกนสองครั้งรัว ๆ พร้อมกัน ถ้าใช้ "อ่านก่อนแล้ว
//      ค่อยเขียน" ทั้งคู่จะอ่านเจอว่ายังไม่มี แล้วเขียนทั้งคู่ ส่วน create()
//      Firestore รับประกันว่ามีได้ตัวเดียว
//   2. ไม่ต้องพึ่ง composite index — เป็นการอ่านด้วยรหัสเอกสารตรง ๆ
//      (query แบบ "เท่ากับ + ช่วงเวลา" ต้องมี index ซึ่งตัวจำลองไม่บังคับ
//      แต่ของจริงบังคับ เคยทำให้ระบบล็อกอินพังมาแล้วในโปรเจกต์นี้)
//   3. อ่าน/เขียนแค่ครั้งเดียว ไม่ต้องดึงรายการ log มานั่งกรอง
//
// เฉพาะการเช็คอินที่สำเร็จเท่านั้นที่ใช้รหัสแบบนี้ ส่วน log ที่ถูกปฏิเสธ
// (หมดอายุ / ไม่รู้จักลายนิ้วมือ) ยังเป็นรหัสอัตโนมัติ เพราะการพยายามเข้า
// หลายครั้งควรถูกบันทึกไว้ทุกครั้ง
'use strict';
const { db } = require('./admin');
const { gymDayKey_ } = require('./dates');

/** รหัสเอกสาร log ของสมาชิกคนนี้ในวันนี้ */
function checkinLogId_(memberDocId, dayKey) {
  return `${memberDocId}__${dayKey}`;
}

/**
 * บันทึกการเช็คอินที่สำเร็จ โดยกันไม่ให้ซ้ำในวันเดียวกัน
 *
 * @returns {Promise<{ok: true, dayKey: string} | {ok: false, reason: 'duplicate', dayKey: string}>}
 */
async function recordCheckin_(memberDocId, payload, now = new Date()) {
  const dayKey = gymDayKey_(now);
  const ref = db.collection('checkinLogs').doc(checkinLogId_(memberDocId, dayKey));

  try {
    await ref.create({
      ...payload,
      memberDocId,
      // เก็บวันของยิมไว้ตรง ๆ ด้วย จะได้กรองรายวันได้โดยไม่ต้องแปลงเวลาทุกครั้ง
      date: dayKey,
      status: 'SUCCESS'
    });
    return { ok: true, dayKey };
  } catch (e) {
    // 6 = ALREADY_EXISTS — มี log ของคนนี้ในวันนี้อยู่แล้ว
    if (e && (e.code === 6 || /already exists/i.test(e.message || ''))) {
      return { ok: false, reason: 'duplicate', dayKey };
    }
    throw e;
  }
}

/** เวลาที่เช็คอินไปแล้ววันนี้ (คืน null ถ้ายังไม่ได้เช็คอิน) */
async function checkedInAt_(memberDocId, now = new Date()) {
  const dayKey = gymDayKey_(now);
  const snap = await db.collection('checkinLogs').doc(checkinLogId_(memberDocId, dayKey)).get();
  if (!snap.exists) return null;
  const ts = snap.data().timestamp;
  return ts && ts.toDate ? ts.toDate() : null;
}

module.exports = { recordCheckin_, checkedInAt_, checkinLogId_ };
