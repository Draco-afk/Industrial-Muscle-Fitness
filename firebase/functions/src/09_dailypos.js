// Daily POS — ported from apps-script-source-refactored/11_DailyPOS.js.
// `dailyPayments` doc ID: auto (looked up by `receiptNo`). `expenses` doc ID:
// auto. `dailyPaymentOverrides` doc ID: the date itself ("yyyy-MM-dd").
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { getNextReceiptNumber_ } = require('./util/receiptNumber');
const config = require('./00_config');

function isDayPassItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเข้าใช้บริการฟิตเนสรายวัน') !== -1;
}
function isMembershipItemName_(itemName) {
  return (itemName || '').toString().indexOf('สมัครสมาชิกรายเดือน') !== -1;
}
function isTrainerFeeItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเทรนเนอร์:') !== -1;
}

async function getDailyPassPrices_() {
  const snap = await db.collection('config').doc('dailyPassPrices').get();
  const d = snap.exists ? snap.data() : {};
  return {
    student: typeof d.student === 'number' ? d.student : config.DEFAULT_DAILY_PRICE_STUDENT,
    adult: typeof d.adult === 'number' ? d.adult : config.DEFAULT_DAILY_PRICE_ADULT
  };
}

// ---- Revenue overrides ----

exports.setDailyRevenueOverride = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { dateStr, membership, dayPass, products, cash, transfer } = request.data || {};
  try {
    if (!dateStr) return { success: false, message: 'ไม่พบวันที่' };
    const mVal = parseFloat(membership), dVal = parseFloat(dayPass), pVal = parseFloat(products);
    const cashVal = parseFloat(cash), transferVal = parseFloat(transfer);
    for (const v of [mVal, dVal, pVal, cashVal, transferVal]) {
      if (isNaN(v) || v < 0) return { success: false, message: 'กรุณากรอกตัวเลขให้ถูกต้องทุกช่อง (ต้องไม่ติดลบ)' };
    }
    await db.collection('dailyPaymentOverrides').doc(dateStr).set({
      cash: cashVal, transfer: transferVal, updatedBy: authCtx.token.adminRole || authCtx.uid,
      updatedAt: FieldValue.serverTimestamp(), membership: mVal, dayPass: dVal, products: pVal
    });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_REVENUE_REPORT', dateStr,
      `แก้ไขยอดวันที่ ${dateStr} เป็นสมาชิก ${mVal}, รายวัน ${dVal}, สินค้า ${pVal}, เงินสด ${cashVal}, โอน ${transferVal}`);
    return { success: true, message: `🟢 บันทึกยอดวันที่ ${dateStr} สำเร็จแล้ว!` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.clearDailyRevenueOverride = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { dateStr } = request.data || {};
  try {
    const ref = db.collection('dailyPaymentOverrides').doc(dateStr);
    if (!(await ref.get()).exists) return { success: true, message: 'วันนี้ไม่มีการแก้ไขเองอยู่แล้ว' };
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'CLEAR_REVENUE_OVERRIDE', dateStr, `ยกเลิกการแก้ไขยอดเอง กลับไปใช้ค่าคำนวณอัตโนมัติของวันที่ ${dateStr}`);
    return { success: true, message: '🟢 รีเซ็ตกลับเป็นยอดที่คำนวณอัตโนมัติแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Expenses ----

exports.addExpense = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { dateStr, description, amount } = request.data || {};
  try {
    const desc = (description || '').toString().trim();
    const amt = parseFloat(amount);
    if (!desc) return { success: false, message: 'กรุณากรอกรายการที่ซื้อ' };
    if (isNaN(amt) || amt <= 0) return { success: false, message: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' };
    if (!dateStr) return { success: false, message: 'กรุณาเลือกวันที่' };

    await db.collection('expenses').add({ timestamp: FieldValue.serverTimestamp(), date: dateStr, description: desc, amount: amt, addedBy: authCtx.token.adminRole || authCtx.uid });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_EXPENSE', desc, `บันทึกรายจ่ายวันที่ ${dateStr} จำนวน ${amt.toLocaleString('th-TH')} บาท`);
    return { success: true, message: '🟢 บันทึกรายจ่ายสำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getExpenseList = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { startDateStr, endDateStr } = request.data || {};
  try {
    const snap = await db.collection('expenses').get();
    const list = [];
    snap.forEach((doc) => {
      const e = doc.data();
      if (startDateStr && e.date < startDateStr) return;
      if (endDateStr && e.date > endDateStr) return;
      list.push({ docId: doc.id, date: e.date, description: e.description, amount: e.amount || 0, addedBy: e.addedBy || '' });
    });
    list.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)));
    return list;
  } catch (e) {
    return [];
  }
});

