// Members — ported from apps-script-source-refactored/06_Members.js.
//
// Package price lookup and coupon validation on signup delegate to
// 03_packages.js / 06_coupons.js. Payment recording is implemented directly
// here (receipt numbering + a `payments` write) since it's plain data
// plumbing shared with what will become the full Payments module.
// Check-in history / booking history in getMemberFullHistory queries the
// relevant collections and simply returns [] if empty (Firestore queries on
// empty/nonexistent collections are not errors), matching the original's
// defensive "if (sheet) {...}" checks.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { daysUntil_, isBirthdayMonth_ } = require('./util/dates');
const { getNextReceiptNumber_ } = require('./util/receiptNumber');
const config = require('./00_config');

function generateReferralCode_(fullName) {
  let prefix = (fullName || 'MEM').toString().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  if (prefix.length < 3) prefix = (prefix + 'GYM').substring(0, 3);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return prefix + rand;
}

async function getPackagePrice_(packageName) {
  if (!packageName) return 0; // matches original getPackageMap_()[undefined] -> undefined -> 0
  const snap = await db.collection('packages').doc(packageName).get();
  return snap.exists ? (snap.data().price || 0) : 0;
}

async function computeBirthdayDiscount_(amount) {
  const snap = await db.collection('config').doc('birthdayDiscount').get();
  const type = snap.exists ? (snap.data().type || 'Percent') : 'Percent';
  const value = snap.exists ? (parseFloat(snap.data().value) || 5) : 5;
  let discountAmount = type === 'Fixed' ? value : Math.round(amount * (value / 100) * 100) / 100;
  if (discountAmount > amount) discountAmount = amount;
  const finalAmount = Math.round((amount - discountAmount) * 100) / 100;
  const label = type === 'Fixed' ? value.toLocaleString('th-TH') + ' บาท' : value + '%';
  return { discountAmount, finalAmount, label, type, value };
}

// ---- saveMemberData ----

