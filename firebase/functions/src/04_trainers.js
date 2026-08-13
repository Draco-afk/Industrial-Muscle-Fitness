// Trainers — ported from apps-script-source-refactored/07_Trainers.js.
// Doc ID: Firestore auto-ID; `trainerId` (e.g. "TR1A2B3C") is kept as the
// original human-readable business key, referenced by bookings/waitlist.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { uploadBase64Image } = require('./util/upload');
const { normalizeTimeValue_ } = require('./util/timeSlots');

function genTrainerId_() {
  return 'TR' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ---- Trainer's own profile/session-scoped actions ----

exports.getTrainerOwnProfile = onCall(async (request) => {
  const authCtx = requireAuth(request, 'trainer');
  const snap = await db.collection('trainers').doc(authCtx.uid).get();
  if (!snap.exists) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  const t = snap.data();
  return {
    trainerId: t.trainerId,
    fullName: t.fullName,
    specialty: t.specialty,
    phone: t.phone || '',
    workingDays: t.workingDays || [],
    startHour: normalizeTimeValue_(t.startHour),
    endHour: normalizeTimeValue_(t.endHour),
    status: t.status || 'Active',
    photoUrl: t.photoUrl || '',
    bio: t.bio || '',
    busyStatus: t.busyStatus || 'Available',
    busySince: t.busySince || null,
    email: t.email || '',
    lineLinked: !!(t.lineUserId && t.lineUserId.toString().trim())
  };
});

exports.updateTrainerOwnEmail = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const email = (request.data?.email || '').toString().trim();
    await db.collection('trainers').doc(authCtx.uid).update({ email });
    const t = (await db.collection('trainers').doc(authCtx.uid).get()).data();
    await logAudit_(t.fullName, 'TRAINER_UPDATE_EMAIL', t.fullName, 'เทรนเนอร์ตั้ง/แก้ไขอีเมลรับแจ้งเตือนด้วยตนเอง');
    return { success: true, message: '🟢 บันทึกอีเมลสำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.setTrainerBusyStatus = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const isBusy = !!request.data?.isBusy;
    const newStatus = isBusy ? 'Busy' : 'Available';
    const ref = db.collection('trainers').doc(authCtx.uid);
    await ref.update({ busyStatus: newStatus, busySince: isBusy ? FieldValue.serverTimestamp() : null });
    const t = (await ref.get()).data();
    await logAudit_(t.fullName, 'TRAINER_SET_STATUS', t.fullName, 'เปลี่ยนสถานะเป็น ' + newStatus);
    return { success: true, message: isBusy ? '🔴 ตั้งสถานะเป็น "ติดลูกค้าอยู่" แล้ว' : '🟢 ตั้งสถานะเป็น "ว่าง" แล้ว', busyStatus: newStatus };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.updateTrainerOwnProfile = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const { bio, email } = request.data || {};
    const update = { bio: (bio || '').toString() };
    if (typeof email !== 'undefined') update.email = (email || '').toString().trim();
    const ref = db.collection('trainers').doc(authCtx.uid);
    await ref.update(update);
    const t = (await ref.get()).data();
    await logAudit_(t.fullName, 'TRAINER_UPDATE_BIO', t.fullName, 'เทรนเนอร์แก้ไขประวัติ/อีเมลด้วยตนเอง');
    return { success: true, message: '🟢 บันทึกข้อมูลสำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.uploadTrainerPhotoSelf = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const { base64Data, mimeType, fileName } = request.data || {};
    const photoUrl = await uploadBase64Image(base64Data, mimeType, fileName || `trainer_${Date.now()}`, 'trainer-photos');
    const ref = db.collection('trainers').doc(authCtx.uid);
    await ref.update({ photoUrl });
    const t = (await ref.get()).data();
    await logAudit_(t.fullName, 'TRAINER_UPDATE_PHOTO', t.fullName, 'เทรนเนอร์อัปโหลดรูปโปรไฟล์ใหม่ด้วยตนเอง');
    return { success: true, url: photoUrl };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteTrainerPhotoSelf = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const ref = db.collection('trainers').doc(authCtx.uid);
    await ref.update({ photoUrl: '' });
    const t = (await ref.get()).data();
    await logAudit_(t.fullName, 'TRAINER_DELETE_PHOTO', t.fullName, 'เทรนเนอร์ลบรูปโปรไฟล์ของตัวเอง');
    return { success: true, message: 'ลบรูปโปรไฟล์แล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Admin-facing trainer management ----

exports.getTrainerList = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('trainers').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => {
      const t = doc.data();
      return {
        docId: doc.id,
        trainerId: t.trainerId,
        fullName: t.fullName,
        specialty: t.specialty,
        phone: t.phone || '',
        workingDays: t.workingDays || [],
        startHour: normalizeTimeValue_(t.startHour),
        endHour: normalizeTimeValue_(t.endHour),
        slotMinutes: t.slotMinutes || 60,
        status: t.status || 'Active',
        photoUrl: t.photoUrl || '',
        bio: t.bio || '',
        busyStatus: t.busyStatus || 'Available',
        email: t.email || '',
        lineLinked: !!(t.lineUserId && t.lineUserId.toString().trim())
      };
    });
  } catch (e) {
    return [];
  }
});