exports.deleteExpense = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('expenses').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบรายการนี้' };
    const desc = snap.data().description;
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_EXPENSE', desc, 'ลบรายการรายจ่ายออกจากระบบ');
    return { success: true, message: `ลบรายการ "${desc}" ออกจากระบบสำเร็จ` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Daily POS sale ----

exports.processDailyPayment = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const name = (data.customerName || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อลูกค้า' };

    const items = [];
    let dayPassSubtotal = 0;
    const dayPassItems = data.dayPassItems || [];
    if (dayPassItems.length > 0) {
      const prices = await getDailyPassPrices_();
      for (const dp of dayPassItems) {
        const qty = parseInt(dp.qty, 10) || 0;
        if (qty <= 0) continue;
        let priceVal = parseFloat(dp.price);
        if (isNaN(priceVal) || priceVal < 0) priceVal = dp.type === 'student' ? prices.student : prices.adult;
        const label = dp.type === 'student' ? 'นักเรียน/นักศึกษา' : 'ผู้ใหญ่';
        items.push({ name: `ค่าเข้าใช้บริการฟิตเนสรายวัน (${label})`, price: priceVal, qty });
        dayPassSubtotal += priceVal * qty;
      }
    }

    let productSubtotal = 0;
    if (data.items && data.items.length > 0) {
      for (const it of data.items) {
        const p = parseFloat(it.price) || 0;
        const q = parseInt(it.qty, 10) || 1;
        if (p > 0 && q > 0) { items.push({ name: it.name, price: p, qty: q }); productSubtotal += p * q; }
      }
    }

    let trainerFeeSubtotal = 0;
    const trainerFees = data.trainerFees || [];
    for (const tf of trainerFees) {
      const tfName = (tf.name || '').toString().trim();
      const tfAmount = parseFloat(tf.amount) || 0;
      if (tfName && tfAmount > 0) { items.push({ name: `ค่าเทรนเนอร์: ${tfName}`, price: tfAmount, qty: 1 }); trainerFeeSubtotal += tfAmount; }
    }

    if (items.length === 0) return { success: false, message: 'กรุณาเลือกอย่างน้อยค่าเข้ายิม สินค้า หรือค่าเทรนเนอร์อย่างใดอย่างหนึ่ง' };

    let totalAmount = Math.round((dayPassSubtotal + productSubtotal + trainerFeeSubtotal) * 100) / 100;
    if (totalAmount <= 0) return { success: false, message: 'ยอดชำระต้องมากกว่า 0 บาท' };

    const couponCode = (data.couponCode || '').toString().trim();
    let couponResult = null;
    if (couponCode) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      const { validateCoupon_ } = require('./06_coupons');
      couponResult = await validateCoupon_(couponCode, dayPassSubtotal, 'daily');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      items.push({ name: `ส่วนลดคูปอง (${couponResult.code})`, price: -couponResult.discountAmount, qty: 1 });
      dayPassSubtotal = couponResult.finalAmount;
      totalAmount -= couponResult.discountAmount;
    }

    const manualDiscountType = (data.manualDiscountType || '').toString().trim();
    const manualDiscountValue = parseFloat(data.manualDiscountValue) || 0;
    if (manualDiscountType && manualDiscountValue > 0) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      let manualDiscountAmount = manualDiscountType === 'Fixed' ? manualDiscountValue : Math.round(dayPassSubtotal * (manualDiscountValue / 100) * 100) / 100;
      if (manualDiscountAmount > dayPassSubtotal) manualDiscountAmount = dayPassSubtotal;
      const manualDiscountLabel = manualDiscountType === 'Fixed' ? manualDiscountValue.toLocaleString('th-TH') + ' บาท' : manualDiscountValue + '%';
      items.push({ name: `ส่วนลดพิเศษ (${manualDiscountLabel})`, price: -manualDiscountAmount, qty: 1 });
      dayPassSubtotal = Math.round((dayPassSubtotal - manualDiscountAmount) * 100) / 100;
      totalAmount = Math.round((totalAmount - manualDiscountAmount) * 100) / 100;
    }

    // Stock check before committing the sale (skip day-pass line items, which aren't tracked products).
    const stockDeductions = [];
    for (const item of items) {
      if (isDayPassItemName_(item.name)) continue;
      const prodSnap = await db.collection('products').where('name', '==', item.name).limit(1).get();
      if (prodSnap.empty) continue;
      const prodDoc = prodSnap.docs[0];
      const stockVal = prodDoc.data().stock;
      if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') continue;
      if (stockVal < item.qty) return { success: false, message: `❌ สินค้า "${item.name}" เหลือไม่พอ (คงเหลือ ${stockVal} ชิ้น)` };
      stockDeductions.push({ ref: prodDoc.ref, newStock: stockVal - item.qty });
    }

    const receiptNo = await getNextReceiptNumber_();
    const phone = (data.phone || '').toString().trim();
    const paymentMethod = data.paymentMethod === 'transfer' ? 'โอนเงิน' : 'เงินสด';
    await db.collection('dailyPayments').add({
      timestamp: FieldValue.serverTimestamp(), customerName: name, phone, amount: totalAmount, receiptNo,
      itemsJson: JSON.stringify(items), refundStatus: '', refundReason: '', refundedBy: '', refundedAt: '', paymentMethod
    });
    if (couponResult) {
      const { applyCouponUsage_ } = require('./06_coupons');
      await applyCouponUsage_(couponResult.docId);
    }
    for (const d of stockDeductions) await d.ref.update({ stock: d.newStock });

    const itemSummary = items.map((it) => it.name + (it.qty > 1 ? ` x${it.qty}` : '')).join(', ');
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DAILY_PAYMENT', name, `รับชำระ ${totalAmount} บาท (${itemSummary}) ใบเสร็จ: ${receiptNo}`);
    return { success: true, message: `🟢 รับชำระเงินสำเร็จ! ยอดรวม ${totalAmount.toLocaleString('th-TH')} บาท เลขที่ใบเสร็จ: ${receiptNo}`, receiptNo, totalAmount };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// Plain function (not onCall-wrapped) so 10_receipts.js can call the same
