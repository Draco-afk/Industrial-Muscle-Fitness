// Auth Session — extracted from the original monolithic Code.js

function checkRateLimit_(key) {
  var raw = CacheService.getScriptCache().get('lockout_' + key);
  if (raw) {
    var data = JSON.parse(raw);
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return { locked: true, remainMin: Math.ceil((data.lockedUntil - Date.now()) / 60000) };
    }
  }
  return { locked: false };
}

function recordFailedAttempt_(key) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('lockout_' + key);
  var data = raw ? JSON.parse(raw) : { count: 0 };
  data.count = (data.count || 0) + 1;
  if (data.count >= MAX_LOGIN_ATTEMPTS) {
    data.lockedUntil = Date.now() + LOGIN_LOCK_DURATION_SEC * 1000;
  }
  cache.put('lockout_' + key, JSON.stringify(data), LOGIN_LOCK_DURATION_SEC);
}

function clearFailedAttempts_(key) {
  CacheService.getScriptCache().remove('lockout_' + key);
}

function createSession(user, role) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('session_' + token, JSON.stringify({ user: user, role: role }), SESSION_DURATION_SEC);
  return token;
}

function validateSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function destroySession(token) {
  if (token) CacheService.getScriptCache().remove('session_' + token);
}

function createMemberSession_(rowNumber, fullName, phone) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('msession_' + token, JSON.stringify({ rowNumber: rowNumber, fullName: fullName, phone: phone }), MEMBER_SESSION_DURATION_SEC);
  return token;
}

function validateMemberSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('msession_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function logoutMember(token) {
  if (token) CacheService.getScriptCache().remove('msession_' + token);
  return { success: true };
}

function checkMemberTokenValid(token) {
  var session = validateMemberSession(token);
  return { valid: !!session };
}

function createTrainerSession_(rowNumber, fullName, trainerId, phone) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('trsession_' + token, JSON.stringify({ rowNumber: rowNumber, fullName: fullName, trainerId: trainerId, phone: phone }), TRAINER_SESSION_DURATION_SEC);
  return token;
}

function validateTrainerSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('trsession_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function logoutTrainer(token) {
  if (token) CacheService.getScriptCache().remove('trsession_' + token);
  return { success: true };
}

function checkTrainerTokenValid(token) {
  var session = validateTrainerSession(token);
  return { valid: !!session };
}

