// AuditLog — extracted from the original monolithic Code.js

function logAudit_(user, action, target, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('AuditLog');
    if (!sheet) {
      sheet = ss.insertSheet('AuditLog');
      sheet.appendRow(["Timestamp", "Admin", "Action", "Target", "Details"]);
    }
    sheet.appendRow([new Date(), user, action, target, details || ""]);
  } catch (e) {}
}

function getAuditLog(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('AuditLog');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var maxDisplay = 50;
    var startRow = Math.max(2, lastRow - maxDisplay + 1);
    var numRows = lastRow - startRow + 1;
    var rows = sheet.getRange(startRow, 1, numRows, 5).getValues();
    var logs = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var t = rows[i][0];
      var tStr = t instanceof Date ? Utilities.formatDate(t, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : t.toString();
      logs.push({ timestamp: tStr, admin: rows[i][1], action: rows[i][2], target: rows[i][3], details: rows[i][4] });
    }
    return logs;
  } catch (e) { return []; }
}
