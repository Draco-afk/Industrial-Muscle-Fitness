// DailyPOS — extracted from the original monolithic Code.js

function ensureDailySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DailyPayments');
  if (!sheet) {
    sheet = ss.insertSheet('DailyPayments');
    sheet.appendRow(["Timestamp", "Customer Name", "Phone", "Amount", "Receipt No", "Items JSON", "Refund Status", "Refund Reason", "Refunded By", "Refunded At", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 11)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Items JSON");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Refund Status");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Refund Reason");
  if (!headerRow[8]) sheet.getRange(1, 9).setValue("Refunded By");
  if (!headerRow[9]) sheet.getRange(1, 10).setValue("Refunded At");
  if (!headerRow[10]) sheet.getRange(1, 11).setValue("Payment Method");
  return sheet;
}

function ensureExpenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Expenses');
    sheet.appendRow(["Timestamp", "Date", "Description", "Amount", "Added By", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์วิธีจ่าย ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 6)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Payment Method");
  return sheet;
}

// วิธีจ่ายของรายการรายจ่าย ใช้ตัดสินว่าจะหักเงินออกจากช่องทางไหน
// รายการเก่าที่บันทึกไว้ก่อนมีคอลัมน์นี้ (ค่าว่าง) ให้ถือเป็นเงินโอน
function expensePaymentMethod_(rawValue) {
  var v = (rawValue || '').toString().trim();
  if (!v) return 'โอนเงิน';
  return v === 'โอนเงิน' ? 'โอนเงิน' : 'เงินสด';
}

function ensureCashTransferOverrideSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DailyPaymentOverrides');
  if (!sheet) {
    sheet = ss.insertSheet('DailyPaymentOverrides');
    sheet.appendRow(["Date", "Cash", "Transfer", "Updated By", "Updated At", "Membership", "DayPass", "Products"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 8)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Membership");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("DayPass");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Products");
  return sheet;
}

function setDailyRevenueOverride(dateStr, membership, dayPass, products, cash, transfer, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var mVal = parseFloat(membership), dVal = parseFloat(dayPass), pVal = parseFloat(products);
    var cashVal = parseFloat(cash), transferVal = parseFloat(transfer);
    if (!dateStr) return { success: false, message: 'ไม่พบวันที่' };
    var vals = [mVal, dVal, pVal, cashVal, transferVal];
    for (var v = 0; v < vals.length; v++) {
      if (isNaN(vals[v]) || vals[v] < 0) return { success: false, message: 'กรุณากรอกตัวเลขให้ถูกต้องทุกช่อง (ต้องไม่ติดลบ)' };
    }

    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    var foundRow = -1;
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][0] || '').toString();
        if (rDate === dateStr) { foundRow = i + 2; break; }
      }
    }

    var now = new Date();
    if (foundRow > -1) {
      sheet.getRange(foundRow, 2, 1, 7).setValues([[cashVal, transferVal, session.user, now, mVal, dVal, pVal]]);
    } else {
      sheet.appendRow([dateStr, cashVal, transferVal, session.user, now, mVal, dVal, pVal]);
    }

    logAudit_(session.user, 'EDIT_REVENUE_REPORT', dateStr, 'แก้ไขยอดวันที่ ' + dateStr + ' เป็นสมาชิก ' + mVal + ', รายวัน ' + dVal + ', สินค้า ' + pVal + ', เงินสด ' + cashVal + ', โอน ' + transferVal);
    return { success: true, message: '🟢 บันทึกยอดวันที่ ' + dateStr + ' สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function clearDailyRevenueOverride(dateStr, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][0] || '').toString();
        if (rDate === dateStr) {
          sheet.deleteRow(i + 2);
          logAudit_(session.user, 'CLEAR_REVENUE_OVERRIDE', dateStr, 'ยกเลิกการแก้ไขยอดเอง กลับไปใช้ค่าคำนวณอัตโนมัติของวันที่ ' + dateStr);
          return { success: true, message: '🟢 รีเซ็ตกลับเป็นยอดที่คำนวณอัตโนมัติแล้ว' };
        }
      }
    }
    return { success: true, message: 'วันนี้ไม่มีการแก้ไขเองอยู่แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔓 ปลดล็อกยอดที่แอดมินเคยแก้เองของวันนั้น เมื่อมีเงินเข้า/ออกจริงเกิดขึ้นใหม่
// ถ้าไม่ปลดล็อก บิลใหม่จะถูกยอดที่พิมพ์ค้างไว้บังทั้งวัน ทำให้รายงานไม่ขยับตามที่บันทึกจริง
function clearRevenueOverrideForDate_(dateStr, user, note) {
  try {
    if (!dateStr) return false;
    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;
    var tz = Session.getScriptTimeZone();
    var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], tz, "yyyy-MM-dd") : (rows[i][0] || '').toString();
      if (rDate !== dateStr) continue;
      sheet.deleteRow(i + 2);
      logAudit_(user || 'system', 'AUTO_CLEAR_REVENUE_OVERRIDE', dateStr, 'ยกเลิกยอดที่แก้เองของวันที่ ' + dateStr + ' อัตโนมัติ เพราะมีรายการใหม่: ' + (note || '-'));
      return true;
    }
    return false;
  } catch (e) { return false; } // ห้ามให้การปลดล็อกที่ล้มเหลว ไปทำให้การรับเงิน/คืนเงินพังตามไปด้วย
}

