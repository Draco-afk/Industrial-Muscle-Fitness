// Payments (membership renewals) — ported from
// apps-script-source-refactored/08_Payments_Membership.js.
// `payments` doc ID: auto; looked up by `receiptNo` field (no natural key
// exists, and receipts must stay immutable once issued for tax records).
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { authOrNull, requireAuth } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { getNextReceiptNumber_ } = require('./util/receiptNumber');
const { isBirthdayMonth_ } = require('./util/dates');

async function getPackageInfo_(packageName) {
  if (!packageName) return null;
  const snap = await db.collection('packages').doc(packageName).get();
  return snap.exists ? snap.data() : null;
}

async function computeBirthdayDiscount_(amount) {
  const snap = await db.collection('config').doc('birthdayDiscount').get();
  const type = snap.exists ? (snap.data().type || 'Percent') : 'Percent';
  const value = snap.exists ? (parseFloat(snap.data().value) || 5) : 5;
  let discountAmount = type === 'Fixed' ? value : Math.round(amount * (value / 100) * 100) / 100;
  if (discountAmount > amount) discountAmount = amount;
  const finalAmount = Math.round((amount - discountAmount) * 100) / 100;
  const label = type === 'Fixed' ? value.toLocaleString('th-TH') + ' บาท' : value + '%';
  return { discountAmount, finalAmount, label };
}