// logic directly for PDF export — onCall()'s wrapper isn't callable in-process.
async function getDailyPaymentLogsCore_() {
  try {
    const snap = await db.collection('dailyPayments').orderBy('timestamp', 'desc').limit(20).get();
    return snap.docs.map((doc) => {
      const d = doc.data();
      let items = [];
      try { items = d.itemsJson ? JSON.parse(d.itemsJson) : []; } catch (e2) { items = []; }
      return {
        docId: doc.id, timestamp: d.timestamp ? d.timestamp.toDate().toISOString() : '',
        customerName: d.customerName, phone: d.phone || '', amount: d.amount || 0, receiptNo: d.receiptNo || '',
        items, itemSummary: items.map((it) => it.name + (it.qty > 1 ? ` x${it.qty}` : '')).join(', '),
        refundStatus: d.refundStatus || '', refundReason: d.refundReason || '', paymentMethod: d.paymentMethod || 'เงินสด'
      };
    });
  } catch (e) {
    return [];
  }
}

exports.getDailyPaymentLogs = onCall(async (request) => {
  requireAuth(request, 'admin');
  return getDailyPaymentLogsCore_();
});

module.exports.getDailyPaymentLogsCore_ = getDailyPaymentLogsCore_;

exports.updateDailyPaymentMethod = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { receiptNo, paymentMethod } = request.data || {};
  try {
    const method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    const snap = await db.collection('dailyPayments').where('receiptNo', '==', receiptNo.toString()).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo}` };
    const doc = snap.docs[0];
    await doc.ref.update({ paymentMethod: method });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_PAYMENT_METHOD', doc.data().customerName, `แก้ไขวิธีชำระเงินใบเสร็จ ${receiptNo} เป็น ${method}`);
    return { success: true, message: `🟢 แก้ไขวิธีชำระเงินเป็น "${method}" แล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.voidDailyPayment = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { receiptNo, reason } = request.data || {};
  try {
    const snap = await db.collection('dailyPayments').where('receiptNo', '==', receiptNo).limit(1).get();
    if (snap.empty) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    const doc = snap.docs[0];
    const d = doc.data();
    if (d.refundStatus === 'Refunded') return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };

    await doc.ref.update({ refundStatus: 'Refunded', refundReason: reason || '', refundedBy: authCtx.token.adminRole || authCtx.uid, refundedAt: FieldValue.serverTimestamp() });

    try {
      const refundedItems = d.itemsJson ? JSON.parse(d.itemsJson) : [];
      for (const it of refundedItems) {
        if (isDayPassItemName_(it.name)) continue;
        const prodSnap = await db.collection('products').where('name', '==', it.name).limit(1).get();
        if (prodSnap.empty) continue;
        const prodDoc = prodSnap.docs[0];
        const stockVal = prodDoc.data().stock;
        if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') continue;
        await prodDoc.ref.update({ stock: stockVal + (it.qty || 1) });
      }
    } catch (e3) { /* don't fail the refund if stock restore fails */ }

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'VOID_DAILY_PAYMENT', d.customerName, `ยกเลิก/คืนเงินใบเสร็จ ${receiptNo} ยอด ${d.amount} บาท เหตุผล: ${reason || '-'}`);
    return { success: true, message: `🟢 ยกเลิก/คืนเงินใบเสร็จ ${receiptNo} เรียบร้อยแล้ว` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.deleteDailyPaymentLog = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { receiptNo } = request.data || {};
  try {
    const snap = await db.collection('dailyPayments').where('receiptNo', '==', receiptNo).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo}` };
    const doc = snap.docs[0];
    const custName = doc.data().customerName;
    await doc.ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_DAILY_PAYMENT', custName, `ลบรายการชำระเงินรายวัน ใบเสร็จ: ${receiptNo}`);
    return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
