// Coupons — extracted from the original monolithic Code.js

function ensureCouponSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Coupons');
  if (!sheet) {
    sheet = ss.insertSheet('Coupons');
    sheet.appendRow(["Code", "Discount Type", "Discount Value", "Usage Limit", "Used Count", "Expiry Date", "Min Purchase Amount", "Applicable To", "Status", "Description"]);
  }
  return sheet;
}

function getCouponList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureCouponSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var expRaw = rows[i][5];
      list.push({
        rowNumber: i + 2,
        code: rows[i][0],
        discountType: rows[i][1] || 'Percent',
        discountValue: rows[i][2] || 0,
        usageLimit: (rows[i][3] === '' || rows[i][3] === null) ? null : rows[i][3],
        usedCount: rows[i][4] || 0,
        expiryDate: expRaw instanceof Date ? Utilities.formatDate(expRaw, tz, "yyyy-MM-dd") : (expRaw || ''),
        minPurchaseAmount: rows[i][6] || 0,
        applicableTo: rows[i][7] || 'All',
        status: rows[i][8] || 'Active',
        description: rows[i][9] || ''
      });
    }
    return list;
  } catch (e) { return []; }
}

function addCouponData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var code = (data.code || '').toString().trim().toUpperCase();
    if (!code) return { success: false, message: 'กรุณากรอกโค้ดคูปอง' };
    var discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    var sheet = ensureCouponSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toString().toUpperCase() === code) return { success: false, message: 'มีโค้ดนี้อยู่ในระบบแล้ว' };
    }

    var usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit);
    var minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    sheet.appendRow([
      code,
      data.discountType || 'Percent',
      discountValue,
      usageLimit,
      0,
      data.expiryDate || '',
      minPurchase,
      data.applicableTo || 'All',
      'Active',
      data.description || ''
    ]);
    logAudit_(session.user, 'ADD_COUPON', code, 'สร้างคูปองใหม่: ' + (data.discountType === 'Fixed' ? discountValue + ' บาท' : discountValue + '%'));

    var broadcastResult = null;
    if (data.broadcastLine) {
      var discountText = data.discountType === 'Fixed' ? discountValue.toLocaleString('th-TH') + ' บาท' : discountValue + '%';
      var broadcastText = '🎟️ คูปองส่วนลดใหม่!\n\n' +
        (data.description ? data.description + '\n' : '') +
        'ใช้โค้ด: ' + code + '\n' +
        'ลด: ' + discountText +
        (data.expiryDate ? '\nหมดเขต: ' + data.expiryDate : '') +
        '\n\nแวะมาใช้สิทธิ์ได้เลยที่ยิม!';
      broadcastResult = broadcastLineToMembers_(broadcastText);
      logAudit_(session.user, 'BROADCAST_COUPON_LINE', code, 'ส่งประกาศคูปองทาง LINE ให้สมาชิก ' + (broadcastResult ? broadcastResult.sentCount : 0) + ' คน');
    }

    return {
      success: true,
      message: 'สร้างคูปอง "' + code + '" สำเร็จ!' + (broadcastResult ? ' 📢 ส่งแจ้งเตือน LINE ให้สมาชิก ' + broadcastResult.sentCount + ' คนแล้ว' : '')
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function broadcastLineToMembers_(text) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return { sentCount: 0 };
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { sentCount: 0 };
    var numCols = Math.max(sheet.getLastColumn(), 19);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var userIds = [];
    for (var i = 0; i < rows.length; i++) {
      var lineUserId = (rows[i][18] || '').toString().trim();
      if (lineUserId) userIds.push(lineUserId);
    }
    if (userIds.length === 0) return { sentCount: 0 };

    var accessToken = PropertiesService.getScriptProperties().getProperty('lineChannelAccessToken');
    if (!accessToken) { Logger.log('broadcastLineToMembers_: ไม่มี Channel Access Token'); return { sentCount: 0 }; }

    // LINE multicast รับได้สูงสุด 500 userId ต่อครั้ง แบ่งเป็นชุดๆ
    var batchSize = 500;
    var totalSent = 0;
    for (var b = 0; b < userIds.length; b += batchSize) {
      var batch = userIds.slice(b, b + batchSize);
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        payload: JSON.stringify({ to: batch, messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        totalSent += batch.length;
      } else {
        Logger.log('broadcastLineToMembers_ ล้มเหลว! HTTP ' + res.getResponseCode() + ' - ' + res.getContentText());
      }
    }
    return { sentCount: totalSent };
  } catch (e) {
    Logger.log('broadcastLineToMembers_ เกิด exception: ' + e.toString());
    return { sentCount: 0 };
  }
}

