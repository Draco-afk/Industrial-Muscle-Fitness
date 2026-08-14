// Fingerprint enrollment + door check-in — ported from
// apps-script-source-refactored/17_Fingerprint.js and the fingerprint-scan
// branch of 16_WebhookApi.js's doPost.
//
// Simplification: the original's buildFingerprintCache_/getFingerprintRowMap_
// existed because scanning the whole Members sheet on every door-scan was
// slow. Firestore's `where('fingerprintId', '==', x)` query is fast enough
// directly — no manual cache layer needed.
//
// This is hardware-agnostic plumbing only: the actual fingerprint scanner
// hardware talks to a middleware program at the gym (not built here), which
// calls this HTTP endpoint the same way it called the original doPost.
'use strict';
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { daysUntil_ } = require('./util/dates');
const config = require('./00_config');

const PENDING_ENROLLMENT_DOC = db.collection('config').doc('pendingFingerprintEnrollment');
const FINGERPRINT_CONFIG_DOC = db.collection('config').doc('fingerprint');

exports.requestFingerprintEnrollment = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { memberDocId } = request.data || {};
  try {
    const existing = await PENDING_ENROLLMENT_DOC.get();
    if (existing.exists && Date.now() - existing.data().requestedAt < 3 * 60 * 1000) {
      return { success: false, message: 'มีคำขอลงทะเบียนอื่นกำลังรออยู่ กรุณารอสักครู่แล้วลองใหม่' };
    }

    const memberSnap = await db.collection('members').doc(memberDocId).get();
    if (!memberSnap.exists) return { success: false, message: 'ไม่พบสมาชิกนี้ในระบบ' };
    const memberName = memberSnap.data().fullName;

    await PENDING_ENROLLMENT_DOC.set({ memberDocId, memberName, requestedAt: Date.now(), status: 'waiting' });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'REQUEST_FINGERPRINT_ENROLL', memberName, 'ขอลงทะเบียนลายนิ้วมือใหม่ รอเครื่องสแกนหน้าประตูรับงาน');
    return { success: true, message: 'ตั้งคำขอแล้ว! ให้สมาชิกไปที่เครื่องสแกนหน้าประตูแล้ววางนิ้ว 3 ครั้งตามที่เครื่องแจ้ง' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.cancelFingerprintEnrollmentRequest = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  await PENDING_ENROLLMENT_DOC.delete().catch(() => {});
  return { success: true, message: 'ยกเลิกคำขอลงทะเบียนแล้ว' };
});

exports.getEnrollmentStatus = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await PENDING_ENROLLMENT_DOC.get();
  if (!snap.exists) return { pending: false, status: 'none' };
  const d = snap.data();
  return { pending: true, status: d.status, memberDocId: d.memberDocId, memberName: d.memberName, fingerprintId: d.fingerprintId || null, errorMessage: d.errorMessage || null };
});

