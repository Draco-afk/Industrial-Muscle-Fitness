// Backup — extracted from the original monolithic Code.js

function createFullBackup(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd_HHmmss");
    var backupName = ss.getName() + ' - Backup ' + timestamp;
    var copiedFile = DriveApp.getFileById(ss.getId()).makeCopy(backupName);
    PropertiesService.getScriptProperties().setProperty('lastBackupAt', Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"));
    logAudit_(session.user, 'CREATE_BACKUP', 'System', 'สร้างไฟล์สำรองข้อมูล: ' + backupName);
    return { success: true, message: '🟢 สร้างไฟล์สำรองข้อมูลสำเร็จ!', fileUrl: copiedFile.getUrl(), fileName: backupName };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function clearTransactionData(confirmPhrase, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    if ((confirmPhrase || '').toString().trim() !== 'ลบข้อมูลถาวร') {
      return { success: false, message: 'ข้อความยืนยันไม่ถูกต้อง กรุณาพิมพ์ "ลบข้อมูลถาวร" ให้ตรงตัวเป๊ะๆ' };
    }

    // 💾 สำรองข้อมูลทั้งไฟล์ก่อนลบเสมอ กันพลาด
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd_HHmmss");
    var backupName = ss.getName() + ' - Backup ก่อนล้างข้อมูล ' + timestamp;
    var copiedFile = DriveApp.getFileById(ss.getId()).makeCopy(backupName);
    PropertiesService.getScriptProperties().setProperty('lastBackupAt', Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"));

    var clearedSheets = [];

    var paymentSheet = ensurePaymentSheet_();
    var pLastRow = paymentSheet.getLastRow();
    if (pLastRow > 1) {
      paymentSheet.getRange(2, 1, pLastRow - 1, paymentSheet.getLastColumn()).clearContent();
      clearedSheets.push('ประวัติชำระเงินสมาชิก (' + (pLastRow - 1) + ' รายการ)');
    }

    var dailySheet = ensureDailySheet_();
    var dLastRow = dailySheet.getLastRow();
    if (dLastRow > 1) {
      dailySheet.getRange(2, 1, dLastRow - 1, dailySheet.getLastColumn()).clearContent();
      clearedSheets.push('ประวัติลูกค้ารายวัน/ขายสินค้า (' + (dLastRow - 1) + ' รายการ)');
    }

    logAudit_(session.user, 'CLEAR_TRANSACTION_DATA', 'System',
      '⚠️ ล้างข้อมูลการซื้อขายทั้งหมดถาวร: ' + (clearedSheets.join(', ') || 'ไม่มีข้อมูลให้ลบ') + ' (สำรองไว้ที่: ' + backupName + ')');

    return {
      success: true,
      message: clearedSheets.length > 0
        ? '🟢 ล้างข้อมูลการซื้อขายเรียบร้อยแล้ว: ' + clearedSheets.join(', ') + '\n\n📁 สำรองข้อมูลไว้ก่อนลบแล้วที่ไฟล์: "' + backupName + '"'
        : 'ไม่มีข้อมูลการซื้อขายให้ล้าง (สำรองข้อมูลไว้แล้วเผื่อไว้)',
      backupFileUrl: copiedFile.getUrl(),
      backupFileName: backupName
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getBackupSettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var enabled = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === BACKUP_HANDLER_FN_) { enabled = true; break; }
  }
  var lastBackupAt = PropertiesService.getScriptProperties().getProperty('lastBackupAt') || '';
  return { enabled: enabled, lastBackupAt: lastBackupAt };
}

function toggleWeeklyBackup(enable, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === BACKUP_HANDLER_FN_) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    if (enable) {
      ScriptApp.newTrigger(BACKUP_HANDLER_FN_).timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
      logAudit_(session.user, 'ENABLE_WEEKLY_BACKUP', 'System', 'เปิดใช้งานสำรองข้อมูลอัตโนมัติทุกสัปดาห์');
      return { success: true, message: '🟢 เปิดใช้งานสำรองข้อมูลอัตโนมัติแล้ว! จะสำรองให้ทุกวันอาทิตย์ช่วงตี 3' };
    } else {
      logAudit_(session.user, 'DISABLE_WEEKLY_BACKUP', 'System', 'ปิดใช้งานสำรองข้อมูลอัตโนมัติทุกสัปดาห์');
      return { success: true, message: 'ปิดใช้งานสำรองข้อมูลอัตโนมัติแล้ว' };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function createFullBackupAuto() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd_HHmmss");
    var backupName = ss.getName() + ' - Auto Backup ' + timestamp;
    DriveApp.getFileById(ss.getId()).makeCopy(backupName);
    PropertiesService.getScriptProperties().setProperty('lastBackupAt', Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"));
    logAudit_('SYSTEM (Auto)', 'AUTO_BACKUP', 'System', 'สร้างไฟล์สำรองข้อมูลอัตโนมัติ: ' + backupName);
  } catch (e) {
    logAudit_('SYSTEM (Auto)', 'AUTO_BACKUP_ERROR', 'System', e.toString());
  }
}
