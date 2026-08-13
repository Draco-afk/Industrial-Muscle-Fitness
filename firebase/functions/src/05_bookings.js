// Bookings — ported from apps-script-source-refactored/20_Bookings.js.
// `bookings`/`waitlist` doc ID: Firestore auto-ID; `memberDocId` replaces
// the original's "Member Row" foreign key. `bookingId` (a UUID) is kept as
// a stable external-facing identifier, same as the original.
//
// notifyTrainerNewBooking_ and the waitlist LINE/email notification are
// stubbed as safe no-ops until the LINE Integration module is ported —
// same "don't let a missing notification break the booking" contract the
// original had (those calls were themselves wrapped in try/catch there).
'use strict';
const crypto = require('crypto');
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { getTrainerByCode_ } = require('./util/trainerLookup');
const { generateTimeSlots_, timeStrToMinutes_ } = require('./util/timeSlots');
const config = require('./00_config');

function notifyTrainerNewBooking_() { /* TODO: wire up once 18_LineIntegration.js is ported */ }
function notifyNextWaitlistPerson_() { /* TODO: wire up once 18_LineIntegration.js is ported */ }

async function computeAvailableSlots_(trainerId, dateStr) {
  const trainer = await getTrainerByCode_(trainerId);
  if (!trainer) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ', slots: [] };

  const workingDays = trainer.workingDays || [];
  const dayOfWeek = config.TRAINER_DAY_MAP_[new Date(dateStr).getDay()];
  if (workingDays.indexOf(dayOfWeek) === -1) {
    return { success: true, slots: [], message: 'เทรนเนอร์ไม่ทำงานในวันที่เลือก' };
  }

  const allSlots = generateTimeSlots_(trainer.startHour, trainer.endHour, trainer.slotMinutes || 60);

  const bookedSnap = await db.collection('bookings')
    .where('trainerId', '==', trainerId).where('date', '==', dateStr).where('status', '==', 'Booked').get();
  const bookedSlots = bookedSnap.docs.map((d) => d.data().timeSlot);

  const today = new Date().toISOString().slice(0, 10);
  const nowMinutes = timeStrToMinutes_(new Date().toTimeString().slice(0, 5));

  const freeSlots = allSlots.filter((s) => {
    if (bookedSlots.includes(s)) return false;
    if (dateStr === today) {
      const slotStart = timeStrToMinutes_(s.split('-')[0]);
      if (slotStart <= nowMinutes) return false;
    }
    return true;
  });

  return { success: true, slots: freeSlots, bookedSlots };
}

async function createBookingRecord_(trainerId, dateStr, timeSlot, memberDocId, memberName, memberPhone) {
  const trainer = await getTrainerByCode_(trainerId);
  if (!trainer) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };

  const dupe = await db.collection('bookings')
    .where('trainerId', '==', trainerId).where('date', '==', dateStr).where('timeSlot', '==', timeSlot).where('status', '==', 'Booked').limit(1).get();
  if (!dupe.empty) return { success: false, message: '❌ ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น' };

  const bookingId = crypto.randomUUID();
  await db.collection('bookings').add({
    bookingId, trainerId, trainerName: trainer.fullName,
    memberDocId, memberName, memberPhone,
    date: dateStr, timeSlot, status: 'Booked', notes: '',
    createdAt: FieldValue.serverTimestamp()
  });
  notifyTrainerNewBooking_(trainerId, memberName, memberPhone, dateStr, timeSlot);
  return { success: true, message: `🟢 จองคิวเทรนเนอร์ ${trainer.fullName} สำเร็จ! วันที่ ${dateStr} เวลา ${timeSlot}`, trainerName: trainer.fullName };
}

// ---- Member-facing ----

exports.getAvailableTrainers = onCall(async (request) => {
  requireAuth(request, 'member');
  try {
    const snap = await db.collection('trainers').where('status', '==', 'Active').get();
    return snap.docs.map((doc) => {
      const t = doc.data();
      return {
        trainerId: t.trainerId, fullName: t.fullName, specialty: t.specialty,
        workingDays: t.workingDays || [], startHour: t.startHour, endHour: t.endHour,
        slotMinutes: t.slotMinutes || 60, photoUrl: t.photoUrl || '', bio: t.bio || '',
        busyStatus: t.busyStatus || 'Available'
      };
    });
  } catch (e) {
    return [];
  }
});

exports.getTrainerAvailableSlots = onCall(async (request) => {
  requireAuth(request, 'member');
  const { trainerId, dateStr } = request.data || {};
  try {
    return await computeAvailableSlots_(trainerId, dateStr);
  } catch (e) {
    return { success: false, message: e.toString(), slots: [] };
  }
});