function updateCouponData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    var sheet = ensureCouponSheet_();
    var row = parseInt(data.rowNumber);
    var usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit);
    var minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    sheet.getRange(row, 2).setValue(data.discountType || 'Percent');
    sheet.getRange(row, 3).setValue(discountValue);
    sheet.getRange(row, 4).setValue(usageLimit);
    sheet.getRange(row, 6).setValue(data.expiryDate || '');
    sheet.getRange(row, 7).setValue(minPurchase);
    sheet.getRange(row, 8).setValue(data.applicableTo || 'All');
    sheet.getRange(row, 9).setValue(data.status || 'Active');
    sheet.getRange(row, 10).setValue(data.description || '');
    logAudit_(session.user, 'EDIT_COUPON', data.code || ('row ' + row), 'แก้ไขคูปอง');
    return { success: true, message: 'อัปเดตคูปองสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteCouponData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureCouponSheet_();
    var row = parseInt(rowNumber);
    var code = sheet.getRange(row, 1).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_COUPON', code, 'ลบคูปองออกจากระบบ');
    return { success: true, message: 'ลบคูปอง "' + code + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function validateCoupon_(code, amount, scope) {
  if (!code) return { valid: false, message: '' };
  try {
    var sheet = ensureCouponSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { valid: false, message: 'ไม่พบโค้ดคูปองนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var normalizedCode = code.toString().trim().toUpperCase();

    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toString().toUpperCase() !== normalizedCode) continue;

      var rowNumber = i + 2;
      var discountType = rows[i][1] || 'Percent';
      var discountValue = rows[i][2] || 0;
      var usageLimit = rows[i][3];
      var usedCount = rows[i][4] || 0;
      var expiryDate = rows[i][5];
      var minPurchase = rows[i][6] || 0;
      var applicableTo = rows[i][7] || 'All';
      var status = rows[i][8] || 'Active';

      if (status !== 'Active') return { valid: false, message: '❌ คูปองนี้ถูกปิดใช้งานแล้ว' };
      if (applicableTo !== 'All' && applicableTo.toLowerCase() !== scope) {
        return { valid: false, message: '❌ คูปองนี้ใช้ไม่ได้กับรายการประเภทนี้' };
      }
      if (usageLimit !== '' && usageLimit !== null && typeof usageLimit !== 'undefined' && usedCount >= usageLimit) {
        return { valid: false, message: '❌ คูปองนี้ถูกใช้ครบจำนวนสิทธิ์แล้ว' };
      }
      if (expiryDate) {
        var expDateObj = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
        var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
        if (expDateObj < todayMid) return { valid: false, message: '❌ คูปองนี้หมดอายุแล้ว' };
      }
      if (minPurchase > 0 && amount < minPurchase) {
        return { valid: false, message: '❌ ยอดซื้อขั้นต่ำสำหรับคูปองนี้คือ ' + minPurchase.toLocaleString('th-TH') + ' บาท' };
      }

      var discountAmount = discountType === 'Fixed' ? discountValue : Math.round(amount * (discountValue / 100) * 100) / 100;
      if (discountAmount > amount) discountAmount = amount;
      var finalAmount = Math.round((amount - discountAmount) * 100) / 100;

      return {
        valid: true,
        rowNumber: rowNumber,
        code: rows[i][0],
        discountType: discountType,
        discountValue: discountValue,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        message: '🎟️ ใช้คูปอง "' + rows[i][0] + '" สำเร็จ! ลด ' + discountAmount.toLocaleString('th-TH') + ' บาท'
      };
    }
    return { valid: false, message: '❌ ไม่พบโค้ดคูปองนี้ในระบบ' };
  } catch (e) { return { valid: false, message: e.toString() }; }
}

function applyCouponUsage_(rowNumber) {
  try {
    var sheet = ensureCouponSheet_();
    var currentUsed = sheet.getRange(rowNumber, 5).getValue() || 0;
    sheet.getRange(rowNumber, 5).setValue(currentUsed + 1);
  } catch (e) { /* ไม่ให้ error ตรงนี้ทำให้การชำระเงินหลักล้มเหลว */ }
}

function previewCouponDiscount(code, amount, scope, token) {
  var session = validateSession(token);
  if (!session) return { valid: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  return validateCoupon_(code, parseFloat(amount) || 0, scope);
}
