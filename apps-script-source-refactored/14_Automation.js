// Automation — extracted from the original monolithic Code.js

function getAutoExpireSettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  var graceDays = parseInt(props.getProperty('autoExpireGraceDays'));
  var enabled = isAutoExpireTriggerInstalled_();
  return {
    enabled: enabled,
    graceDays: isNaN(graceDays) ? DEFAULT_AUTO_INACTIVE_GRACE_DAYS : graceDays
  };
}

function isAutoExpireTriggerInstalled_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === AUTO_EXPIRE_HANDLER_FN_) return true;
  }
  return false;
}

function toggleAutoExpireTrigger(enable, graceDays, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var gd = parseInt(graceDays);
    if (isNaN(gd) || gd < 0) return { success: false, message: 'กรุณากรอกจำนวนวันผ่อนผันให้ถูกต้อง' };
    PropertiesService.getScriptProperties().setProperty('autoExpireGraceDays', gd.toString());

    // ลบ trigger เดิมของฟังก์ชันนี้ทั้งหมดก่อน กันซ้ำซ้อน
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === AUTO_EXPIRE_HANDLER_FN_) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    if (enable) {
      ScriptApp.newTrigger(AUTO_EXPIRE_HANDLER_FN_).timeBased().everyDays(1).atHour(2).create();
      logAudit_(session.user, 'ENABLE_AUTO_EXPIRE', 'System', 'เปิดใช้งานปิดสถานะสมาชิกอัตโนมัติ (ผ่อนผัน ' + gd + ' วัน)');
      return { success: true, message: '🟢 เปิดใช้งานระบบปิดสถานะอัตโนมัติแล้ว! จะทำงานทุกวันช่วงตี 2' };
    } else {
      logAudit_(session.user, 'DISABLE_AUTO_EXPIRE', 'System', 'ปิดใช้งานปิดสถานะสมาชิกอัตโนมัติ');
      return { success: true, message: 'ปิดใช้งานระบบปิดสถานะอัตโนมัติแล้ว' };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function autoExpireMembers() {
  try {
    var props = PropertiesService.getScriptProperties();
    var graceDaysRaw = parseInt(props.getProperty('autoExpireGraceDays'));
    var graceDays = isNaN(graceDaysRaw) ? DEFAULT_AUTO_INACTIVE_GRACE_DAYS : graceDaysRaw;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var changedNames = [];

    for (var i = 0; i < rows.length; i++) {
      var status = rows[i][8] || 'Active';
      if (status !== 'Active') continue;
      var expRaw = rows[i][6];
      if (!expRaw) continue;
      var daysLeft = daysUntil_(expRaw);
      if (daysLeft === null) continue;
      if (daysLeft < 0 && Math.abs(daysLeft) > graceDays) {
        sheet.getRange(i + 2, 9).setValue('Inactive');
        changedNames.push(rows[i][1] + ' (หมดอายุเกิน ' + Math.abs(daysLeft) + ' วัน)');
      }
    }

    if (changedNames.length > 0) {
      logAudit_('SYSTEM (Auto)', 'AUTO_SET_INACTIVE', 'Members', 'ปิดสถานะสมาชิก ' + changedNames.length + ' คนอัตโนมัติ: ' + changedNames.join(', '));
    }
  } catch (e) {
    logAudit_('SYSTEM (Auto)', 'AUTO_SET_INACTIVE_ERROR', 'Members', e.toString());
  }
}

function toggleWinBackCampaign(enable, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === WINBACK_HANDLER_FN_) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    if (enable) {
      ScriptApp.newTrigger(WINBACK_HANDLER_FN_).timeBased().everyDays(1).atHour(10).create();
      logAudit_(session.user, 'ENABLE_WINBACK', 'System', 'เปิดใช้งานระบบดึงสมาชิกที่หายไปกลับมาอัตโนมัติ');
      return { success: true, message: '🟢 เปิดใช้งานระบบ Win-back Campaign แล้ว! จะทำงานทุกวันช่วง 10 โมงเช้า' };
    } else {
      logAudit_(session.user, 'DISABLE_WINBACK', 'System', 'ปิดใช้งานระบบดึงสมาชิกที่หายไปกลับมา');
      return { success: true, message: 'ปิดใช้งานระบบ Win-back Campaign แล้ว' };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getWinBackSettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var enabled = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === WINBACK_HANDLER_FN_) { enabled = true; break; }
  }
  var props = PropertiesService.getScriptProperties();
  return {
    enabled: enabled,
    inactiveDays: parseInt(props.getProperty('winbackInactiveDays')) || 30,
    discountPercent: parseInt(props.getProperty('winbackDiscountPercent')) || 20,
    validDays: parseInt(props.getProperty('winbackValidDays')) || 14
  };
}

