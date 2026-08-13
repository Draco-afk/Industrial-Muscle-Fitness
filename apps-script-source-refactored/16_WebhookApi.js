// WebhookApi — extracted from the original monolithic Code.js

function doPost(e) {
  try {
    var jsonParam = JSON.parse(e.postData.contents);

    // 💬 Webhook จาก LINE จะมีโครงสร้าง { destination, events: [...] } - แยกเส้นทางไปจัดการต่างหาก
    if (jsonParam.events && Array.isArray(jsonParam.events)) {
      return handleLineWebhook_(jsonParam);
    }

    // 🖐️ คำขอจากโปรแกรมตัวกลางที่รันบนคอมหน้าประตู (เช็ค/แจ้งผลการลงทะเบียนลายนิ้วมือ)
    if (jsonParam.action === 'checkPendingEnrollment' || jsonParam.action === 'completeEnrollment') {
      return handleEnrollmentAction_(jsonParam);
    }

    var fingerprintId = jsonParam.fingerprintId;

    var expectedKey = PropertiesService.getScriptProperties().getProperty('FINGERPRINT_API_KEY');
    if (expectedKey && jsonParam.apiKey !== expectedKey) {
      return ContentService.createTextOutput(JSON.stringify({ "access": false, "message": "Unauthorized API Key" })).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var logSheet = ss.getSheetByName('Logs');
    if (!logSheet) { logSheet = ss.insertSheet('Logs'); logSheet.appendRow(["Timestamp", "Name", "Fingerprint ID", "Status", "Details"]); }
    var today = new Date();
    // 🕒 ถ้าโปรแกรมตัวกลางส่งเวลาที่สแกนจริงมาด้วย (เช่น กรณีเน็ตขาดแล้วส่งย้อนหลัง) ให้ใช้เวลานั้นบันทึกลง Log แทนเวลาปัจจุบัน
    var logTimestamp = jsonParam.scanTimestamp ? new Date(jsonParam.scanTimestamp) : new Date();
    if (isNaN(logTimestamp.getTime())) logTimestamp = new Date();

    // ⚡ ใช้แคชค้นหาแถวโดยตรง (เร็วกว่าไล่สแกนทีละแถวทั้งชีทมาก โดยเฉพาะพอสมาชิกเยอะขึ้น)
    var fpMap = getFingerprintRowMap_();
    var rowNum = fpMap[fingerprintId.toString().trim().toLowerCase()];

    if (rowNum) {
      var rowData = sheet.getRange(rowNum, 1, 1, 10).getValues()[0]; // ดึงแค่แถวเดียวที่ต้องใช้ ไม่ใช่ทั้งชีท
      var fullName = rowData[1];
      var expiryDate = new Date(rowData[6]);
      var currentStatus = rowData[8];
      var checkInCount = parseInt(rowData[9] || 0);
      var pkgName = rowData[4];

      if (currentStatus === 'Active' && expiryDate >= today) {
        sheet.getRange(rowNum, 10).setValue(checkInCount + 1);
        var daysLeftGate = daysUntil_(expiryDate);
        var detailsText = "Package: " + pkgName;
        if (daysLeftGate !== null && daysLeftGate <= EXPIRY_ALERT_DAYS) {
          detailsText += (daysLeftGate < 0)
            ? " ⚠️ หมดอายุไปแล้ว " + Math.abs(daysLeftGate) + " วัน"
            : " ⚠️ ใกล้หมดอายุ (เหลือ " + daysLeftGate + " วัน)";
        }
        logSheet.appendRow([logTimestamp, fullName, fingerprintId, "SUCCESS", detailsText]);
        return ContentService.createTextOutput(JSON.stringify({
          "access": true, "name": fullName, "message": "Access Granted",
          "daysLeft": daysLeftGate, "nearExpiry": (daysLeftGate !== null && daysLeftGate <= EXPIRY_ALERT_DAYS)
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        var reason = (currentStatus !== 'Active') ? "Status: " + currentStatus : "Expired";
        logSheet.appendRow([logTimestamp, fullName, fingerprintId, "BLOCKED", reason]);
        return ContentService.createTextOutput(JSON.stringify({ "access": false, "message": reason })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    logSheet.appendRow([logTimestamp, "Unknown Fingerprint", fingerprintId, "UNKNOWN", "ไม่พบลายนิ้วมือในระบบ"]);
    return ContentService.createTextOutput(JSON.stringify({ "access": false, "message": "Unknown Fingerprint" })).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ "access": false, "error": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