exports.addTrainerData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const trainerId = genTrainerId_();
    await db.collection('trainers').add({
      trainerId,
      fullName: data.fullName,
      specialty: data.specialty || '',
      phone: (data.phone || '').toString(),
      workingDays: data.workingDays || [],
      startHour: data.startHour || '09:00',
      endHour: data.endHour || '18:00',
      slotMinutes: parseInt(data.slotMinutes, 10) || 60,
      status: 'Active',
      photoUrl: data.photoUrl || '',
      bio: data.bio || '',
      pinHash: '', // bootstraps to default 1234 on first login, same as Members
      busyStatus: 'Available',
      busySince: null,
      email: (data.email || '').toString().trim(),
      lineUserId: '',
      lineLinkCode: '',
      createdAt: FieldValue.serverTimestamp()
    });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_TRAINER', data.fullName, `เพิ่มเทรนเนอร์ใหม่ ID: ${trainerId} (PIN เริ่มต้นแอปเทรนเนอร์: 1234)`);
    return { success: true, message: 'เพิ่มเทรนเนอร์สำเร็จ! PIN เริ่มต้นสำหรับเข้าแอปเทรนเนอร์คือ 1234', trainerId };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.updateTrainerData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const ref = db.collection('trainers').doc(data.docId);
    if (!(await ref.get()).exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    const update = {
      fullName: data.fullName,
      specialty: data.specialty || '',
      phone: (data.phone || '').toString(),
      workingDays: data.workingDays || [],
      startHour: data.startHour || '09:00',
      endHour: data.endHour || '18:00',
      slotMinutes: parseInt(data.slotMinutes, 10) || 60,
      status: data.status || 'Active',
      bio: data.bio || '',
      email: (data.email || '').toString().trim()
    };
    if (typeof data.photoUrl !== 'undefined' && data.photoUrl !== null) update.photoUrl = data.photoUrl;
    await ref.update(update);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_TRAINER', data.fullName, 'แก้ไขข้อมูลเทรนเนอร์');
    return { success: true, message: 'อัปเดตข้อมูลเทรนเนอร์สำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteTrainerData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('trainers').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    const name = snap.data().fullName;
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_TRAINER', name, 'ลบเทรนเนอร์ออกจากระบบ');
    return { success: true, message: `ลบเทรนเนอร์ "${name}" ออกจากระบบสำเร็จ` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.adminSetTrainerBusyStatus = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId, isBusy } = request.data || {};
  try {
    const ref = db.collection('trainers').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    const newStatus = isBusy ? 'Busy' : 'Available';
    await ref.update({ busyStatus: newStatus, busySince: isBusy ? FieldValue.serverTimestamp() : null });
    const name = snap.data().fullName;
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADMIN_SET_TRAINER_STATUS', name, 'แอดมินตั้งสถานะเทรนเนอร์เป็น ' + newStatus);
    return { success: true, message: `ตั้งสถานะ "${name}" เป็น ${isBusy ? 'ติดลูกค้าอยู่' : 'ว่าง'} แล้ว`, busyStatus: newStatus };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteTrainerPhoto = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('trainers').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    await ref.update({ photoUrl: '' });
    const name = snap.data().fullName;
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADMIN_DELETE_TRAINER_PHOTO', name, 'แอดมินลบรูปโปรไฟล์เทรนเนอร์');
    return { success: true, message: `ลบรูปโปรไฟล์ของ "${name}" แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.uploadTrainerPhoto = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const { base64Data, mimeType, fileName } = request.data || {};
    const url = await uploadBase64Image(base64Data, mimeType, fileName || `trainer_${Date.now()}`, 'trainer-photos');
    return { success: true, url };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