exports.updateFingerprintApiKey = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { apiKey } = request.data || {};
  try {
    await FINGERPRINT_CONFIG_DOC.set({ apiKey: (apiKey || '').toString().trim() }, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_FINGERPRINT_API_KEY', 'System', 'อัปเดต API Key สำหรับเครื่องสแกนลายนิ้วมือ');
    return { success: true, message: '🟢 บันทึก API Key สำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- HTTP webhook for the door-side scanner middleware (not a callable — no Firebase Auth context) ----

exports.fingerprintWebhook = onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    const configSnap = await FINGERPRINT_CONFIG_DOC.get();
    const expectedKey = configSnap.exists ? configSnap.data().apiKey : '';
    if (expectedKey && body.apiKey !== expectedKey) {
      res.status(200).json({ access: false, message: 'Unauthorized API Key' });
      return;
    }

    if (body.action === 'checkPendingEnrollment') {
      const snap = await PENDING_ENROLLMENT_DOC.get();
      if (!snap.exists || snap.data().status !== 'waiting') { res.status(200).json({ pending: false }); return; }
      const d = snap.data();
      res.status(200).json({ pending: true, memberDocId: d.memberDocId, memberName: d.memberName });
      return;
    }

    if (body.action === 'completeEnrollment') {
      const snap = await PENDING_ENROLLMENT_DOC.get();
      const pending = snap.exists ? snap.data() : null;
      // The middleware's own memberDocId is authoritative (guards against a
      // late-arriving completion clobbering a different member's row if the
      // admin already started a new enrollment request in the meantime).
      const targetMemberDocId = body.memberDocId || (pending ? pending.memberDocId : null);
      if (!targetMemberDocId) { res.status(200).json({ success: false, message: 'ไม่พบคำขอที่รอดำเนินการ (อาจหมดเวลาไปแล้ว)' }); return; }

      const isSameActivePending = pending && pending.memberDocId === targetMemberDocId;

      if (body.success === false) {
        if (isSameActivePending) {
          await PENDING_ENROLLMENT_DOC.set({ ...pending, status: 'failed', errorMessage: body.errorMessage || 'ลงทะเบียนไม่สำเร็จ' });
        }
        res.status(200).json({ success: true });
        return;
      }

      const memberRef = db.collection('members').doc(targetMemberDocId);
      const memberSnap = await memberRef.get();
      const memberName = (memberSnap.exists && memberSnap.data().fullName) || (pending ? pending.memberName : '');
      await memberRef.update({ fingerprintId: body.fingerprintId });
      await logAudit_('SYSTEM (เครื่องสแกนหน้าประตู)', 'FINGERPRINT_ENROLLED', memberName,
        `ลงทะเบียนลายนิ้วมือสำเร็จ รหัส: ${body.fingerprintId}${isSameActivePending ? '' : ' (รายงานผลล่าช้า - เขียนตรงเข้าแถวที่ถูกต้องแล้ว)'}`);

      if (isSameActivePending) {
        await PENDING_ENROLLMENT_DOC.set({ ...pending, status: 'done', fingerprintId: body.fingerprintId });
      }
      res.status(200).json({ success: true });
      return;
    }

    // Plain door-scan (access check + check-in).
    const fingerprintId = body.fingerprintId;
    if (!fingerprintId) { res.status(200).json({ access: false, message: 'Missing fingerprintId' }); return; }

    const logTimestamp = body.scanTimestamp ? new Date(body.scanTimestamp) : new Date();
    const validTimestamp = isNaN(logTimestamp.getTime()) ? new Date() : logTimestamp;
    const today = new Date();

    const memberSnap = await db.collection('members').where('fingerprintId', '==', fingerprintId.toString().trim()).limit(1).get();
    if (memberSnap.empty) {
      await db.collection('checkinLogs').add({ timestamp: FieldValue.serverTimestamp(), name: 'Unknown Fingerprint', fingerprintId, status: 'UNKNOWN', details: 'ไม่พบลายนิ้วมือในระบบ' });
      res.status(200).json({ access: false, message: 'Unknown Fingerprint' });
      return;
    }

    const doc = memberSnap.docs[0];
    const m = doc.data();
    const expiryDate = new Date(m.expiryDate);

    if ((m.status || 'Active') === 'Active' && expiryDate >= today) {
      await doc.ref.update({ checkInCount: (m.checkInCount || 0) + 1 });
      const daysLeftGate = daysUntil_(m.expiryDate);
      let detailsText = `Package: ${m.package}`;
      if (daysLeftGate !== null && daysLeftGate <= config.EXPIRY_ALERT_DAYS) {
        detailsText += daysLeftGate < 0 ? ` ⚠️ หมดอายุไปแล้ว ${Math.abs(daysLeftGate)} วัน` : ` ⚠️ ใกล้หมดอายุ (เหลือ ${daysLeftGate} วัน)`;
      }
      await db.collection('checkinLogs').add({ timestamp: FieldValue.serverTimestamp(), name: m.fullName, fingerprintId, status: 'SUCCESS', details: detailsText });
      res.status(200).json({ access: true, name: m.fullName, message: 'Access Granted', daysLeft: daysLeftGate, nearExpiry: daysLeftGate !== null && daysLeftGate <= config.EXPIRY_ALERT_DAYS });
      return;
    }

    const reason = (m.status || 'Active') !== 'Active' ? `Status: ${m.status}` : 'Expired';
    await db.collection('checkinLogs').add({ timestamp: FieldValue.serverTimestamp(), name: m.fullName, fingerprintId, status: 'BLOCKED', details: reason });
    res.status(200).json({ access: false, message: reason });
  } catch (error) {
    res.status(200).json({ access: false, error: error.toString() });
  }
});
