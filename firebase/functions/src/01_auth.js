// Auth — ported from apps-script-source-refactored/02_Auth_Session.js.
//
// Behavioral changes from the original (both intentional, per the migration plan):
//   1. CacheService session tokens -> Firebase Auth custom tokens + ID tokens.
//      loginAdmin/loginMember/loginTrainer now return a Firebase custom token;
//      the client exchanges it via signInWithCustomToken() and every other
//      call is authenticated by the Firebase SDK automatically (request.auth).
//   2. The Members/Trainers sheets stored each PIN in plaintext next to its
//      SHA-256 hash. Firestore only ever stores pinHash. The "no hash yet ->
//      accept the default 1234, then set the hash" bootstrap flow is kept
//      unchanged; only the plaintext-comparison branch is removed.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, auth } = require('./util/admin');
const { authOrNull, SESSION_EXPIRED_MSG } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { hashPassword_ } = require('./util/hash');
const config = require('./00_config');

// ---- Rate limiting (ported from checkRateLimit_ / recordFailedAttempt_ / clearFailedAttempts_) ----
// CacheService -> a small rateLimits/{key} Firestore doc with the same shape.

async function checkRateLimit_(key) {
  const snap = await db.collection('rateLimits').doc(key).get();
  if (snap.exists) {
    const data = snap.data();
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return { locked: true, remainMin: Math.ceil((data.lockedUntil - Date.now()) / 60000) };
    }
  }
  return { locked: false };
}

async function recordFailedAttempt_(key) {
  const ref = db.collection('rateLimits').doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { count: 0 };
    const count = (data.count || 0) + 1;
    const update = { count, updatedAt: Date.now() };
    if (count >= config.MAX_LOGIN_ATTEMPTS) {
      update.lockedUntil = Date.now() + config.LOGIN_LOCK_DURATION_SEC * 1000;
    }
    tx.set(ref, update, { merge: true });
  });
}

async function clearFailedAttempts_(key) {
  await db.collection('rateLimits').doc(key).delete().catch(() => {});
}

// ---- Admin login (ported from loginAdmin) ----

