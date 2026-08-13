// Receipts PDF — extracted from the original monolithic Code.js

function buildThermalReceiptHtml_(opts) {
  var itemsHtml = opts.items.map(function (it) {
    return '<div class="item">' +
      '<div class="item-name">' + it.name + '</div>' +
      '<div class="item-line"><span>' + it.qty + ' x ' + it.unitPrice + '</span><span>' + it.lineTotal + '</span></div>' +
      '</div>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบเสร็จ ' + opts.receiptNo + '</title><style>' +
    '@page { size: 80mm auto; margin: 0; }' +
    '* { box-sizing: border-box; }' +
    'html, body { margin: 0; padding: 0; }' +
    'body { width: 80mm; margin: 0 auto; padding: 4mm 3.5mm; font-family: "Sarabun", "Prompt", "TH Sarabun New", monospace, sans-serif; font-size: 12px; color: #000; }' +
    '.center { text-align: center; }' +
    '.gymname { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }' +
    '.meta { font-size: 10px; line-height: 1.5; margin-top: 3px; }' +
    '.divider { border-top: 1px dashed #000; margin: 7px 0; }' +
    '.doctitle { font-weight: bold; font-size: 13px; margin-bottom: 6px; }' +
    '.row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; gap: 8px; }' +
    '.row span:first-child { color: #333; }' +
    '.row span:last-child { text-align: right; }' +
    '.item { margin: 7px 0; }' +
    '.item-name { font-size: 12px; font-weight: bold; }' +
    '.item-line { display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 1px; }' +
    '.total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; margin-top: 2px; }' +
    '.footer { text-align: center; font-size: 10px; margin-top: 14px; line-height: 1.7; }' +
    '.printbar { text-align: center; margin-top: 16px; }' +
    '.printbar button { background: #111; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }' +
    '@media print { .printbar { display: none; } body { padding: 2mm 3.5mm; } }' +
    '</style></head><body>' +
    '<div class="center">' +
    '<div class="gymname">' + GYM_INFO.name + '</div>' +
    '<div class="meta">' + GYM_INFO.address + '<br>เลขผู้เสียภาษี: ' + GYM_INFO.taxId + '<br>โทร: ' + GYM_INFO.phone + '</div>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<div class="center doctitle">ใบเสร็จรับเงิน / RECEIPT</div>' +
    '<div class="row"><span>เลขที่</span><span>' + opts.receiptNo + '</span></div>' +
    '<div class="row"><span>วันที่</span><span>' + opts.dateStr + ' ' + opts.timeStr + ' น.</span></div>' +
    '<div class="row"><span>ลูกค้า</span><span>' + opts.custName + '</span></div>' +
    (opts.custPhone ? '<div class="row"><span>เบอร์โทร</span><span>' + opts.custPhone + '</span></div>' : '') +
    (opts.extraLine ? '<div class="row"><span>' + opts.extraLine[0] + '</span><span>' + opts.extraLine[1] + '</span></div>' : '') +
    (opts.paymentMethod ? '<div class="row"><span>ชำระโดย</span><span>' + opts.paymentMethod + '</span></div>' : '') +
    '<div class="divider"></div>' +
    itemsHtml +
    '<div class="divider"></div>' +
    '<div class="total-row"><span>ยอดชำระทั้งสิ้น</span><span>' + opts.totalText + ' บาท</span></div>' +
    '<div class="divider"></div>' +
    '<div class="footer">ผู้รับเงิน: ' + opts.cashierName + '<br>ขอบคุณที่ใช้บริการครับ/ค่ะ 🙏</div>' +
    '<div class="printbar"><button onclick="window.print()">🖨️ พิมพ์ใบเสร็จ</button></div>' +
    '</body>' +
    '<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>' +
    '</html>';
}

function generateDailyReceiptPDF(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) { target = rows[i]; break; }
    }
    if (!target) return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };

    var tz = Session.getScriptTimeZone();
    var payDate = target[0] instanceof Date ? target[0] : new Date(target[0]);
    var payDateStr = Utilities.formatDate(payDate, tz, "dd/MM/yyyy");
    var payTimeStr = Utilities.formatDate(payDate, tz, "HH:mm");
    var custName = target[1];
    var custPhone = target[2] ? target[2].toString() : '';
    var amount = target[3] || 0;
    var amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var paymentMethod = target[10] || '';

    var items = [];
    try { items = target[5] ? JSON.parse(target[5]) : []; } catch (e2) { items = []; }
    if (items.length === 0) {
      items = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', price: amount, qty: 1 }]; // รองรับข้อมูลเก่าก่อนอัปเดตระบบ
    }

    var itemsForTemplate = items.map(function (it) {
      return {
        name: it.name,
        qty: it.qty,
        unitPrice: Number(it.price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        lineTotal: Number(it.price * it.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      };
    });

    var html = buildThermalReceiptHtml_({
      receiptNo: receiptNo,
      dateStr: payDateStr,
      timeStr: payTimeStr,
      custName: custName,
      custPhone: custPhone,
      items: itemsForTemplate,
      totalText: amountText,
      cashierName: session.user,
      paymentMethod: paymentMethod
    });

    var pdfBlob = Utilities.newBlob(html, 'text/html', receiptNo + '.html').getAs('application/pdf').setName('Receipt_' + receiptNo + '.pdf');

    logAudit_(session.user, 'PRINT_DAILY_RECEIPT', custName, 'พิมพ์ใบเสร็จรายวันเลขที่ ' + receiptNo);
    return { success: true, html: html, pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()), filename: 'Receipt_' + receiptNo + '.pdf' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function exportRevenueReportPDF(token, startDateStr, endDateStr) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var report = getRevenueReport(token, startDateStr, endDateStr);
  var headers = ["วันที่", "รายรับสมาชิกรายเดือน", "รายรับค่าเข้ารายวัน", "รายรับขายสินค้า", "รวม (บาท)"];
  var rows = report.breakdown.map(function (d) {
    var dayTotal = d.membership + d.dayPass + d.products;
    return [d.date, d.membership, d.dayPass, d.products, dayTotal];
  });
  rows.push(["รวมทั้งหมด", report.totals.membership, report.totals.dayPass, report.totals.products, report.totals.grandTotal]);
  return generatePDFReport("รายงานรายรับแยกช่องทาง (" + startDateStr + " ถึง " + endDateStr + ")", headers, rows, "Revenue_Report_" + startDateStr + "_to_" + endDateStr);
}

function generatePDFReport(title, headers, dataRows, filename) {
  try {
    var html = '<!DOCTYPE html><html><head><style>' +
      'body { font-family: "Sarabun", "Prompt", sans-serif; padding: 20px; color: #111; }' +
      'h1 { text-align: center; color: #dc2626; font-size: 22px; margin-bottom: 5px; text-transform: uppercase; }' +
      'p.subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 20px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }' +
      'th { background-color: #222; color: #fff; padding: 8px; border: 1px solid #333; text-align: left; }' +
      'td { padding: 8px; border: 1px solid #ddd; }' +
      'tr:nth-child(even) { background-color: #f9f9f9; }' +
      '.footer { margin-top: 30px; font-size: 10px; text-align: right; color: #888; }' +
      '</style></head><body>' +
      '<h1>INDUSTRIAL MUSCLE GYM</h1>' +
      '<p class="subtitle">' + title + ' (พิมพ์เมื่อ: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss") + ')</p>' +
      '<table><thead><tr>';
      
    headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    
    dataRows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(cell) { html += '<td>' + (cell !== undefined && cell !== null ? cell : '-') + '</td>'; });
      html += '</tr>';
    });
    
    html += '</tbody></table>' +
      '<div class="footer">เอกสารรายงานอัตโนมัติจากระบบ Industrial Muscle Management</div>' +
      '</body></html>';

    var blob = Utilities.newBlob(html, 'text/html', filename + '.html').getAs('application/pdf').setName(filename + '.pdf');
    return { success: true, base64: Utilities.base64Encode(blob.getBytes()), filename: filename + '.pdf' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function exportMembersPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var list = getMemberList(token);
  var headers = ["ลำดับ", "ชื่อ-นามสกุล", "เบอร์โทร", "แพ็กเกจ", "หมดอายุ", "สถานะ", "เข้ายิม (ครั้ง)"];
  var rows = list.map(function(m, idx) {
    return [idx + 1, m.fullName, m.phone, m.package, m.expiryDate, m.status, m.checkInCount];
  });
  return generatePDFReport("รายงานรายชื่อสมาชิกทั้งหมด", headers, rows, "Members_Report");
}

function exportPaymentsPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var logs = getPaymentLogs(token);
  var headers = ["วันเวลาทำรายการ", "ชื่อสมาชิก", "แพ็กเกจ", "รหัสสลิป QR", "วันหมดอายุใหม่", "เลขที่ใบเสร็จ", "ยอดเงิน (บาท)", "สถานะ"];
  var rows = logs.map(function(p) {
    return [p.timestamp, p.memberName, p.package, p.qrData, p.newExpiry, p.receiptNo, p.amount, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ'];
  });
  return generatePDFReport("รายงานประวัติการชำระเงิน", headers, rows, "Payments_Report");
}

function exportDailyPaymentsPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var logs = getDailyPaymentLogs(token);
  var headers = ["วันเวลาทำรายการ", "ชื่อลูกค้า", "เบอร์โทร", "รายการ", "จำนวนเงิน (บาท)", "เลขที่ใบเสร็จ", "สถานะ"];
  var rows = logs.map(function(p) {
    return [p.timestamp, p.customerName, p.phone, p.itemSummary || '-', p.amount, p.receiptNo, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ'];
  });
  return generatePDFReport("รายงานลูกค้ารายวัน / ขายสินค้าหน้ายิม", headers, rows, "DailyPayments_Report");
}

function generateReceiptPDF(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Payments');
    if (!sheet) return { success: false, message: 'ไม่พบข้อมูลการชำระเงิน' };

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var numCols = Math.max(sheet.getLastColumn(), 7);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo) { target = rows[i]; break; }
    }
    if (!target) return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };

    // ดึงเบอร์โทรของสมาชิกจากชีท Members มาแสดงในใบเสร็จ
    var memberSheet = ss.getSheetByName('Members');
    var memberPhone = '';
    if (memberSheet) {
      var mRows = memberSheet.getDataRange().getValues();
      for (var j = 1; j < mRows.length; j++) {
        if (mRows[j][1].toString() === target[1].toString()) {
          memberPhone = mRows[j][2] ? mRows[j][2].toString() : '';
          break;
        }
      }
    }

    var tz = Session.getScriptTimeZone();
    var payDate = target[0] instanceof Date ? target[0] : new Date(target[0]);
    var payDateStr = Utilities.formatDate(payDate, tz, "dd/MM/yyyy");
    var payTimeStr = Utilities.formatDate(payDate, tz, "HH:mm");
    var pkgName = target[2];
    var newExpiry = target[4];
    var amount = target[6] || ((getPackageMap_()[pkgName] || {}).price || 0);
    var amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var paymentMethod = target[11] || '';

    var html = buildThermalReceiptHtml_({
      receiptNo: receiptNo,
      dateStr: payDateStr,
      timeStr: payTimeStr,
      custName: target[1],
      custPhone: memberPhone,
      extraLine: ['หมดอายุใหม่', newExpiry],
      items: [{
        name: 'ค่าสมาชิก แพ็กเกจ ' + pkgName,
        qty: 1,
        unitPrice: amountText,
        lineTotal: amountText
      }],
      totalText: amountText,
      cashierName: session.user,
      paymentMethod: paymentMethod
    });

    var pdfBlob = Utilities.newBlob(html, 'text/html', receiptNo + '.html').getAs('application/pdf').setName('Receipt_' + receiptNo + '.pdf');

    logAudit_(session.user, 'PRINT_RECEIPT', target[1], 'พิมพ์ใบเสร็จเลขที่ ' + receiptNo);
    return { success: true, html: html, pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()), filename: 'Receipt_' + receiptNo + '.pdf' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
