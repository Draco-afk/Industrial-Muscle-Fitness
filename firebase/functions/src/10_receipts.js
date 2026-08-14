// Receipts / reports — ported from
// apps-script-source-refactored/12_Receipts_PDF.js.
//
// Adaptation: the original used Utilities.newBlob(html).getAs('application/pdf'),
// an Apps-Script-only HTML->PDF converter with no Cloud Functions equivalent
// (would need a headless-Chrome dependency like puppeteer). Since the
// generated HTML was always print-styled for the browser's own print dialog
// anyway (@page/@media print rules, an auto window.print() on load), these
// functions now return the HTML directly instead of a PDF blob — the
// frontend opens it in a new tab and the browser's native "Print > Save as
// PDF" produces the same result the user actually wants.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { requireAuth } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { db } = require('./util/admin');
const config = require('./00_config');

function buildThermalReceiptHtml_(opts) {
  const itemsHtml = opts.items.map((it) =>
    `<div class="item"><div class="item-name">${it.name}</div><div class="item-line"><span>${it.qty} x ${it.unitPrice}</span><span>${it.lineTotal}</span></div></div>`
  ).join('');

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
    '<div class="gymname">' + config.GYM_INFO.name + '</div>' +
    '<div class="meta">' + config.GYM_INFO.address + '<br>เลขผู้เสียภาษี: ' + config.GYM_INFO.taxId + '<br>โทร: ' + config.GYM_INFO.phone + '</div>' +
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

function generatePDFReport_(title, headers, dataRows, filename) {
  let html = '<!DOCTYPE html><html><head><style>' +
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
    `<p class="subtitle">${title} (พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')})</p>` +
    '<table><thead><tr>';
  headers.forEach((h) => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  dataRows.forEach((row) => {
    html += '<tr>';
    row.forEach((cell) => { html += `<td>${cell !== undefined && cell !== null ? cell : '-'}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table><div class="footer">เอกสารรายงานอัตโนมัติจากระบบ Industrial Muscle Management</div></body></html>';
  return { success: true, html, filename: filename + '.html' };
}

exports.generateDailyReceiptPDF = onCall(async (request) => {
  const authCtx = requireAuth(request, 'admin');
  const { receiptNo } = request.data || {};
  try {
    const snap = await db.collection('dailyPayments').where('receiptNo', '==', receiptNo).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo} ในระบบ` };
    const d = snap.docs[0].data();

    const payDate = d.timestamp ? d.timestamp.toDate() : new Date();
    const payDateStr = payDate.toLocaleDateString('th-TH');
    const payTimeStr = payDate.toTimeString().slice(0, 5);
    const amount = d.amount || 0;
    const amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let items = [];
    try { items = d.itemsJson ? JSON.parse(d.itemsJson) : []; } catch (e2) { items = []; }
    if (items.length === 0) items = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', price: amount, qty: 1 }];

    const itemsForTemplate = items.map((it) => ({
      name: it.name, qty: it.qty,
      unitPrice: Number(it.price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      lineTotal: Number(it.price * it.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }));

    const html = buildThermalReceiptHtml_({
      receiptNo, dateStr: payDateStr, timeStr: payTimeStr, custName: d.customerName, custPhone: d.phone || '',
      items: itemsForTemplate, totalText: amountText, cashierName: authCtx.token.adminRole || authCtx.uid, paymentMethod: d.paymentMethod || ''
    });

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'PRINT_DAILY_RECEIPT', d.customerName, `พิมพ์ใบเสร็จรายวันเลขที่ ${receiptNo}`);
    return { success: true, html, filename: `Receipt_${receiptNo}.html` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.generateReceiptPDF = onCall(async (request) => {
  const authCtx = requireAuth(request, 'admin');
  const { receiptNo } = request.data || {};
  try {
    const snap = await db.collection('payments').where('receiptNo', '==', receiptNo).limit(1).get();
    if (snap.empty) return { success: false, message: `ไม่พบใบเสร็จเลขที่ ${receiptNo} ในระบบ` };
    const p = snap.docs[0].data();

    const memberSnap = await db.collection('members').where('fullName', '==', p.memberName).limit(1).get();
    const memberPhone = memberSnap.empty ? '' : (memberSnap.docs[0].data().phone || '');

    const payDate = p.timestamp ? p.timestamp.toDate() : new Date();
    const payDateStr = payDate.toLocaleDateString('th-TH');
    const payTimeStr = payDate.toTimeString().slice(0, 5);
    let amount = p.amount;
    if (!amount) {
      const pkgSnap = await db.collection('packages').doc(p.package).get();
      amount = pkgSnap.exists ? (pkgSnap.data().price || 0) : 0;
    }
    const amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const html = buildThermalReceiptHtml_({
      receiptNo, dateStr: payDateStr, timeStr: payTimeStr, custName: p.memberName, custPhone: memberPhone,
      extraLine: ['หมดอายุใหม่', p.newExpiryDate],
      items: [{ name: `ค่าสมาชิก แพ็กเกจ ${p.package}`, qty: 1, unitPrice: amountText, lineTotal: amountText }],
      totalText: amountText, cashierName: authCtx.token.adminRole || authCtx.uid, paymentMethod: p.paymentMethod || ''
    });

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'PRINT_RECEIPT', p.memberName, `พิมพ์ใบเสร็จเลขที่ ${receiptNo}`);
    return { success: true, html, filename: `Receipt_${receiptNo}.html` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.exportMembersPDF = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { getMemberListCore_ } = require('./02_members');
  const list = await getMemberListCore_();
  const headers = ['ลำดับ', 'ชื่อ-นามสกุล', 'เบอร์โทร', 'แพ็กเกจ', 'หมดอายุ', 'สถานะ', 'เข้ายิม (ครั้ง)'];
  const rows = list.map((m, idx) => [idx + 1, m.fullName, m.phone, m.package, m.expiryDate, m.status, m.checkInCount]);
  return generatePDFReport_('รายงานรายชื่อสมาชิกทั้งหมด', headers, rows, 'Members_Report');
});

exports.exportPaymentsPDF = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { getPaymentLogsCore_ } = require('./08_payments');
  const logs = await getPaymentLogsCore_();
  const headers = ['วันเวลาทำรายการ', 'ชื่อสมาชิก', 'แพ็กเกจ', 'รหัสสลิป QR', 'วันหมดอายุใหม่', 'เลขที่ใบเสร็จ', 'ยอดเงิน (บาท)', 'สถานะ'];
  const rows = logs.map((p) => [p.timestamp, p.memberName, p.package, p.qrData, p.newExpiry, p.receiptNo, p.amount, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ']);
  return generatePDFReport_('รายงานประวัติการชำระเงิน', headers, rows, 'Payments_Report');
});

exports.exportDailyPaymentsPDF = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { getDailyPaymentLogsCore_ } = require('./09_dailypos');
  const logs = await getDailyPaymentLogsCore_();
  const headers = ['วันเวลาทำรายการ', 'ชื่อลูกค้า', 'เบอร์โทร', 'รายการ', 'จำนวนเงิน (บาท)', 'เลขที่ใบเสร็จ', 'สถานะ'];
  const rows = logs.map((p) => [p.timestamp, p.customerName, p.phone, p.itemSummary || '-', p.amount, p.receiptNo, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ']);
  return generatePDFReport_('รายงานลูกค้ารายวัน / ขายสินค้าหน้ายิม', headers, rows, 'DailyPayments_Report');
});

exports.exportRevenueReportPDF = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { startDateStr, endDateStr } = request.data || {};
  const { getRevenueReportCore_ } = require('./11_reports');
  const report = await getRevenueReportCore_(startDateStr, endDateStr);
  const headers = ['วันที่', 'รายรับสมาชิกรายเดือน', 'รายรับค่าเข้ารายวัน', 'รายรับขายสินค้า', 'รวม (บาท)'];
  const rows = report.breakdown.map((d) => [d.date, d.membership, d.dayPass, d.products, d.membership + d.dayPass + d.products]);
  rows.push(['รวมทั้งหมด', report.totals.membership, report.totals.dayPass, report.totals.products, report.totals.grandTotal]);
  return generatePDFReport_(`รายงานรายรับแยกช่องทาง (${startDateStr} ถึง ${endDateStr})`, headers, rows, `Revenue_Report_${startDateStr}_to_${endDateStr}`);
});
