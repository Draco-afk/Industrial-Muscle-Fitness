// Admins — extracted from the original monolithic Code.js

function getAdminList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    if (!sheet) return [];
    var rows = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      list.push({ user: rows[i][0].toString(), role: rows[i][2] || "Admin Staff", email: rows[i][3] || "" });
    }
    return list;
  } catch(e) { return []; }
}

function addAdminData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    if (!sheet) {
      sheet = ss.insertSheet('Admins');
      sheet.appendRow(["Username", "Password", "Role", "Email"]);
    }
    var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 4)).getValues()[0];
    if (!headerRow[3]) sheet.getRange(1, 4).setValue("Email");

    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === data.user) return { success: false, message: "ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว!" };
    }
    sheet.appendRow([data.user, hashPassword_(data.pass), data.role, data.email || ""]);
    logAudit_(session.user, 'ADD_ADMIN', data.user, 'สร้างบัญชีแอดมินใหม่ role: ' + data.role);
    return { success: true, message: "เพิ่มบัญชีแอดมินใหม่สำเร็จ!" };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteAdminData(username, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === username) {
        sheet.deleteRow(i + 1);
        logAudit_(session.user, 'DELETE_ADMIN', username, 'ลบบัญชีแอดมิน');
        return { success: true, message: "ลบบัญชีแอดมินออกจากระบบสำเร็จ!" };
      }
    }
    return { success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function requestAdminPasswordReset(usernameOrEmail) {
  try {
    usernameOrEmail = (usernameOrEmail || '').toString().trim();
    if (!usernameOrEmail) return { success: false, message: 'กรุณากรอก Username หรืออีเมล' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    if (!sheet) return { success: false, message: 'ไม่พบระบบแอดมิน' };
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      var uname = rows[i][0].toString();
      var email = (rows[i][3] || '').toString().trim();
      if (uname === usernameOrEmail || (email && email.toLowerCase() === usernameOrEmail.toLowerCase())) {
        if (!email) {
          return { success: false, message: 'บัญชีนี้ยังไม่ได้ผูกอีเมลสำหรับกู้คืนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบหลัก' };
        }
        var resetToken = Utilities.getUuid();
        CacheService.getScriptCache().put('pwreset_' + resetToken, uname, 30 * 60); // ลิงก์อายุ 30 นาที
        var resetUrl = ScriptApp.getService().getUrl() + '?page=reset-password&rtoken=' + resetToken;

        MailApp.sendEmail({
          to: email,
          subject: 'Industrial Muscle - คำขอรีเซ็ตรหัสผ่านแอดมิน',
          htmlBody:
            'คุณได้ทำการขอรีเซ็ตรหัสผ่านสำหรับบัญชี <b>' + uname + '</b><br><br>' +
            'กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์นี้จะหมดอายุใน 30 นาที):<br><br>' +
            '<a href="' + resetUrl + '">' + resetUrl + '</a><br><br>' +
            'หากคุณไม่ได้เป็นผู้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้'
        });
        logAudit_(uname, 'REQUEST_PASSWORD_RESET', uname, 'ขอลิงก์รีเซ็ตรหัสผ่านทางอีเมล');
        return { success: true, message: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว กรุณาตรวจสอบกล่องจดหมาย' };
      }
    }
    return { success: false, message: 'ไม่พบ Username หรืออีเมลนี้ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function checkResetTokenValid(rtoken) {
  var username = CacheService.getScriptCache().get('pwreset_' + rtoken);
  return { valid: !!username };
}

function resetAdminPassword(rtoken, newPassword) {
  try {
    var username = CacheService.getScriptCache().get('pwreset_' + rtoken);
    if (!username) return { success: false, message: 'ลิงก์รีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง' };
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === username) {
        sheet.getRange(i + 1, 2).setValue(hashPassword_(newPassword));
        CacheService.getScriptCache().remove('pwreset_' + rtoken);
        clearFailedAttempts_('admin_' + username);
        logAudit_(username, 'RESET_PASSWORD', username, 'ตั้งรหัสผ่านใหม่ผ่านลิงก์อีเมลสำเร็จ');
        return { success: true, message: '🟢 ตั้งรหัสผ่านใหม่สำเร็จแล้ว! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' };
      }
    }
    return { success: false, message: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
