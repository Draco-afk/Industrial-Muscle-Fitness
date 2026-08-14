// Products — ported from apps-script-source-refactored/10_Products.js.
// Doc ID: Firestore auto-ID; `productId` kept as the original business key.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');

function genProductId_() {
  return 'PD' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

exports.getProductList = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('products').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => {
      const p = doc.data();
      return {
        docId: doc.id, productId: p.productId, name: p.name, category: p.category || '',
        price: p.price || 0, status: p.status || 'Active',
        stock: (p.stock === '' || p.stock === null || typeof p.stock === 'undefined') ? null : p.stock,
        lowStockThreshold: p.lowStockThreshold || 5
      };
    });
  } catch (e) {
    return [];
  }
});

exports.addProductData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const name = (data.name || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อสินค้า' };
    const price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    let stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock, 10);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    let threshold = parseInt(data.lowStockThreshold, 10);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    const productId = genProductId_();
    await db.collection('products').add({
      productId, name, category: data.category || '', price, status: 'Active', stock, lowStockThreshold: threshold,
      createdAt: FieldValue.serverTimestamp()
    });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADD_PRODUCT', name, `เพิ่มสินค้าใหม่ ราคา ${price} บาท สต็อกเริ่มต้น ${stock === '' ? 'ไม่ระบุ' : stock} ชิ้น`);
    return { success: true, message: 'เพิ่มสินค้าสำเร็จ!', productId };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.updateProductData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const data = request.data || {};
  try {
    const price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    let stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock, 10);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    let threshold = parseInt(data.lowStockThreshold, 10);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    const ref = db.collection('products').doc(data.docId);
    if (!(await ref.get()).exists) return { success: false, message: 'ไม่พบสินค้านี้ในระบบ' };
    await ref.update({ name: data.name, category: data.category || '', price, status: data.status || 'Active', stock, lowStockThreshold: threshold });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'EDIT_PRODUCT', data.name, 'แก้ไขข้อมูลสินค้า');
    return { success: true, message: 'อัปเดตข้อมูลสินค้าสำเร็จ!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.adjustProductStock = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId, delta } = request.data || {};
  try {
    const ref = db.collection('products').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบสินค้านี้ในระบบ' };
    const p = snap.data();
    const currentStock = (p.stock === '' || p.stock === null || typeof p.stock === 'undefined') ? 0 : parseInt(p.stock, 10);
    const newStock = Math.max(0, currentStock + parseInt(delta, 10));
    await ref.update({ stock: newStock });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ADJUST_PRODUCT_STOCK', p.name, `${delta > 0 ? 'เติมสต็อก +' : 'ปรับลดสต็อก '}${delta} ชิ้น (คงเหลือ ${newStock} ชิ้น)`);
    return { success: true, message: `ปรับสต็อก "${p.name}" เป็น ${newStock} ชิ้นแล้ว`, newStock };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getLowStockProducts = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('products').where('status', '==', 'Active').get();
    const list = [];
    snap.forEach((doc) => {
      const p = doc.data();
      const stock = p.stock;
      if (stock === '' || stock === null || typeof stock === 'undefined') return;
      const threshold = p.lowStockThreshold || 5;
      if (stock <= threshold) list.push({ docId: doc.id, name: p.name, stock, threshold });
    });
    list.sort((a, b) => a.stock - b.stock);
    return list;
  } catch (e) {
    return [];
  }
});

exports.deleteProductData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const ref = db.collection('products').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'ไม่พบสินค้านี้ในระบบ' };
    const name = snap.data().name;
    await ref.delete();
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DELETE_PRODUCT', name, 'ลบสินค้าออกจากระบบ');
    return { success: true, message: `ลบสินค้า "${name}" ออกจากระบบสำเร็จ` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