// แปลงค่าวันที่จากชีท (Date หรือข้อความ) เป็น yyyy-MM-dd เพื่อใช้จับคู่กับชีท DailyPaymentOverrides
function toOverrideDateKey_(value) {
  if (!value) return '';
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// paymentMethod ต่อท้ายพารามิเตอร์เดิม เผื่อหน้าเว็บที่ค้าง cache อยู่ยังเรียกแบบ 4 ตัวได้ (จะกลายเป็นเงินสดตามค่าเริ่มต้น)
function addExpense(dateStr, description, amount, token, paymentMethod) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var desc = (description || '').toString().trim();
    var amt = parseFloat(amount);
    if (!desc) return { success: false, message: 'กรุณากรอกรายการที่ซื้อ' };
    if (isNaN(amt) || amt <= 0) return { success: false, message: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' };
    if (!dateStr) return { success: false, message: 'กรุณาเลือกวันที่' };

    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensureExpenseSheet_();
    sheet.appendRow([new Date(), dateStr, desc, amt, session.user, method]);
    clearRevenueOverrideForDate_(dateStr, session.user, 'บันทึกรายจ่าย ' + desc);
    logAudit_(session.user, 'ADD_EXPENSE', desc, 'บันทึกรายจ่ายวันที่ ' + dateStr + ' จำนวน ' + amt.toLocaleString('th-TH') + ' บาท (' + method + ')');
    return { success: true, message: '🟢 บันทึกรายจ่ายสำเร็จแล้ว! (' + method + ')' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getExpenseList(token, startDateStr, endDateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureExpenseSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var numCols = Math.max(sheet.getLastColumn(), 6);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var dateStr = rows[i][1] instanceof Date ? Utilities.formatDate(rows[i][1], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][1] || '').toString();
      if (startDateStr && dateStr < startDateStr) continue;
      if (endDateStr && dateStr > endDateStr) continue;
      list.push({
        rowNumber: i + 2,
        date: dateStr,
        description: rows[i][2],
        amount: rows[i][3] || 0,
        addedBy: rows[i][4] || '',
        paymentMethod: expensePaymentMethod_(rows[i][5])
      });
    }
    list.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return list;
  } catch (e) { return []; }
}