exports.processRenewalPayment = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const inputQrData = data.qrData ? data.qrData.toString().trim() : '';
    if (!inputQrData) return { success: false, message: '❌ ไม่พบข้อมูล QR Code จากสลิป' };

    const dupe = await db.collection('payments').where('qrData', '==', inputQrData).limit(1).get();
    if (!dupe.empty) return { success: false, message: '❌ ไม่สามารถใช้สลิปนี้ซ้ำได้! เคยถูกใช้ต่ออายุไปแล้ว' };

    const memberSnap = await db.collection('members').doc(data.memberDocId).get();
    if (!memberSnap.exists) return { success: false, message: '❌ ไม่พบรายชื่อสมาชิกนี้ในระบบ' };
    const member = memberSnap.data();

    let baseDate = new Date();
    if (member.expiryDate) {
      const currentExpiry = new Date(member.expiryDate);
      if (currentExpiry > baseDate) baseDate = currentExpiry;
    }
    const pkgInfo = await getPackageInfo_(data.package);
    const durationMonths = pkgInfo ? pkgInfo.durationMonths : 1;

    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + durationMonths);
    const newExpiryStr = newExpiry.toISOString().slice(0, 10);

    await memberSnap.ref.update({ package: data.package, expiryDate: newExpiryStr, status: 'Active' });

    const isBirthday = isBirthdayMonth_(member.dob);
    let paidAmount = pkgInfo ? pkgInfo.price : 0;
    let discountNote = '';
    if (isBirthday) {
      const bd = await computeBirthdayDiscount_(paidAmount);
      paidAmount = bd.finalAmount;
      discountNote = ` 🎂 (ใช้ส่วนลดวันเกิด ${bd.label})`;
    }

    const couponCode = (data.couponCode || '').toString().trim();
    let couponResult = null;
    if (couponCode) {
      const { validateCoupon_ } = require('./06_coupons');
      couponResult = await validateCoupon_(couponCode, paidAmount, 'membership');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      paidAmount = couponResult.finalAmount;
      discountNote += ` 🎟️ (คูปอง ${couponResult.code} ลด ${couponResult.discountAmount.toLocaleString('th-TH')} บาท)`;
    }

    const receiptNo = await getNextReceiptNumber_();
    const paymentMethod = data.paymentMethod === 'transfer' ? 'โอนเงิน' : 'เงินสด';
    await db.collection('payments').add({
      timestamp: FieldValue.serverTimestamp(),
      memberName: member.fullName, package: data.package, qrData: inputQrData, newExpiryDate: newExpiryStr,
      receiptNo, amount: paidAmount, refundStatus: '', refundReason: '', refundedBy: '', refundedAt: '', paymentMethod
    });
    if (couponResult) {
      const { applyCouponUsage_ } = require('./06_coupons');
      await applyCouponUsage_(couponResult.docId);
    }

    const { clearRevenueOverrideForDate_ } = require('./09_dailypos');
    await clearRevenueOverrideForDate_(new Date().toISOString().slice(0, 10), authCtx.token.adminRole || authCtx.uid, `ต่ออายุสมาชิก ใบเสร็จ ${receiptNo}`);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'RENEW_PAYMENT', member.fullName,
      `ต่ออายุสำเร็จ: ${data.package} หมดอายุ ${newExpiryStr} (ใบเสร็จ: ${receiptNo})${discountNote}`);

    return {
      success: true,
      message: `🟢 ต่ออายุสมาชิกเรียบร้อยแล้ว!${discountNote} เลขที่ใบเสร็จ: ${receiptNo}`,
      receiptNo, isBirthday, paidAmount
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// Plain function (not onCall-wrapped) so 10_receipts.js can call the same
// logic directly for PDF export — onCall()'s wrapper isn't callable in-process.
async function getPaymentLogsCore_() {
  try {
    const logs = [];

    const paySnap = await db.collection('payments').orderBy('timestamp', 'desc').limit(15).get();
    paySnap.forEach((doc) => {
      const p = doc.data();
      if (!p.timestamp) return;
      logs.push({
        timestampRaw: p.timestamp.toMillis(), timestamp: p.timestamp.toDate().toISOString(),
        memberName: p.memberName, package: p.package, qrData: p.qrData || '', newExpiry: p.newExpiryDate || '',
        receiptNo: p.receiptNo || '', amount: p.amount || 0, refundStatus: p.refundStatus || '', refundReason: p.refundReason || '',
        paymentMethod: p.paymentMethod || 'เงินสด', bundledInDailyBill: false
      });
    });

    // Membership signups bundled into a daily-customer POS bill (see 09_dailypos.js).
    const dailySnap = await db.collection('dailyPayments').orderBy('timestamp', 'desc').limit(30).get();
    const membershipItemPattern = /^สมัครสมาชิกรายเดือน - (.+) \((.+)\)$/;
    dailySnap.forEach((doc) => {
      const d = doc.data();
      let items = [];
      try { items = d.itemsJson ? JSON.parse(d.itemsJson) : []; } catch (e2) { items = []; }
      items.forEach((it) => {
        const match = membershipItemPattern.exec(it.name || '');
        if (!match) return;
        logs.push({
          timestampRaw: d.timestamp ? d.timestamp.toMillis() : 0,
          timestamp: d.timestamp ? d.timestamp.toDate().toISOString() : '',
          memberName: match[2], package: match[1], qrData: '', newExpiry: '',
          receiptNo: d.receiptNo || '', amount: (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || 1),
          refundStatus: d.refundStatus || '', refundReason: d.refundReason || '',
          paymentMethod: d.paymentMethod || 'เงินสด', bundledInDailyBill: true
        });
      });
    });

    logs.sort((a, b) => b.timestampRaw - a.timestampRaw);
    return logs.slice(0, 15);
  } catch (e) {
    return [];
  }
}

exports.getPaymentLogs = onCall(async (request) => {
  requireAuth(request, 'admin');
  return getPaymentLogsCore_();
});

module.exports.getPaymentLogsCore_ = getPaymentLogsCore_;

exports.updatePaymentMethod = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { receiptNo, paymentMethod } = request.data || {};
  try {
    const method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    const snap = await db.collection('payments').where('receiptNo', '==', receiptNo.toString()).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo}` };
    const doc = snap.docs[0];
    await doc.ref.update({ paymentMethod: method });
    const { clearRevenueOverrideForDate_, toOverrideDateKey_ } = require('./09_dailypos');
    await clearRevenueOverrideForDate_(toOverrideDateKey_(doc.data().timestamp), authCtx.token.adminRole || authCtx.uid, `แก้วิธีชำระเงินใบเสร็จ ${receiptNo}`);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_PAYMENT_METHOD', doc.data().memberName, `แก้ไขวิธีชำระเงินใบเสร็จ ${receiptNo} เป็น ${method}`);
    return { success: true, message: `🟢 แก้ไขวิธีชำระเงินเป็น "${method}" แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.voidMembershipPayment = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { receiptNo, reason } = request.data || {};
  try {
    const snap = await db.collection('payments').where('receiptNo', '==', receiptNo).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo} ในระบบ` };
    const doc = snap.docs[0];
    const p = doc.data();
    if (p.refundStatus === 'Refunded') return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };
    await doc.ref.update({ refundStatus: 'Refunded', refundReason: reason || '', refundedBy: authCtx.token.adminRole || authCtx.uid, refundedAt: FieldValue.serverTimestamp() });
    const { clearRevenueOverrideForDate_, toOverrideDateKey_ } = require('./09_dailypos');
    await clearRevenueOverrideForDate_(toOverrideDateKey_(p.timestamp), authCtx.token.adminRole || authCtx.uid, `ยกเลิก/คืนเงินใบเสร็จ ${receiptNo}`);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'VOID_MEMBERSHIP_PAYMENT', p.memberName, `ยกเลิก/คืนเงินใบเสร็จ ${receiptNo} ยอด ${p.amount} บาท เหตุผล: ${reason || '-'}`);
    return { success: true, message: `🟢 ยกเลิก/คืนเงินใบเสร็จ ${receiptNo} เรียบร้อยแล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