function hashPassword_(plainText) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plainText, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function loginAdmin(user, pass) {
  try {
    var rl = checkRateLimit_('admin_' + user);
    if (rl.locked) {
      return { success: false, message: '🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ' + rl.remainMin + ' นาที' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Admins');
    if (!sheet) return { success: false, message: 'ไม่พบระบบแอดมิน' };
    var rows = sheet.getDataRange().getValues();
    var hashedInput = hashPassword_(pass);
    for (var i = 1; i < rows.length; i++) {
      var storedPass = rows[i][1].toString();
      var match = (storedPass === hashedInput) || (storedPass === pass);
      if (rows[i][0].toString() === user && match) {
        if (storedPass === pass && storedPass !== hashedInput) {
          sheet.getRange(i + 1, 2).setValue(hashedInput);
        }
        clearFailedAttempts_('admin_' + user); // ✅ ล็อกอินสำเร็จ เคลียร์ประวัติผิด
        var role = rows[i][2] || 'Admin Staff';
        var token = createSession(user, role);
        logAudit_(user, 'LOGIN', user, 'เข้าสู่ระบบสำเร็จ');
        return { success: true, token: token, role: role };
      }
    }
    recordFailedAttempt_('admin_' + user); // ❌ บันทึกความผิดพลาด
    return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function logoutAdmin(token) {
  destroySession(token);
  return { success: true };
}

function loginMember(phone, pin) {
  try {
    phone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    pin = (pin || '').toString().trim();
    if (!phone || !/^\d{4}$/.test(pin)) {
      return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์และ PIN 4 หลัก' };
    }

    var rl = checkRateLimit_('member_' + phone);
    if (rl.locked) {
      return { success: false, message: '🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ' + rl.remainMin + ' นาที' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return { success: false, message: 'ไม่พบฐานข้อมูลสมาชิก' };
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ' };
    var numCols = Math.max(sheet.getLastColumn(), 17);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    for (var i = 0; i < rows.length; i++) {
      var rowPhone = (rows[i][2] || '').toString().trim().replace(/[^0-9]/g, '');
      if (rowPhone === phone) {
        var storedPinHash = (rows[i][16] || '').toString();
        var plainPinText = (rows[i][15] || '').toString().trim();
        
        var inputHash = hashPassword_(pin);
        var isDefaultMatch = (!storedPinHash && pin === '1234') || (plainPinText === pin);
        var isHashMatch = (storedPinHash === inputHash);

        if (isHashMatch || isDefaultMatch) {
          if (isDefaultMatch && !storedPinHash) {
            sheet.getRange(i + 2, 17).setValue(inputHash);
          }
          clearFailedAttempts_('member_' + phone);
          var token = createMemberSession_(i + 2, rows[i][1], phone);
          return { success: true, token: token };
        } else {
          recordFailedAttempt_('member_' + phone);
          return { success: false, message: 'PIN 4 หลักไม่ถูกต้อง (รหัสเริ่มต้นคือ 1234)' };
        }
      }
    }
    recordFailedAttempt_('member_' + phone);
    return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบสมัครสมาชิก' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function loginTrainer(phone, pin) {
  try {
    phone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    pin = (pin || '').toString().trim();
    if (!phone || !/^\d{4}$/.test(pin)) {
      return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์และ PIN 4 หลัก' };
    }

    var rl = checkRateLimit_('trainer_' + phone);
    if (rl.locked) {
      return { success: false, message: '🔒 บัญชีถูกล็อกชั่วคราวจากการกรอกผิดหลายครั้ง กรุณาลองใหม่ในอีก ' + rl.remainMin + ' นาที' };
    }

    var sheet = ensureTrainerSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();

    for (var i = 0; i < rows.length; i++) {
      var rowPhone = (rows[i][3] || '').toString().trim().replace(/[^0-9]/g, '');
      if (rowPhone === phone) {
        var storedPinHash = (rows[i][12] || '').toString();
        var plainPinText = (rows[i][11] || '').toString().trim();

        var inputHash = hashPassword_(pin);
        var isDefaultMatch = (!storedPinHash && pin === '1234') || (plainPinText === pin);
        var isHashMatch = (storedPinHash === inputHash);

        if (isHashMatch || isDefaultMatch) {
          if (isDefaultMatch && !storedPinHash) {
            sheet.getRange(i + 2, 13).setValue(inputHash);
          }
          clearFailedAttempts_('trainer_' + phone);
          var token = createTrainerSession_(i + 2, rows[i][1], rows[i][0], phone);
          return { success: true, token: token };
        } else {
          recordFailedAttempt_('trainer_' + phone);
          return { success: false, message: 'PIN 4 หลักไม่ถูกต้อง (รหัสเริ่มต้นคือ 1234)' };
        }
      }
    }
    recordFailedAttempt_('trainer_' + phone);
    return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบเทรนเนอร์' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function changeTrainerPin(token, oldPin, newPin) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    oldPin = (oldPin || '').toString().trim();
    newPin = (newPin || '').toString().trim();
    if (!/^\d{4}$/.test(newPin)) return { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น' };

    var sheet = ensureTrainerSheet_();
    var row = session.rowNumber;
    var storedPinHash = (sheet.getRange(row, 13).getValue() || '').toString();
    var plainPinText = (sheet.getRange(row, 12).getValue() || '').toString().trim();

    var inputHash = hashPassword_(oldPin);
    var isDefaultMatch = (!storedPinHash && oldPin === '1234') || (plainPinText === oldPin);
    var isHashMatch = (storedPinHash === inputHash);

    if (!isHashMatch && !isDefaultMatch) {
      return { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' };
    }
    if (oldPin === newPin) {
      return { success: false, message: 'กรุณาตั้งรหัส PIN ใหม่ที่ไม่ซ้ำกับรหัสเดิม' };
    }

    sheet.getRange(row, 12).setValue("'" + newPin);
    sheet.getRange(row, 13).setValue(hashPassword_(newPin));
    logAudit_(session.fullName, 'TRAINER_CHANGE_PIN', session.fullName, 'เทรนเนอร์เปลี่ยน PIN ด้วยตนเอง');
    return { success: true, message: '🟢 เปลี่ยนรหัส PIN สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function changeMemberPin(token, oldPin, newPin) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    oldPin = (oldPin || '').toString().trim();
    newPin = (newPin || '').toString().trim();
    if (!/^\d{4}$/.test(newPin)) return { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 4 หลักเท่านั้น' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    var row = session.rowNumber;
    var storedPinHash = (sheet.getRange(row, 17).getValue() || '').toString();
    var plainPinText = (sheet.getRange(row, 16).getValue() || '').toString().trim();

    var inputHash = hashPassword_(oldPin);
    var isDefaultMatch = (!storedPinHash && oldPin === '1234') || (plainPinText === oldPin);
    var isHashMatch = (storedPinHash === inputHash);

    if (!isHashMatch && !isDefaultMatch) {
      return { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' };
    }
    if (oldPin === newPin) {
      return { success: false, message: 'กรุณาตั้งรหัส PIN ใหม่ที่ไม่ซ้ำกับรหัสเดิม' };
    }

    sheet.getRange(row, 16).setValue("'" + newPin);
    sheet.getRange(row, 17).setValue(hashPassword_(newPin));
    logAudit_(session.fullName, 'MEMBER_CHANGE_PIN', session.fullName, 'สมาชิกเปลี่ยน PIN ด้วยตนเอง');
    return { success: true, message: '🟢 เปลี่ยนรหัส PIN สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function resetTrainerPin(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    sheet.getRange(row, 12).setValue("'1234");
    sheet.getRange(row, 13).setValue('');
    logAudit_(session.user, 'RESET_TRAINER_PIN', name, 'รีเซ็ต PIN แอปเทรนเนอร์กลับเป็นค่าเริ่มต้น');
    return { success: true, message: 'รีเซ็ต PIN ของ "' + name + '" กลับเป็น 1234 แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
