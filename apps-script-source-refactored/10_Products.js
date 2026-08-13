// Products — extracted from the original monolithic Code.js

function ensureProductSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Products');
  if (!sheet) {
    sheet = ss.insertSheet('Products');
    sheet.appendRow(["Product ID", "Name", "Category", "Price", "Status", "Stock", "Low Stock Threshold"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์สต็อก ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 7)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Stock");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Low Stock Threshold");
  return sheet;
}

function getProductList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureProductSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      list.push({
        rowNumber: i + 2,
        productId: rows[i][0],
        name: rows[i][1],
        category: rows[i][2] || '',
        price: rows[i][3] || 0,
        status: rows[i][4] || 'Active',
        stock: (rows[i][5] === '' || rows[i][5] === null || typeof rows[i][5] === 'undefined') ? null : rows[i][5],
        lowStockThreshold: rows[i][6] || 5
      });
    }
    return list;
  } catch (e) { return []; }
}

function addProductData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var name = (data.name || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อสินค้า' };
    var price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    var stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    var threshold = parseInt(data.lowStockThreshold);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    var sheet = ensureProductSheet_();
    var productId = 'PD' + Utilities.getUuid().substring(0, 6).toUpperCase();
    sheet.appendRow([productId, name, data.category || '', price, 'Active', stock, threshold]);
    logAudit_(session.user, 'ADD_PRODUCT', name, 'เพิ่มสินค้าใหม่ ราคา ' + price + ' บาท สต็อกเริ่มต้น ' + (stock === '' ? 'ไม่ระบุ' : stock) + ' ชิ้น');
    return { success: true, message: 'เพิ่มสินค้าสำเร็จ!', productId: productId };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateProductData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(data.rowNumber);
    var price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    var stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    var threshold = parseInt(data.lowStockThreshold);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    sheet.getRange(row, 2).setValue(data.name);
    sheet.getRange(row, 3).setValue(data.category || '');
    sheet.getRange(row, 4).setValue(price);
    sheet.getRange(row, 5).setValue(data.status || 'Active');
    sheet.getRange(row, 6).setValue(stock);
    sheet.getRange(row, 7).setValue(threshold);
    logAudit_(session.user, 'EDIT_PRODUCT', data.name, 'แก้ไขข้อมูลสินค้า');
    return { success: true, message: 'อัปเดตข้อมูลสินค้าสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function adjustProductStock(rowNumber, delta, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    var currentStock = sheet.getRange(row, 6).getValue();
    currentStock = (currentStock === '' || currentStock === null) ? 0 : parseInt(currentStock);
    var newStock = Math.max(0, currentStock + parseInt(delta));
    sheet.getRange(row, 6).setValue(newStock);
    logAudit_(session.user, 'ADJUST_PRODUCT_STOCK', name, (delta > 0 ? 'เติมสต็อก +' : 'ปรับลดสต็อก ') + delta + ' ชิ้น (คงเหลือ ' + newStock + ' ชิ้น)');
    return { success: true, message: 'ปรับสต็อก "' + name + '" เป็น ' + newStock + ' ชิ้นแล้ว', newStock: newStock };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getLowStockProducts(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureProductSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || 'Active') !== 'Active') continue;
      var stock = rows[i][5];
      if (stock === '' || stock === null || typeof stock === 'undefined') continue; // ไม่ได้ติดตามสต็อกสินค้านี้
      var threshold = rows[i][6] || 5;
      if (stock <= threshold) {
        list.push({ rowNumber: i + 2, name: rows[i][1], stock: stock, threshold: threshold });
      }
    }
    list.sort(function (a, b) { return a.stock - b.stock; });
    return list;
  } catch (e) { return []; }
}

function deleteProductData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_PRODUCT', name, 'ลบสินค้าออกจากระบบ');
    return { success: true, message: 'ลบสินค้า "' + name + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