exports.bookTrainerSlot = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { trainerId, dateStr, timeSlot } = request.data || {};
  try {
    const m = (await db.collection('members').doc(authCtx.uid).get()).data();
    const result = await createBookingRecord_(trainerId, dateStr, timeSlot, authCtx.uid, m.fullName, m.phone);
    if (result.success) await logAudit_(m.fullName, 'MEMBER_BOOK_TRAINER', result.trainerName, `จองคิววันที่ ${dateStr} เวลา ${timeSlot}`);
    return { success: result.success, message: result.message };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getMyBookings = onCall(async (request) => {
  const authCtx = requireAuth(request, 'member');
  try {
    const snap = await db.collection('bookings').where('memberDocId', '==', authCtx.uid).orderBy('createdAt', 'desc').get();
    return snap.docs.map((doc) => {
      const b = doc.data();
      return { bookingId: b.bookingId, trainerName: b.trainerName, date: b.date, timeSlot: b.timeSlot, status: b.status || 'Booked' };
    });
  } catch (e) {
    return [];
  }
});

exports.cancelMyBooking = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { bookingId } = request.data || {};
  try {
    const snap = await db.collection('bookings').where('bookingId', '==', bookingId).where('memberDocId', '==', authCtx.uid).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบรายการจองนี้ หรือไม่ใช่คิวของคุณ' };
    const doc = snap.docs[0];
    const b = doc.data();
    await doc.ref.update({ status: 'Cancelled' });
    notifyNextWaitlistPerson_(b.trainerId, b.date, b.timeSlot);
    const m = (await db.collection('members').doc(authCtx.uid).get()).data();
    await logAudit_(m.fullName, 'MEMBER_CANCEL_BOOKING', b.trainerName, `ยกเลิกคิว วันที่ ${b.date} เวลา ${b.timeSlot}`);
    return { success: true, message: 'ยกเลิกคิวเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.joinWaitlist = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { trainerId, dateStr, timeSlot } = request.data || {};
  try {
    const trainer = await getTrainerByCode_(trainerId);
    if (!trainer) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };

    const dupe = await db.collection('waitlist')
      .where('trainerId', '==', trainerId).where('date', '==', dateStr).where('timeSlot', '==', timeSlot)
      .where('memberDocId', '==', authCtx.uid).where('status', '==', 'Waiting').limit(1).get();
    if (!dupe.empty) return { success: false, message: 'คุณเข้าคิวรอช่วงเวลานี้ไว้อยู่แล้ว' };

    const m = (await db.collection('members').doc(authCtx.uid).get()).data();
    await db.collection('waitlist').add({
      trainerId, trainerName: trainer.fullName, memberDocId: authCtx.uid, memberName: m.fullName, memberPhone: m.phone,
      date: dateStr, timeSlot, status: 'Waiting', createdAt: FieldValue.serverTimestamp()
    });
    await logAudit_(m.fullName, 'MEMBER_JOIN_WAITLIST', trainer.fullName, `เข้าคิวรอวันที่ ${dateStr} เวลา ${timeSlot}`);
    return { success: true, message: '⏳ เข้าคิวรอสำเร็จ! ถ้ามีคนยกเลิกช่วงเวลานี้ ระบบจะแจ้งคุณทันทีทาง LINE/แอป' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getMyWaitlist = onCall(async (request) => {
  const authCtx = requireAuth(request, 'member');
  try {
    const snap = await db.collection('waitlist').where('memberDocId', '==', authCtx.uid).orderBy('createdAt', 'asc').get();
    return snap.docs
      .map((doc) => ({ waitlistDocId: doc.id, trainerName: doc.data().trainerName, date: doc.data().date, timeSlot: doc.data().timeSlot, status: doc.data().status }))
      .filter((w) => w.status !== 'Cancelled');
  } catch (e) {
    return [];
  }
});

exports.cancelMyWaitlistEntry = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { waitlistDocId } = request.data || {};
  try {
    const ref = db.collection('waitlist').doc(waitlistDocId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().memberDocId !== authCtx.uid) return { success: false, message: 'ไม่ใช่รายการของคุณ' };
    await ref.update({ status: 'Cancelled' });
    return { success: true, message: 'ยกเลิกการรอคิวเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Trainer's own bookings ----

exports.getTrainerOwnBookings = onCall(async (request) => {
  const authCtx = requireAuth(request, 'trainer');
  try {
    const t = (await db.collection('trainers').doc(authCtx.uid).get()).data();
    const snap = await db.collection('bookings').where('trainerId', '==', t.trainerId).get();
    const today = new Date().toISOString().slice(0, 10);
    const list = snap.docs
      .filter((doc) => doc.data().status !== 'Cancelled')
      .map((doc) => {
        const b = doc.data();
        return { bookingId: b.bookingId, memberName: b.memberName, memberPhone: b.memberPhone || '', date: b.date, timeSlot: b.timeSlot, status: b.status || 'Booked', isToday: b.date === today };
      });
    list.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.timeSlot.localeCompare(b.timeSlot)));
    return list;
  } catch (e) {
    return [];
  }
});

exports.trainerUpdateBookingStatus = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { bookingId, newStatus } = request.data || {};
  try {
    if (newStatus !== 'Completed' && newStatus !== 'Cancelled') return { success: false, message: 'สถานะไม่ถูกต้อง' };
    const t = (await db.collection('trainers').doc(authCtx.uid).get()).data();
    const snap = await db.collection('bookings').where('bookingId', '==', bookingId).where('trainerId', '==', t.trainerId).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบรายการจองนี้ หรือไม่ใช่คิวของคุณ' };
    const doc = snap.docs[0];
    const b = doc.data();
    await doc.ref.update({ status: newStatus });
    const statusLabel = newStatus === 'Completed' ? 'เสร็จสิ้น' : 'ยกเลิก';
    if (newStatus === 'Cancelled') notifyNextWaitlistPerson_(b.trainerId, b.date, b.timeSlot);
    await logAudit_(t.fullName, 'TRAINER_UPDATE_BOOKING', b.memberName, `เทรนเนอร์ตั้งสถานะคิวเป็น ${statusLabel} (สมาชิก: ${b.memberName})`);
    return { success: true, message: `ตั้งสถานะคิวเป็น "${statusLabel}" เรียบร้อยแล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Admin-facing ----

exports.getTrainerAvailableSlotsAdmin = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { trainerId, dateStr } = request.data || {};
  try {
    return await computeAvailableSlots_(trainerId, dateStr);
  } catch (e) {
    return { success: false, message: e.toString(), slots: [] };
  }
});

exports.adminBookTrainerSlot = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { memberDocId, trainerId, dateStr, timeSlot } = request.data || {};
  try {
    const mSnap = await db.collection('members').doc(memberDocId).get();
    if (!mSnap.exists) return { success: false, message: 'ไม่พบสมาชิกนี้ในระบบ' };
    const m = mSnap.data();
    const result = await createBookingRecord_(trainerId, dateStr, timeSlot, memberDocId, m.fullName, m.phone || '');
    if (result.success) await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADMIN_BOOK_TRAINER', result.trainerName, `จองคิวให้สมาชิก ${m.fullName} วันที่ ${dateStr} เวลา ${timeSlot}`);
    return result;
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getAllBookings = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('bookings').orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs.map((doc) => {
      const b = doc.data();
      return {
        timestamp: b.createdAt ? b.createdAt.toDate().toISOString() : '',
        bookingId: b.bookingId, trainerName: b.trainerName, memberName: b.memberName,
        memberPhone: b.memberPhone || '', date: b.date, timeSlot: b.timeSlot, status: b.status || 'Booked'
      };
    });
  } catch (e) {
    return [];
  }
});

exports.getTrainerScheduleByDate = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { trainerId, dateStr } = request.data || {};
  try {
    const snap = await db.collection('bookings').where('trainerId', '==', trainerId).where('date', '==', dateStr).get();
    const list = snap.docs.map((doc) => {
      const b = doc.data();
      return { bookingId: b.bookingId, memberName: b.memberName, memberPhone: b.memberPhone || '', timeSlot: b.timeSlot, status: b.status || 'Booked' };
    });
    list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
    return list;
  } catch (e) {
    return [];
  }
});

exports.updateBookingStatus = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { bookingId, newStatus } = request.data || {};
  try {
    const snap = await db.collection('bookings').where('bookingId', '==', bookingId).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบรายการจองนี้' };
    const doc = snap.docs[0];
    const b = doc.data();
    await doc.ref.update({ status: newStatus });
    if (newStatus === 'Cancelled') notifyNextWaitlistPerson_(b.trainerId, b.date, b.timeSlot);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_BOOKING_STATUS', b.trainerName, `เปลี่ยนสถานะคิวเป็น ${newStatus} (สมาชิก: ${b.memberName})`);
    return { success: true, message: 'อัปเดตสถานะคิวเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
