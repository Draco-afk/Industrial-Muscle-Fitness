// PaymentQR — ported from apps-script-source-refactored/19_PaymentQR.js.
// PropertiesService -> config/paymentQr Firestore doc; DriveApp -> Cloud Storage.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { uploadBase64Image } = require('./util/upload');

exports.uploadPaymentQR = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const { base64Data, mimeType, fileName } = request.data || {};
    const qrUrl = await uploadBase64Image(base64Data, mimeType, fileName || `payment_qr_${Date.now()}`, 'payment-qr');
    await db.collection('config').doc('paymentQr').set({ url: qrUrl }, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_PAYMENT_QR', 'Payment QR', 'อัปโหลด QR รับเงินใหม่');
    return { success: true, url: qrUrl };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getPaymentQRInfo = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await db.collection('config').doc('paymentQr').get();
  const d = snap.exists ? snap.data() : {};
  return { url: d.url || '', caption: d.caption || '' };
});

exports.updatePaymentQRCaption = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { caption } = request.data || {};
  try {
    await db.collection('config').doc('paymentQr').set({ caption: (caption || '').toString() }, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_PAYMENT_QR_CAPTION', 'Payment QR', 'แก้ไขคำอธิบาย QR รับเงิน');
    return { success: true, message: 'บันทึกคำอธิบาย QR สำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
