// Members — extracted from the original monolithic Code.js

function generateReferralCode_(fullName) {
  var prefix = (fullName || 'MEM').toString().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  if (prefix.length < 3) prefix = (prefix + 'GYM').substring(0, 3);
  var rand = Math.floor(1000 + Math.random() * 9000);
  return prefix + rand;
}

function saveMemberData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) {
      sheet = ss.insertSheet('Members');
      sheet.appendRow(["Timestamp", "Full Name", "Phone", "Email", "Package", "Start Date", "Expiry Date", "Fingerprint ID", "Status", "Check-in Count", "Referral Code", "Referred By", "Referral Reward Given", "Card Change Count", "Freeze Start Date", "PIN Code", "PIN Hash", "Date of Birth", "LINE User ID", "LINE Link Code", "Expiry LINE Notified For", "Birthday LINE Notified Year", "Winback Coupon Code"]);
    }

    var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 23)).getValues()[0];
    if (!headerRow[15]) sheet.getRange(1, 16).setValue("PIN Code");
    if (!headerRow[16]) sheet.getRange(1, 17).setValue("PIN Hash");
    if (!headerRow[17]) sheet.getRange(1, 18).setValue("Date of Birth");
    if (!headerRow[18]) sheet.getRange(1, 19).setValue("LINE User ID");
    if (!headerRow[19]) sheet.getRange(1, 20).setValue("LINE Link Code");
    if (!headerRow[20]) sheet.getRange(1, 21).setValue("Expiry LINE Notified For");
    if (!headerRow[21]) sheet.getRange(1, 22).setValue("Birthday LINE Notified Year");
    if (!headerRow[22]) sheet.getRange(1, 23).setValue("Winback Coupon Code");

    var pinInput = (data.pin || '1234').toString().trim();
    var pinHash = hashPassword_(pinInput);

    var ownCode = generateReferralCode_(data.fullName);
    var expiryDateStr = data.expiryDate;
    var bonusMessage = "";

    // จัดเก็บเบอร์โทรและรหัส PIN พร้อมเครื่องหมาย ' ป้องกันชีทตัดเลข 0 นำหน้า
    sheet.appendRow([
      new Date(), 
      data.fullName, 
      "'" + data.phone, 
      data.email, 
      data.package, 
      data.startDate, 
      expiryDateStr, 
      data.fingerprintId, 
      'Active', 
      0, 
      ownCode, 
      '', 
      '', 
      0, 
      "", 
      "'" + pinInput, 
      pinHash,
      data.dob || ''
    ]);

    // 💳 บันทึกการชำระเงินทันทีตอนสมัครสมาชิก (รวมหน้าสมัคร+จ่ายเงินเป็นขั้นตอนเดียว)
    // ถ้า deferPayment = true แปลว่าจะเอาไปรวมบิลกับ POS ลูกค้ารายวันแทน (ข้ามการออกใบเสร็จ/บันทึกที่นี่)
    var pkgInfo = getPackageMap_()[data.package];
    var chargeAmount = parseFloat(data.amount);
    if (isNaN(chargeAmount) || chargeAmount < 0) {
      chargeAmount = pkgInfo ? pkgInfo.price : 0;
    }

    // 🎟️ ส่วนลดคูปอง (ถ้ามี)
    var newMemberCouponCode = (data.couponCode || '').toString().trim();
    var newMemberCouponResult = null;
    var couponNote = '';
    if (newMemberCouponCode) {
      newMemberCouponResult = validateCoupon_(newMemberCouponCode, chargeAmount, 'newmember');
      if (!newMemberCouponResult.valid) return { success: false, message: newMemberCouponResult.message };
      chargeAmount = newMemberCouponResult.finalAmount;
      couponNote = ' 🎟️ (คูปอง ' + newMemberCouponResult.code + ' ลด ' + newMemberCouponResult.discountAmount.toLocaleString('th-TH') + ' บาท)';
    }

    var receiptNo = '';
    var deferPayment = !!data.deferPayment;
    if (!deferPayment && chargeAmount > 0) {
      var newMemberPaymentSheet = ensurePaymentSheet_();
      receiptNo = getNextReceiptNumber_();
      var qrDataForNewMember = data.qrData ? data.qrData.toString().trim() : '';
      var newMemberPaymentMethod = (data.paymentMethod === 'transfer') ? 'โอนเงิน' : 'เงินสด';
      newMemberPaymentSheet.appendRow([new Date(), data.fullName, data.package, qrDataForNewMember, expiryDateStr, receiptNo, chargeAmount, '', '', '', '', newMemberPaymentMethod]);
    }
    if (newMemberCouponResult) applyCouponUsage_(newMemberCouponResult.rowNumber);
    invalidateFingerprintCache_(); // สมาชิกใหม่อาจมีรหัสลายนิ้วมือ - ล้างแคชกันข้อมูลเก่าค้าง
    
    logAudit_(session.user, 'ADD_MEMBER', data.fullName, 'แพ็กเกจ: ' + data.package + ' (PIN: ' + pinInput + ')' +
      (deferPayment ? ' (รอชำระเงินรวมกับบิลลูกค้ารายวัน)' : (receiptNo ? ' ชำระเงิน ' + chargeAmount + ' บาท ใบเสร็จ: ' + receiptNo : ' (ยังไม่ชำระเงิน)')) + couponNote);
    return {
      success: true,
      message: deferPayment
        ? "ลงทะเบียนสมาชิกสำเร็จ! กำลังพากลับไปรวมบิลกับรายการรายวัน..."
        : ("ลงทะเบียนสมาชิกสำเร็จ! PIN สำหรับเข้ายิมบนมือถือคือ: " + pinInput + bonusMessage + couponNote + (receiptNo ? " 🧾 ใบเสร็จ: " + receiptNo : "")),
      referralCode: ownCode,
      receiptNo: receiptNo,
      chargeAmount: chargeAmount,
      pin: pinInput
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateMemberData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var row = parseInt(data.rowNumber);
    var tz = Session.getScriptTimeZone();

    var currentStatus = sheet.getRange(row, 9).getValue();
    var newStatus = data.status;
    var expiryDateToSet = data.expiryDate;
    var freezeNote = "";

    if (currentStatus !== 'Suspended' && newStatus === 'Suspended') {
      sheet.getRange(row, 15).setValue(Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
      freezeNote = " (เริ่ม Freeze วันนี้)";
    } else if (currentStatus === 'Suspended' && newStatus === 'Active') {
      var freezeStartRaw = sheet.getRange(row, 15).getValue();
      if (freezeStartRaw) {
        var freezeStart = new Date(freezeStartRaw);
        var today = new Date();
        var frozenDays = Math.round((today.getTime() - freezeStart.getTime()) / (1000 * 60 * 60 * 24));
        if (frozenDays > 0) {
          var newExpiry = new Date(expiryDateToSet);
          newExpiry.setDate(newExpiry.getDate() + frozenDays);
          expiryDateToSet = Utilities.formatDate(newExpiry, tz, "yyyy-MM-dd");
          freezeNote = " (คืนวันหมดอายุ +" + frozenDays + " วัน จากการ Freeze)";
        }
      }
      sheet.getRange(row, 15).setValue("");
    }

    sheet.getRange(row, 2).setValue(data.fullName);
    sheet.getRange(row, 3).setValue("'" + data.phone);
    sheet.getRange(row, 4).setValue(data.email);
    sheet.getRange(row, 5).setValue(data.package);
    sheet.getRange(row, 6).setValue(data.startDate);
    sheet.getRange(row, 7).setValue(expiryDateToSet);
    if (data.fingerprintId) { sheet.getRange(row, 8).setValue(data.fingerprintId); invalidateFingerprintCache_(); }
    sheet.getRange(row, 9).setValue(newStatus);

    if (data.pin && /^\d{4}$/.test(data.pin)) {
      sheet.getRange(row, 16).setValue("'" + data.pin);       // อัปเดต PIN ธรรมดา
      sheet.getRange(row, 17).setValue(hashPassword_(data.pin)); // อัปเดต PIN Hash (หลักที่ 17)
    }
    if (typeof data.dob !== 'undefined') {
      sheet.getRange(row, 18).setValue(data.dob || ''); // วันเดือนปีเกิด (หลักที่ 18)
    }

    logAudit_(session.user, 'EDIT_MEMBER', data.fullName, 'อัปเดตข้อมูลสมาชิก' + freezeNote);
    return { success: true, message: "อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว!" + freezeNote };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteMemberData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var row = parseInt(rowNumber);
    var fullName = sheet.getRange(row, 2).getValue();
    sheet.deleteRow(row);
    invalidateFingerprintCache_(); // ลบแถวแล้วเลขแถวของทุกคนด้านล่างเลื่อน - ต้องล้างแคชกันสแกนแล้วขึ้นชื่อผิดคน
    logAudit_(session.user, 'DELETE_MEMBER', fullName, 'ลบสมาชิกออกจากระบบถาวร');
    return { success: true, message: 'ลบสมาชิก "' + fullName + '" ออกจากระบบเรียบร้อยแล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getMemberList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var numCols = Math.max(sheet.getLastColumn(), 18);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var list = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var expDate = rows[i][6];
      var expDateStr = expDate instanceof Date ? Utilities.formatDate(expDate, Session.getScriptTimeZone(), "yyyy-MM-dd") : (expDate ? expDate.toString() : "");
      var startDate = rows[i][5];
      var startDateStr = startDate instanceof Date ? Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd") : (startDate ? startDate.toString() : "");
      var dobRaw = rows[i][17];
      var dobStr = dobRaw instanceof Date ? Utilities.formatDate(dobRaw, Session.getScriptTimeZone(), "yyyy-MM-dd") : (dobRaw ? dobRaw.toString() : "");
      list.push({
        rowNumber: i + 2,
        fullName: rows[i][1],
        phone: rows[i][2] ? rows[i][2].toString() : "",
        email: rows[i][3],
        package: rows[i][4],
        startDate: startDateStr,
        expiryDate: expDateStr,
        fingerprintId: rows[i][7],
        status: rows[i][8] || "Active",
        checkInCount: rows[i][9] || 0,
        referralCode: rows[i][10] || "",
        referredBy: rows[i][11] || "",
        pin: rows[i][15] ? rows[i][15].toString() : "1234",
        dob: dobStr,
        isBirthdayMonth: isBirthdayMonth_(dobStr)
      });
    }
    return list;
  } catch (e) { throw new Error(e.toString()); }
}

function getBirthdayDiscountSettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  return {
    type: props.getProperty('birthdayDiscountType') || 'Percent',
    value: parseFloat(props.getProperty('birthdayDiscountValue')) || 5
  };
}

function updateBirthdayDiscountSettings(discountType, discountValue, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var value = parseFloat(discountValue);
    if (isNaN(value) || value < 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };
    var props = PropertiesService.getScriptProperties();
    props.setProperty('birthdayDiscountType', discountType === 'Fixed' ? 'Fixed' : 'Percent');
    props.setProperty('birthdayDiscountValue', String(value));
    logAudit_(session.user, 'UPDATE_BIRTHDAY_DISCOUNT', 'System', 'อัปเดตส่วนลดวันเกิดเป็น ' + (discountType === 'Fixed' ? value.toLocaleString('th-TH') + ' บาท' : value + '%'));
    return { success: true, message: '🟢 บันทึกการตั้งค่าส่วนลดวันเกิดสำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function computeBirthdayDiscount_(amount) {
  var props = PropertiesService.getScriptProperties();
  var type = props.getProperty('birthdayDiscountType') || 'Percent';
  var value = parseFloat(props.getProperty('birthdayDiscountValue')) || 5;
  var discountAmount = type === 'Fixed' ? value : Math.round(amount * (value / 100) * 100) / 100;
  if (discountAmount > amount) discountAmount = amount;
  var finalAmount = Math.round((amount - discountAmount) * 100) / 100;
  var label = type === 'Fixed' ? value.toLocaleString('th-TH') + ' บาท' : value + '%';
  return { discountAmount: discountAmount, finalAmount: finalAmount, label: label, type: type, value: value };
}

function isBirthdayMonth_(dobValue) {
  if (!dobValue) return false;
  var dob = dobValue instanceof Date ? dobValue : new Date(dobValue);
  if (isNaN(dob.getTime())) return false;
  var now = new Date();
  return dob.getMonth() === now.getMonth();
}

function getMemberFullHistory(token, rowNumber) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var memberSheet = ss.getSheetByName('Members');
    var row = parseInt(rowNumber);
    var numCols = Math.max(memberSheet.getLastColumn(), 17);
    var m = memberSheet.getRange(row, 1, 1, numCols).getValues()[0];
    var tz = Session.getScriptTimeZone();

    var profile = {
      rowNumber: row,
      fullName: m[1],
      phone: m[2] ? m[2].toString() : '',
      email: m[3] || '',
      package: m[4],
      startDate: m[5] instanceof Date ? Utilities.formatDate(m[5], tz, "yyyy-MM-dd") : (m[5] || ''),
      expiryDate: m[6] instanceof Date ? Utilities.formatDate(m[6], tz, "yyyy-MM-dd") : (m[6] || ''),
      fingerprintId: m[7],
      status: m[8] || 'Active',
      checkInCount: m[9] || 0,
      referralCode: m[10] || '',
      referredBy: m[11] || ''
    };

    // ประวัติการชำระเงิน (ต่ออายุ/สมัครสมาชิก)
    var payments = [];
    var paymentSheet = ensurePaymentSheet_();
    var pLastRow = paymentSheet.getLastRow();
    if (pLastRow > 1) {
      var pRows = paymentSheet.getRange(2, 1, pLastRow - 1, 11).getValues();
      for (var i = pRows.length - 1; i >= 0; i--) {
        if ((pRows[i][1] || '').toString() === profile.fullName) {
          var pts = pRows[i][0];
          payments.push({
            timestamp: pts instanceof Date ? Utilities.formatDate(pts, tz, "yyyy-MM-dd HH:mm") : pts.toString(),
            package: pRows[i][2],
            amount: pRows[i][6] || 0,
            receiptNo: pRows[i][5] ? pRows[i][5].toString() : '',
            newExpiry: pRows[i][4] ? Utilities.formatDate(new Date(pRows[i][4]), tz, "yyyy-MM-dd") : '',
            refundStatus: pRows[i][7] || ''
          });
        }
      }
    }

    // ประวัติการเข้ายิม (สแกนลายนิ้วมือที่ประตู)
    var checkIns = [];
    var logSheet = ss.getSheetByName('Logs');
    if (logSheet) {
      var lLastRow = logSheet.getLastRow();
      if (lLastRow > 1) {
        var lRows = logSheet.getRange(2, 1, lLastRow - 1, 5).getValues();
        for (var j = lRows.length - 1; j >= 0 && checkIns.length < 30; j--) {
          if ((lRows[j][1] || '').toString() === profile.fullName) {
            var lts = lRows[j][0];
            checkIns.push({
              timestamp: lts instanceof Date ? Utilities.formatDate(lts, tz, "yyyy-MM-dd HH:mm:ss") : lts.toString(),
              status: lRows[j][3],
              details: lRows[j][4]
            });
          }
        }
      }
    }

    // ประวัติการจองคิวเทรนเนอร์
    var bookings = [];
    var bookingSheet = ensureBookingSheet_();
    var bLastRow = bookingSheet.getLastRow();
    if (bLastRow > 1) {
      var bRows = bookingSheet.getRange(2, 1, bLastRow - 1, 11).getValues();
      for (var k = bRows.length - 1; k >= 0; k--) {
        if (bRows[k][4] === row) {
          var bDate = bRows[k][7] instanceof Date ? Utilities.formatDate(bRows[k][7], tz, "yyyy-MM-dd") : bRows[k][7].toString();
          bookings.push({
            trainerName: bRows[k][3],
            date: bDate,
            timeSlot: bRows[k][8],
            status: bRows[k][9] || 'Booked'
          });
        }
      }
    }

    return { profile: profile, payments: payments, checkIns: checkIns, bookings: bookings };
  } catch (e) { throw new Error(e.toString()); }
}

