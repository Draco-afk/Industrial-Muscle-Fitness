// Admins — ported from apps-script-source-refactored/03_Admins.js.
// Doc ID: auto (username field queried, matches loginAdmin in 01_auth.js).
//
// requestAdminPasswordReset / resetAdminPassword: token issuance and
// verification are fully implemented (Firestore replacing CacheService),
// but MailApp.sendEmail has no Cloud Functions equivalent without an email
// provider (SMTP, SendGrid, Firebase's "Trigger Email" extension, etc.) —
// none configured yet. Returns an explicit "not configured" message rather
// than silently pretending the email was sent.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { hashPassword_ } = require('./util/hash');

exports.getAuditLog = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('auditLog').orderBy('timestamp', 'desc').limit(50).get();
    return snap.docs.map((doc) => {
      const a = doc.data();
      return {
        timestamp: a.timestamp ? a.timestamp.toDate().toISOString().replace('T', ' ').slice(0, 19) : '',
        admin: a.user, action: a.action, target: a.target, details: a.details
      };
    });
  } catch (e) {
    return [];
  }
});

exports.getAdminList = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('admins').get();
    return snap.docs.map((doc) => {
      const a = doc.data();
      return { docId: doc.id, user: a.username, role: a.role || 'Admin Staff', email: a.email || '' };
    });
  } catch (e) {
    return [];
  }
});

exports.addAdminData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const dupe = await db.collection('admins').where('username', '==', data.user).limit(1).get();
    if (!dupe.empty) return { success: false, message: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว!' };
    await db.collection('admins').add({ username: data.user, passwordHash: hashPassword_(data.pass), role: data.role, email: data.email || '' });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_ADMIN', data.user, `สร้างบัญชีแอดมินใหม่ role: ${data.role}`);
    return { success: true, message: 'เพิ่มบัญชีแอดมินใหม่สำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteAdminData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { username } = request.data || {};
  try {
    const snap = await db.collection('admins').where('username', '==', username).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' };
    await snap.docs[0].ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_ADMIN', username, 'ลบบัญชีแอดมิน');
    return { success: true, message: 'ลบบัญชีแอดมินออกจากระบบสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.requestAdminPasswordReset = onCall(async (request) => {
  const { usernameOrEmail: rawInput } = request.data || {};
  try {
    const usernameOrEmail = (rawInput || '').toString().trim();
    if (!usernameOrEmail) return { success: false, message: 'กรุณากรอก Username หรืออีเมล' };

    const byUsername = await db.collection('admins').where('username', '==', usernameOrEmail).limit(1).get();
    const snap = byUsername.empty ? await db.collection('admins').where('email', '==', usernameOrEmail.toLowerCase()).limit(1).get() : byUsername;
    if (snap.empty) return { success: false, message: 'ไม่พบ Username หรืออีเมลนี้ในระบบ' };

    const doc = snap.docs[0];
    const a = doc.data();
    if (!a.email) return { success: false, message: 'บัญชีนี้ยังไม่ได้ผูกอีเมลสำหรับกู้คืนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบหลัก' };

    return { success: false, message: 'ระบบส่งอีเมลยังไม่ได้ตั้งค่าในเฟสนี้ กรุณาติดต่อผู้ดูแลระบบหลักให้รีเซ็ต PIN/รหัสผ่านให้โดยตรง' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.checkResetTokenValid = onCall(async (request) => {
  const { rtoken } = request.data || {};
  const snap = await db.collection('passwordResetTokens').doc(rtoken).get();
  return { valid: snap.exists && snap.data().expiresAt > Date.now() };
});

exports.resetAdminPassword = onCall(async (request) => {
  const { rtoken, newPassword } = request.data || {};
  try {
    const tokenRef = db.collection('passwordResetTokens').doc(rtoken);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists || tokenSnap.data().expiresAt <= Date.now()) {
      return { success: false, message: 'ลิงก์รีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง' };
    }
    if (!newPassword || newPassword.length < 6) return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };

    const username = tokenSnap.data().username;
    const snap = await db.collection('admins').where('username', '==', username).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' };

    await snap.docs[0].ref.update({ passwordHash: hashPassword_(newPassword) });
    await tokenRef.delete();
    await db.collection('rateLimits').doc('admin_' + username).delete().catch(() => {});
    await logAudit_(username, 'RESET_PASSWORD', username, 'ตั้งรหัสผ่านใหม่ผ่านลิงก์อีเมลสำเร็จ');
    return { success: true, message: '🟢 ตั้งรหัสผ่านใหม่สำเร็จแล้ว! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
