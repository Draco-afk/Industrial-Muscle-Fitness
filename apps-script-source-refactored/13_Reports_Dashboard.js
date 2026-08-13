// Reports Dashboard — extracted from the original monolithic Code.js

function getMonthlyStats(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var monthsBack = 6;
    var now = new Date();
    var buckets = [];
    var keyIndex = {};

    for (var m = monthsBack - 1; m >= 0; m--) {
      var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      var key = Utilities.formatDate(d, tz, "yyyy-MM");
      var label = Utilities.formatDate(d, tz, "MMM yyyy");
      var bucket = { key: key, label: label, newMembers: 0, revenue: 0 };
      buckets.push(bucket);
      keyIndex[key] = bucket;
    }

    var memberSheet = ss.getSheetByName('Members');
    if (memberSheet) {
      var mRows = memberSheet.getDataRange().getValues();
      for (var i = 1; i < mRows.length; i++) {
        var startRaw = mRows[i][5];
        if (!startRaw) continue;
        var startDate = startRaw instanceof Date ? startRaw : new Date(startRaw);
        var key1 = Utilities.formatDate(startDate, tz, "yyyy-MM");
        if (keyIndex[key1]) keyIndex[key1].newMembers++;
      }
    }

    var paymentSheet = ensurePaymentSheet_();
    var pkgMapForStats = getPackageMap_();
    var pRows = paymentSheet.getDataRange().getValues();
    for (var j = 1; j < pRows.length; j++) {
      var tsRaw = pRows[j][0];
      if (!tsRaw) continue;
      if ((pRows[j][7] || '') === 'Refunded') continue; // ข้ามรายการที่ยกเลิก/คืนเงินแล้ว
      var ts = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
      var key2 = Utilities.formatDate(ts, tz, "yyyy-MM");
      var pkg = pRows[j][2];
      var price = pRows[j][6] || ((pkgMapForStats[pkg] || {}).price || 0);
      if (keyIndex[key2]) keyIndex[key2].revenue += price;
    }

    // 🎫 รวมรายได้จากลูกค้ารายวันเข้าไปในกราฟรายเดือนด้วย
    var dailySheet = ensureDailySheet_();
    var dRows = dailySheet.getDataRange().getValues();
    for (var k = 1; k < dRows.length; k++) {
      var dtsRaw = dRows[k][0];
      if (!dtsRaw) continue;
      if ((dRows[k][6] || '') === 'Refunded') continue; // ข้ามรายการที่ยกเลิก/คืนเงินแล้ว
      var dts = dtsRaw instanceof Date ? dtsRaw : new Date(dtsRaw);
      var key3 = Utilities.formatDate(dts, tz, "yyyy-MM");
      var dAmount = dRows[k][3] || 0;
      if (keyIndex[key3]) keyIndex[key3].revenue += dAmount;
    }

    return buckets;
  } catch (e) { return []; }
}