function getCheckInLeaderboard(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      list.push({
        fullName: rows[i][1],
        package: rows[i][4],
        status: rows[i][8] || 'Active',
        checkInCount: rows[i][9] || 0
      });
    }
    list.sort(function (a, b) { return b.checkInCount - a.checkInCount; });
    return list.slice(0, 10);
  } catch (e) { return []; }
}

function manualCheckIn(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var row = parseInt(rowNumber);
    var rowData = sheet.getRange(row, 1, 1, 10).getValues()[0];
    var fullName = rowData[1];
    var expiryDate = new Date(rowData[6]);
    var currentStatus = rowData[8];
    var checkInCount = parseInt(rowData[9] || 0);
    var pkgName = rowData[4];
    var today = new Date();

    if (currentStatus !== 'Active' || expiryDate < today) {
      var reason = (currentStatus !== 'Active') ? 'สถานะ: ' + currentStatus : 'สมาชิกภาพหมดอายุแล้ว';
      return { success: false, message: '❌ เช็คอินไม่ได้: ' + reason };
    }

    sheet.getRange(row, 10).setValue(checkInCount + 1);

    var logSheet = ss.getSheetByName('Logs');
    if (!logSheet) { logSheet = ss.insertSheet('Logs'); logSheet.appendRow(["Timestamp", "Name", "Fingerprint ID", "Status", "Details"]); }
    var daysLeft = daysUntil_(expiryDate);
    var detailsText = "Package: " + pkgName + " (เช็คอินด้วยมือโดย " + session.user + " - เครื่องสแกนใช้งานไม่ได้)";
    logSheet.appendRow([new Date(), fullName, rowData[7] || '', "SUCCESS", detailsText]);

    logAudit_(session.user, 'MANUAL_CHECK_IN', fullName, 'เช็คอินด้วยมือ (สำรองเวลาเครื่องสแกนใช้งานไม่ได้)');
    return { success: true, message: '🟢 เช็คอินให้ "' + fullName + '" สำเร็จแล้ว! (ครั้งที่ ' + (checkInCount + 1) + ')' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getMemberProfile(token) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var row = session.rowNumber;
    var numCols = Math.max(sheet.getLastColumn(), 22);
    var rowData = sheet.getRange(row, 1, 1, numCols).getValues()[0];
    var tz = Session.getScriptTimeZone();

    var expDate = rowData[6];
    var expDateStr = expDate instanceof Date ? Utilities.formatDate(expDate, tz, "yyyy-MM-dd") : (expDate ? expDate.toString() : "");
    var startDate = rowData[5];
    var startDateStr = startDate instanceof Date ? Utilities.formatDate(startDate, tz, "yyyy-MM-dd") : (startDate ? startDate.toString() : "");

    var profile = {
      fullName: rowData[1],
      phone: rowData[2] ? rowData[2].toString() : "",
      email: rowData[3] || "",
      package: rowData[4],
      startDate: startDateStr,
      expiryDate: expDateStr,
      fingerprintId: rowData[7],
      status: rowData[8] || "Active",
      checkInCount: rowData[9] || 0,
      referralCode: rowData[10] || "",
      referredBy: rowData[11] || "",
      pin: rowData[15] ? rowData[15].toString() : "1234",
      lineLinked: !!(rowData[18] && rowData[18].toString().trim()),
      referrerBonusDays: REFERRAL_REFERRER_BONUS_DAYS,
      newMemberBonusDays: REFERRAL_NEW_MEMBER_BONUS_DAYS
    };

    // 🎂 แจ้งเตือนโปรโมชั่นวันเกิด (ลด 5% ตอนต่ออายุในเดือนเกิด)
    profile.isBirthdayMonth = isBirthdayMonth_(rowData[17]);
    profile.birthdayDiscountLabel = computeBirthdayDiscount_(1000).label; // แค่ต้องการ label ส่วนลด ไม่ได้ใช้ยอดเงินจริงตรงนี้

    // ⚠️ ข้อมูลแจ้งเตือนใกล้หมดอายุ สำหรับแสดงแบนเนอร์ในแอปสมาชิก
    var daysLeft = daysUntil_(expDate);
    profile.daysLeft = daysLeft;
    profile.isExpired = (daysLeft !== null && daysLeft < 0);
    profile.nearExpiry = (daysLeft !== null && daysLeft >= 0 && daysLeft <= EXPIRY_ALERT_DAYS && profile.status === 'Active');

    var paymentSheet = ss.getSheetByName('Payments');
    var payments = [];
    if (paymentSheet) {
      var pLastRow = paymentSheet.getLastRow();
      if (pLastRow > 1) {
        var pNumCols = Math.max(paymentSheet.getLastColumn(), 7);
        var pRows = paymentSheet.getRange(2, 1, pLastRow - 1, pNumCols).getValues();
        for (var j = pRows.length - 1; j >= 0 && payments.length < 10; j--) {
          if ((pRows[j][1] || '').toString() === profile.fullName) {
            var ts = pRows[j][0];
            var tsStr = ts instanceof Date ? Utilities.formatDate(ts, tz, "yyyy-MM-dd HH:mm") : ts.toString();
            payments.push({
              timestamp: tsStr,
              package: pRows[j][2],
              newExpiry: pRows[j][4] ? Utilities.formatDate(new Date(pRows[j][4]), tz, "yyyy-MM-dd") : "",
              receiptNo: pRows[j][5] ? pRows[j][5].toString() : ""
            });
          }
        }
      }
    }
    profile.paymentHistory = payments;
    return profile;
  } catch (e) { throw new Error(e.toString()); }
}

