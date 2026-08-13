// Fingerprint — extracted from the original monolithic Code.js

function buildFingerprintCache_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Members');
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow > 1) {
    var fpCol = sheet.getRange(2, 8, lastRow - 1, 1).getValues(); // คอลัมน์ H = Fingerprint ID เท่านั้น
    for (var i = 0; i < fpCol.length; i++) {
      var fp = (fpCol[i][0] || '').toString().trim().toLowerCase();
      if (fp) map[fp] = i + 2; // เลขแถวจริงในชีท
    }
  }
  try {
    CacheService.getScriptCache().put(FINGERPRINT_CACHE_KEY_, JSON.stringify(map), 21600); // เก็บไว้ 6 ชม. (ค่าสูงสุดที่ Google อนุญาต)
  } catch (e) { /* เผื่อข้อมูลใหญ่เกินขนาดแคช - ไม่ให้กระทบการทำงานหลัก แค่จะช้าลงเป็นบางครั้ง */ }
  return map;
}

function getFingerprintRowMap_() {
  try {
    var cached = CacheService.getScriptCache().get(FINGERPRINT_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* แคชเสีย/parse ไม่ได้ - สร้างใหม่ */ }
  return buildFingerprintCache_();
}

function invalidateFingerprintCache_() {
  try { CacheService.getScriptCache().remove(FINGERPRINT_CACHE_KEY_); } catch (e) { /* ไม่ให้กระทบการทำงานหลัก */ }
}

function requestFingerprintEnrollment(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var props = PropertiesService.getScriptProperties();
    var existing = props.getProperty('pendingEnrollment');
    if (existing) {
      var existingData = JSON.parse(existing);
      // ถ้าคำขอเก่าค้างนานเกิน 3 นาที ถือว่าหมดอายุ ให้ตั้งคำขอใหม่ทับได้เลย
      if (Date.now() - existingData.requestedAt < 3 * 60 * 1000) {
        return { success: false, message: 'มีคำขอลงทะเบียนอื่นกำลังรออยู่ กรุณารอสักครู่แล้วลองใหม่' };
      }
    }
    var memberSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    var memberName = memberSheet.getRange(parseInt(rowNumber), 2).getValue();

    props.setProperty('pendingEnrollment', JSON.stringify({
      rowNumber: parseInt(rowNumber),
      memberName: memberName,
      requestedAt: Date.now(),
      status: 'waiting' // waiting -> done | failed
    }));
    logAudit_(session.user, 'REQUEST_FINGERPRINT_ENROLL', memberName, 'ขอลงทะเบียนลายนิ้วมือใหม่ รอเครื่องสแกนหน้าประตูรับงาน');
    return { success: true, message: 'ตั้งคำขอแล้ว! ให้สมาชิกไปที่เครื่องสแกนหน้าประตูแล้ววางนิ้ว 3 ครั้งตามที่เครื่องแจ้ง' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function cancelFingerprintEnrollmentRequest(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  PropertiesService.getScriptProperties().deleteProperty('pendingEnrollment');
  return { success: true, message: 'ยกเลิกคำขอลงทะเบียนแล้ว' };
}

function getEnrollmentStatus(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var raw = PropertiesService.getScriptProperties().getProperty('pendingEnrollment');
  if (!raw) return { pending: false, status: 'none' };
  var data = JSON.parse(raw);
  return { pending: true, status: data.status, rowNumber: data.rowNumber, memberName: data.memberName, fingerprintId: data.fingerprintId || null, errorMessage: data.errorMessage || null };
}

function handleEnrollmentAction_(jsonParam) {
  var expectedKey = PropertiesService.getScriptProperties().getProperty('FINGERPRINT_API_KEY');
  if (expectedKey && jsonParam.apiKey !== expectedKey) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Unauthorized API Key' })).setMimeType(ContentService.MimeType.JSON);
  }

  var props = PropertiesService.getScriptProperties();

  if (jsonParam.action === 'checkPendingEnrollment') {
    var raw = props.getProperty('pendingEnrollment');
    if (!raw) return ContentService.createTextOutput(JSON.stringify({ pending: false })).setMimeType(ContentService.MimeType.JSON);
    var data = JSON.parse(raw);
    if (data.status !== 'waiting') return ContentService.createTextOutput(JSON.stringify({ pending: false })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(JSON.stringify({ pending: true, rowNumber: data.rowNumber, memberName: data.memberName })).setMimeType(ContentService.MimeType.JSON);
  }

  if (jsonParam.action === 'completeEnrollment') {
    try {
      // 🛡️ ใช้ rowNumber ที่ส่งมาจากโปรแกรมตัวกลางเป็นตัวตัดสินหลักเสมอ (ไม่พึ่งค่าที่เก็บไว้ใน property อย่างเดียว)
      // ป้องกันกรณีส่งคำขอนี้ล่าช้า (เช่น ตอนเน็ตขาดแล้วส่งซ้ำทีหลัง) จนแอดมินไปเริ่มลงทะเบียนคนอื่นไปแล้ว
      // ถ้าไม่ทำแบบนี้ ลายนิ้วมือของคนแรกอาจไปเขียนทับผิดแถวของคนที่สองได้
      var raw2 = props.getProperty('pendingEnrollment');
      var data2 = raw2 ? JSON.parse(raw2) : null;
      var targetRowNumber = jsonParam.rowNumber || (data2 ? data2.rowNumber : null);
      if (!targetRowNumber) return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'ไม่พบคำขอที่รอดำเนินการ (อาจหมดเวลาไปแล้ว)' })).setMimeType(ContentService.MimeType.JSON);

      // อัปเดตสถานะให้หน้าเว็บ poll เห็นผลได้ ถ้ายังเป็นคำขอเดียวกับที่ค้างอยู่ตอนนี้พอดี (ไม่ใช่คนละคนกับที่แอดมินเพิ่งเริ่มขอใหม่)
      var isSameActivePending = data2 && data2.rowNumber === targetRowNumber;

      if (jsonParam.success === false) {
        if (isSameActivePending) {
          data2.status = 'failed';
          data2.errorMessage = jsonParam.errorMessage || 'ลงทะเบียนไม่สำเร็จ';
          props.setProperty('pendingEnrollment', JSON.stringify(data2));
        }
        return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
      }

      var memberSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
      var memberNameForLog = memberSheet.getRange(targetRowNumber, 2).getValue() || (data2 ? data2.memberName : '');
      memberSheet.getRange(targetRowNumber, 8).setValue(jsonParam.fingerprintId); // คอลัมน์ที่ 8 = Fingerprint ID
      invalidateFingerprintCache_(); // เพิ่ง/แก้รหัสลายนิ้วมือใหม่ - ล้างแคชกันข้อมูลเก่าค้าง
      logAudit_('SYSTEM (เครื่องสแกนหน้าประตู)', 'FINGERPRINT_ENROLLED', memberNameForLog, 'ลงทะเบียนลายนิ้วมือสำเร็จ รหัส: ' + jsonParam.fingerprintId + (isSameActivePending ? '' : ' (รายงานผลล่าช้า - เขียนตรงเข้าแถวที่ถูกต้องแล้ว)'));

      if (isSameActivePending) {
        data2.status = 'done';
        data2.fingerprintId = jsonParam.fingerprintId;
        props.setProperty('pendingEnrollment', JSON.stringify(data2));
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: e.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
}