function updateWinBackSettings(inactiveDays, discountPercent, validDays, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('winbackInactiveDays', String(parseInt(inactiveDays) || 30));
    props.setProperty('winbackDiscountPercent', String(parseInt(discountPercent) || 20));
    props.setProperty('winbackValidDays', String(parseInt(validDays) || 14));
    logAudit_(session.user, 'UPDATE_WINBACK_SETTINGS', 'System', 'อัปเดตการตั้งค่า Win-back Campaign');
    return { success: true, message: '🟢 บันทึกการตั้งค่า Win-back Campaign สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function checkWinBackCampaign_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var inactiveDaysThreshold = parseInt(props.getProperty('winbackInactiveDays')) || 30;
    var discountPercent = parseInt(props.getProperty('winbackDiscountPercent')) || 20;
    var validDays = parseInt(props.getProperty('winbackValidDays')) || 14;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var numCols = Math.max(sheet.getLastColumn(), 23);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var tz = Session.getScriptTimeZone();
    var today = new Date();
    var sentCount = 0;

    for (var i = 0; i < rows.length; i++) {
      var status = rows[i][8] || 'Active';
      if (status !== 'Inactive') continue;

      var expRaw = rows[i][6];
      if (!expRaw) continue;
      var daysLeft = daysUntil_(expRaw); // ค่าติดลบ = จำนวนวันที่หมดอายุไปแล้ว
      if (daysLeft === null || daysLeft >= 0) continue;
      var daysSinceExpiry = Math.abs(daysLeft);
      if (daysSinceExpiry < inactiveDaysThreshold) continue;

      var alreadySentCode = (rows[i][22] || '').toString().trim();
      if (alreadySentCode) continue; // เคยส่งให้คนนี้ไปแล้ว ไม่ส่งซ้ำ

      var fullName = rows[i][1];
      var lineUserId = (rows[i][18] || '').toString().trim();
      var email = (rows[i][3] || '').toString().trim();
      if (!lineUserId && !email) continue; // ไม่มีช่องทางติดต่อเลย ข้ามไป

      // 🎟️ สร้างคูปองเฉพาะสำหรับคนนี้คนเดียว (ใช้ได้ครั้งเดียว)
      var couponSheet = ensureCouponSheet_();
      var uniqueCode = 'COMEBACK' + Utilities.getUuid().substring(0, 6).toUpperCase();
      var expiryDateObj = new Date(today.getTime() + validDays * 24 * 60 * 60 * 1000);
      var expiryDateStr = Utilities.formatDate(expiryDateObj, tz, "yyyy-MM-dd");
      couponSheet.appendRow([uniqueCode, 'Percent', discountPercent, 1, 0, expiryDateStr, 0, 'Membership', 'Active', 'Win-back campaign สำหรับ ' + fullName]);

      var msgText = '🥺 เราคิดถึงคุณนะ ' + fullName + '!\n\n' +
        'นานแล้วที่ไม่ได้เจอกัน กลับมาออกกำลังกายกับเราอีกครั้งไหม?\n\n' +
        '🎁 รับส่วนลดพิเศษ ' + discountPercent + '% เมื่อกลับมาต่ออายุสมาชิกภาพ\n' +
        'ใช้โค้ด: ' + uniqueCode + '\n' +
        'หมดเขต: ' + expiryDateStr + '\n\n' +
        'แวะมาคุยกับเราได้เลยครับ!';

      if (lineUserId) sendLineMessage_(lineUserId, msgText);
      if (email) {
        try {
          MailApp.sendEmail({ to: email, subject: '🥺 เราคิดถึงคุณ! รับส่วนลด ' + discountPercent + '% กลับมาออกกำลังกาย', htmlBody: msgText.replace(/\n/g, '<br>') });
        } catch (e2) { /* ไม่ให้ error ตรงนี้กระทบส่วนอื่น */ }
      }

      sheet.getRange(i + 2, 23).setValue(uniqueCode);
      sentCount++;
    }

    if (sentCount > 0) {
      logAudit_('SYSTEM (Auto)', 'WINBACK_CAMPAIGN', 'Members', 'ส่งคูปอง Win-back ให้สมาชิก ' + sentCount + ' คน');
    }
  } catch (e) {
    logAudit_('SYSTEM (Auto)', 'WINBACK_CAMPAIGN_ERROR', 'Members', e.toString());
  }
}