function getRevenueReport(token, startDateStr, endDateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();

    var startDate = new Date(startDateStr + 'T00:00:00');
    var endDate = new Date(endDateStr + 'T23:59:59');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
      throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    }

    // เตรียม bucket รายวันสำหรับทุกวันในช่วงที่เลือก (เติม 0 ไว้ก่อน เพื่อให้กราฟ/ตารางต่อเนื่องไม่ขาดช่วง)
    var dailyBuckets = {};
    var orderedKeys = [];
    var cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    var endMid = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    while (cursor <= endMid) {
      var key = Utilities.formatDate(cursor, tz, "yyyy-MM-dd");
      dailyBuckets[key] = { date: key, membership: 0, dayPass: 0, products: 0, membershipCount: 0, dailyTxnCount: 0, expenses: 0, cash: 0, transfer: 0 };
      orderedKeys.push(key);
      cursor.setDate(cursor.getDate() + 1);
    }

    var totalMembership = 0, totalDayPass = 0, totalProducts = 0, totalTrainerFees = 0, totalExpenses = 0, totalCash = 0, totalTransfer = 0;
    var membershipTxnCount = 0, dailyTxnCount = 0;
    var productRevenueMap = {}; // ชื่อสินค้า -> { qty, revenue }
    var trainerFeeMap = {}; // ชื่อเทรนเนอร์ -> ยอดที่เก็บแทนให้สะสม

    // 1) รายรับจากสมาชิกรายเดือน (ต่ออายุ/สมัครใหม่) - ชีท Payments
    var paymentSheet = ensurePaymentSheet_();
    var pLastRow = paymentSheet.getLastRow();
    if (pLastRow > 1) {
      var pkgMapForReport = getPackageMap_();
      var pNumCols = Math.max(paymentSheet.getLastColumn(), 12);
      var pRows = paymentSheet.getRange(2, 1, pLastRow - 1, pNumCols).getValues();
      for (var i = 0; i < pRows.length; i++) {
        var pts = pRows[i][0];
        if (!pts) continue;
        if ((pRows[i][7] || '') === 'Refunded') continue; // ข้ามรายการที่ยกเลิก/คืนเงินแล้ว
        var pDate = pts instanceof Date ? pts : new Date(pts);
        if (pDate < startDate || pDate > endDate) continue;
        var pKey = Utilities.formatDate(pDate, tz, "yyyy-MM-dd");
        var pAmount = pRows[i][6] || ((pkgMapForReport[pRows[i][2]] || {}).price || 0);
        totalMembership += pAmount;
        membershipTxnCount++;
        if (dailyBuckets[pKey]) {
          dailyBuckets[pKey].membership += pAmount;
          dailyBuckets[pKey].membershipCount++;
        }
        var pPaymentMethod = pRows[i][11] || 'เงินสด'; // ข้อมูลเก่าก่อนมีระบบนี้ ถือว่าเป็นเงินสดไว้ก่อน
        if (pPaymentMethod === 'โอนเงิน') {
          totalTransfer += pAmount;
          if (dailyBuckets[pKey]) dailyBuckets[pKey].transfer += pAmount;
        } else {
          totalCash += pAmount;
          if (dailyBuckets[pKey]) dailyBuckets[pKey].cash += pAmount;
        }
      }
    }

    // 2) รายรับจากลูกค้ารายวัน + ขายสินค้า (บิลเดียวกัน แยกยอดตามรายการ) - ชีท DailyPayments
    var dailySheet = ensureDailySheet_();
    var dLastRow = dailySheet.getLastRow();
    if (dLastRow > 1) {
      var dNumCols = Math.max(dailySheet.getLastColumn(), 11);
      var dRows = dailySheet.getRange(2, 1, dLastRow - 1, dNumCols).getValues();
      for (var j = 0; j < dRows.length; j++) {
        var dts = dRows[j][0];
        if (!dts) continue;
        if ((dRows[j][6] || '') === 'Refunded') continue; // ข้ามรายการที่ยกเลิก/คืนเงินแล้ว
        var dDate = dts instanceof Date ? dts : new Date(dts);
        if (dDate < startDate || dDate > endDate) continue;
        var dKey = Utilities.formatDate(dDate, tz, "yyyy-MM-dd");

        var dItems = [];
        try { dItems = dRows[j][5] ? JSON.parse(dRows[j][5]) : []; } catch (e2) { dItems = []; }
        if (dItems.length === 0) {
          // ข้อมูลเก่าก่อนมีระบบตะกร้า ให้นับเป็นค่าเข้ารายวันทั้งหมด
          dItems = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', price: dRows[j][3] || 0, qty: 1 }];
        }

        dailyTxnCount++;
        if (dailyBuckets[dKey]) dailyBuckets[dKey].dailyTxnCount++;

        dItems.forEach(function (it) {
          var lineTotal = (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1);
          if (isTrainerFeeItemName_(it.name)) {
            // 🥋 ค่าเทรนเนอร์ฟรีแลนซ์ - เก็บแทนให้เฉยๆ ไม่นับเป็นรายรับของยิมเด็ดขาด แยกเก็บต่างหาก
            totalTrainerFees += lineTotal;
            var trainerNameForMap = it.name.replace('ค่าเทรนเนอร์: ', '');
            if (!trainerFeeMap[trainerNameForMap]) trainerFeeMap[trainerNameForMap] = 0;
            trainerFeeMap[trainerNameForMap] += lineTotal;
          } else if (isDayPassItemName_(it.name)) {
            totalDayPass += lineTotal;
            if (dailyBuckets[dKey]) dailyBuckets[dKey].dayPass += lineTotal;
          } else if (isMembershipItemName_(it.name)) {
            totalMembership += lineTotal;
            membershipTxnCount++;
            if (dailyBuckets[dKey]) {
              dailyBuckets[dKey].membership += lineTotal;
              dailyBuckets[dKey].membershipCount++;
            }
          } else {
            totalProducts += lineTotal;
            if (dailyBuckets[dKey]) dailyBuckets[dKey].products += lineTotal;
            if (!productRevenueMap[it.name]) productRevenueMap[it.name] = { qty: 0, revenue: 0 };
              productRevenueMap[it.name].qty += (parseInt(it.qty) || 1);
              productRevenueMap[it.name].revenue += lineTotal;
            }
          });

        // 💵 แยกยอดเงินสด/โอนเงิน ตามวิธีชำระของบิลนี้ (คิดเฉพาะส่วนรายรับของยิม ไม่รวมค่าเทรนเนอร์ที่เก็บแทนให้)
        var dTrainerFeeAmount = 0;
        dItems.forEach(function (it) {
          if (isTrainerFeeItemName_(it.name)) dTrainerFeeAmount += (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1);
        });
        var dGymPortion = (dRows[j][3] || 0) - dTrainerFeeAmount;
        var dPaymentMethod = dRows[j][10] || 'เงินสด'; // ข้อมูลเก่าก่อนมีระบบนี้ ถือว่าเป็นเงินสดไว้ก่อน
        if (dPaymentMethod === 'โอนเงิน') {
          totalTransfer += dGymPortion;
          if (dailyBuckets[dKey]) dailyBuckets[dKey].transfer += dGymPortion;
        } else {
          totalCash += dGymPortion;
          if (dailyBuckets[dKey]) dailyBuckets[dKey].cash += dGymPortion;
        }
        }
      }

    // 3) รายจ่าย (แอดมินกรอกเอง) - หักออกจากรายรับเพื่อคำนวณกำไรสุทธิ
    var expenseSheet = ensureExpenseSheet_();
    var eLastRow = expenseSheet.getLastRow();
    if (eLastRow > 1) {
      var eRows = expenseSheet.getRange(2, 1, eLastRow - 1, 5).getValues();
      for (var k = 0; k < eRows.length; k++) {
        var eDateRaw = eRows[k][1];
        var eKey = eDateRaw instanceof Date ? Utilities.formatDate(eDateRaw, tz, "yyyy-MM-dd") : (eDateRaw || '').toString();
        if (eKey < startDateStr || eKey > endDateStr) continue;
        var eAmount = eRows[k][3] || 0;
        totalExpenses += eAmount;
        if (dailyBuckets[eKey]) dailyBuckets[eKey].expenses += eAmount;
      }
    }

    // 4) ยอดที่แอดมินแก้ไขเองในรายงาน (ถ้ามี) - ใช้แทนที่ยอดที่คำนวณอัตโนมัติของวันนั้นๆ ทั้งแถว (สมาชิก/รายวัน/สินค้า/เงินสด/เงินโอน)
    var overrideSheet = ensureCashTransferOverrideSheet_();
    var oLastRow = overrideSheet.getLastRow();
    if (oLastRow > 1) {
      var oNumCols = Math.max(overrideSheet.getLastColumn(), 8);
      var oRows = overrideSheet.getRange(2, 1, oLastRow - 1, oNumCols).getValues();
      for (var m = 0; m < oRows.length; m++) {
        var oKey = oRows[m][0] instanceof Date ? Utilities.formatDate(oRows[m][0], tz, "yyyy-MM-dd") : (oRows[m][0] || '').toString();
        if (oKey < startDateStr || oKey > endDateStr) continue;
        if (!dailyBuckets[oKey]) continue;

        // หักยอดเดิมที่คำนวณอัตโนมัติของวันนั้นออกจากยอดรวมก่อน แล้วค่อยบวกยอดที่แก้ไขใหม่เข้าไปแทน
        totalCash -= dailyBuckets[oKey].cash;
        totalTransfer -= dailyBuckets[oKey].transfer;
        totalMembership -= dailyBuckets[oKey].membership;
        totalDayPass -= dailyBuckets[oKey].dayPass;
        totalProducts -= dailyBuckets[oKey].products;

        dailyBuckets[oKey].cash = oRows[m][1] || 0;
        dailyBuckets[oKey].transfer = oRows[m][2] || 0;
        // คอลัมน์ Membership/DayPass/Products (F,G,H) เพิ่มเข้ามาทีหลัง - ถ้าเป็นข้อมูลเก่าที่มีแค่เงินสด/โอน ให้คงยอดสมาชิก/รายวัน/สินค้าเดิมไว้ (ไม่ทับด้วยเลข 0)
        var hasFullOverride = oRows[m][5] !== '' && oRows[m][5] !== undefined && oRows[m][5] !== null;
        if (hasFullOverride) {
          dailyBuckets[oKey].membership = oRows[m][5] || 0;
          dailyBuckets[oKey].dayPass = oRows[m][6] || 0;
          dailyBuckets[oKey].products = oRows[m][7] || 0;
        } else {
          dailyBuckets[oKey].membership += 0; // คงค่าเดิมที่คำนวณอัตโนมัติไว้ (แค่หักออกแล้วบวกกลับเข้าไปเหมือนเดิม)
        }
        dailyBuckets[oKey].cashTransferOverridden = true;

        totalCash += dailyBuckets[oKey].cash;
        totalTransfer += dailyBuckets[oKey].transfer;
        totalMembership += dailyBuckets[oKey].membership;
        totalDayPass += dailyBuckets[oKey].dayPass;
        totalProducts += dailyBuckets[oKey].products;
      }
    }

    var breakdown = orderedKeys.map(function (k) { return dailyBuckets[k]; });
    var topProducts = Object.keys(productRevenueMap).map(function (name) {
      return { name: name, qty: productRevenueMap[name].qty, revenue: productRevenueMap[name].revenue };
    }).sort(function (a, b) { return b.revenue - a.revenue; });
    var trainerFeeBreakdown = Object.keys(trainerFeeMap).map(function (name) {
      return { name: name, amount: trainerFeeMap[name] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    return {
      startDate: startDateStr,
      endDate: endDateStr,
      totals: {
        membership: totalMembership,
        dayPass: totalDayPass,
        products: totalProducts,
        grandTotal: totalMembership + totalDayPass + totalProducts,
        membershipCount: membershipTxnCount,
        dailyCount: dailyTxnCount,
        expenses: totalExpenses,
        netProfit: (totalMembership + totalDayPass + totalProducts) - totalExpenses,
        cash: totalCash,
        transfer: totalTransfer
      },
      breakdown: breakdown,
      topProducts: topProducts,
      trainerFees: {
        total: totalTrainerFees,
        breakdown: trainerFeeBreakdown
      }
    };
  } catch (e) { throw new Error(e.toString()); }
}

function getDashboardStats(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var memberSheet = ss.getSheetByName('Members');
    var total = 0, active = 0;
    if (memberSheet) {
      var lastRow = memberSheet.getLastRow();
      if (lastRow > 1) {
        var rows = memberSheet.getRange(2, 1, lastRow - 1, 9).getValues();
        total = rows.length;
        var today = new Date();
        rows.forEach(function(r) {
          var status = r[8] || 'Active';
          var expiry = new Date(r[6]);
          if (status === 'Active' && expiry >= today) active++;
        });
      }
    }

    var logSheet = ss.getSheetByName('Logs');
    var logs = [];
    if (logSheet) {
      var lLastRow = logSheet.getLastRow();
      if (lLastRow > 1) {
        var maxDisplay = 15;
        var startRow = Math.max(2, lLastRow - maxDisplay + 1);
        var numRows = lLastRow - startRow + 1;
        var lRows = logSheet.getRange(startRow, 1, numRows, 5).getValues();
        var tz = Session.getScriptTimeZone();
        for (var i = lRows.length - 1; i >= 0; i--) {
          var t = lRows[i][0];
          var tStr = t instanceof Date ? Utilities.formatDate(t, tz, "HH:mm:ss") : t.toString();
          logs.push({ time: tStr, name: lRows[i][1], uid: lRows[i][2], status: lRows[i][3], details: lRows[i][4] });
        }
      }
    }

    return { total: total, active: active, logs: logs };
  } catch (e) { return { total: 0, active: 0, logs: [] }; }
}

