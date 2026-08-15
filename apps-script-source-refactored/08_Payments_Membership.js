// Payments Membership — extracted from the original monolithic Code.js

function getNextReceiptNumber_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var yearPart = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy");
    var key = 'receipt_counter_' + yearPart;
    var current = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, current.toString());
    return 'RC' + yearPart + '-' + ('0000' + current).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

function ensurePaymentSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Payments');
  if (!sheet) {
    sheet = ss.insertSheet('Payments');
    sheet.appendRow(["Timestamp", "Member Name", "Package", "QR Code Data", "New Expiry Date", "Receipt No", "Amount", "Refund Status", "Refund Reason", "Refunded By", "Refunded At", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 12)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Receipt No");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Amount");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Refund Status");
  if (!headerRow[8]) sheet.getRange(1, 9).setValue("Refund Reason");
  if (!headerRow[9]) sheet.getRange(1, 10).setValue("Refunded By");
  if (!headerRow[10]) sheet.getRange(1, 11).setValue("Refunded At");
  if (!headerRow[11]) sheet.getRange(1, 12).setValue("Payment Method");
  return sheet;
}

function processRenewalPayment(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var memberSheet = ss.getSheetByName('Members');
    var paymentSheet = ensurePaymentSheet_();

    var paymentRows = paymentSheet.getDataRange().getValues();
    var inputQrData = data.qrData ? data.qrData.toString().trim() : "";
    if (inputQrData !== "") {
      for (var p = 1; p < paymentRows.length; p++) {
        var existingQrData = paymentRows[p][3] ? paymentRows[p][3].toString().trim() : "";
        if (existingQrData === inputQrData) {
          return { success: false, message: "❌ ไม่สามารถใช้สลิปนี้ซ้ำได้! เคยถูกใช้ต่ออายุไปแล้ว" };
        }
      }
    } else {
      return { success: false, message: "❌ ไม่พบข้อมูล QR Code จากสลิป" };
    }

    var rows = memberSheet.getDataRange().getValues();
    var targetRow = -1;
    var currentExpiryStr = "";
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1].toString() === data.memberName) { targetRow = i + 1; currentExpiryStr = rows[i][6]; break; }
    }
    if (targetRow === -1) return { success: false, message: "❌ ไม่พบรายชื่อสมาชิกนี้ในระบบ" };

    var baseDate = new Date();
    if (currentExpiryStr) {
      var currentExpiry = new Date(currentExpiryStr);
      if (currentExpiry > baseDate) baseDate = currentExpiry;
    }
    var pkgMap = getPackageMap_();
    var pkgInfo = pkgMap[data.package];
    var durationMonths = pkgInfo ? pkgInfo.durationMonths : 1;

    var newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + durationMonths);
    var newExpiryStr = Utilities.formatDate(newExpiry, Session.getScriptTimeZone(), "yyyy-MM-dd");

    memberSheet.getRange(targetRow, 5).setValue(data.package);
    memberSheet.getRange(targetRow, 7).setValue(newExpiryStr);
    memberSheet.getRange(targetRow, 9).setValue('Active');

    // 🎂 ส่วนลดวันเกิด - ถ้าเดือนปัจจุบันตรงกับเดือนเกิดของสมาชิกคนนี้ (ตั้งค่าได้ในหน้า Settings)
    var dobRaw = memberSheet.getRange(targetRow, 18).getValue();
    var isBirthday = isBirthdayMonth_(dobRaw);
    var paidAmount = pkgInfo ? pkgInfo.price : 0;
    var discountNote = '';
    if (isBirthday) {
      var bd = computeBirthdayDiscount_(paidAmount);
      paidAmount = bd.finalAmount;
      discountNote = ' 🎂 (ใช้ส่วนลดวันเกิด ' + bd.label + ')';
    }

    // 🎟️ ส่วนลดคูปอง (ถ้ามี) - คิดต่อจากยอดหลังหักส่วนลดวันเกิดแล้ว
    var couponCode = (data.couponCode || '').toString().trim();
    var couponResult = null;
    if (couponCode) {
      couponResult = validateCoupon_(couponCode, paidAmount, 'membership');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      paidAmount = couponResult.finalAmount;
      discountNote += ' 🎟️ (คูปอง ' + couponResult.code + ' ลด ' + couponResult.discountAmount.toLocaleString('th-TH') + ' บาท)';
    }

    // 🧾 ออกเลขที่ใบเสร็จอัตโนมัติ พร้อมบันทึกยอดเงินที่ชำระ สำหรับใช้ยื่นภาษี
    var receiptNo = getNextReceiptNumber_();

    var renewalPaymentMethod = (data.paymentMethod === 'transfer') ? 'โอนเงิน' : 'เงินสด';
    var renewalDate = new Date();
    paymentSheet.appendRow([renewalDate, data.memberName, data.package, inputQrData, newExpiryStr, receiptNo, paidAmount, '', '', '', '', renewalPaymentMethod]);
    if (couponResult) applyCouponUsage_(couponResult.rowNumber);
    clearRevenueOverrideForDate_(toOverrideDateKey_(renewalDate), session.user, 'ต่ออายุสมาชิก ใบเสร็จ ' + receiptNo);
    logAudit_(session.user, 'RENEW_PAYMENT', data.memberName, 'ต่ออายุสำเร็จ: ' + data.package + ' หมดอายุ ' + newExpiryStr + ' (ใบเสร็จ: ' + receiptNo + ')' + discountNote);
    return {
      success: true,
      message: "🟢 ต่ออายุสมาชิกเรียบร้อยแล้ว!" + discountNote + " เลขที่ใบเสร็จ: " + receiptNo,
      receiptNo: receiptNo,
      isBirthday: isBirthday,
      paidAmount: paidAmount
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getPaymentLogs(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var logs = [];

    // 1) รายการต่ออายุ/สมัครที่จ่ายแยกปกติ - จากชีท Payments
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var numCols = Math.max(sheet.getLastColumn(), 12);
      var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
      for (var i = 0; i < rows.length; i++) {
        var dateObj = rows[i][0];
        if (!dateObj) continue;
        var dateStr = dateObj instanceof Date ? Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : dateObj.toString();
        logs.push({
          timestampRaw: dateObj instanceof Date ? dateObj.getTime() : new Date(dateObj).getTime(),
          timestamp: dateStr,
          memberName: rows[i][1],
          package: rows[i][2],
          qrData: rows[i][3] ? rows[i][3].toString() : "",
          newExpiry: rows[i][4] ? Utilities.formatDate(new Date(rows[i][4]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
          receiptNo: rows[i][5] ? rows[i][5].toString() : "",
          amount: rows[i][6] || 0,
          refundStatus: rows[i][7] || '',
          refundReason: rows[i][8] || '',
          paymentMethod: rows[i][11] || 'เงินสด',
          bundledInDailyBill: false
        });
      }
    }

    // 2) ค่าสมัครสมาชิกที่ถูกรวมเข้าไปในบิล POS ลูกค้ารายวัน (แพ็กเกจเสริม) - ดึงมาจากชีท DailyPayments ด้วย
    // เพื่อไม่ให้ต้องไปงมหาเองว่ารายการไปโผล่อยู่ตรงไหน (เช่นกรณีสมัครพร้อมซื้อของ/รวมบิลกับลูกค้ารายวัน)
    var dailySheet = ensureDailySheet_();
    var dLastRow = dailySheet.getLastRow();
    if (dLastRow > 1) {
      var dNumCols = Math.max(dailySheet.getLastColumn(), 11);
      var dRows = dailySheet.getRange(2, 1, dLastRow - 1, dNumCols).getValues();
      var membershipItemPattern = /^สมัครสมาชิกรายเดือน - (.+) \((.+)\)$/;
      for (var j = 0; j < dRows.length; j++) {
        var dItems = [];
        try { dItems = dRows[j][5] ? JSON.parse(dRows[j][5]) : []; } catch (e2) { dItems = []; }
        dItems.forEach(function (it) {
          var match = membershipItemPattern.exec(it.name || '');
          if (!match) return;
          var dDateObj = dRows[j][0];
          logs.push({
            timestampRaw: dDateObj instanceof Date ? dDateObj.getTime() : new Date(dDateObj).getTime(),
            timestamp: dDateObj instanceof Date ? Utilities.formatDate(dDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : dDateObj.toString(),
            memberName: match[2],
            package: match[1],
            qrData: "",
            newExpiry: "",
            receiptNo: dRows[j][4] ? dRows[j][4].toString() : "",
            amount: (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1),
            refundStatus: dRows[j][6] || '',
            refundReason: dRows[j][7] || '',
            paymentMethod: dRows[j][10] || 'เงินสด',
            bundledInDailyBill: true
          });
        });
      }
    }

    logs.sort(function (a, b) { return b.timestampRaw - a.timestampRaw; });
    return logs.slice(0, 15);
  } catch (e) { return []; }
}

function updatePaymentMethod(receiptNo, paymentMethod, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบข้อมูล' };
    var numCols = Math.max(sheet.getLastColumn(), 12);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo.toString()) {
        sheet.getRange(i + 2, 12).setValue(method);
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'แก้วิธีชำระเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'EDIT_PAYMENT_METHOD', rows[i][1], 'แก้ไขวิธีชำระเงินใบเสร็จ ' + receiptNo + ' เป็น ' + method);
        return { success: true, message: '🟢 แก้ไขวิธีชำระเงินเป็น "' + method + '" แล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function voidMembershipPayment(token, receiptNo, reason) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo) {
        if ((rows[i][7] || '') === 'Refunded') {
          return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };
        }
        var row = i + 2;
        sheet.getRange(row, 8).setValue('Refunded');
        sheet.getRange(row, 9).setValue(reason || '');
        sheet.getRange(row, 10).setValue(session.user);
        sheet.getRange(row, 11).setValue(new Date());
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'VOID_MEMBERSHIP_PAYMENT', rows[i][1], 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' ยอด ' + rows[i][6] + ' บาท เหตุผล: ' + (reason || '-'));
        return { success: true, message: '🟢 ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
