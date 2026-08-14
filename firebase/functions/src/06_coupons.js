// Coupons — ported from apps-script-source-refactored/09_Coupons.js.
// Doc ID: the coupon code itself, uppercased (O(1) lookup vs. the original's
// full-sheet scan).
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { broadcastLineToMembers_ } = require('./util/lineClient');

async function validateCoupon_(code, amount, scope) {
  if (!code) return { valid: false, message: '' };
  try {
    const normalizedCode = code.toString().trim().toUpperCase();
    const snap = await db.collection('coupons').doc(normalizedCode).get();
    if (!snap.exists) return { valid: false, message: '❌ ไม่พบโค้ดคูปองนี้ในระบบ' };
    const c = snap.data();

    if ((c.status || 'Active') !== 'Active') return { valid: false, message: '❌ คูปองนี้ถูกปิดใช้งานแล้ว' };
    const applicableTo = c.applicableTo || 'All';
    if (applicableTo !== 'All' && applicableTo.toLowerCase() !== scope) {
      return { valid: false, message: '❌ คูปองนี้ใช้ไม่ได้กับรายการประเภทนี้' };
    }
    const usageLimit = c.usageLimit;
    const usedCount = c.usedCount || 0;
    if (usageLimit !== '' && usageLimit !== null && typeof usageLimit !== 'undefined' && usedCount >= usageLimit) {
      return { valid: false, message: '❌ คูปองนี้ถูกใช้ครบจำนวนสิทธิ์แล้ว' };
    }
    if (c.expiryDate) {
      const expDateObj = new Date(c.expiryDate);
      const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      if (expDateObj < todayMid) return { valid: false, message: '❌ คูปองนี้หมดอายุแล้ว' };
    }
    const minPurchase = c.minPurchaseAmount || 0;
    if (minPurchase > 0 && amount < minPurchase) {
      return { valid: false, message: `❌ ยอดซื้อขั้นต่ำสำหรับคูปองนี้คือ ${minPurchase.toLocaleString('th-TH')} บาท` };
    }

    const discountType = c.discountType || 'Percent';
    const discountValue = c.discountValue || 0;
    let discountAmount = discountType === 'Fixed' ? discountValue : Math.round(amount * (discountValue / 100) * 100) / 100;
    if (discountAmount > amount) discountAmount = amount;
    const finalAmount = Math.round((amount - discountAmount) * 100) / 100;

    return {
      valid: true,
      docId: normalizedCode,
      code: normalizedCode,
      discountType, discountValue, discountAmount, finalAmount,
      message: `🎟️ ใช้คูปอง "${normalizedCode}" สำเร็จ! ลด ${discountAmount.toLocaleString('th-TH')} บาท`
    };
  } catch (e) {
    return { valid: false, message: e.toString() };
  }
}

async function applyCouponUsage_(docId) {
  try {
    const ref = db.collection('coupons').doc(docId);
    const snap = await ref.get();
    const currentUsed = (snap.exists && snap.data().usedCount) || 0;
    await ref.update({ usedCount: currentUsed + 1 });
  } catch (e) { /* ignore, matches original */ }
}

exports.getCouponList = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('coupons').get();
    return snap.docs.map((doc) => {
      const c = doc.data();
      return {
        docId: doc.id, code: doc.id,
        discountType: c.discountType || 'Percent', discountValue: c.discountValue || 0,
        usageLimit: (c.usageLimit === '' || c.usageLimit === null || typeof c.usageLimit === 'undefined') ? null : c.usageLimit,
        usedCount: c.usedCount || 0, expiryDate: c.expiryDate || '', minPurchaseAmount: c.minPurchaseAmount || 0,
        applicableTo: c.applicableTo || 'All', status: c.status || 'Active', description: c.description || ''
      };
    });
  } catch (e) {
    return [];
  }
});

exports.addCouponData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const code = (data.code || '').toString().trim().toUpperCase();
    if (!code) return { success: false, message: 'กรุณากรอกโค้ดคูปอง' };
    const discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    const ref = db.collection('coupons').doc(code);
    if ((await ref.get()).exists) return { success: false, message: 'มีโค้ดนี้อยู่ในระบบแล้ว' };

    const usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit, 10);
    const minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    await ref.set({
      discountType: data.discountType || 'Percent', discountValue, usageLimit, usedCount: 0,
      expiryDate: data.expiryDate || '', minPurchaseAmount: minPurchase,
      applicableTo: data.applicableTo || 'All', status: 'Active', description: data.description || ''
    });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_COUPON', code, `สร้างคูปองใหม่: ${data.discountType === 'Fixed' ? discountValue + ' บาท' : discountValue + '%'}`);

    let broadcastResult = null;
    if (data.broadcastLine) {
      broadcastResult = await broadcastLineToMembers_();
      await logAudit_(authCtx.token.adminRole || authCtx.uid, 'BROADCAST_COUPON_LINE', code, `ส่งประกาศคูปองทาง LINE ให้สมาชิก ${broadcastResult.sentCount} คน`);
    }

    return {
      success: true,
      message: `สร้างคูปอง "${code}" สำเร็จ!` + (broadcastResult ? ` 📢 ส่งแจ้งเตือน LINE ให้สมาชิก ${broadcastResult.sentCount} คนแล้ว` : '')
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.updateCouponData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    const ref = db.collection('coupons').doc(data.docId);
    if (!(await ref.get()).exists) return { success: false, message: 'ไม่พบคูปองนี้ในระบบ' };
    const usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit, 10);
    const minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    await ref.update({
      discountType: data.discountType || 'Percent', discountValue, usageLimit,
      expiryDate: data.expiryDate || '', minPurchaseAmount: minPurchase,
      applicableTo: data.applicableTo || 'All', status: data.status || 'Active', description: data.description || ''
    });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_COUPON', data.docId, 'แก้ไขคูปอง');
    return { success: true, message: 'อัปเดตคูปองสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteCouponData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('coupons').doc(docId);
    if (!(await ref.get()).exists) return { success: false, message: 'ไม่พบคูปองนี้ในระบบ' };
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_COUPON', docId, 'ลบคูปองออกจากระบบ');
    return { success: true, message: `ลบคูปอง "${docId}" ออกจากระบบสำเร็จ` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.previewCouponDiscount = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { code, amount, scope } = request.data || {};
  return validateCoupon_(code, parseFloat(amount) || 0, scope);
});

module.exports.validateCoupon_ = validateCoupon_;
module.exports.applyCouponUsage_ = applyCouponUsage_;
