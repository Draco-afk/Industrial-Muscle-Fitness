// Packages — ported from apps-script-source-refactored/05_Packages.js.
// Doc ID = package name itself (see docs/firestore-schema.md), replacing
// the original's full-sheet-scan-into-map pattern with O(1) lookup.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const config = require('./00_config');

exports.getPackageList = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('packages').get();
    return snap.docs.map((doc) => {
      const p = doc.data();
      return { docId: doc.id, name: doc.id, price: p.price || 0, durationMonths: p.durationMonths || 1, status: p.status || 'Active' };
    });
  } catch (e) {
    return [];
  }
});

exports.addPackageData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const name = (data.name || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อแพ็กเกจ' };
    const price = parseFloat(data.price);
    const duration = parseInt(data.durationMonths, 10);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    if (isNaN(duration) || duration <= 0) return { success: false, message: 'กรุณากรอกระยะเวลา (เดือน) ให้ถูกต้อง' };

    const ref = db.collection('packages').doc(name);
    if ((await ref.get()).exists) return { success: false, message: 'มีแพ็กเกจชื่อนี้อยู่แล้วในระบบ' };

    await ref.set({ price, durationMonths: duration, status: 'Active' });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_PACKAGE', name, `เพิ่มแพ็กเกจใหม่ ราคา ${price} บาท / ${duration} เดือน`);
    return { success: true, message: 'เพิ่มแพ็กเกจสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.updatePackageData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const price = parseFloat(data.price);
    const duration = parseInt(data.durationMonths, 10);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    if (isNaN(duration) || duration <= 0) return { success: false, message: 'กรุณากรอกระยะเวลา (เดือน) ให้ถูกต้อง' };

    const docId = data.docId; // current key (original package name)
    const newName = (data.name || '').toString().trim() || docId;
    const ref = db.collection('packages').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบแพ็กเกจนี้ในระบบ' };

    const fields = { price, durationMonths: duration, status: data.status || 'Active' };
    if (newName !== docId) {
      // Doc ID is the package name -> renaming means moving to a new doc.
      if ((await db.collection('packages').doc(newName).get()).exists) {
        return { success: false, message: 'มีแพ็กเกจชื่อนี้อยู่แล้วในระบบ' };
      }
      await db.collection('packages').doc(newName).set(fields);
      await ref.delete();
    } else {
      await ref.set(fields, { merge: true });
    }

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_PACKAGE', newName, `แก้ไขแพ็กเกจ ราคา ${price} บาท / ${duration} เดือน`);
    return { success: true, message: 'อัปเดตแพ็กเกจสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deletePackageData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('packages').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบแพ็กเกจนี้ในระบบ' };
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_PACKAGE', docId, 'ลบแพ็กเกจออกจากระบบ');
    return { success: true, message: `ลบแพ็กเกจ "${docId}" ออกจากระบบสำเร็จ` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getDailyPassPrices = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await db.collection('config').doc('dailyPassPrices').get();
  const d = snap.exists ? snap.data() : {};
  return {
    student: typeof d.student === 'number' ? d.student : config.DEFAULT_DAILY_PRICE_STUDENT,
    adult: typeof d.adult === 'number' ? d.adult : config.DEFAULT_DAILY_PRICE_ADULT
  };
});

exports.updateDailyPassPrices = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { student: rawStudent, adult: rawAdult } = request.data || {};
  try {
    const student = parseFloat(rawStudent);
    const adult = parseFloat(rawAdult);
    if (isNaN(student) || student < 0 || isNaN(adult) || adult < 0) {
      return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    }
    await db.collection('config').doc('dailyPassPrices').set({ student, adult });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_DAILY_PRICES', 'Day Pass Pricing', `นักเรียน/นักศึกษา: ${student} บาท, ผู้ใหญ่: ${adult} บาท`);
    return { success: true, message: 'บันทึกราคาค่าเข้ายิมรายวันสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
