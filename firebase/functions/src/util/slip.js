// สลิปโอนเงินหนึ่งใบ ใช้ได้ครั้งเดียว
//
// เดิมการต่ออายุตรวจซ้ำเฉพาะในคอลเลกชัน payments ของตัวเอง แปลว่าสลิปใบที่
// เคยใช้ต่ออายุแล้ว ยังเอามาจ่ายค่าเข้ารายวันได้อีกรอบ และกลับกันด้วย
// ตัวตรวจจึงต้องมองทั้งสองคอลเลกชันเสมอ ไม่ว่าจะถูกเรียกจากทางไหน
//
// ใช้ query แบบเท่ากับบนฟิลด์เดียว ซึ่ง Firestore สร้าง index ให้เองอัตโนมัติ
// จงใจไม่ใช้เงื่อนไขสองชั้น เพราะแบบนั้นต้องมี composite index ที่ตัวจำลอง
// ไม่บังคับแต่ของจริงบังคับ เคยทำให้ระบบล็อกอินพังมาแล้ว
'use strict';
const { db } = require('./admin');

/** ยาวพอที่จะเป็นรหัสสลิปจริง ไม่ใช่สัญญาณขยะจากเครื่องสแกน */
const MIN_SLIP_LEN = 8;

/**
 * @returns {Promise<string>} ข้อความบอกเหตุผลถ้าใช้ไม่ได้ หรือ '' ถ้าผ่าน
 */
async function slipRejectReason_(qrData) {
  const code = (qrData || '').toString().trim();
  if (code.length < MIN_SLIP_LEN) return '❌ อ่านสลิปไม่ได้ กรุณาสแกนใหม่อีกครั้ง';

  const [daily, member] = await Promise.all([
    db.collection('dailyPayments').where('qrData', '==', code).limit(1).get(),
    db.collection('payments').where('qrData', '==', code).limit(1).get()
  ]);
  if (!daily.empty) return '❌ สลิปนี้ถูกใช้จ่ายค่าเข้าหรือค่าสินค้าไปแล้ว ใช้ซ้ำไม่ได้';
  if (!member.empty) return '❌ สลิปนี้ถูกใช้กับค่าสมาชิกไปแล้ว ใช้ซ้ำไม่ได้';
  return '';
}

/**
 * หลักฐานการโอน มี 3 แบบที่รับได้ และ 1 แบบที่ไม่รับ
 *
 *   เงินสด                  - ไม่มีสลิปให้สแกน จึงไม่ถาม
 *   โอน + สลิป              - สแกนมา ตรวจว่าไม่ซ้ำกับทุกใบที่เคยรับ
 *   โอน + พนักงานยืนยัน      - คนที่เคาน์เตอร์เห็นเงินเข้าในแอปธนาคารแล้วรับรอง
 *                             บันทึกไว้ว่าใครรับรอง เพราะทางนี้ไม่มีตัวกันซ้ำ
 *   โอน + ไม่มีอะไรเลย       - ปฏิเสธ
 *
 * ตู้บริการตนเองจะไม่ส่ง slipConfirmed มาเด็ดขาด เพราะไม่มีใครยืนดูอยู่ตรงนั้น
 *
 * @returns {Promise<{ok:boolean, message?:string, qrData:string, confirmedManually:boolean}>}
 */
async function checkPaymentProof_(data) {
  const isTransfer = data.paymentMethod === 'transfer';
  const qrData = data.qrData ? data.qrData.toString().trim() : '';
  const confirmedManually = isTransfer && !qrData && data.slipConfirmed === true;

  if (!isTransfer) return { ok: true, qrData: '', confirmedManually: false };
  if (!qrData && !confirmedManually) {
    return { ok: false, message: '❌ กรุณาสแกนสลิปโอนเงิน หรือกดยืนยันว่าได้รับเงินโอนแล้ว', qrData: '', confirmedManually: false };
  }
  if (qrData) {
    const reason = await slipRejectReason_(qrData);
    if (reason) return { ok: false, message: reason, qrData, confirmedManually: false };
  }
  return { ok: true, qrData, confirmedManually };
}

module.exports = { checkPaymentProof_, slipRejectReason_, MIN_SLIP_LEN };