exports.saveMemberData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const pinInput = (data.pin || '1234').toString().trim();
    const { hashPassword_ } = require('./util/hash');
    const pinHash = hashPassword_(pinInput);
    const ownCode = generateReferralCode_(data.fullName);
    const expiryDateStr = data.expiryDate;

    const memberRef = await db.collection('members').add({
      fullName: data.fullName,
      phone: (data.phone || '').toString(),
      email: data.email || '',
      package: data.package,
      startDate: data.startDate,
      expiryDate: expiryDateStr,
      fingerprintId: data.fingerprintId || '',
      status: 'Active',
      checkInCount: 0,
      referralCode: ownCode,
      referredBy: '',
      referralRewardGiven: '',
      cardChangeCount: 0,
      freezeStartDate: '',
      pinHash,
      dob: data.dob || '',
      lineUserId: '',
      lineLinkCode: '',
      expiryLineNotifiedFor: '',
      birthdayLineNotifiedYear: '',
      winbackCouponCode: '',
      createdAt: FieldValue.serverTimestamp()
    });

    let chargeAmount = parseFloat(data.amount);
    if (isNaN(chargeAmount) || chargeAmount < 0) {
      chargeAmount = await getPackagePrice_(data.package);
    }

    const newMemberCouponCode = (data.couponCode || '').toString().trim();
    let newMemberCouponResult = null;
    let couponNote = '';
    if (newMemberCouponCode) {
      const { validateCoupon_ } = require('./06_coupons');
      newMemberCouponResult = await validateCoupon_(newMemberCouponCode, chargeAmount, 'newmember');
      if (!newMemberCouponResult.valid) return { success: false, message: newMemberCouponResult.message };
      chargeAmount = newMemberCouponResult.finalAmount;
      couponNote = ` 🎟️ (คูปอง ${newMemberCouponResult.code} ลด ${newMemberCouponResult.discountAmount.toLocaleString('th-TH')} บาท)`;
    }

    let receiptNo = '';
    const deferPayment = !!data.deferPayment;
    if (!deferPayment && chargeAmount > 0) {
      receiptNo = await getNextReceiptNumber_();
      const paymentMethod = data.paymentMethod === 'transfer' ? 'โอนเงิน' : 'เงินสด';
      await db.collection('payments').add({
        timestamp: FieldValue.serverTimestamp(),
        memberName: data.fullName,
        package: data.package,
        qrData: data.qrData ? data.qrData.toString().trim() : '',
        newExpiryDate: expiryDateStr,
        receiptNo,
        amount: chargeAmount,
        refundStatus: '',
        refundReason: '',
        refundedBy: '',
        refundedAt: '',
        paymentMethod
      });
    }
    if (newMemberCouponResult) {
      const { applyCouponUsage_ } = require('./06_coupons');
      await applyCouponUsage_(newMemberCouponResult.docId);
    }

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_MEMBER', data.fullName,
      `แพ็กเกจ: ${data.package} (PIN: ${pinInput})` +
      (deferPayment ? ' (รอชำระเงินรวมกับบิลลูกค้ารายวัน)' : (receiptNo ? ` ชำระเงิน ${chargeAmount} บาท ใบเสร็จ: ${receiptNo}` : ' (ยังไม่ชำระเงิน)')) + couponNote);

    return {
      success: true,
      message: deferPayment
        ? 'ลงทะเบียนสมาชิกสำเร็จ! กำลังพากลับไปรวมบิลกับรายการรายวัน...'
        : `ลงทะเบียนสมาชิกสำเร็จ! PIN สำหรับเข้ายิมบนมือถือคือ: ${pinInput}${couponNote}${receiptNo ? ' 🧾 ใบเสร็จ: ' + receiptNo : ''}`,
      referralCode: ownCode,
      receiptNo,
      chargeAmount,
      pin: pinInput,
      memberDocId: memberRef.id
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- updateMemberData ----

exports.updateMemberData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const ref = db.collection('members').doc(data.docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบสมาชิกนี้ในระบบ' };
    const current = snap.data();

    let expiryDateToSet = data.expiryDate;
    let freezeNote = '';
    const update = {};

    if (current.status !== 'Suspended' && data.status === 'Suspended') {
      update.freezeStartDate = new Date().toISOString().slice(0, 10);
      freezeNote = ' (เริ่ม Freeze วันนี้)';
    } else if (current.status === 'Suspended' && data.status === 'Active') {
      if (current.freezeStartDate) {
        const freezeStart = new Date(current.freezeStartDate);
        const today = new Date();
        const frozenDays = Math.round((today.getTime() - freezeStart.getTime()) / (1000 * 60 * 60 * 24));
        if (frozenDays > 0) {
          const newExpiry = new Date(expiryDateToSet);
          newExpiry.setDate(newExpiry.getDate() + frozenDays);
          expiryDateToSet = newExpiry.toISOString().slice(0, 10);
          freezeNote = ` (คืนวันหมดอายุ +${frozenDays} วัน จากการ Freeze)`;
        }
      }
      update.freezeStartDate = '';
    }

    update.fullName = data.fullName;
    update.phone = (data.phone || '').toString();
    update.email = data.email;
    update.package = data.package;
    update.startDate = data.startDate;
    update.expiryDate = expiryDateToSet;
    if (data.fingerprintId) update.fingerprintId = data.fingerprintId;
    update.status = data.status;

    if (data.pin && /^\d{4}$/.test(data.pin)) {
      const { hashPassword_ } = require('./util/hash');
      update.pinHash = hashPassword_(data.pin);
    }
    if (typeof data.dob !== 'undefined') update.dob = data.dob || '';

    await ref.update(update);
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_MEMBER', data.fullName, 'อัปเดตข้อมูลสมาชิก' + freezeNote);
    return { success: true, message: 'อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว!' + freezeNote };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- deleteMemberData ----

exports.deleteMemberData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('members').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบสมาชิกนี้ในระบบ' };
    const fullName = snap.data().fullName;
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_MEMBER', fullName, 'ลบสมาชิกออกจากระบบถาวร');
    return { success: true, message: `ลบสมาชิก "${fullName}" ออกจากระบบเรียบร้อยแล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- getMemberList ----

// Plain function (not onCall-wrapped) so other modules — e.g. 10_receipts.js
// exporting a member list to PDF — can call the same logic directly.
// Cloud Functions v2's onCall() wrapper is not itself callable in-process.
async function getMemberListCore_() {
  const snap = await db.collection('members').orderBy('createdAt', 'desc').get();
  return snap.docs.map((doc) => {
    const m = doc.data();
    return {
      docId: doc.id,
      fullName: m.fullName,
      phone: m.phone || '',
      email: m.email,
      package: m.package,
      startDate: m.startDate,
      expiryDate: m.expiryDate,
      fingerprintId: m.fingerprintId,
      status: m.status || 'Active',
      checkInCount: m.checkInCount || 0,
      referralCode: m.referralCode || '',
      referredBy: m.referredBy || '',
      dob: m.dob || '',
      isBirthdayMonth: isBirthdayMonth_(m.dob)
    };
  });
}

exports.getMemberList = onCall(async (request) => {
  requireAuth(request, 'admin');
  return getMemberListCore_();
});

module.exports.getMemberListCore_ = getMemberListCore_;

// ---- Birthday discount settings ----

exports.getBirthdayDiscountSettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await db.collection('config').doc('birthdayDiscount').get();
  return {
    type: snap.exists ? (snap.data().type || 'Percent') : 'Percent',
    value: snap.exists ? (parseFloat(snap.data().value) || 5) : 5
  };
});

exports.updateBirthdayDiscountSettings = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { discountType, discountValue } = request.data || {};
  try {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value < 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };
    const type = discountType === 'Fixed' ? 'Fixed' : 'Percent';
    await db.collection('config').doc('birthdayDiscount').set({ type, value: String(value) });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_BIRTHDAY_DISCOUNT', 'System',
      'อัปเดตส่วนลดวันเกิดเป็น ' + (type === 'Fixed' ? value.toLocaleString('th-TH') + ' บาท' : value + '%'));
    return { success: true, message: '🟢 บันทึกการตั้งค่าส่วนลดวันเกิดสำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- getMemberFullHistory ----

exports.getMemberFullHistory = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { docId } = request.data || {};
  const memberSnap = await db.collection('members').doc(docId).get();
  if (!memberSnap.exists) throw new Error('ไม่พบสมาชิกนี้ในระบบ');
  const m = memberSnap.data();

  const profile = {
    docId,
    fullName: m.fullName,
    phone: m.phone || '',
    email: m.email || '',
    package: m.package,
    startDate: m.startDate,
    expiryDate: m.expiryDate,
    fingerprintId: m.fingerprintId,
    status: m.status || 'Active',
    checkInCount: m.checkInCount || 0,
    referralCode: m.referralCode || '',
    referredBy: m.referredBy || ''
  };

  const payments = [];
  const paySnap = await db.collection('payments').where('memberName', '==', profile.fullName).orderBy('timestamp', 'desc').get();
  paySnap.forEach((doc) => {
    const p = doc.data();
    payments.push({
      timestamp: p.timestamp ? p.timestamp.toDate().toISOString() : '',
      package: p.package,
      amount: p.amount || 0,
      receiptNo: p.receiptNo || '',
      newExpiry: p.newExpiryDate || '',
      refundStatus: p.refundStatus || ''
    });
  });

  const checkIns = [];
  const logSnap = await db.collection('checkinLogs').where('name', '==', profile.fullName).orderBy('timestamp', 'desc').limit(30).get();
  logSnap.forEach((doc) => {
    const l = doc.data();
    checkIns.push({
      timestamp: l.timestamp ? l.timestamp.toDate().toISOString() : '',
      status: l.status,
      details: l.details
    });
  });

  const bookings = [];
  const bookingSnap = await db.collection('bookings').where('memberDocId', '==', docId).orderBy('date', 'desc').get();
  bookingSnap.forEach((doc) => {
    const b = doc.data();
    bookings.push({
      trainerName: b.trainerName,
      date: b.date,
      timeSlot: b.timeSlot,
      status: b.status || 'Booked'
    });
  });

  return { profile, payments, checkIns, bookings };
});

// ---- getCheckInLeaderboard ----

exports.getCheckInLeaderboard = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('members').get();
    const list = snap.docs.map((doc) => {
      const m = doc.data();
      return { fullName: m.fullName, package: m.package, status: m.status || 'Active', checkInCount: m.checkInCount || 0 };
    });
    list.sort((a, b) => b.checkInCount - a.checkInCount);
    return list.slice(0, 10);
  } catch (e) {
    return [];
  }
});

// ---- manualCheckIn ----

exports.manualCheckIn = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('members').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบสมาชิกนี้ในระบบ' };
    const m = snap.data();
    const expiryDate = new Date(m.expiryDate);
    const today = new Date();

    if (m.status !== 'Active' || expiryDate < today) {
      const reason = m.status !== 'Active' ? 'สถานะ: ' + m.status : 'สมาชิกภาพหมดอายุแล้ว';
      return { success: false, message: '❌ เช็คอินไม่ได้: ' + reason };
    }

    const newCount = (m.checkInCount || 0) + 1;
    await ref.update({ checkInCount: newCount });

    await db.collection('checkinLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      name: m.fullName,
      fingerprintId: m.fingerprintId || '',
      status: 'SUCCESS',
      details: `Package: ${m.package} (เช็คอินด้วยมือโดย ${authCtx.token.adminRole || authCtx.uid} - เครื่องสแกนใช้งานไม่ได้)`
    });

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'MANUAL_CHECK_IN', m.fullName, 'เช็คอินด้วยมือ (สำรองเวลาเครื่องสแกนใช้งานไม่ได้)');
    return { success: true, message: `🟢 เช็คอินให้ "${m.fullName}" สำเร็จแล้ว! (ครั้งที่ ${newCount})` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- getMemberProfile (member's own view) ----

exports.getMemberProfile = onCall(async (request) => {
  const authCtx = requireAuth(request, 'member');
  const snap = await db.collection('members').doc(authCtx.uid).get();
  if (!snap.exists) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  const m = snap.data();

  const profile = {
    fullName: m.fullName,
    phone: m.phone || '',
    email: m.email || '',
    package: m.package,
    startDate: m.startDate,
    expiryDate: m.expiryDate,
    fingerprintId: m.fingerprintId,
    status: m.status || 'Active',
    checkInCount: m.checkInCount || 0,
    referralCode: m.referralCode || '',
    referredBy: m.referredBy || '',
    lineLinked: !!(m.lineUserId && m.lineUserId.toString().trim()),
    referrerBonusDays: config.REFERRAL_REFERRER_BONUS_DAYS,
    newMemberBonusDays: config.REFERRAL_NEW_MEMBER_BONUS_DAYS
  };

  profile.isBirthdayMonth = isBirthdayMonth_(m.dob);
  profile.birthdayDiscountLabel = (await computeBirthdayDiscount_(1000)).label;

  const daysLeft = daysUntil_(m.expiryDate);
  profile.daysLeft = daysLeft;
  profile.isExpired = daysLeft !== null && daysLeft < 0;
  profile.nearExpiry = daysLeft !== null && daysLeft >= 0 && daysLeft <= config.EXPIRY_ALERT_DAYS && profile.status === 'Active';

  const payments = [];
  const paySnap = await db.collection('payments').where('memberName', '==', profile.fullName).orderBy('timestamp', 'desc').limit(10).get();
  paySnap.forEach((doc) => {
    const p = doc.data();
    payments.push({
      timestamp: p.timestamp ? p.timestamp.toDate().toISOString() : '',
      package: p.package,
      newExpiry: p.newExpiryDate || '',
      receiptNo: p.receiptNo || ''
    });
  });
  profile.paymentHistory = payments;
  return profile;
});

// ---- getExpiringMembers ----

exports.getExpiringMembers = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('members').where('status', '==', 'Active').get();
    const list = [];
    snap.forEach((doc) => {
      const m = doc.data();
      if (!m.expiryDate) return;
      const daysLeft = daysUntil_(m.expiryDate);
      if (daysLeft === null || daysLeft > config.EXPIRY_ALERT_DAYS) return;
      list.push({ fullName: m.fullName, phone: m.phone || '', package: m.package, expiryDate: m.expiryDate, daysLeft });
    });
    list.sort((a, b) => a.daysLeft - b.daysLeft);
    return list;
  } catch (e) {
    return [];
  }
});

// ---- getBirthdayMembersThisMonth ----

exports.getBirthdayMembersThisMonth = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('members').where('status', '==', 'Active').get();
    const list = [];
    snap.forEach((doc) => {
      const m = doc.data();
      if (!m.dob || !isBirthdayMonth_(m.dob)) return;
      const dob = new Date(m.dob);
      list.push({ fullName: m.fullName, phone: m.phone || '', package: m.package, birthDay: dob.getDate() });
    });
    list.sort((a, b) => a.birthDay - b.birthDay);
    return list;
  } catch (e) {
    return [];
  }
});
