// Monthly overheads — rent, water, electricity and the like.
//
// Deliberately not the same thing as `expenses`. Expenses are the day-to-day
// buying that comes straight out of the till, so they reduce the cash and
// transfer figures. These are the fixed bills the gym pays separately: the
// owner wants them off the bottom line without touching either the "รวมรายจ่าย"
// total or the money-on-hand figures, so they are only ever subtracted from
// net profit.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');

exports.addMonthlyBill = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { dateStr, description, amount, category } = request.data || {};
  try {
    const desc = (description || '').toString().trim();
    const amt = parseFloat(amount);
    if (!desc) return { success: false, message: 'กรุณากรอกชื่อบิล เช่น ค่าน้ำ ค่าไฟ ค่าเช่าที่' };
    if (isNaN(amt) || amt <= 0) return { success: false, message: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' };
    if (!dateStr) return { success: false, message: 'กรุณาเลือกวันที่ของบิล' };

    const actor = authCtx.token.adminRole || authCtx.uid;
    await db.collection('monthlyBills').add({
      timestamp: FieldValue.serverTimestamp(),
      date: dateStr,
      description: desc,
      category: (category || '').toString().trim(),
      amount: amt,
      addedBy: actor
    });
    await logAudit_(actor, 'ADD_MONTHLY_BILL', desc,
      `บันทึกบิลรายเดือนวันที่ ${dateStr} จำนวน ${amt.toLocaleString('th-TH')} บาท`);
    return { success: true, message: `🟢 บันทึกบิล "${desc}" ${amt.toLocaleString('th-TH')} บาท แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getMonthlyBills = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { startDateStr, endDateStr } = request.data || {};
  try {
    const snap = await db.collection('monthlyBills').get();
    const list = [];
    snap.forEach((doc) => {
      const b = doc.data();
      if (startDateStr && b.date < startDateStr) return;
      if (endDateStr && b.date > endDateStr) return;
      list.push({
        docId: doc.id, date: b.date, description: b.description,
        category: b.category || '', amount: b.amount || 0, addedBy: b.addedBy || ''
      });
    });
    list.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)));
    return list;
  } catch (e) {
    return [];
  }
});

exports.deleteMonthlyBill = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('monthlyBills').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบบิลนี้' };
    const desc = snap.data().description;
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_MONTHLY_BILL', desc, 'ลบบิลรายเดือนออกจากระบบ');
    return { success: true, message: `ลบบิล "${desc}" แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