exports.loginAdmin = onCall(async (request) => {
  const { user, pass } = request.data || {};
  try {
    const rl = await checkRateLimit_('admin_' + user);
    if (rl.locked) {
      return { success: false, message: `🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ${rl.remainMin} นาที` };
    }

    const snap = await db.collection('admins').where('username', '==', user).limit(1).get();
    if (snap.empty) {
      await recordFailedAttempt_('admin_' + user);
      return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
    }
    const doc = snap.docs[0];
    const adminData = doc.data();
    const hashedInput = hashPassword_(pass);
    if (adminData.passwordHash !== hashedInput) {
      await recordFailedAttempt_('admin_' + user);
      return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
    }

    await clearFailedAttempts_('admin_' + user);
    const role = adminData.role || 'Admin Staff';
    const token = await auth.createCustomToken(doc.id, { role: 'admin', adminRole: role });
    await logAudit_(user, 'LOGIN', user, 'เข้าสู่ระบบสำเร็จ');
    return { success: true, token, role };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Member login (ported from loginMember) ----

exports.loginMember = onCall(async (request) => {
  let { phone, pin } = request.data || {};
  try {
    phone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    pin = (pin || '').toString().trim();
    if (!phone || !/^\d{4}$/.test(pin)) {
      return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์และ PIN 4 หลัก' };
    }

    const rl = await checkRateLimit_('member_' + phone);
    if (rl.locked) {
      return { success: false, message: `🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ${rl.remainMin} นาที` };
    }

    // First match wins on duplicate phone numbers, same as the original row-scan.
    const snap = await db.collection('members').where('phone', '==', phone).orderBy('createdAt', 'asc').limit(1).get();
    if (snap.empty) {
      await recordFailedAttempt_('member_' + phone);
      return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบสมัครสมาชิก' };
    }

    const doc = snap.docs[0];
    const m = doc.data();
    const storedPinHash = m.pinHash || '';
    const inputHash = hashPassword_(pin);
    const isDefaultMatch = !storedPinHash && pin === '1234';
    const isHashMatch = storedPinHash === inputHash;

    if (!isHashMatch && !isDefaultMatch) {
      await recordFailedAttempt_('member_' + phone);
      return { success: false, message: 'PIN 4 หลักไม่ถูกต้อง (รหัสเริ่มต้นคือ 1234)' };
    }

    if (isDefaultMatch && !storedPinHash) {
      await doc.ref.update({ pinHash: inputHash });
    }
    await clearFailedAttempts_('member_' + phone);
    const token = await auth.createCustomToken(doc.id, { role: 'member' });
    return { success: true, token };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Trainer login (ported from loginTrainer) ----

exports.loginTrainer = onCall(async (request) => {
  let { phone, pin } = request.data || {};
  try {
    phone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    pin = (pin || '').toString().trim();
    if (!phone || !/^\d{4}$/.test(pin)) {
      return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์และ PIN 4 หลัก' };
    }

    const rl = await checkRateLimit_('trainer_' + phone);
    if (rl.locked) {
      return { success: false, message: `🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ${rl.remainMin} นาที` };
    }

    const snap = await db.collection('trainers').where('phone', '==', phone).orderBy('createdAt', 'asc').limit(1).get();
    if (snap.empty) {
      await recordFailedAttempt_('trainer_' + phone);
      return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบเทรนเนอร์' };
    }

    const doc = snap.docs[0];
    const t = doc.data();
    const storedPinHash = t.pinHash || '';
    const inputHash = hashPassword_(pin);
    const isDefaultMatch = !storedPinHash && pin === '1234';
    const isHashMatch = storedPinHash === inputHash;

    if (!isHashMatch && !isDefaultMatch) {
      await recordFailedAttempt_('trainer_' + phone);
      return { success: false, message: 'PIN 4 หลักไม่ถูกต้อง (รหัสเริ่มต้นคือ 1234)' };
    }

    if (isDefaultMatch && !storedPinHash) {
      await doc.ref.update({ pinHash: inputHash });
    }
    await clearFailedAttempts_('trainer_' + phone);
    const token = await auth.createCustomToken(doc.id, { role: 'trainer', trainerId: t.trainerId });
    return { success: true, token };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- PIN changes (ported from changeMemberPin / changeTrainerPin) ----

exports.changeMemberPin = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: SESSION_EXPIRED_MSG };
  let { oldPin, newPin } = request.data || {};
  try {
    oldPin = (oldPin || '').toString().trim();
    newPin = (newPin || '').toString().trim();
    if (!/^\d{4}$/.test(newPin)) return { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น' };

    const ref = db.collection('members').doc(authCtx.uid);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: SESSION_EXPIRED_MSG };
    const m = snap.data();
    const storedPinHash = m.pinHash || '';
    const inputHash = hashPassword_(oldPin);
    const isDefaultMatch = !storedPinHash && oldPin === '1234';
    if (storedPinHash !== inputHash && !isDefaultMatch) {
      return { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' };
    }
    if (oldPin === newPin) return { success: false, message: 'กรุณาตั้งรหัส PIN ใหม่ที่ไม่ซ้ำกับรหัสเดิม' };

    await ref.update({ pinHash: hashPassword_(newPin) });
    await logAudit_(m.fullName, 'MEMBER_CHANGE_PIN', m.fullName, 'สมาชิกเปลี่ยน PIN ด้วยตนเอง');
    return { success: true, message: '🟢 เปลี่ยนรหัส PIN สำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.changeTrainerPin = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: SESSION_EXPIRED_MSG };
  let { oldPin, newPin } = request.data || {};
  try {
    oldPin = (oldPin || '').toString().trim();
    newPin = (newPin || '').toString().trim();
    if (!/^\d{4}$/.test(newPin)) return { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น' };

    const ref = db.collection('trainers').doc(authCtx.uid);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: SESSION_EXPIRED_MSG };
    const t = snap.data();
    const storedPinHash = t.pinHash || '';
    const inputHash = hashPassword_(oldPin);
    const isDefaultMatch = !storedPinHash && oldPin === '1234';
    if (storedPinHash !== inputHash && !isDefaultMatch) {
      return { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' };
    }
    if (oldPin === newPin) return { success: false, message: 'กรุณาตั้งรหัส PIN ใหม่ที่ไม่ซ้ำกับรหัสเดิม' };

    await ref.update({ pinHash: hashPassword_(newPin) });
    await logAudit_(t.fullName, 'TRAINER_CHANGE_PIN', t.fullName, 'เทรนเนอร์เปลี่ยน PIN ด้วยตนเอง');
    return { success: true, message: '🟢 เปลี่ยนรหัส PIN สำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.resetTrainerPin = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: SESSION_EXPIRED_MSG };
  const { trainerDocId } = request.data || {};
  try {
    const ref = db.collection('trainers').doc(trainerDocId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    const name = snap.data().fullName;
    await ref.update({ pinHash: '' }); // next login with 1234 re-bootstraps the hash
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'RESET_TRAINER_PIN', name, 'รีเซ็ต PIN แอปเทรนเนอร์กลับเป็นค่าเริ่มต้น');
    return { success: true, message: `รีเซ็ต PIN ของ "${name}" กลับเป็น 1234 แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