function deleteExpense(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureExpenseSheet_();
    var row = parseInt(rowNumber);
    var desc = sheet.getRange(row, 3).getValue();
    var expenseDate = toOverrideDateKey_(sheet.getRange(row, 2).getValue());
    sheet.deleteRow(row);
    clearRevenueOverrideForDate_(expenseDate, session.user, 'ลบรายจ่าย ' + desc);
    logAudit_(session.user, 'DELETE_EXPENSE', desc, 'ลบรายการรายจ่ายออกจากระบบ');
    return { success: true, message: 'ลบรายการ "' + desc + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function processDailyPayment(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var name = (data.customerName || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อลูกค้า' };

    var items = [];
    var dayPassSubtotal = 0;
    var dayPassItems = data.dayPassItems || []; // [{ type: 'student'|'adult', qty, price }, ...] - รองรับเลือกได้พร้อมกันหลายประเภท/หลายคน
    if (dayPassItems.length > 0) {
      var prices = getDailyPassPrices(token);
      dayPassItems.forEach(function (dp) {
        var qty = parseInt(dp.qty) || 0;
        if (qty <= 0) return;
        var priceVal = parseFloat(dp.price);
        if (isNaN(priceVal) || priceVal < 0) {
          priceVal = (dp.type === 'student') ? prices.student : prices.adult;
        }
        var label = (dp.type === 'student') ? 'นักเรียน/นักศึกษา' : 'ผู้ใหญ่';
        items.push({ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (' + label + ')', price: priceVal, qty: qty });
        dayPassSubtotal += priceVal * qty;
      });
    }
    var productSubtotal = 0;
    if (data.items && data.items.length > 0) {
      data.items.forEach(function (it) {
        var p = parseFloat(it.price) || 0;
        var q = parseInt(it.qty) || 1;
        if (p > 0 && q > 0) { items.push({ name: it.name, price: p, qty: q }); productSubtotal += p * q; }
      });
    }

    // 🥋 ค่าเทรนเนอร์ฟรีแลนซ์ - เก็บเงินแทนให้ในบิลเดียวกัน แต่ไม่ใช่รายรับของยิม (แยกออกจากรายงานรายรับเสมอ)
    // ทำก่อนเช็ค items ว่าง เพราะอนุญาตให้เก็บแค่ค่าเทรนเนอร์อย่างเดียวได้ (ไม่บังคับต้องมีค่าเข้ายิม/สินค้าด้วย)
    var trainerFeeSubtotal = 0;
    var trainerFees = data.trainerFees || []; // [{ name, amount }, ...]
    trainerFees.forEach(function (tf) {
      var tfName = (tf.name || '').toString().trim();
      var tfAmount = parseFloat(tf.amount) || 0;
      if (tfName && tfAmount > 0) {
        items.push({ name: 'ค่าเทรนเนอร์: ' + tfName, price: tfAmount, qty: 1 });
        trainerFeeSubtotal += tfAmount;
      }
    });

    if (items.length === 0) return { success: false, message: 'กรุณาเลือกอย่างน้อยค่าเข้ายิม สินค้า หรือค่าเทรนเนอร์อย่างใดอย่างหนึ่ง' };

    var totalAmount = Math.round((dayPassSubtotal + productSubtotal + trainerFeeSubtotal) * 100) / 100;
    if (totalAmount <= 0) return { success: false, message: 'ยอดชำระต้องมากกว่า 0 บาท' };

    // 🎟️ ส่วนลดคูปอง (ถ้ามี) - คิดจากค่าเข้ายิมเท่านั้น ไม่รวมสินค้า/เครื่องดื่ม
    var couponCode = (data.couponCode || '').toString().trim();
    var couponResult = null;
    if (couponCode) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      couponResult = validateCoupon_(couponCode, dayPassSubtotal, 'daily');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      items.push({ name: 'ส่วนลดคูปอง (' + couponResult.code + ')', price: -couponResult.discountAmount, qty: 1 });
      dayPassSubtotal = couponResult.finalAmount;
      totalAmount -= couponResult.discountAmount;
    }

    // 🏷️ ส่วนลดพิเศษแบบไม่ต้องมีโค้ด (แอดมิน/พนักงานปรับเองหน้าร้าน) - คิดจากค่าเข้ายิมเท่านั้น ไม่รวมสินค้า/เครื่องดื่ม เช่นกัน
    var manualDiscountType = (data.manualDiscountType || '').toString().trim();
    var manualDiscountValue = parseFloat(data.manualDiscountValue) || 0;
    if (manualDiscountType && manualDiscountValue > 0) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      var manualDiscountAmount = manualDiscountType === 'Fixed' ? manualDiscountValue : Math.round(dayPassSubtotal * (manualDiscountValue / 100) * 100) / 100;
      if (manualDiscountAmount > dayPassSubtotal) manualDiscountAmount = dayPassSubtotal;
      var manualDiscountLabel = manualDiscountType === 'Fixed' ? manualDiscountValue.toLocaleString('th-TH') + ' บาท' : manualDiscountValue + '%';
      items.push({ name: 'ส่วนลดพิเศษ (' + manualDiscountLabel + ')', price: -manualDiscountAmount, qty: 1 });
      dayPassSubtotal = Math.round((dayPassSubtotal - manualDiscountAmount) * 100) / 100;
      totalAmount = Math.round((totalAmount - manualDiscountAmount) * 100) / 100;
    }

    // 📦 ตรวจสอบสต็อกสินค้าก่อนขาย (เฉพาะสินค้าที่มีการติดตามสต็อก - เว้นค่าเข้ายิมรายวัน)
    var productSheet = ensureProductSheet_();
    var pLastRow = productSheet.getLastRow();
    var productRows = pLastRow > 1 ? productSheet.getRange(2, 1, pLastRow - 1, 7).getValues() : [];
    var stockDeductions = [];

    for (var idx = 0; idx < items.length; idx++) {
      var item = items[idx];
      if (isDayPassItemName_(item.name)) continue;
      for (var pr = 0; pr < productRows.length; pr++) {
        if (productRows[pr][1] === item.name) {
          var stockVal = productRows[pr][5];
          if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') break; // ไม่ได้ติดตามสต็อกสินค้านี้
          if (stockVal < item.qty) {
            return { success: false, message: '❌ สินค้า "' + item.name + '" เหลือไม่พอ (คงเหลือ ' + stockVal + ' ชิ้น)' };
          }
          stockDeductions.push({ row: pr + 2, newStock: stockVal - item.qty });
          break;
        }
      }
    }

    var sheet = ensureDailySheet_();
    var receiptNo = getNextReceiptNumber_();
    var phone = (data.phone || '').toString().trim();

    var paymentMethod = (data.paymentMethod === 'transfer') ? 'โอนเงิน' : 'เงินสด';
    var billDate = new Date();
    sheet.appendRow([billDate, name, "'" + phone, totalAmount, receiptNo, JSON.stringify(items), '', '', '', '', paymentMethod]);
    if (couponResult) applyCouponUsage_(couponResult.rowNumber);
    clearRevenueOverrideForDate_(toOverrideDateKey_(billDate), session.user, 'รับชำระเงินรายวัน ใบเสร็จ ' + receiptNo);

    // ตัดสต็อกสินค้าหลังบันทึกการขายสำเร็จ
    stockDeductions.forEach(function (d) {
      productSheet.getRange(d.row, 6).setValue(d.newStock);
    });

    var itemSummary = items.map(function (it) { return it.name + (it.qty > 1 ? ' x' + it.qty : ''); }).join(', ');
    logAudit_(session.user, 'DAILY_PAYMENT', name, 'รับชำระ ' + totalAmount + ' บาท (' + itemSummary + ') ใบเสร็จ: ' + receiptNo);
    return { success: true, message: "🟢 รับชำระเงินสำเร็จ! ยอดรวม " + totalAmount.toLocaleString('th-TH') + " บาท เลขที่ใบเสร็จ: " + receiptNo, receiptNo: receiptNo, totalAmount: totalAmount };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getDailyPaymentLogs(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var maxDisplay = 20;
    var startRow = Math.max(2, lastRow - maxDisplay + 1);
    var numRows = lastRow - startRow + 1;
    var rows = sheet.getRange(startRow, 1, numRows, 10).getValues();
    var tz = Session.getScriptTimeZone();
    var logs = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var ts = rows[i][0];
      var tsStr = ts instanceof Date ? Utilities.formatDate(ts, tz, "yyyy-MM-dd HH:mm:ss") : ts.toString();
      var items = [];
      try { items = rows[i][5] ? JSON.parse(rows[i][5]) : []; } catch (e2) { items = []; }
      logs.push({
        timestamp: tsStr,
        customerName: rows[i][1],
        phone: rows[i][2] ? rows[i][2].toString() : "",
        amount: rows[i][3] || 0,
        receiptNo: rows[i][4] ? rows[i][4].toString() : "",
        items: items,
        itemSummary: items.map(function (it) { return it.name + (it.qty > 1 ? ' x' + it.qty : ''); }).join(', '),
        refundStatus: rows[i][6] || '',
        refundReason: rows[i][7] || '',
        paymentMethod: rows[i][10] || 'เงินสด'
      });
    }
    return logs;
  } catch (e) { return []; }
}

function updateDailyPaymentMethod(receiptNo, paymentMethod, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบข้อมูล' };
    var numCols = Math.max(sheet.getLastColumn(), 11);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo.toString()) {
        sheet.getRange(i + 2, 11).setValue(method);
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'แก้วิธีชำระเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'EDIT_PAYMENT_METHOD', rows[i][1], 'แก้ไขวิธีชำระเงินใบเสร็จ ' + receiptNo + ' เป็น ' + method);
        return { success: true, message: '🟢 แก้ไขวิธีชำระเงินเป็น "' + method + '" แล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function voidDailyPayment(token, receiptNo, reason) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) {
        if ((rows[i][6] || '') === 'Refunded') {
          return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };
        }
        var row = i + 2;
        sheet.getRange(row, 7).setValue('Refunded');
        sheet.getRange(row, 8).setValue(reason || '');
        sheet.getRange(row, 9).setValue(session.user);
        sheet.getRange(row, 10).setValue(new Date());

        // 📦 คืนสต็อกสินค้าที่เคยตัดไปตอนขาย (เฉพาะสินค้าที่มีการติดตามสต็อก)
        try {
          var refundedItems = rows[i][5] ? JSON.parse(rows[i][5]) : [];
          if (refundedItems.length > 0) {
            var productSheet = ensureProductSheet_();
            var pLastRow = productSheet.getLastRow();
            if (pLastRow > 1) {
              var productRows = productSheet.getRange(2, 1, pLastRow - 1, 7).getValues();
              refundedItems.forEach(function (it) {
                if (isDayPassItemName_(it.name)) return;
                for (var pr = 0; pr < productRows.length; pr++) {
                  if (productRows[pr][1] === it.name) {
                    var stockVal = productRows[pr][5];
                    if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') break;
                    productSheet.getRange(pr + 2, 6).setValue(stockVal + (it.qty || 1));
                    break;
                  }
                }
              });
            }
          }
        } catch (e3) { /* ไม่ต้องหยุดการคืนเงินถ้าคืนสต็อกไม่สำเร็จ */ }

        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'VOID_DAILY_PAYMENT', rows[i][1], 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' ยอด ' + rows[i][3] + ' บาท เหตุผล: ' + (reason || '-'));
        return { success: true, message: '🟢 ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteDailyPaymentLog(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบรายการนี้' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) {
        var custName = rows[i][1];
        var deletedBillDate = toOverrideDateKey_(rows[i][0]);
        sheet.deleteRow(i + 2);
        clearRevenueOverrideForDate_(deletedBillDate, session.user, 'ลบบิลรายวัน ใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'DELETE_DAILY_PAYMENT', custName, 'ลบรายการชำระเงินรายวัน ใบเสร็จ: ' + receiptNo);
        return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function isDayPassItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเข้าใช้บริการฟิตเนสรายวัน') !== -1;
}

function isMembershipItemName_(itemName) {
  return (itemName || '').toString().indexOf('สมัครสมาชิกรายเดือน') !== -1;
}

function isTrainerFeeItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเทรนเนอร์:') !== -1;
}