function getLatestCheckIn(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('Logs');
    if (!logSheet) return null;
    var lastRow = logSheet.getLastRow();
    if (lastRow <= 1) return null;

    var row = logSheet.getRange(lastRow, 1, 1, 5).getValues()[0];
    var tz = Session.getScriptTimeZone();
    var tsDate = row[0] instanceof Date ? row[0] : new Date(row[0]);

    var result = {
      rowId: lastRow,
      timestamp: tsDate.getTime(),
      timeStr: Utilities.formatDate(tsDate, tz, "HH:mm:ss"),
      name: row[1],
      fingerprintId: row[2],
      status: row[3], // SUCCESS, BLOCKED, UNKNOWN
      details: row[4]
    };

    // 🔎 ดึงข้อมูลโปรไฟล์สมาชิกเพิ่มเติมมาแสดงในจอต้อนรับ (แพ็กเกจ / วันหมดอายุ / จำนวนครั้งที่เข้า)
    var memberSheet = ss.getSheetByName('Members');
    if (memberSheet && result.status === 'SUCCESS') {
      var mLastRow = memberSheet.getLastRow();
      if (mLastRow > 1) {
        var mRows = memberSheet.getRange(2, 1, mLastRow - 1, 10).getValues();
        for (var i = 0; i < mRows.length; i++) {
          var fpId = (mRows[i][7] || '').toString().trim().toLowerCase();
          if (fpId === (result.fingerprintId || '').toString().trim().toLowerCase()) {
            result.package = mRows[i][4];
            var exp = mRows[i][6];
            result.expiryDate = exp instanceof Date ? Utilities.formatDate(exp, tz, "yyyy-MM-dd") : (exp ? exp.toString() : "");
            result.checkInCount = mRows[i][9] || 0;
            var daysLeft = daysUntil_(exp);
            result.daysLeft = daysLeft;
            result.nearExpiry = (daysLeft !== null && daysLeft >= 0 && daysLeft <= EXPIRY_ALERT_DAYS);
            break;
          }
        }
      }
    }
    return result;
  } catch (e) { return null; }
}