function getExpiringMembers(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var status = rows[i][8] || 'Active';
      if (status !== 'Active') continue;
      var expRaw = rows[i][6];
      if (!expRaw) continue;
      var daysLeft = daysUntil_(expRaw);
      if (daysLeft === null || daysLeft > EXPIRY_ALERT_DAYS) continue;
      var expDate = expRaw instanceof Date ? expRaw : new Date(expRaw);
      list.push({
        fullName: rows[i][1],
        phone: rows[i][2] ? rows[i][2].toString() : "",
        package: rows[i][4],
        expiryDate: Utilities.formatDate(expDate, tz, "yyyy-MM-dd"),
        daysLeft: daysLeft
      });
    }
    list.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    return list;
  } catch (e) { return []; }
}

function getBirthdayMembersThisMonth(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var numCols = Math.max(sheet.getLastColumn(), 18);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var status = rows[i][8] || 'Active';
      if (status !== 'Active') continue;
      var dobRaw = rows[i][17];
      if (!dobRaw || !isBirthdayMonth_(dobRaw)) continue;
      var dob = dobRaw instanceof Date ? dobRaw : new Date(dobRaw);
      list.push({
        fullName: rows[i][1],
        phone: rows[i][2] ? rows[i][2].toString() : "",
        package: rows[i][4],
        birthDay: dob.getDate()
      });
    }
    list.sort(function (a, b) { return a.birthDay - b.birthDay; });
    return list;
  } catch (e) { return []; }
}