function toggleMemberLineNotifications(enable, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === MEMBER_LINE_NOTIFY_HANDLER_FN_) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    if (enable) {
      ScriptApp.newTrigger(MEMBER_LINE_NOTIFY_HANDLER_FN_).timeBased().everyDays(1).atHour(9).create();
      logAudit_(session.user, 'ENABLE_MEMBER_LINE_NOTIFY', 'System', 'เปิดใช้งานแจ้งเตือนสมาชิกทาง LINE อัตโนมัติ (ใกล้หมดอายุ/วันเกิด)');
      return { success: true, message: '🟢 เปิดใช้งานแจ้งเตือนสมาชิกทาง LINE แล้ว! จะทำงานทุกวันช่วง 9 โมงเช้า' };
    } else {
      logAudit_(session.user, 'DISABLE_MEMBER_LINE_NOTIFY', 'System', 'ปิดใช้งานแจ้งเตือนสมาชิกทาง LINE อัตโนมัติ');
      return { success: true, message: 'ปิดใช้งานแจ้งเตือนสมาชิกทาง LINE แล้ว' };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getMemberLineNotifySettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var enabled = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MEMBER_LINE_NOTIFY_HANDLER_FN_) { enabled = true; break; }
  }
  return { enabled: enabled };
}

function checkMemberNotificationsLine_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var numCols = Math.max(sheet.getLastColumn(), 22);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var tz = Session.getScriptTimeZone();
    var today = new Date();
    var currentYear = today.getFullYear();
    var notifiedCount = 0;

    for (var i = 0; i < rows.length; i++) {
      var status = rows[i][8] || 'Active';
      var lineUserId = (rows[i][18] || '').toString().trim();
      if (!lineUserId) continue;
      var fullName = rows[i][1];

      // ⚠️ แจ้งเตือนใกล้หมดอายุ (ส่งครั้งเดียวต่อรอบวันหมดอายุ - ไม่ส่งซ้ำจนกว่าจะต่ออายุใหม่)
      if (status === 'Active') {
        var expRaw = rows[i][6];
        if (expRaw) {
          var expDateStr = expRaw instanceof Date ? Utilities.formatDate(expRaw, tz, "yyyy-MM-dd") : expRaw.toString();
          var daysLeft = daysUntil_(expRaw);
          var alreadyNotifiedFor = (rows[i][20] || '').toString();
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= EXPIRY_ALERT_DAYS && alreadyNotifiedFor !== expDateStr) {
            sendLineMessage_(lineUserId,
              '⚠️ แจ้งเตือนสมาชิกภาพใกล้หมดอายุ\n\n' +
              'สวัสดีคุณ ' + fullName + '\n' +
              'สมาชิกภาพของคุณจะหมดอายุในวันที่ ' + expDateStr + ' (เหลืออีก ' + daysLeft + ' วัน)\n\n' +
              'แวะมาต่ออายุได้เลยที่ยิม หรือติดต่อแอดมินล่วงหน้าได้ครับ');
            sheet.getRange(i + 2, 21).setValue(expDateStr);
            notifiedCount++;
          }
        }
      }

      // 🎂 แจ้งเตือนวันเกิด (ส่งครั้งเดียวต่อปี ตรงวันเกิดจริง)
      var dobRaw = rows[i][17];
      if (dobRaw) {
        var dob = dobRaw instanceof Date ? dobRaw : new Date(dobRaw);
        if (!isNaN(dob.getTime()) && dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
          var alreadyNotifiedYear = rows[i][21];
          if (alreadyNotifiedYear !== currentYear) {
            var bdLabel = computeBirthdayDiscount_(1000).label; // แค่ต้องการ label ส่วนลด ไม่ได้ใช้ยอดเงินจริงตรงนี้
            sendLineMessage_(lineUserId,
              '🎂 สุขสันต์วันเกิดค่ะ/ครับ คุณ ' + fullName + '!\n\n' +
              'เป็นของขวัญวันเกิดจากเรา รับส่วนลด ' + bdLabel + ' ทันทีเมื่อต่ออายุสมาชิกภายในเดือนนี้ 🎁\n\n' +
              'แวะมาฉลองวันเกิดด้วยการออกกำลังกายกับเรานะครับ!');
            sheet.getRange(i + 2, 22).setValue(currentYear);
            notifiedCount++;
          }
        }
      }
    }

    if (notifiedCount > 0) {
      logAudit_('SYSTEM (Auto)', 'MEMBER_LINE_NOTIFY', 'Members', 'ส่งแจ้งเตือน LINE ให้สมาชิก ' + notifiedCount + ' รายการ');
    }
  } catch (e) {
    logAudit_('SYSTEM (Auto)', 'MEMBER_LINE_NOTIFY_ERROR', 'Members', e.toString());
  }
}
