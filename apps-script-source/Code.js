// ===========================================================================
// 🌐 ROUTING & PAGE INITIALIZATION (doGet)
// ===========================================================================
function doGet(e) {
  var page = (e && e.parameter) ? e.parameter.page : null;
  var token = (e && e.parameter) ? e.parameter.token : null;

  // 1. หน้า Portal สำหรับลูกค้า/สมาชิก (Member App บนมือถือ)
  if (page === 'member-main') {
    var mSession = validateMemberSession(token);
    if (mSession) {
      var mTpl = HtmlService.createTemplateFromFile('Client'); // เรียกใช้ไฟล์ Client.html ที่สร้างแยกไว้
      mTpl.sessionToken = token;
      return mTpl.evaluate()
          .setTitle('Industrial Muscle - My Pass')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    page = 'member'; // ถ้า Token ปลอมหรือหมดอายุ ให้เด้งไปหน้า Login สมาชิก
  }

  if (page === 'member') {
    return HtmlService.createTemplateFromFile('MemberLogin') // หน้าต่างสำหรับให้สมาชิกกรอกเบอร์โทร + PIN
        .evaluate()
        .setTitle('Industrial Muscle - Member Login')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. หน้าแอดมิน / เจ้าของยิม (Admin Dashboard)
  if (page === 'main') {
    var session = validateSession(token);
    if (session) {
      var tpl = HtmlService.createTemplateFromFile('Index'); // เรียกใช้ Index.html ตัวหลักของแอดมิน
      tpl.sessionToken = token;
      tpl.userRole = session.role;
      return tpl.evaluate()
          .setTitle('Industrial Muscle - Owner & Management')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // 4. จอแสดงผลลูกค้า (Customer Check-in Display) - สำหรับจอที่ 2 ตั้งไว้หน้าประตูทางเข้า
  if (page === 'checkin-display') {
    var dSession = validateSession(token);
    if (dSession) {
      var dTpl = HtmlService.createTemplateFromFile('CheckinDisplay');
      dTpl.sessionToken = token;
      return dTpl.evaluate()
          .setTitle('Industrial Muscle - Check-in Display')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    page = 'main'; // Token ผิดหรือหมดอายุ ให้เด้งกลับไป Login แอดมิน
  }

  // 5. แอปเทรนเนอร์ (Trainer App บนมือถือ - แยกออกจากแอปสมาชิกโดยเฉพาะ)
  if (page === 'trainer-main') {
    var trSession = validateTrainerSession(token);
    if (trSession) {
      var trTpl = HtmlService.createTemplateFromFile('TrainerApp');
      trTpl.sessionToken = token;
      return trTpl.evaluate()
          .setTitle('Industrial Muscle - Trainer App')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    page = 'trainer'; // ถ้า Token ปลอมหรือหมดอายุ ให้เด้งไปหน้า Login เทรนเนอร์
  }

  if (page === 'trainer') {
    return HtmlService.createTemplateFromFile('TrainerLogin')
        .evaluate()
        .setTitle('Industrial Muscle - Trainer Login')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 3. หน้ารีเซ็ตรหัสผ่านแอดมิน (มาจากลิงก์ในอีเมล)
  if (page === 'reset-password') {
    var rtoken = (e && e.parameter) ? e.parameter.rtoken : null;
    var rTpl = HtmlService.createTemplateFromFile('ResetPassword');
    rTpl.resetToken = rtoken || '';
    return rTpl.evaluate()
        .setTitle('Industrial Muscle - Reset Password')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // หน้าล็อกอินแรกเข้าเริ่มต้นของเจ้าหน้าที่/แอดมิน
  return HtmlService.createTemplateFromFile('Login')
      .evaluate()
      .setTitle('Industrial Muscle - Admin Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getScriptUrl() { return ScriptApp.getService().getUrl(); }

// ==========================================
// 💰 PACKAGE PRICING & CONFIG (แก้ไขราคา/ระยะเวลาแพ็กเกจได้ผ่านหน้า Settings)
// ==========================================
function ensurePackageSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Packages');
  if (!sheet) {
    sheet = ss.insertSheet('Packages');
    sheet.appendRow(["Package Name", "Price", "Duration Months", "Status"]);
    sheet.appendRow(["Standard Monthly", 990, 1, "Active"]);
    sheet.appendRow(["Gold Annual", 9990, 12, "Active"]);
    sheet.appendRow(["Black VIP", 2990, 3, "Active"]);
  }
  return sheet;
}

// map ภายใน { packageName: { price, durationMonths, status } } - ใช้ในโค้ดฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ต้องใช้ token
function getPackageMap_() {
  var sheet = ensurePackageSheet_();
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow <= 1) return map;
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < rows.length; i++) {
    map[rows[i][0]] = { price: rows[i][1] || 0, durationMonths: rows[i][2] || 1, status: rows[i][3] || 'Active' };
  }
  return map;
}

function getPackageList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensurePackageSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      list.push({
        rowNumber: i + 2,
        name: rows[i][0],
        price: rows[i][1] || 0,
        durationMonths: rows[i][2] || 1,
        status: rows[i][3] || 'Active'
      });
    }
    return list;
  } catch (e) { return []; }
}

function addPackageData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var name = (data.name || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อแพ็กเกจ' };
    var price = parseFloat(data.price);
    var duration = parseInt(data.durationMonths);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    if (isNaN(duration) || duration <= 0) return { success: false, message: 'กรุณากรอกระยะเวลา (เดือน) ให้ถูกต้อง' };

    var sheet = ensurePackageSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toString() === name) return { success: false, message: 'มีแพ็กเกจชื่อนี้อยู่แล้วในระบบ' };
    }
    sheet.appendRow([name, price, duration, 'Active']);
    logAudit_(session.user, 'ADD_PACKAGE', name, 'เพิ่มแพ็กเกจใหม่ ราคา ' + price + ' บาท / ' + duration + ' เดือน');
    return { success: true, message: 'เพิ่มแพ็กเกจสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updatePackageData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var price = parseFloat(data.price);
    var duration = parseInt(data.durationMonths);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    if (isNaN(duration) || duration <= 0) return { success: false, message: 'กรุณากรอกระยะเวลา (เดือน) ให้ถูกต้อง' };

    var sheet = ensurePackageSheet_();
    var row = parseInt(data.rowNumber);
    sheet.getRange(row, 1).setValue(data.name);
    sheet.getRange(row, 2).setValue(price);
    sheet.getRange(row, 3).setValue(duration);
    sheet.getRange(row, 4).setValue(data.status || 'Active');
    logAudit_(session.user, 'EDIT_PACKAGE', data.name, 'แก้ไขแพ็กเกจ ราคา ' + price + ' บาท / ' + duration + ' เดือน');
    return { success: true, message: 'อัปเดตแพ็กเกจสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deletePackageData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensurePackageSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 1).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_PACKAGE', name, 'ลบแพ็กเกจออกจากระบบ');
    return { success: true, message: 'ลบแพ็กเกจ "' + name + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🎫 ราคาเริ่มต้นค่าเข้าใช้บริการรายวัน (Walk-in / Day Pass) แยกตามประเภทลูกค้า - แก้ราคาได้ในหน้า Settings หรือแก้ค่าเริ่มต้นตรงนี้
var DEFAULT_DAILY_PRICE_STUDENT = 30;
var DEFAULT_DAILY_PRICE_ADULT = 50;

// ⏰ จำนวนวันก่อนหมดอายุที่จะเริ่มแจ้งเตือน (แก้ได้ตรงนี้)
var EXPIRY_ALERT_DAYS = 7;

// คำนวณจำนวนวันที่เหลือก่อนหมดอายุ (นับแบบวันที่ล้วนๆ ไม่รวมเวลา) — ค่าติดลบหมายถึงหมดอายุไปแล้วกี่วัน
function daysUntil_(dateVal) {
  if (!dateVal) return null;
  var expDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(expDate.getTime())) return null;
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var expMid = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  return Math.round((expMid - todayMid) / (1000 * 60 * 60 * 24));
}

// 🔧 ดึง/บันทึกราคาค่าเข้ายิมรายวันแยกประเภท (เก็บใน Script Properties เพื่อให้แก้ได้จากหน้า Settings โดยไม่ต้องแก้โค้ด)
function getDailyPassPrices(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  var student = parseFloat(props.getProperty('dailyPriceStudent'));
  var adult = parseFloat(props.getProperty('dailyPriceAdult'));
  return {
    student: isNaN(student) ? DEFAULT_DAILY_PRICE_STUDENT : student,
    adult: isNaN(adult) ? DEFAULT_DAILY_PRICE_ADULT : adult
  };
}

function updateDailyPassPrices(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var student = parseFloat(data.student);
    var adult = parseFloat(data.adult);
    if (isNaN(student) || student < 0 || isNaN(adult) || adult < 0) {
      return { success: false, message: 'กรุณากรอกราคาให้ถูกต้อง' };
    }
    var props = PropertiesService.getScriptProperties();
    props.setProperty('dailyPriceStudent', student.toString());
    props.setProperty('dailyPriceAdult', adult.toString());
    logAudit_(session.user, 'UPDATE_DAILY_PRICES', 'Day Pass Pricing', 'นักเรียน/นักศึกษา: ' + student + ' บาท, ผู้ใหญ่: ' + adult + ' บาท');
    return { success: true, message: 'บันทึกราคาค่าเข้ายิมรายวันสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

var SESSION_DURATION_SEC = 6 * 60 * 60;        // แอดมินล็อกอินได้นาน 6 ชั่วโมง
var MEMBER_SESSION_DURATION_SEC = 24 * 60 * 60; // สมาชิกทั่วไปล็อกอินได้นาน 24 ชั่วโมง
var TRAINER_SESSION_DURATION_SEC = 12 * 60 * 60; // เทรนเนอร์ล็อกอินได้นาน 12 ชั่วโมง

// ==========================================
// 🧾 GYM INFO FOR TAX RECEIPT (แก้ไขข้อมูลร้าน/เลขผู้เสียภาษีตรงนี้ให้ตรงกับยิมจริง)
// ==========================================
var GYM_INFO = {
  name: "INDUSTRIAL MUSCLE GYM",
  address: "678/13 ถ.เจ้าเงาะ ต.ในเมือง อ.บ้านไผ่ จ.ขอนแก่น 40110",
  taxId: "-",
  phone: "095-289-5441"
};

// ==========================================
// 🔢 RECEIPT NUMBER GENERATOR (เลขที่ใบเสร็จรันทุกปี เช่น RC2026-0001)
// ==========================================
function getNextReceiptNumber_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var yearPart = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy");
    var key = 'receipt_counter_' + yearPart;
    var current = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, current.toString());
    return 'RC' + yearPart + '-' + ('0000' + current).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 🛡️ RATE LIMITING (กัน Brute-force)
// ==========================================
var MAX_LOGIN_ATTEMPTS = 5;
var LOGIN_LOCK_DURATION_SEC = 15 * 60; // ล็อก 15 นาที

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

// ==========================================
// 🔐 SESSION HELPERS (ระบบจัดการ session)
// ==========================================
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

// 🔁 เช็คว่า token ที่บันทึกไว้ในเครื่อง (localStorage) ยังใช้ได้อยู่ไหม - สำหรับระบบ Auto-Login
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

// 🔁 เช็คว่า token ที่บันทึกไว้ในเครื่อง (localStorage) ยังใช้ได้อยู่ไหม - สำหรับระบบ Auto-Login
function checkTrainerTokenValid(token) {
  var session = validateTrainerSession(token);
  return { valid: !!session };
}

// ==========================================
// 📝 AUDIT LOG SYSTEM (ประวัติหลังบ้าน)
// ==========================================
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

// ==========================================
// 🎁 REFERRAL & SECURITY HELPERS
// ==========================================
var REFERRAL_NEW_MEMBER_BONUS_DAYS = 3;
var REFERRAL_REFERRER_BONUS_DAYS = 7;

function generateReferralCode_(fullName) {
  var prefix = (fullName || 'MEM').toString().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  if (prefix.length < 3) prefix = (prefix + 'GYM').substring(0, 3);
  var rand = Math.floor(1000 + Math.random() * 9000);
  return prefix + rand;
}

function hashPassword_(plainText) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plainText, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

// ==========================================
// 🔐 ADMIN CONTROLS
// ==========================================
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

// ==========================================
// 🔑 ADMIN PASSWORD RESET (ผ่านอีเมล)
// ==========================================
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

// ==========================================
// 🏋️‍♂️ MEMBER MANAGEMENT (เพิ่มรหัส PIN)
// ==========================================
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

// 🎂 อ่าน/บันทึกการตั้งค่าส่วนลดวันเกิด (เลือกได้ว่าจะลดเป็น % หรือลดเป็นจำนวนเงินคงที่)
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

// 🔧 คำนวณส่วนลดวันเกิดตามที่แอดมินตั้งค่าไว้ (ใช้ร่วมกันทุกจุดที่ต้องคิดส่วนลดวันเกิด)
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

// 🎂 เช็คว่าวันเกิด (เดือน) ของค่านี้ตรงกับเดือนปัจจุบันไหม
function isBirthdayMonth_(dobValue) {
  if (!dobValue) return false;
  var dob = dobValue instanceof Date ? dobValue : new Date(dobValue);
  if (isNaN(dob.getTime())) return false;
  var now = new Date();
  return dob.getMonth() === now.getMonth();
}

// 📜 ประวัติทั้งหมดของสมาชิกคนเดียวแบบละเอียด (ชำระเงิน / เข้ายิม / จองคิวเทรนเนอร์)
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

// ==========================================
// 🏆 CHECK-IN LEADERBOARD
// ==========================================
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

// ==========================================
// ✅ เช็คอินด้วยมือ (สำรองไว้ใช้เวลาเครื่องสแกนลายนิ้วมือใช้งานไม่ได้)
// ==========================================
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

// ===========================================================================
// 📱 CLIENT / MEMBER APP INTEGRATION (ส่วนสำหรับลูกค้ายิม - ต้อง Login ด้วย Token เท่านั้น)
// ===========================================================================
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

// ===========================================================================
// 🧑‍🏫 TRAINER APP (แอปสำหรับเทรนเนอร์เท่านั้น - ต้อง Login ด้วย Token เท่านั้น)
// ===========================================================================
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

function getTrainerOwnProfile(token) {
  var session = validateTrainerSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureTrainerSheet_();
    var row = session.rowNumber;
    var data = sheet.getRange(row, 1, 1, 18).getValues()[0];
    var busySinceRaw = data[14];

    return {
      trainerId: data[0],
      fullName: data[1],
      specialty: data[2],
      phone: data[3] ? data[3].toString() : '',
      workingDays: data[4] ? data[4].toString().split(',') : [],
      startHour: normalizeTimeValue_(data[5]),
      endHour: normalizeTimeValue_(data[6]),
      status: data[8] || 'Active',
      photoUrl: data[9] || '',
      bio: data[10] || '',
      pin: data[11] ? data[11].toString() : '1234',
      busyStatus: data[13] || 'Available',
      busySince: busySinceRaw ? (busySinceRaw instanceof Date ? busySinceRaw.getTime() : new Date(busySinceRaw).getTime()) : null,
      email: data[15] || '',
      lineLinked: !!(data[16] && data[16].toString().trim())
    };
  } catch (e) { throw new Error(e.toString()); }
}

// ✉️ เทรนเนอร์ตั้ง/แก้ไขอีเมลของตัวเอง (ไว้รับแจ้งเตือนคิวใหม่)
function updateTrainerOwnEmail(token, email) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    sheet.getRange(session.rowNumber, 16).setValue((email || '').toString().trim());
    logAudit_(session.fullName, 'TRAINER_UPDATE_EMAIL', session.fullName, 'เทรนเนอร์ตั้ง/แก้ไขอีเมลรับแจ้งเตือนด้วยตนเอง');
    return { success: true, message: '🟢 บันทึกอีเมลสำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔴🟢 เทรนเนอร์กดแจ้งสถานะตัวเองว่า "ว่าง" หรือ "ติดลูกค้าอยู่" แบบเรียลไทม์
function setTrainerBusyStatus(token, isBusy) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = session.rowNumber;
    var newStatus = isBusy ? 'Busy' : 'Available';
    sheet.getRange(row, 14).setValue(newStatus);
    sheet.getRange(row, 15).setValue(isBusy ? new Date() : '');
    logAudit_(session.fullName, 'TRAINER_SET_STATUS', session.fullName, 'เปลี่ยนสถานะเป็น ' + newStatus);
    return {
      success: true,
      message: isBusy ? '🔴 ตั้งสถานะเป็น "ติดลูกค้าอยู่" แล้ว' : '🟢 ตั้งสถานะเป็น "ว่าง" แล้ว',
      busyStatus: newStatus
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🕹️ แอดมินควบคุม/ตั้งสถานะเทรนเนอร์แทนได้ (เผื่อเทรนเนอร์ลืมกดหรือแอดมินอยากปรับเอง)
function adminSetTrainerBusyStatus(rowNumber, isBusy, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    var newStatus = isBusy ? 'Busy' : 'Available';
    sheet.getRange(row, 14).setValue(newStatus);
    sheet.getRange(row, 15).setValue(isBusy ? new Date() : '');
    logAudit_(session.user, 'ADMIN_SET_TRAINER_STATUS', name, 'แอดมินตั้งสถานะเทรนเนอร์เป็น ' + newStatus);
    return {
      success: true,
      message: 'ตั้งสถานะ "' + name + '" เป็น ' + (isBusy ? 'ติดลูกค้าอยู่' : 'ว่าง') + ' แล้ว',
      busyStatus: newStatus
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// รายการคิวที่ถูกจองกับเทรนเนอร์คนนี้ (ไม่รวมที่ยกเลิกแล้ว) เรียงตามวันที่/เวลาใกล้ที่สุดก่อน
function getTrainerOwnBookings(token) {
  var session = validateTrainerSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    var tz = Session.getScriptTimeZone();
    var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][2] !== session.trainerId) continue;
      if (rows[i][9] === 'Cancelled') continue;
      var bDate = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
      list.push({
        bookingId: rows[i][1],
        memberName: rows[i][5],
        memberPhone: rows[i][6] ? rows[i][6].toString() : '',
        date: bDate,
        timeSlot: rows[i][8],
        status: rows[i][9] || 'Booked',
        isToday: bDate === todayStr
      });
    }
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.timeSlot.localeCompare(b.timeSlot);
    });
    return list;
  } catch (e) { return []; }
}

// ✅ เทรนเนอร์ปิดคิว/ยกเลิกคิวของตัวเองได้เลยจากแอปเทรนเนอร์ (ไม่ต้องรอแอดมิน)
function trainerUpdateBookingStatus(token, bookingId, newStatus) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    if (newStatus !== 'Completed' && newStatus !== 'Cancelled') {
      return { success: false, message: 'สถานะไม่ถูกต้อง' };
    }
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบรายการจองนี้' };
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] === bookingId && rows[i][2] === session.trainerId) {
        bookingSheet.getRange(i + 2, 10).setValue(newStatus);
        var statusLabel = newStatus === 'Completed' ? 'เสร็จสิ้น' : 'ยกเลิก';
        if (newStatus === 'Cancelled') {
          var tz = Session.getScriptTimeZone();
          var cancelDateStr = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
          notifyNextWaitlistPerson_(rows[i][2], cancelDateStr, rows[i][8]);
        }
        logAudit_(session.fullName, 'TRAINER_UPDATE_BOOKING', rows[i][5], 'เทรนเนอร์ตั้งสถานะคิวเป็น ' + statusLabel + ' (สมาชิก: ' + rows[i][5] + ')');
        return { success: true, message: 'ตั้งสถานะคิวเป็น "' + statusLabel + '" เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบรายการจองนี้ หรือไม่ใช่คิวของคุณ' };
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

// ✏️ เทรนเนอร์แก้ไขประวัติ/ผลงานของตัวเอง
function updateTrainerOwnProfile(token, bio, email) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    sheet.getRange(session.rowNumber, 11).setValue((bio || '').toString());
    if (typeof email !== 'undefined') {
      sheet.getRange(session.rowNumber, 16).setValue((email || '').toString().trim());
    }
    logAudit_(session.fullName, 'TRAINER_UPDATE_BIO', session.fullName, 'เทรนเนอร์แก้ไขประวัติ/อีเมลด้วยตนเอง');
    return { success: true, message: '🟢 บันทึกข้อมูลสำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 📸 เทรนเนอร์อัปโหลดรูปโปรไฟล์ใหม่ด้วยตนเอง (บันทึกลง Drive แล้วอัปเดตในชีทให้ทันที)
function uploadTrainerPhotoSelf(base64Data, mimeType, fileName, token) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var folders = DriveApp.getFoldersByName('TrainerPhotos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('TrainerPhotos');

    var decoded = Utilities.base64Decode(base64Data.split(',').pop());
    var blob = Utilities.newBlob(decoded, mimeType, fileName || ('trainer_' + Date.now()));
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var photoUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w500';
    var sheet = ensureTrainerSheet_();
    sheet.getRange(session.rowNumber, 10).setValue(photoUrl);
    logAudit_(session.fullName, 'TRAINER_UPDATE_PHOTO', session.fullName, 'เทรนเนอร์อัปโหลดรูปโปรไฟล์ใหม่ด้วยตนเอง');
    return { success: true, url: photoUrl };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🗑️ เทรนเนอร์ลบรูปโปรไฟล์ของตัวเอง (กลับเป็นไอคอนเริ่มต้น)
function deleteTrainerPhotoSelf(token) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    sheet.getRange(session.rowNumber, 10).setValue('');
    logAudit_(session.fullName, 'TRAINER_DELETE_PHOTO', session.fullName, 'เทรนเนอร์ลบรูปโปรไฟล์ของตัวเอง');
    return { success: true, message: 'ลบรูปโปรไฟล์แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🗑️ แอดมินลบรูปโปรไฟล์ของเทรนเนอร์คนใดก็ได้
function deleteTrainerPhoto(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    sheet.getRange(row, 10).setValue('');
    logAudit_(session.user, 'ADMIN_DELETE_TRAINER_PHOTO', name, 'แอดมินลบรูปโปรไฟล์เทรนเนอร์');
    return { success: true, message: 'ลบรูปโปรไฟล์ของ "' + name + '" แล้ว' };
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

// ==========================================
// 🔑 MEMBER SELF-SERVICE PIN CHANGE
// ==========================================
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

// ==========================================
// 💳 PAYMENTS & OVERLAP RENEWALS (สมาชิกรายเดือน)
// ==========================================
function ensurePaymentSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Payments');
  if (!sheet) {
    sheet = ss.insertSheet('Payments');
    sheet.appendRow(["Timestamp", "Member Name", "Package", "QR Code Data", "New Expiry Date", "Receipt No", "Amount", "Refund Status", "Refund Reason", "Refunded By", "Refunded At", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 12)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Receipt No");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Amount");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Refund Status");
  if (!headerRow[8]) sheet.getRange(1, 9).setValue("Refund Reason");
  if (!headerRow[9]) sheet.getRange(1, 10).setValue("Refunded By");
  if (!headerRow[10]) sheet.getRange(1, 11).setValue("Refunded At");
  if (!headerRow[11]) sheet.getRange(1, 12).setValue("Payment Method");
  return sheet;
}

function processRenewalPayment(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var memberSheet = ss.getSheetByName('Members');
    var paymentSheet = ensurePaymentSheet_();

    var paymentRows = paymentSheet.getDataRange().getValues();
    var inputQrData = data.qrData ? data.qrData.toString().trim() : "";
    if (inputQrData !== "") {
      for (var p = 1; p < paymentRows.length; p++) {
        var existingQrData = paymentRows[p][3] ? paymentRows[p][3].toString().trim() : "";
        if (existingQrData === inputQrData) {
          return { success: false, message: "❌ ไม่สามารถใช้สลิปนี้ซ้ำได้! เคยถูกใช้ต่ออายุไปแล้ว" };
        }
      }
    } else {
      return { success: false, message: "❌ ไม่พบข้อมูล QR Code จากสลิป" };
    }

    var rows = memberSheet.getDataRange().getValues();
    var targetRow = -1;
    var currentExpiryStr = "";
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1].toString() === data.memberName) { targetRow = i + 1; currentExpiryStr = rows[i][6]; break; }
    }
    if (targetRow === -1) return { success: false, message: "❌ ไม่พบรายชื่อสมาชิกนี้ในระบบ" };

    var baseDate = new Date();
    if (currentExpiryStr) {
      var currentExpiry = new Date(currentExpiryStr);
      if (currentExpiry > baseDate) baseDate = currentExpiry;
    }
    var pkgMap = getPackageMap_();
    var pkgInfo = pkgMap[data.package];
    var durationMonths = pkgInfo ? pkgInfo.durationMonths : 1;

    var newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + durationMonths);
    var newExpiryStr = Utilities.formatDate(newExpiry, Session.getScriptTimeZone(), "yyyy-MM-dd");

    memberSheet.getRange(targetRow, 5).setValue(data.package);
    memberSheet.getRange(targetRow, 7).setValue(newExpiryStr);
    memberSheet.getRange(targetRow, 9).setValue('Active');

    // 🎂 ส่วนลดวันเกิด - ถ้าเดือนปัจจุบันตรงกับเดือนเกิดของสมาชิกคนนี้ (ตั้งค่าได้ในหน้า Settings)
    var dobRaw = memberSheet.getRange(targetRow, 18).getValue();
    var isBirthday = isBirthdayMonth_(dobRaw);
    var paidAmount = pkgInfo ? pkgInfo.price : 0;
    var discountNote = '';
    if (isBirthday) {
      var bd = computeBirthdayDiscount_(paidAmount);
      paidAmount = bd.finalAmount;
      discountNote = ' 🎂 (ใช้ส่วนลดวันเกิด ' + bd.label + ')';
    }

    // 🎟️ ส่วนลดคูปอง (ถ้ามี) - คิดต่อจากยอดหลังหักส่วนลดวันเกิดแล้ว
    var couponCode = (data.couponCode || '').toString().trim();
    var couponResult = null;
    if (couponCode) {
      couponResult = validateCoupon_(couponCode, paidAmount, 'membership');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      paidAmount = couponResult.finalAmount;
      discountNote += ' 🎟️ (คูปอง ' + couponResult.code + ' ลด ' + couponResult.discountAmount.toLocaleString('th-TH') + ' บาท)';
    }

    // 🧾 ออกเลขที่ใบเสร็จอัตโนมัติ พร้อมบันทึกยอดเงินที่ชำระ สำหรับใช้ยื่นภาษี
    var receiptNo = getNextReceiptNumber_();

    var renewalPaymentMethod = (data.paymentMethod === 'transfer') ? 'โอนเงิน' : 'เงินสด';
    var renewalDate = new Date();
    paymentSheet.appendRow([renewalDate, data.memberName, data.package, inputQrData, newExpiryStr, receiptNo, paidAmount, '', '', '', '', renewalPaymentMethod]);
    if (couponResult) applyCouponUsage_(couponResult.rowNumber);
    clearRevenueOverrideForDate_(toOverrideDateKey_(renewalDate), session.user, 'ต่ออายุสมาชิก ใบเสร็จ ' + receiptNo);
    logAudit_(session.user, 'RENEW_PAYMENT', data.memberName, 'ต่ออายุสำเร็จ: ' + data.package + ' หมดอายุ ' + newExpiryStr + ' (ใบเสร็จ: ' + receiptNo + ')' + discountNote);
    return {
      success: true,
      message: "🟢 ต่ออายุสมาชิกเรียบร้อยแล้ว!" + discountNote + " เลขที่ใบเสร็จ: " + receiptNo,
      receiptNo: receiptNo,
      isBirthday: isBirthday,
      paidAmount: paidAmount
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getPaymentLogs(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var logs = [];

    // 1) รายการต่ออายุ/สมัครที่จ่ายแยกปกติ - จากชีท Payments
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var numCols = Math.max(sheet.getLastColumn(), 12);
      var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
      for (var i = 0; i < rows.length; i++) {
        var dateObj = rows[i][0];
        if (!dateObj) continue;
        var dateStr = dateObj instanceof Date ? Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : dateObj.toString();
        logs.push({
          timestampRaw: dateObj instanceof Date ? dateObj.getTime() : new Date(dateObj).getTime(),
          timestamp: dateStr,
          memberName: rows[i][1],
          package: rows[i][2],
          qrData: rows[i][3] ? rows[i][3].toString() : "",
          newExpiry: rows[i][4] ? Utilities.formatDate(new Date(rows[i][4]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
          receiptNo: rows[i][5] ? rows[i][5].toString() : "",
          amount: rows[i][6] || 0,
          refundStatus: rows[i][7] || '',
          refundReason: rows[i][8] || '',
          paymentMethod: rows[i][11] || 'เงินสด',
          bundledInDailyBill: false
        });
      }
    }

    // 2) ค่าสมัครสมาชิกที่ถูกรวมเข้าไปในบิล POS ลูกค้ารายวัน (แพ็กเกจเสริม) - ดึงมาจากชีท DailyPayments ด้วย
    // เพื่อไม่ให้ต้องไปงมหาเองว่ารายการไปโผล่อยู่ตรงไหน (เช่นกรณีสมัครพร้อมซื้อของ/รวมบิลกับลูกค้ารายวัน)
    var dailySheet = ensureDailySheet_();
    var dLastRow = dailySheet.getLastRow();
    if (dLastRow > 1) {
      var dNumCols = Math.max(dailySheet.getLastColumn(), 11);
      var dRows = dailySheet.getRange(2, 1, dLastRow - 1, dNumCols).getValues();
      var membershipItemPattern = /^สมัครสมาชิกรายเดือน - (.+) \((.+)\)$/;
      for (var j = 0; j < dRows.length; j++) {
        var dItems = [];
        try { dItems = dRows[j][5] ? JSON.parse(dRows[j][5]) : []; } catch (e2) { dItems = []; }
        dItems.forEach(function (it) {
          var match = membershipItemPattern.exec(it.name || '');
          if (!match) return;
          var dDateObj = dRows[j][0];
          logs.push({
            timestampRaw: dDateObj instanceof Date ? dDateObj.getTime() : new Date(dDateObj).getTime(),
            timestamp: dDateObj instanceof Date ? Utilities.formatDate(dDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : dDateObj.toString(),
            memberName: match[2],
            package: match[1],
            qrData: "",
            newExpiry: "",
            receiptNo: dRows[j][4] ? dRows[j][4].toString() : "",
            amount: (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1),
            refundStatus: dRows[j][6] || '',
            refundReason: dRows[j][7] || '',
            paymentMethod: dRows[j][10] || 'เงินสด',
            bundledInDailyBill: true
          });
        });
      }
    }

    logs.sort(function (a, b) { return b.timestampRaw - a.timestampRaw; });
    return logs.slice(0, 15);
  } catch (e) { return []; }
}

// ✏️ แก้ไขวิธีชำระเงิน (เงินสด/โอนเงิน) ของรายการต่ออายุสมาชิกที่ผ่านมาแล้ว - ใช้แก้ข้อมูลที่กรอกผิด/ไม่มีข้อมูลเดิม
function updatePaymentMethod(receiptNo, paymentMethod, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบข้อมูล' };
    var numCols = Math.max(sheet.getLastColumn(), 12);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo.toString()) {
        sheet.getRange(i + 2, 12).setValue(method);
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'แก้วิธีชำระเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'EDIT_PAYMENT_METHOD', rows[i][1], 'แก้ไขวิธีชำระเงินใบเสร็จ ' + receiptNo + ' เป็น ' + method);
        return { success: true, message: '🟢 แก้ไขวิธีชำระเงินเป็น "' + method + '" แล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 💸 ยกเลิก/คืนเงินใบเสร็จสมาชิกรายเดือน (ไม่ปรับวันหมดอายุอัตโนมัติ เพื่อความปลอดภัย - แอดมินปรับเองในหน้า Edit Member ถ้าจำเป็น)
function voidMembershipPayment(token, receiptNo, reason) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensurePaymentSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo) {
        if ((rows[i][7] || '') === 'Refunded') {
          return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };
        }
        var row = i + 2;
        sheet.getRange(row, 8).setValue('Refunded');
        sheet.getRange(row, 9).setValue(reason || '');
        sheet.getRange(row, 10).setValue(session.user);
        sheet.getRange(row, 11).setValue(new Date());
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'VOID_MEMBERSHIP_PAYMENT', rows[i][1], 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' ยอด ' + rows[i][6] + ' บาท เหตุผล: ' + (reason || '-'));
        return { success: true, message: '🟢 ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 🛒 PRODUCT CATALOG (น้ำ, เวย์, ขนม ฯลฯ ที่ขายหน้ายิม)
// ==========================================
function ensureProductSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Products');
  if (!sheet) {
    sheet = ss.insertSheet('Products');
    sheet.appendRow(["Product ID", "Name", "Category", "Price", "Status", "Stock", "Low Stock Threshold"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์สต็อก ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 7)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Stock");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Low Stock Threshold");
  return sheet;
}

// ==========================================
// 🎟️ คูปอง/โค้ดส่วนลด (แอดมินสร้างเองได้ - ใช้ได้กับสมัครสมาชิก/ต่ออายุ/POS รายวัน)
// ==========================================
function ensureCouponSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Coupons');
  if (!sheet) {
    sheet = ss.insertSheet('Coupons');
    sheet.appendRow(["Code", "Discount Type", "Discount Value", "Usage Limit", "Used Count", "Expiry Date", "Min Purchase Amount", "Applicable To", "Status", "Description"]);
  }
  return sheet;
}

function getCouponList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureCouponSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var expRaw = rows[i][5];
      list.push({
        rowNumber: i + 2,
        code: rows[i][0],
        discountType: rows[i][1] || 'Percent',
        discountValue: rows[i][2] || 0,
        usageLimit: (rows[i][3] === '' || rows[i][3] === null) ? null : rows[i][3],
        usedCount: rows[i][4] || 0,
        expiryDate: expRaw instanceof Date ? Utilities.formatDate(expRaw, tz, "yyyy-MM-dd") : (expRaw || ''),
        minPurchaseAmount: rows[i][6] || 0,
        applicableTo: rows[i][7] || 'All',
        status: rows[i][8] || 'Active',
        description: rows[i][9] || ''
      });
    }
    return list;
  } catch (e) { return []; }
}

function addCouponData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var code = (data.code || '').toString().trim().toUpperCase();
    if (!code) return { success: false, message: 'กรุณากรอกโค้ดคูปอง' };
    var discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    var sheet = ensureCouponSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toString().toUpperCase() === code) return { success: false, message: 'มีโค้ดนี้อยู่ในระบบแล้ว' };
    }

    var usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit);
    var minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    sheet.appendRow([
      code,
      data.discountType || 'Percent',
      discountValue,
      usageLimit,
      0,
      data.expiryDate || '',
      minPurchase,
      data.applicableTo || 'All',
      'Active',
      data.description || ''
    ]);
    logAudit_(session.user, 'ADD_COUPON', code, 'สร้างคูปองใหม่: ' + (data.discountType === 'Fixed' ? discountValue + ' บาท' : discountValue + '%'));

    var broadcastResult = null;
    if (data.broadcastLine) {
      var discountText = data.discountType === 'Fixed' ? discountValue.toLocaleString('th-TH') + ' บาท' : discountValue + '%';
      var broadcastText = '🎟️ คูปองส่วนลดใหม่!\n\n' +
        (data.description ? data.description + '\n' : '') +
        'ใช้โค้ด: ' + code + '\n' +
        'ลด: ' + discountText +
        (data.expiryDate ? '\nหมดเขต: ' + data.expiryDate : '') +
        '\n\nแวะมาใช้สิทธิ์ได้เลยที่ยิม!';
      broadcastResult = broadcastLineToMembers_(broadcastText);
      logAudit_(session.user, 'BROADCAST_COUPON_LINE', code, 'ส่งประกาศคูปองทาง LINE ให้สมาชิก ' + (broadcastResult ? broadcastResult.sentCount : 0) + ' คน');
    }

    return {
      success: true,
      message: 'สร้างคูปอง "' + code + '" สำเร็จ!' + (broadcastResult ? ' 📢 ส่งแจ้งเตือน LINE ให้สมาชิก ' + broadcastResult.sentCount + ' คนแล้ว' : '')
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 📢 ส่งข้อความ LINE ให้สมาชิกที่เชื่อมต่อ LINE ไว้ทุกคนพร้อมกัน (ใช้ multicast แทน push ทีละคนเพื่อประหยัด quota)
function broadcastLineToMembers_(text) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return { sentCount: 0 };
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { sentCount: 0 };
    var numCols = Math.max(sheet.getLastColumn(), 19);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var userIds = [];
    for (var i = 0; i < rows.length; i++) {
      var lineUserId = (rows[i][18] || '').toString().trim();
      if (lineUserId) userIds.push(lineUserId);
    }
    if (userIds.length === 0) return { sentCount: 0 };

    var accessToken = PropertiesService.getScriptProperties().getProperty('lineChannelAccessToken');
    if (!accessToken) { Logger.log('broadcastLineToMembers_: ไม่มี Channel Access Token'); return { sentCount: 0 }; }

    // LINE multicast รับได้สูงสุด 500 userId ต่อครั้ง แบ่งเป็นชุดๆ
    var batchSize = 500;
    var totalSent = 0;
    for (var b = 0; b < userIds.length; b += batchSize) {
      var batch = userIds.slice(b, b + batchSize);
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        payload: JSON.stringify({ to: batch, messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        totalSent += batch.length;
      } else {
        Logger.log('broadcastLineToMembers_ ล้มเหลว! HTTP ' + res.getResponseCode() + ' - ' + res.getContentText());
      }
    }
    return { sentCount: totalSent };
  } catch (e) {
    Logger.log('broadcastLineToMembers_ เกิด exception: ' + e.toString());
    return { sentCount: 0 };
  }
}

function updateCouponData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var discountValue = parseFloat(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) return { success: false, message: 'กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง' };

    var sheet = ensureCouponSheet_();
    var row = parseInt(data.rowNumber);
    var usageLimit = data.usageLimit === '' || typeof data.usageLimit === 'undefined' ? '' : parseInt(data.usageLimit);
    var minPurchase = parseFloat(data.minPurchaseAmount) || 0;

    sheet.getRange(row, 2).setValue(data.discountType || 'Percent');
    sheet.getRange(row, 3).setValue(discountValue);
    sheet.getRange(row, 4).setValue(usageLimit);
    sheet.getRange(row, 6).setValue(data.expiryDate || '');
    sheet.getRange(row, 7).setValue(minPurchase);
    sheet.getRange(row, 8).setValue(data.applicableTo || 'All');
    sheet.getRange(row, 9).setValue(data.status || 'Active');
    sheet.getRange(row, 10).setValue(data.description || '');
    logAudit_(session.user, 'EDIT_COUPON', data.code || ('row ' + row), 'แก้ไขคูปอง');
    return { success: true, message: 'อัปเดตคูปองสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteCouponData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureCouponSheet_();
    var row = parseInt(rowNumber);
    var code = sheet.getRange(row, 1).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_COUPON', code, 'ลบคูปองออกจากระบบ');
    return { success: true, message: 'ลบคูปอง "' + code + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔍 ตรวจสอบคูปอง (ใช้ภายใน) - ไม่แก้ไขข้อมูลใดๆ แค่คำนวณและคืนผลลัพธ์เฉยๆ
// scope: 'membership' | 'daily' | 'newmember'
function validateCoupon_(code, amount, scope) {
  if (!code) return { valid: false, message: '' };
  try {
    var sheet = ensureCouponSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { valid: false, message: 'ไม่พบโค้ดคูปองนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var normalizedCode = code.toString().trim().toUpperCase();

    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toString().toUpperCase() !== normalizedCode) continue;

      var rowNumber = i + 2;
      var discountType = rows[i][1] || 'Percent';
      var discountValue = rows[i][2] || 0;
      var usageLimit = rows[i][3];
      var usedCount = rows[i][4] || 0;
      var expiryDate = rows[i][5];
      var minPurchase = rows[i][6] || 0;
      var applicableTo = rows[i][7] || 'All';
      var status = rows[i][8] || 'Active';

      if (status !== 'Active') return { valid: false, message: '❌ คูปองนี้ถูกปิดใช้งานแล้ว' };
      if (applicableTo !== 'All' && applicableTo.toLowerCase() !== scope) {
        return { valid: false, message: '❌ คูปองนี้ใช้ไม่ได้กับรายการประเภทนี้' };
      }
      if (usageLimit !== '' && usageLimit !== null && typeof usageLimit !== 'undefined' && usedCount >= usageLimit) {
        return { valid: false, message: '❌ คูปองนี้ถูกใช้ครบจำนวนสิทธิ์แล้ว' };
      }
      if (expiryDate) {
        var expDateObj = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
        var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
        if (expDateObj < todayMid) return { valid: false, message: '❌ คูปองนี้หมดอายุแล้ว' };
      }
      if (minPurchase > 0 && amount < minPurchase) {
        return { valid: false, message: '❌ ยอดซื้อขั้นต่ำสำหรับคูปองนี้คือ ' + minPurchase.toLocaleString('th-TH') + ' บาท' };
      }

      var discountAmount = discountType === 'Fixed' ? discountValue : Math.round(amount * (discountValue / 100) * 100) / 100;
      if (discountAmount > amount) discountAmount = amount;
      var finalAmount = Math.round((amount - discountAmount) * 100) / 100;

      return {
        valid: true,
        rowNumber: rowNumber,
        code: rows[i][0],
        discountType: discountType,
        discountValue: discountValue,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        message: '🎟️ ใช้คูปอง "' + rows[i][0] + '" สำเร็จ! ลด ' + discountAmount.toLocaleString('th-TH') + ' บาท'
      };
    }
    return { valid: false, message: '❌ ไม่พบโค้ดคูปองนี้ในระบบ' };
  } catch (e) { return { valid: false, message: e.toString() }; }
}

function applyCouponUsage_(rowNumber) {
  try {
    var sheet = ensureCouponSheet_();
    var currentUsed = sheet.getRange(rowNumber, 5).getValue() || 0;
    sheet.getRange(rowNumber, 5).setValue(currentUsed + 1);
  } catch (e) { /* ไม่ให้ error ตรงนี้ทำให้การชำระเงินหลักล้มเหลว */ }
}

// 🔍 พรีวิวส่วนลดคูปองแบบ real-time ให้แอดมินเห็นก่อนกดชำระเงินจริง (ไม่แก้ไขข้อมูลใดๆ)
function previewCouponDiscount(code, amount, scope, token) {
  var session = validateSession(token);
  if (!session) return { valid: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  return validateCoupon_(code, parseFloat(amount) || 0, scope);
}

function getProductList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureProductSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      list.push({
        rowNumber: i + 2,
        productId: rows[i][0],
        name: rows[i][1],
        category: rows[i][2] || '',
        price: rows[i][3] || 0,
        status: rows[i][4] || 'Active',
        stock: (rows[i][5] === '' || rows[i][5] === null || typeof rows[i][5] === 'undefined') ? null : rows[i][5],
        lowStockThreshold: rows[i][6] || 5
      });
    }
    return list;
  } catch (e) { return []; }
}

function addProductData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var name = (data.name || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อสินค้า' };
    var price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    var stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    var threshold = parseInt(data.lowStockThreshold);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    var sheet = ensureProductSheet_();
    var productId = 'PD' + Utilities.getUuid().substring(0, 6).toUpperCase();
    sheet.appendRow([productId, name, data.category || '', price, 'Active', stock, threshold]);
    logAudit_(session.user, 'ADD_PRODUCT', name, 'เพิ่มสินค้าใหม่ ราคา ' + price + ' บาท สต็อกเริ่มต้น ' + (stock === '' ? 'ไม่ระบุ' : stock) + ' ชิ้น');
    return { success: true, message: 'เพิ่มสินค้าสำเร็จ!', productId: productId };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateProductData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(data.rowNumber);
    var price = parseFloat(data.price);
    if (isNaN(price) || price < 0) return { success: false, message: 'กรุณากรอกราคาสินค้าให้ถูกต้อง' };
    var stock = data.stock === '' || typeof data.stock === 'undefined' ? '' : parseInt(data.stock);
    if (stock !== '' && (isNaN(stock) || stock < 0)) return { success: false, message: 'กรุณากรอกจำนวนสต็อกให้ถูกต้อง' };
    var threshold = parseInt(data.lowStockThreshold);
    if (isNaN(threshold) || threshold < 0) threshold = 5;

    sheet.getRange(row, 2).setValue(data.name);
    sheet.getRange(row, 3).setValue(data.category || '');
    sheet.getRange(row, 4).setValue(price);
    sheet.getRange(row, 5).setValue(data.status || 'Active');
    sheet.getRange(row, 6).setValue(stock);
    sheet.getRange(row, 7).setValue(threshold);
    logAudit_(session.user, 'EDIT_PRODUCT', data.name, 'แก้ไขข้อมูลสินค้า');
    return { success: true, message: 'อัปเดตข้อมูลสินค้าสำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ➕➖ ปรับสต็อกด่วน (เติมของเข้า/ปรับยอดคลาดเคลื่อน) โดยไม่ต้องเปิดฟอร์มแก้ไขทั้งหมด
function adjustProductStock(rowNumber, delta, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    var currentStock = sheet.getRange(row, 6).getValue();
    currentStock = (currentStock === '' || currentStock === null) ? 0 : parseInt(currentStock);
    var newStock = Math.max(0, currentStock + parseInt(delta));
    sheet.getRange(row, 6).setValue(newStock);
    logAudit_(session.user, 'ADJUST_PRODUCT_STOCK', name, (delta > 0 ? 'เติมสต็อก +' : 'ปรับลดสต็อก ') + delta + ' ชิ้น (คงเหลือ ' + newStock + ' ชิ้น)');
    return { success: true, message: 'ปรับสต็อก "' + name + '" เป็น ' + newStock + ' ชิ้นแล้ว', newStock: newStock };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 📋 รายการสินค้าที่ใกล้หมด (สำหรับ Widget แจ้งเตือนในหน้า Dashboard)
function getLowStockProducts(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureProductSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || 'Active') !== 'Active') continue;
      var stock = rows[i][5];
      if (stock === '' || stock === null || typeof stock === 'undefined') continue; // ไม่ได้ติดตามสต็อกสินค้านี้
      var threshold = rows[i][6] || 5;
      if (stock <= threshold) {
        list.push({ rowNumber: i + 2, name: rows[i][1], stock: stock, threshold: threshold });
      }
    }
    list.sort(function (a, b) { return a.stock - b.stock; });
    return list;
  } catch (e) { return []; }
}

function deleteProductData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureProductSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_PRODUCT', name, 'ลบสินค้าออกจากระบบ');
    return { success: true, message: 'ลบสินค้า "' + name + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 🎫 DAILY / WALK-IN CUSTOMER PAYMENT (ลูกค้าจ่ายรายวัน / ซื้อของหน้ายิม - รวมบิลเดียวกันได้)
// ==========================================
function ensureDailySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DailyPayments');
  if (!sheet) {
    sheet = ss.insertSheet('DailyPayments');
    sheet.appendRow(["Timestamp", "Customer Name", "Phone", "Amount", "Receipt No", "Items JSON", "Refund Status", "Refund Reason", "Refunded By", "Refunded At", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 11)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Items JSON");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("Refund Status");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Refund Reason");
  if (!headerRow[8]) sheet.getRange(1, 9).setValue("Refunded By");
  if (!headerRow[9]) sheet.getRange(1, 10).setValue("Refunded At");
  if (!headerRow[10]) sheet.getRange(1, 11).setValue("Payment Method");
  return sheet;
}

// ==========================================
// 💸 รายจ่าย (แอดมินกรอกเองว่าแต่ละวันซื้ออะไรไปบ้าง - หักลบกับรายรับอัตโนมัติในรายงานสรุป)
// ==========================================
function ensureExpenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Expenses');
    sheet.appendRow(["Timestamp", "Date", "Description", "Amount", "Added By", "Payment Method"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์วิธีจ่าย ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 6)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Payment Method");
  return sheet;
}

function expensePaymentMethod_(rawValue) {
  var v = (rawValue || '').toString().trim();
  if (!v) return 'โอนเงิน';
  return v === 'โอนเงิน' ? 'โอนเงิน' : 'เงินสด';
}

// ==========================================
// ✏️ ปรับยอดรายวันเอง (แก้ตรงในหน้ารายงานสรุปได้เลย - ใช้แทนที่ยอดที่ระบบคำนวณอัตโนมัติของวันนั้นทั้งแถว)
// ==========================================
function ensureCashTransferOverrideSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DailyPaymentOverrides');
  if (!sheet) {
    sheet = ss.insertSheet('DailyPaymentOverrides');
    sheet.appendRow(["Date", "Cash", "Transfer", "Updated By", "Updated At", "Membership", "DayPass", "Products"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 8)).getValues()[0];
  if (!headerRow[5]) sheet.getRange(1, 6).setValue("Membership");
  if (!headerRow[6]) sheet.getRange(1, 7).setValue("DayPass");
  if (!headerRow[7]) sheet.getRange(1, 8).setValue("Products");
  return sheet;
}

// บันทึก/แก้ไขยอดของวันที่ระบุทั้งแถว (สมาชิก/รายวัน/สินค้า/เงินสด/เงินโอน) - เขียนทับค่าที่ระบบคำนวณอัตโนมัติสำหรับวันนั้นในรายงาน
function setDailyRevenueOverride(dateStr, membership, dayPass, products, cash, transfer, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var mVal = parseFloat(membership), dVal = parseFloat(dayPass), pVal = parseFloat(products);
    var cashVal = parseFloat(cash), transferVal = parseFloat(transfer);
    if (!dateStr) return { success: false, message: 'ไม่พบวันที่' };
    var vals = [mVal, dVal, pVal, cashVal, transferVal];
    for (var v = 0; v < vals.length; v++) {
      if (isNaN(vals[v]) || vals[v] < 0) return { success: false, message: 'กรุณากรอกตัวเลขให้ถูกต้องทุกช่อง (ต้องไม่ติดลบ)' };
    }

    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    var foundRow = -1;
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][0] || '').toString();
        if (rDate === dateStr) { foundRow = i + 2; break; }
      }
    }

    var now = new Date();
    if (foundRow > -1) {
      sheet.getRange(foundRow, 2, 1, 7).setValues([[cashVal, transferVal, session.user, now, mVal, dVal, pVal]]);
    } else {
      sheet.appendRow([dateStr, cashVal, transferVal, session.user, now, mVal, dVal, pVal]);
    }

    logAudit_(session.user, 'EDIT_REVENUE_REPORT', dateStr, 'แก้ไขยอดวันที่ ' + dateStr + ' เป็นสมาชิก ' + mVal + ', รายวัน ' + dVal + ', สินค้า ' + pVal + ', เงินสด ' + cashVal + ', โอน ' + transferVal);
    return { success: true, message: '🟢 บันทึกยอดวันที่ ' + dateStr + ' สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ยกเลิกการแก้ไขเอง กลับไปใช้ยอดที่ระบบคำนวณอัตโนมัติจากรายการจริงตามปกติ
function clearDailyRevenueOverride(dateStr, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][0] || '').toString();
        if (rDate === dateStr) {
          sheet.deleteRow(i + 2);
          logAudit_(session.user, 'CLEAR_REVENUE_OVERRIDE', dateStr, 'ยกเลิกการแก้ไขยอดเอง กลับไปใช้ค่าคำนวณอัตโนมัติของวันที่ ' + dateStr);
          return { success: true, message: '🟢 รีเซ็ตกลับเป็นยอดที่คำนวณอัตโนมัติแล้ว' };
        }
      }
    }
    return { success: true, message: 'วันนี้ไม่มีการแก้ไขเองอยู่แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔓 ปลดล็อกยอดที่แอดมินเคยแก้เองของวันนั้น เมื่อมีเงินเข้า/ออกจริงเกิดขึ้นใหม่
// ถ้าไม่ปลดล็อก บิลใหม่จะถูกยอดที่พิมพ์ค้างไว้บังทั้งวัน ทำให้รายงานไม่ขยับตามที่บันทึกจริง
function clearRevenueOverrideForDate_(dateStr, user, note) {
  try {
    if (!dateStr) return false;
    var sheet = ensureCashTransferOverrideSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;
    var tz = Session.getScriptTimeZone();
    var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rDate = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], tz, "yyyy-MM-dd") : (rows[i][0] || '').toString();
      if (rDate !== dateStr) continue;
      sheet.deleteRow(i + 2);
      logAudit_(user || 'system', 'AUTO_CLEAR_REVENUE_OVERRIDE', dateStr, 'ยกเลิกยอดที่แก้เองของวันที่ ' + dateStr + ' อัตโนมัติ เพราะมีรายการใหม่: ' + (note || '-'));
      return true;
    }
    return false;
  } catch (e) { return false; } // ห้ามให้การปลดล็อกที่ล้มเหลว ไปทำให้การรับเงิน/คืนเงินพังตามไปด้วย
}

// แปลงค่าวันที่จากชีท (Date หรือข้อความ) เป็น yyyy-MM-dd เพื่อใช้จับคู่กับชีท DailyPaymentOverrides
function toOverrideDateKey_(value) {
  if (!value) return '';
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function addExpense(dateStr, description, amount, token, paymentMethod) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var desc = (description || '').toString().trim();
    var amt = parseFloat(amount);
    if (!desc) return { success: false, message: 'กรุณากรอกรายการที่ซื้อ' };
    if (isNaN(amt) || amt <= 0) return { success: false, message: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' };
    if (!dateStr) return { success: false, message: 'กรุณาเลือกวันที่' };

    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensureExpenseSheet_();
    sheet.appendRow([new Date(), dateStr, desc, amt, session.user, method]);
    clearRevenueOverrideForDate_(dateStr, session.user, 'บันทึกรายจ่าย ' + desc);
    logAudit_(session.user, 'ADD_EXPENSE', desc, 'บันทึกรายจ่ายวันที่ ' + dateStr + ' จำนวน ' + amt.toLocaleString('th-TH') + ' บาท (' + method + ')');
    return { success: true, message: '🟢 บันทึกรายจ่ายสำเร็จแล้ว! (' + method + ')' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getExpenseList(token, startDateStr, endDateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureExpenseSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var numCols = Math.max(sheet.getLastColumn(), 6);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var dateStr = rows[i][1] instanceof Date ? Utilities.formatDate(rows[i][1], Session.getScriptTimeZone(), "yyyy-MM-dd") : (rows[i][1] || '').toString();
      if (startDateStr && dateStr < startDateStr) continue;
      if (endDateStr && dateStr > endDateStr) continue;
      list.push({
        rowNumber: i + 2,
        date: dateStr,
        description: rows[i][2],
        amount: rows[i][3] || 0,
        addedBy: rows[i][4] || '',
        paymentMethod: expensePaymentMethod_(rows[i][5])
      });
    }
    list.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return list;
  } catch (e) { return []; }
}

function deleteExpense(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureExpenseSheet_();
    var row = parseInt(rowNumber);
    var desc = sheet.getRange(row, 3).getValue();
    var expenseDate = toOverrideDateKey_(sheet.getRange(row, 2).getValue());
    sheet.deleteRow(row);
    clearRevenueOverrideForDate_(expenseDate, session.user, 'ลบรายจ่าย ' + desc);
    logAudit_(session.user, 'DELETE_EXPENSE', desc, 'ลบรายการรายจ่ายออกจากระบบ');
    return { success: true, message: 'ลบรายการ "' + desc + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// data.items: [{ name, price, qty }, ...] เช่น รายการสินค้าที่ซื้อ (น้ำ, เวย์, ขนม)
// data.includeDayPass: true/false, data.dayPassPrice: ราคาค่าเข้าวันนี้ (ถ้าเลือกรวม)
// ระบบจะรวมยอดค่าเข้ายิมรายวัน + ค่าสินค้าทั้งหมด เป็นบิลเดียวกันโดยอัตโนมัติ
function processDailyPayment(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var name = (data.customerName || '').toString().trim();
    if (!name) return { success: false, message: 'กรุณากรอกชื่อลูกค้า' };

    var items = [];
    var dayPassSubtotal = 0;
    var dayPassItems = data.dayPassItems || []; // [{ type: 'student'|'adult', qty, price }, ...] - รองรับเลือกได้พร้อมกันหลายประเภท/หลายคน
    if (dayPassItems.length > 0) {
      var prices = getDailyPassPrices(token);
      dayPassItems.forEach(function (dp) {
        var qty = parseInt(dp.qty) || 0;
        if (qty <= 0) return;
        var priceVal = parseFloat(dp.price);
        if (isNaN(priceVal) || priceVal < 0) {
          priceVal = (dp.type === 'student') ? prices.student : prices.adult;
        }
        var label = (dp.type === 'student') ? 'นักเรียน/นักศึกษา' : 'ผู้ใหญ่';
        items.push({ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (' + label + ')', price: priceVal, qty: qty });
        dayPassSubtotal += priceVal * qty;
      });
    }
    var productSubtotal = 0;
    if (data.items && data.items.length > 0) {
      data.items.forEach(function (it) {
        var p = parseFloat(it.price) || 0;
        var q = parseInt(it.qty) || 1;
        if (p > 0 && q > 0) { items.push({ name: it.name, price: p, qty: q }); productSubtotal += p * q; }
      });
    }

    // 🥋 ค่าเทรนเนอร์ฟรีแลนซ์ - เก็บเงินแทนให้ในบิลเดียวกัน แต่ไม่ใช่รายรับของยิม (แยกออกจากรายงานรายรับเสมอ)
    // ทำก่อนเช็ค items ว่าง เพราะอนุญาตให้เก็บแค่ค่าเทรนเนอร์อย่างเดียวได้ (ไม่บังคับต้องมีค่าเข้ายิม/สินค้าด้วย)
    var trainerFeeSubtotal = 0;
    var trainerFees = data.trainerFees || []; // [{ name, amount }, ...]
    trainerFees.forEach(function (tf) {
      var tfName = (tf.name || '').toString().trim();
      var tfAmount = parseFloat(tf.amount) || 0;
      if (tfName && tfAmount > 0) {
        items.push({ name: 'ค่าเทรนเนอร์: ' + tfName, price: tfAmount, qty: 1 });
        trainerFeeSubtotal += tfAmount;
      }
    });

    if (items.length === 0) return { success: false, message: 'กรุณาเลือกอย่างน้อยค่าเข้ายิม สินค้า หรือค่าเทรนเนอร์อย่างใดอย่างหนึ่ง' };

    var totalAmount = Math.round((dayPassSubtotal + productSubtotal + trainerFeeSubtotal) * 100) / 100;
    if (totalAmount <= 0) return { success: false, message: 'ยอดชำระต้องมากกว่า 0 บาท' };

    // 🎟️ ส่วนลดคูปอง (ถ้ามี) - คิดจากค่าเข้ายิมเท่านั้น ไม่รวมสินค้า/เครื่องดื่ม
    var couponCode = (data.couponCode || '').toString().trim();
    var couponResult = null;
    if (couponCode) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      couponResult = validateCoupon_(couponCode, dayPassSubtotal, 'daily');
      if (!couponResult.valid) return { success: false, message: couponResult.message };
      items.push({ name: 'ส่วนลดคูปอง (' + couponResult.code + ')', price: -couponResult.discountAmount, qty: 1 });
      dayPassSubtotal = couponResult.finalAmount;
      totalAmount -= couponResult.discountAmount;
    }

    // 🏷️ ส่วนลดพิเศษแบบไม่ต้องมีโค้ด (แอดมิน/พนักงานปรับเองหน้าร้าน) - คิดจากค่าเข้ายิมเท่านั้น ไม่รวมสินค้า/เครื่องดื่ม เช่นกัน
    var manualDiscountType = (data.manualDiscountType || '').toString().trim();
    var manualDiscountValue = parseFloat(data.manualDiscountValue) || 0;
    if (manualDiscountType && manualDiscountValue > 0) {
      if (dayPassSubtotal <= 0) return { success: false, message: '❌ ไม่มีค่าเข้ายิมในบิลนี้ ใช้ส่วนลดไม่ได้ (ส่วนลดใช้ได้กับค่าเข้ายิมเท่านั้น ไม่รวมสินค้า)' };
      var manualDiscountAmount = manualDiscountType === 'Fixed' ? manualDiscountValue : Math.round(dayPassSubtotal * (manualDiscountValue / 100) * 100) / 100;
      if (manualDiscountAmount > dayPassSubtotal) manualDiscountAmount = dayPassSubtotal;
      var manualDiscountLabel = manualDiscountType === 'Fixed' ? manualDiscountValue.toLocaleString('th-TH') + ' บาท' : manualDiscountValue + '%';
      items.push({ name: 'ส่วนลดพิเศษ (' + manualDiscountLabel + ')', price: -manualDiscountAmount, qty: 1 });
      dayPassSubtotal = Math.round((dayPassSubtotal - manualDiscountAmount) * 100) / 100;
      totalAmount = Math.round((totalAmount - manualDiscountAmount) * 100) / 100;
    }

    // 📦 ตรวจสอบสต็อกสินค้าก่อนขาย (เฉพาะสินค้าที่มีการติดตามสต็อก - เว้นค่าเข้ายิมรายวัน)
    var productSheet = ensureProductSheet_();
    var pLastRow = productSheet.getLastRow();
    var productRows = pLastRow > 1 ? productSheet.getRange(2, 1, pLastRow - 1, 7).getValues() : [];
    var stockDeductions = [];

    for (var idx = 0; idx < items.length; idx++) {
      var item = items[idx];
      if (isDayPassItemName_(item.name)) continue;
      for (var pr = 0; pr < productRows.length; pr++) {
        if (productRows[pr][1] === item.name) {
          var stockVal = productRows[pr][5];
          if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') break; // ไม่ได้ติดตามสต็อกสินค้านี้
          if (stockVal < item.qty) {
            return { success: false, message: '❌ สินค้า "' + item.name + '" เหลือไม่พอ (คงเหลือ ' + stockVal + ' ชิ้น)' };
          }
          stockDeductions.push({ row: pr + 2, newStock: stockVal - item.qty });
          break;
        }
      }
    }

    var sheet = ensureDailySheet_();
    var receiptNo = getNextReceiptNumber_();
    var phone = (data.phone || '').toString().trim();

    var paymentMethod = (data.paymentMethod === 'transfer') ? 'โอนเงิน' : 'เงินสด';
    var billDate = new Date();
    sheet.appendRow([billDate, name, "'" + phone, totalAmount, receiptNo, JSON.stringify(items), '', '', '', '', paymentMethod]);
    if (couponResult) applyCouponUsage_(couponResult.rowNumber);
    clearRevenueOverrideForDate_(toOverrideDateKey_(billDate), session.user, 'รับชำระเงินรายวัน ใบเสร็จ ' + receiptNo);

    // ตัดสต็อกสินค้าหลังบันทึกการขายสำเร็จ
    stockDeductions.forEach(function (d) {
      productSheet.getRange(d.row, 6).setValue(d.newStock);
    });

    var itemSummary = items.map(function (it) { return it.name + (it.qty > 1 ? ' x' + it.qty : ''); }).join(', ');
    logAudit_(session.user, 'DAILY_PAYMENT', name, 'รับชำระ ' + totalAmount + ' บาท (' + itemSummary + ') ใบเสร็จ: ' + receiptNo);
    return { success: true, message: "🟢 รับชำระเงินสำเร็จ! ยอดรวม " + totalAmount.toLocaleString('th-TH') + " บาท เลขที่ใบเสร็จ: " + receiptNo, receiptNo: receiptNo, totalAmount: totalAmount };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getDailyPaymentLogs(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var maxDisplay = 20;
    var startRow = Math.max(2, lastRow - maxDisplay + 1);
    var numRows = lastRow - startRow + 1;
    var rows = sheet.getRange(startRow, 1, numRows, 10).getValues();
    var tz = Session.getScriptTimeZone();
    var logs = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var ts = rows[i][0];
      var tsStr = ts instanceof Date ? Utilities.formatDate(ts, tz, "yyyy-MM-dd HH:mm:ss") : ts.toString();
      var items = [];
      try { items = rows[i][5] ? JSON.parse(rows[i][5]) : []; } catch (e2) { items = []; }
      logs.push({
        timestamp: tsStr,
        customerName: rows[i][1],
        phone: rows[i][2] ? rows[i][2].toString() : "",
        amount: rows[i][3] || 0,
        receiptNo: rows[i][4] ? rows[i][4].toString() : "",
        items: items,
        itemSummary: items.map(function (it) { return it.name + (it.qty > 1 ? ' x' + it.qty : ''); }).join(', '),
        refundStatus: rows[i][6] || '',
        refundReason: rows[i][7] || '',
        paymentMethod: rows[i][10] || 'เงินสด'
      });
    }
    return logs;
  } catch (e) { return []; }
}

// ✏️ แก้ไขวิธีชำระเงิน (เงินสด/โอนเงิน) ของรายการลูกค้ารายวัน/ขายสินค้าที่ผ่านมาแล้ว - ใช้แก้ข้อมูลที่กรอกผิด/ไม่มีข้อมูลเดิม
function updateDailyPaymentMethod(receiptNo, paymentMethod, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var method = (paymentMethod === 'transfer' || paymentMethod === 'โอนเงิน') ? 'โอนเงิน' : 'เงินสด';
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบข้อมูล' };
    var numCols = Math.max(sheet.getLastColumn(), 11);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo.toString()) {
        sheet.getRange(i + 2, 11).setValue(method);
        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'แก้วิธีชำระเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'EDIT_PAYMENT_METHOD', rows[i][1], 'แก้ไขวิธีชำระเงินใบเสร็จ ' + receiptNo + ' เป็น ' + method);
        return { success: true, message: '🟢 แก้ไขวิธีชำระเงินเป็น "' + method + '" แล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 💸 ยกเลิก/คืนเงินใบเสร็จลูกค้ารายวัน / ขายสินค้า
function voidDailyPayment(token, receiptNo, reason) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) {
        if ((rows[i][6] || '') === 'Refunded') {
          return { success: false, message: 'ใบเสร็จนี้ถูกยกเลิก/คืนเงินไปแล้ว' };
        }
        var row = i + 2;
        sheet.getRange(row, 7).setValue('Refunded');
        sheet.getRange(row, 8).setValue(reason || '');
        sheet.getRange(row, 9).setValue(session.user);
        sheet.getRange(row, 10).setValue(new Date());

        // 📦 คืนสต็อกสินค้าที่เคยตัดไปตอนขาย (เฉพาะสินค้าที่มีการติดตามสต็อก)
        try {
          var refundedItems = rows[i][5] ? JSON.parse(rows[i][5]) : [];
          if (refundedItems.length > 0) {
            var productSheet = ensureProductSheet_();
            var pLastRow = productSheet.getLastRow();
            if (pLastRow > 1) {
              var productRows = productSheet.getRange(2, 1, pLastRow - 1, 7).getValues();
              refundedItems.forEach(function (it) {
                if (isDayPassItemName_(it.name)) return;
                for (var pr = 0; pr < productRows.length; pr++) {
                  if (productRows[pr][1] === it.name) {
                    var stockVal = productRows[pr][5];
                    if (stockVal === '' || stockVal === null || typeof stockVal === 'undefined') break;
                    productSheet.getRange(pr + 2, 6).setValue(stockVal + (it.qty || 1));
                    break;
                  }
                }
              });
            }
          }
        } catch (e3) { /* ไม่ต้องหยุดการคืนเงินถ้าคืนสต็อกไม่สำเร็จ */ }

        clearRevenueOverrideForDate_(toOverrideDateKey_(rows[i][0]), session.user, 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'VOID_DAILY_PAYMENT', rows[i][1], 'ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' ยอด ' + rows[i][3] + ' บาท เหตุผล: ' + (reason || '-'));
        return { success: true, message: '🟢 ยกเลิก/คืนเงินใบเสร็จ ' + receiptNo + ' เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteDailyPaymentLog(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบรายการนี้' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) {
        var custName = rows[i][1];
        var deletedBillDate = toOverrideDateKey_(rows[i][0]);
        sheet.deleteRow(i + 2);
        clearRevenueOverrideForDate_(deletedBillDate, session.user, 'ลบบิลรายวัน ใบเสร็จ ' + receiptNo);
        logAudit_(session.user, 'DELETE_DAILY_PAYMENT', custName, 'ลบรายการชำระเงินรายวัน ใบเสร็จ: ' + receiptNo);
        return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🧾 ใบเสร็จลูกค้ารายวัน / ขายสินค้า (แสดงรายการทั้งหมดที่ซื้อรวมในบิลเดียว)
// 🧾 สร้าง HTML ใบเสร็จสไตล์เครื่องพิมพ์ความร้อน 80mm (แนวตั้ง คล้ายใบเสร็จร้านสะดวกซื้อ/คาเฟ่)
// ใช้ร่วมกันทั้งใบเสร็จสมาชิกและใบเสร็จลูกค้ารายวัน
function buildThermalReceiptHtml_(opts) {
  var itemsHtml = opts.items.map(function (it) {
    return '<div class="item">' +
      '<div class="item-name">' + it.name + '</div>' +
      '<div class="item-line"><span>' + it.qty + ' x ' + it.unitPrice + '</span><span>' + it.lineTotal + '</span></div>' +
      '</div>';
  }).join('');

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
    '<div class="gymname">' + GYM_INFO.name + '</div>' +
    '<div class="meta">' + GYM_INFO.address + '<br>เลขผู้เสียภาษี: ' + GYM_INFO.taxId + '<br>โทร: ' + GYM_INFO.phone + '</div>' +
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

function generateDailyReceiptPDF(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureDailySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][4] || '').toString() === receiptNo) { target = rows[i]; break; }
    }
    if (!target) return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };

    var tz = Session.getScriptTimeZone();
    var payDate = target[0] instanceof Date ? target[0] : new Date(target[0]);
    var payDateStr = Utilities.formatDate(payDate, tz, "dd/MM/yyyy");
    var payTimeStr = Utilities.formatDate(payDate, tz, "HH:mm");
    var custName = target[1];
    var custPhone = target[2] ? target[2].toString() : '';
    var amount = target[3] || 0;
    var amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var paymentMethod = target[10] || '';

    var items = [];
    try { items = target[5] ? JSON.parse(target[5]) : []; } catch (e2) { items = []; }
    if (items.length === 0) {
      items = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', price: amount, qty: 1 }]; // รองรับข้อมูลเก่าก่อนอัปเดตระบบ
    }

    var itemsForTemplate = items.map(function (it) {
      return {
        name: it.name,
        qty: it.qty,
        unitPrice: Number(it.price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        lineTotal: Number(it.price * it.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      };
    });

    var html = buildThermalReceiptHtml_({
      receiptNo: receiptNo,
      dateStr: payDateStr,
      timeStr: payTimeStr,
      custName: custName,
      custPhone: custPhone,
      items: itemsForTemplate,
      totalText: amountText,
      cashierName: session.user,
      paymentMethod: paymentMethod
    });

    var pdfBlob = Utilities.newBlob(html, 'text/html', receiptNo + '.html').getAs('application/pdf').setName('Receipt_' + receiptNo + '.pdf');

    logAudit_(session.user, 'PRINT_DAILY_RECEIPT', custName, 'พิมพ์ใบเสร็จรายวันเลขที่ ' + receiptNo);
    return { success: true, html: html, pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()), filename: 'Receipt_' + receiptNo + '.pdf' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

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

// ==========================================
// 📊 รายงานรายรับแบบละเอียด แยกตามช่องทาง (สมาชิกรายเดือน / ค่าเข้ารายวัน / ขายสินค้า)
// ==========================================

// ตรวจว่ารายการนี้เป็น "ค่าเข้ายิมรายวัน" หรือ "สินค้า" จากชื่อรายการ
function isDayPassItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเข้าใช้บริการฟิตเนสรายวัน') !== -1;
}

// ตรวจว่ารายการนี้เป็น "สมัครสมาชิกรายเดือน" ที่ถูกรวมเข้ามาในบิลลูกค้ารายวัน (แพ็กเกจเสริม)
function isMembershipItemName_(itemName) {
  return (itemName || '').toString().indexOf('สมัครสมาชิกรายเดือน') !== -1;
}

// ตรวจว่ารายการนี้เป็น "ค่าเทรนเนอร์ฟรีแลนซ์" ที่เก็บแทนให้เฉยๆ ไม่ใช่รายรับของยิม
function isTrainerFeeItemName_(itemName) {
  return (itemName || '').toString().indexOf('ค่าเทรนเนอร์:') !== -1;
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
      var eNumCols = Math.max(expenseSheet.getLastColumn(), 6);
      var eRows = expenseSheet.getRange(2, 1, eLastRow - 1, eNumCols).getValues();
      for (var k = 0; k < eRows.length; k++) {
        var eDateRaw = eRows[k][1];
        var eKey = eDateRaw instanceof Date ? Utilities.formatDate(eDateRaw, tz, "yyyy-MM-dd") : (eDateRaw || '').toString();
        if (eKey < startDateStr || eKey > endDateStr) continue;
        var eAmount = eRows[k][3] || 0;
        totalExpenses += eAmount;
        if (dailyBuckets[eKey]) dailyBuckets[eKey].expenses += eAmount;

        // 💸 หักรายจ่ายออกจากช่องทางที่จ่ายจริง เพื่อให้ เงินสด + เงินโอน = เงินที่เหลืออยู่จริง (= กำไรสุทธิ)
        if (expensePaymentMethod_(eRows[k][5]) === 'โอนเงิน') {
          totalTransfer -= eAmount;
          if (dailyBuckets[eKey]) dailyBuckets[eKey].transfer -= eAmount;
        } else {
          totalCash -= eAmount;
          if (dailyBuckets[eKey]) dailyBuckets[eKey].cash -= eAmount;
        }
      }
    }

    // 4) ยอดที่แอดมินแก้ไขเองในรายงาน (ถ้ามี) - ใช้แทนที่ยอดที่คำนวณอัตโนมัติของวันนั้นๆ ทั้งแถว (สมาชิก/รายวัน/สินค้า/เงินสด/เงินโอน)
    var overriddenDays = []; // ⚠️ วันที่ยอดไม่ได้มาจากบิลจริง - ส่งไปเตือนบนหน้ารายงาน
    var overrideSheet = ensureCashTransferOverrideSheet_();
    var oLastRow = overrideSheet.getLastRow();
    if (oLastRow > 1) {
      var oNumCols = Math.max(overrideSheet.getLastColumn(), 8);
      var oRows = overrideSheet.getRange(2, 1, oLastRow - 1, oNumCols).getValues();
      for (var m = 0; m < oRows.length; m++) {
        var oKey = oRows[m][0] instanceof Date ? Utilities.formatDate(oRows[m][0], tz, "yyyy-MM-dd") : (oRows[m][0] || '').toString();
        if (oKey < startDateStr || oKey > endDateStr) continue;
        if (!dailyBuckets[oKey]) continue;

        // เก็บยอดจริงที่คำนวณจากบิลไว้ก่อน เพื่อเอาไปเทียบให้แอดมินเห็นว่ายอดที่พิมพ์เองต่างจากของจริงเท่าไร
        var autoMembership = dailyBuckets[oKey].membership;
        var autoDayPass = dailyBuckets[oKey].dayPass;
        var autoProducts = dailyBuckets[oKey].products;
        var autoCash = dailyBuckets[oKey].cash;
        var autoTransfer = dailyBuckets[oKey].transfer;

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

        overriddenDays.push({
          date: oKey,
          autoTotal: autoMembership + autoDayPass + autoProducts,
          autoCash: autoCash,
          autoTransfer: autoTransfer,
          shownTotal: dailyBuckets[oKey].membership + dailyBuckets[oKey].dayPass + dailyBuckets[oKey].products,
          shownCash: dailyBuckets[oKey].cash,
          shownTransfer: dailyBuckets[oKey].transfer,
          updatedBy: (oRows[m][3] || '').toString(),
          updatedAt: oRows[m][4] instanceof Date ? Utilities.formatDate(oRows[m][4], tz, "yyyy-MM-dd HH:mm") : ''
        });
      }
    }
    overriddenDays.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

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
        transfer: totalTransfer,
        hasOverrides: overriddenDays.length > 0
      },
      breakdown: breakdown,
      overriddenDays: overriddenDays,
      topProducts: topProducts,
      trainerFees: {
        total: totalTrainerFees,
        breakdown: trainerFeeBreakdown
      }
    };
  } catch (e) { throw new Error(e.toString()); }
}

function exportRevenueReportPDF(token, startDateStr, endDateStr) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var report = getRevenueReport(token, startDateStr, endDateStr);
  var headers = ["วันที่", "รายรับสมาชิกรายเดือน", "รายรับค่าเข้ารายวัน", "รายรับขายสินค้า", "รวม (บาท)"];
  var rows = report.breakdown.map(function (d) {
    var dayTotal = d.membership + d.dayPass + d.products;
    return [d.date, d.membership, d.dayPass, d.products, dayTotal];
  });
  rows.push(["รวมทั้งหมด", report.totals.membership, report.totals.dayPass, report.totals.products, report.totals.grandTotal]);
  return generatePDFReport("รายงานรายรับแยกช่องทาง (" + startDateStr + " ถึง " + endDateStr + ")", headers, rows, "Revenue_Report_" + startDateStr + "_to_" + endDateStr);
}

// ==========================================
// 📄 REPORTS GENERATOR (PDF)
// ==========================================
function generatePDFReport(title, headers, dataRows, filename) {
  try {
    var html = '<!DOCTYPE html><html><head><style>' +
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
      '<p class="subtitle">' + title + ' (พิมพ์เมื่อ: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss") + ')</p>' +
      '<table><thead><tr>';
      
    headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    
    dataRows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(cell) { html += '<td>' + (cell !== undefined && cell !== null ? cell : '-') + '</td>'; });
      html += '</tr>';
    });
    
    html += '</tbody></table>' +
      '<div class="footer">เอกสารรายงานอัตโนมัติจากระบบ Industrial Muscle Management</div>' +
      '</body></html>';

    var blob = Utilities.newBlob(html, 'text/html', filename + '.html').getAs('application/pdf').setName(filename + '.pdf');
    return { success: true, base64: Utilities.base64Encode(blob.getBytes()), filename: filename + '.pdf' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function exportMembersPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var list = getMemberList(token);
  var headers = ["ลำดับ", "ชื่อ-นามสกุล", "เบอร์โทร", "แพ็กเกจ", "หมดอายุ", "สถานะ", "เข้ายิม (ครั้ง)"];
  var rows = list.map(function(m, idx) {
    return [idx + 1, m.fullName, m.phone, m.package, m.expiryDate, m.status, m.checkInCount];
  });
  return generatePDFReport("รายงานรายชื่อสมาชิกทั้งหมด", headers, rows, "Members_Report");
}

function exportPaymentsPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var logs = getPaymentLogs(token);
  var headers = ["วันเวลาทำรายการ", "ชื่อสมาชิก", "แพ็กเกจ", "รหัสสลิป QR", "วันหมดอายุใหม่", "เลขที่ใบเสร็จ", "ยอดเงิน (บาท)", "สถานะ"];
  var rows = logs.map(function(p) {
    return [p.timestamp, p.memberName, p.package, p.qrData, p.newExpiry, p.receiptNo, p.amount, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ'];
  });
  return generatePDFReport("รายงานประวัติการชำระเงิน", headers, rows, "Payments_Report");
}

function exportDailyPaymentsPDF(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ' };
  var logs = getDailyPaymentLogs(token);
  var headers = ["วันเวลาทำรายการ", "ชื่อลูกค้า", "เบอร์โทร", "รายการ", "จำนวนเงิน (บาท)", "เลขที่ใบเสร็จ", "สถานะ"];
  var rows = logs.map(function(p) {
    return [p.timestamp, p.customerName, p.phone, p.itemSummary || '-', p.amount, p.receiptNo, p.refundStatus === 'Refunded' ? 'คืนเงินแล้ว' : 'ปกติ'];
  });
  return generatePDFReport("รายงานลูกค้ารายวัน / ขายสินค้าหน้ายิม", headers, rows, "DailyPayments_Report");
}

// ==========================================
// 🧾 TAX RECEIPT GENERATOR (ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ) — สมาชิกรายเดือน
// ==========================================
function generateReceiptPDF(receiptNo, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Payments');
    if (!sheet) return { success: false, message: 'ไม่พบข้อมูลการชำระเงิน' };

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบใบเสร็จนี้ในระบบ' };
    var numCols = Math.max(sheet.getLastColumn(), 7);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][5] || '').toString() === receiptNo) { target = rows[i]; break; }
    }
    if (!target) return { success: false, message: 'ไม่พบใบเสร็จเลขที่ ' + receiptNo + ' ในระบบ' };

    // ดึงเบอร์โทรของสมาชิกจากชีท Members มาแสดงในใบเสร็จ
    var memberSheet = ss.getSheetByName('Members');
    var memberPhone = '';
    if (memberSheet) {
      var mRows = memberSheet.getDataRange().getValues();
      for (var j = 1; j < mRows.length; j++) {
        if (mRows[j][1].toString() === target[1].toString()) {
          memberPhone = mRows[j][2] ? mRows[j][2].toString() : '';
          break;
        }
      }
    }

    var tz = Session.getScriptTimeZone();
    var payDate = target[0] instanceof Date ? target[0] : new Date(target[0]);
    var payDateStr = Utilities.formatDate(payDate, tz, "dd/MM/yyyy");
    var payTimeStr = Utilities.formatDate(payDate, tz, "HH:mm");
    var pkgName = target[2];
    var newExpiry = target[4];
    var amount = target[6] || ((getPackageMap_()[pkgName] || {}).price || 0);
    var amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var paymentMethod = target[11] || '';

    var html = buildThermalReceiptHtml_({
      receiptNo: receiptNo,
      dateStr: payDateStr,
      timeStr: payTimeStr,
      custName: target[1],
      custPhone: memberPhone,
      extraLine: ['หมดอายุใหม่', newExpiry],
      items: [{
        name: 'ค่าสมาชิก แพ็กเกจ ' + pkgName,
        qty: 1,
        unitPrice: amountText,
        lineTotal: amountText
      }],
      totalText: amountText,
      cashierName: session.user,
      paymentMethod: paymentMethod
    });

    var pdfBlob = Utilities.newBlob(html, 'text/html', receiptNo + '.html').getAs('application/pdf').setName('Receipt_' + receiptNo + '.pdf');

    logAudit_(session.user, 'PRINT_RECEIPT', target[1], 'พิมพ์ใบเสร็จเลขที่ ' + receiptNo);
    return { success: true, html: html, pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()), filename: 'Receipt_' + receiptNo + '.pdf' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 📊 DASHBOARD STATS (ใช้ในหน้า Admin Dashboard)
// ==========================================
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

// ==========================================
// 📺 CUSTOMER CHECK-IN DISPLAY (จอที่ 2 หน้าประตูทางเข้า)
// ==========================================
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

// 📋 รายชื่อสมาชิกที่ใกล้หมดอายุ (หรือหมดอายุไปแล้วแต่ยังตั้งสถานะ Active) - สำหรับ Widget แจ้งเตือนในหน้า Dashboard
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

// 🎂 รายชื่อสมาชิกที่เกิดในเดือนนี้ (สำหรับ Widget แจ้งเตือนในหน้า Dashboard ให้พนักงานติดต่อลูกค้าเชิญชวนต่ออายุ)
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

// ==========================================
// ⏱️ ระบบปิดสถานะสมาชิก "Inactive" อัตโนมัติ เมื่อหมดอายุเกิน X วัน (Time-driven Trigger)
// ==========================================
var DEFAULT_AUTO_INACTIVE_GRACE_DAYS = 3;
var AUTO_EXPIRE_HANDLER_FN_ = 'autoExpireMembers';

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

// ฟังก์ชันนี้ถูกเรียกโดย Time-driven Trigger เท่านั้น (ไม่ต้องใช้ token เพราะไม่ได้มาจากหน้าเว็บ)
// จะไล่เช็คสมาชิกที่สถานะ Active แต่หมดอายุเกินจำนวนวันผ่อนผันที่ตั้งไว้ แล้วเปลี่ยนเป็น Inactive ให้อัตโนมัติ
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

// ==========================================
// 🥺 ระบบดึงสมาชิกที่หายไปกลับมาอัตโนมัติ (Win-back Campaign)
// ==========================================
var WINBACK_HANDLER_FN_ = 'checkWinBackCampaign_';

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

// ฟังก์ชันนี้ถูกเรียกโดย Time-driven Trigger เท่านั้น (ไม่ต้องใช้ token)
// ไล่เช็คสมาชิกที่หมดอายุนานเกินเกณฑ์ที่ตั้งไว้ - สร้างคูปองเฉพาะคน + ส่งข้อความชวนกลับมาอัตโนมัติ (ส่งครั้งเดียวต่อคน)
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

// ==========================================
// 💬 แจ้งเตือนสมาชิกทาง LINE อัตโนมัติทุกวัน (ใกล้หมดอายุ / วันเกิด)
// ==========================================
var MEMBER_LINE_NOTIFY_HANDLER_FN_ = 'checkMemberNotificationsLine_';

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

// ฟังก์ชันนี้ถูกเรียกโดย Time-driven Trigger เท่านั้น (ไม่ต้องใช้ token)
// ไล่เช็คสมาชิกทุกคนที่เชื่อมต่อ LINE ไว้ - ถ้าใกล้หมดอายุหรือตรงเดือน/วันเกิด จะส่งแจ้งเตือนให้ (ส่งครั้งเดียวต่อรอบ ไม่สแปมซ้ำ)
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



// สำรองข้อมูลด้วยตนเอง (กดจากหน้า Settings)
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

// ==========================================
// ⚠️ ล้างข้อมูลการซื้อขายทั้งหมด (Payments + DailyPayments) - ใช้ได้ครั้งเดียวแล้วกู้คืนไม่ได้
// สำรองข้อมูลทั้งไฟล์ให้อัตโนมัติก่อนลบทุกครั้ง เป็นเซฟตี้เน็ตกันพลาด
// ==========================================
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

// ฟังก์ชันนี้ถูกเรียกโดย Time-driven Trigger เท่านั้น (ไม่ต้องใช้ token)
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


// ==========================================
// 🔌 FINGERPRINT SCANNER GATE POST METHOD (API ประตูหน้าร้าน)
// ==========================================
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

// ==========================================
// ⚡ แคชรหัสลายนิ้วมือ -> แถวในชีท (ทำให้สแกนนิ้วเร็วขึ้นมาก แทนที่จะไล่อ่านทั้งชีททุกครั้ง)
// ==========================================
var FINGERPRINT_CACHE_KEY_ = 'fingerprintRowMap';

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

// เรียกใช้ทุกครั้งที่ข้อมูลลายนิ้วมือของสมาชิกอาจเปลี่ยน (เพิ่ม/ลบสมาชิก, ลงทะเบียน/เปลี่ยนลายนิ้วมือใหม่)
// เพื่อไม่ให้แคชเก่าค้างจนสแกนแล้วขึ้นชื่อผิดคน
function invalidateFingerprintCache_() {
  try { CacheService.getScriptCache().remove(FINGERPRINT_CACHE_KEY_); } catch (e) { /* ไม่ให้กระทบการทำงานหลัก */ }
}

// ==========================================
// 🖐️ ลงทะเบียนลายนิ้วมือจากหน้าเว็บ (แอดมินกดในเว็บ → โปรแกรมตัวกลางที่รันเงียบๆ อยู่แล้วรับงานอัตโนมัติ)
// ==========================================

// แอดมินกดปุ่ม "ลงทะเบียนลายนิ้วมือ" ในเว็บ - ตั้ง "คำขอที่รอดำเนินการ" ไว้ให้โปรแกรมตัวกลางมาเจอ
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

// แอดมินกดยกเลิกคำขอที่ค้างอยู่ (เผื่อกดผิดหรือเปลี่ยนใจ)
function cancelFingerprintEnrollmentRequest(token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  PropertiesService.getScriptProperties().deleteProperty('pendingEnrollment');
  return { success: true, message: 'ยกเลิกคำขอลงทะเบียนแล้ว' };
}

// หน้าเว็บ poll ฟังก์ชันนี้ทุก 2 วินาทีเพื่อดูว่าลงทะเบียนเสร็จหรือยัง
function getEnrollmentStatus(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var raw = PropertiesService.getScriptProperties().getProperty('pendingEnrollment');
  if (!raw) return { pending: false, status: 'none' };
  var data = JSON.parse(raw);
  return { pending: true, status: data.status, rowNumber: data.rowNumber, memberName: data.memberName, fingerprintId: data.fingerprintId || null, errorMessage: data.errorMessage || null };
}

// 🔧 จัดการคำขอจากโปรแกรมตัวกลาง (เรียกจาก doPost เท่านั้น) - ทั้งเช็คงานค้างและแจ้งผลลงทะเบียนเสร็จ
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

  function testMailAuth() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "ทดสอบ", "ทดสอบสิทธิ์ส่งเมล");
}

// ==========================================
// 🧑‍🏫 TRAINER BOOKING SYSTEM (ระบบจองเทรนเนอร์)
// ==========================================

function ensureTrainerSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Trainers');
  if (!sheet) {
    sheet = ss.insertSheet('Trainers');
    sheet.appendRow(["Trainer ID", "Full Name", "Specialty", "Phone", "Working Days", "Start Hour", "End Hour", "Slot Minutes", "Status", "Photo URL", "Bio", "PIN Code", "PIN Hash", "Busy Status", "Busy Since", "Email", "LINE User ID", "LINE Link Code"]);
  }
  // เผื่อชีทเดิมที่สร้างไว้ก่อนหน้านี้ยังไม่มีคอลัมน์ใหม่ ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 18)).getValues()[0];
  if (!headerRow[9]) sheet.getRange(1, 10).setValue("Photo URL");
  if (!headerRow[10]) sheet.getRange(1, 11).setValue("Bio");
  if (!headerRow[11]) sheet.getRange(1, 12).setValue("PIN Code");
  if (!headerRow[12]) sheet.getRange(1, 13).setValue("PIN Hash");
  if (!headerRow[13]) sheet.getRange(1, 14).setValue("Busy Status");
  if (!headerRow[14]) sheet.getRange(1, 15).setValue("Busy Since");
  if (!headerRow[15]) sheet.getRange(1, 16).setValue("Email");
  if (!headerRow[16]) sheet.getRange(1, 17).setValue("LINE User ID");
  if (!headerRow[17]) sheet.getRange(1, 18).setValue("LINE Link Code");
  return sheet;
}

// 📧 แจ้งเตือนเทรนเนอร์ทางอีเมลเมื่อมีลูกค้าจองคิวใหม่ (ไม่ทำให้การจองล้มเหลวถ้าส่งอีเมลไม่สำเร็จ)
// 🧪 ฟังก์ชันทดสอบส่ง LINE โดยตรง (รันจาก Apps Script Editor เพื่อ debug)
// วิธีใช้: แก้เลข rowNumber ให้ตรงกับแถวของเทรนเนอร์ในชีท Trainers (ดูจากคอลัมน์ A ซ้ายสุดของ Google Sheet)
// แล้วเลือกฟังก์ชันนี้จาก dropdown ด้านบน Editor > กด Run > ดูผลที่ View > Logs (หรือ Executions)
function testSendLineMessageToTrainer() {
  var rowNumber = 2; // 👈 แก้เลขนี้ให้ตรงกับแถวของเทรนเนอร์ที่ต้องการทดสอบ
  var sheet = ensureTrainerSheet_();
  var data = sheet.getRange(rowNumber, 1, 1, 18).getValues()[0];
  var trainerName = data[1];
  var lineUserId = data[16];
  Logger.log('ทดสอบส่งหาเทรนเนอร์: ' + trainerName + ' | LINE User ID: ' + lineUserId);
  if (!lineUserId) {
    Logger.log('❌ เทรนเนอร์คนนี้ยังไม่มี LINE User ID บันทึกไว้ - ยังไม่ได้เชื่อมต่อ');
    return;
  }
  sendLineMessage_(lineUserId, '🧪 นี่คือข้อความทดสอบจากระบบ Industrial Muscle - ถ้าคุณได้รับข้อความนี้ แปลว่าระบบแจ้งเตือน LINE ทำงานถูกต้องแล้ว!');
  Logger.log('ส่งคำสั่งแล้ว - เช็คผลลัพธ์ด้านบน (สำเร็จ/ล้มเหลว) และเช็คมือถือเทรนเนอร์ว่าได้รับข้อความไหม');
}

function notifyTrainerNewBooking_(trainerId, memberName, memberPhone, dateStr, timeSlot) {
  try {
    var sheet = ensureTrainerSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var rows = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === trainerId) {
        var email = (rows[i][15] || '').toString().trim();
        var lineUserId = (rows[i][16] || '').toString().trim();
        var trainerName = rows[i][1];
        if (email) {
          MailApp.sendEmail({
            to: email,
            subject: '🔔 มีลูกค้าจองคิวใหม่ - ' + dateStr + ' ' + timeSlot,
            htmlBody:
              'สวัสดีคุณ ' + trainerName + ',<br><br>' +
              'มีลูกค้าจองคิวกับคุณเพิ่มเข้ามาใหม่ ดังนี้<br><br>' +
              '<b>ลูกค้า:</b> ' + memberName + '<br>' +
              '<b>เบอร์โทร:</b> ' + (memberPhone || '-') + '<br>' +
              '<b>วันที่:</b> ' + dateStr + '<br>' +
              '<b>เวลา:</b> ' + timeSlot + '<br><br>' +
              'เข้าแอปเทรนเนอร์เพื่อดูรายละเอียดหรือจัดการคิวนี้ได้เลย'
          });
        }
        if (lineUserId) {
          sendLineMessage_(lineUserId,
            '🔔 มีลูกค้าจองคิวใหม่!\n\n' +
            'ลูกค้า: ' + memberName + '\n' +
            'เบอร์โทร: ' + (memberPhone || '-') + '\n' +
            'วันที่: ' + dateStr + '\n' +
            'เวลา: ' + timeSlot);
        }
        break;
      }
    }
  } catch (e) { /* ไม่ให้ error ตรงนี้ทำให้การจองคิวหลักล้มเหลว */ }
}

// ==========================================
// 💬 LINE MESSAGING API (แจ้งเตือนคิวใหม่เข้า LINE เทรนเนอร์โดยตรง)
// ==========================================

// 🔧 อ่าน/บันทึกการตั้งค่า LINE OA (Channel Access Token + ลิงก์เพิ่มเพื่อน)
function getLineSettings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  var hasToken = !!props.getProperty('lineChannelAccessToken');
  return {
    hasToken: hasToken,
    addFriendUrl: props.getProperty('lineAddFriendUrl') || '',
    webhookUrl: ScriptApp.getService().getUrl()
  };
}

function updateLineSettings(channelAccessToken, addFriendUrl, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var props = PropertiesService.getScriptProperties();
    if (channelAccessToken && channelAccessToken.trim()) {
      props.setProperty('lineChannelAccessToken', channelAccessToken.trim());
    }
    props.setProperty('lineAddFriendUrl', (addFriendUrl || '').toString().trim());
    logAudit_(session.user, 'UPDATE_LINE_SETTINGS', 'System', 'อัปเดตการตั้งค่า LINE Official Account');
    return { success: true, message: '🟢 บันทึกการตั้งค่า LINE สำเร็จแล้ว!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 📤 ส่งข้อความ Push ไปหา LINE user คนหนึ่ง (ใช้ตอนแจ้งเตือนคิวใหม่)
function sendLineMessage_(userId, text) {
  try {
    var accessToken = PropertiesService.getScriptProperties().getProperty('lineChannelAccessToken');
    if (!accessToken) { Logger.log('sendLineMessage_: ไม่มี Channel Access Token บันทึกไว้ในระบบ'); return; }
    if (!userId) { Logger.log('sendLineMessage_: ไม่มี userId'); return; }
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('sendLineMessage_ ล้มเหลว! HTTP ' + code + ' - ' + res.getContentText());
    } else {
      Logger.log('sendLineMessage_ สำเร็จ ส่งถึง userId: ' + userId);
    }
  } catch (e) { Logger.log('sendLineMessage_ เกิด exception: ' + e.toString()); }
}

// 📥 ตอบกลับข้อความใน LINE (ใช้ replyToken จาก webhook event เดียวเท่านั้น ใช้ได้ครั้งเดียว)
function replyLineMessage_(replyToken, text) {
  try {
    var accessToken = PropertiesService.getScriptProperties().getProperty('lineChannelAccessToken');
    if (!accessToken) { Logger.log('replyLineMessage_: ไม่มี Channel Access Token บันทึกไว้ในระบบ'); return; }
    if (!replyToken) { Logger.log('replyLineMessage_: ไม่มี replyToken'); return; }
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('replyLineMessage_ ล้มเหลว! HTTP ' + code + ' - ' + res.getContentText());
    } else {
      Logger.log('replyLineMessage_ สำเร็จ');
    }
  } catch (e) { Logger.log('replyLineMessage_ เกิด exception: ' + e.toString()); }
}

// 🔑 สร้างรหัสเชื่อมต่อ LINE ให้เทรนเนอร์คนหนึ่ง (แอดมินกดสร้างแทนได้)
function generateTrainerLineLinkCode(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(rowNumber);
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    sheet.getRange(row, 18).setValue(code);
    return { success: true, code: code };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔑 เทรนเนอร์สร้างรหัสเชื่อมต่อ LINE ของตัวเอง (ทำเองในแอปได้เลย ไม่ต้องรอแอดมิน)
function generateMyLineLinkCode(token) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    sheet.getRange(session.rowNumber, 18).setValue(code);
    return { success: true, code: code };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// เทรนเนอร์ดึงลิงก์เพิ่มเพื่อน LINE OA มาแสดงตอนเชื่อมต่อบัญชี (ข้อมูลไม่อ่อนไหว แค่ต้องมี session ที่ถูกต้อง)
function getLineAddFriendUrlForTrainer(token) {
  var session = validateTrainerSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  return { addFriendUrl: props.getProperty('lineAddFriendUrl') || '' };
}

// ยกเลิกการเชื่อมต่อ LINE ของตัวเอง (เผื่ออยากเชื่อมบัญชีใหม่)
function unlinkMyLine(token) {
  var session = validateTrainerSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    sheet.getRange(session.rowNumber, 17).setValue('');
    sheet.getRange(session.rowNumber, 18).setValue('');
    return { success: true, message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 💬 LINE สำหรับสมาชิก (แจ้งเตือนใกล้หมดอายุ / วันเกิด / คูปองใหม่)
// ==========================================
function generateMyMemberLineLinkCode(token) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    sheet.getRange(session.rowNumber, 20).setValue(code);
    return { success: true, code: code };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getLineAddFriendUrlForMember(token) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  return { addFriendUrl: props.getProperty('lineAddFriendUrl') || '' };
}

function unlinkMyMemberLine(token) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    sheet.getRange(session.rowNumber, 19).setValue('');
    sheet.getRange(session.rowNumber, 20).setValue('');
    return { success: true, message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔧 จับคู่รหัสเชื่อมต่อกับ LINE userId ที่พิมพ์เข้ามา (เรียกจาก webhook เท่านั้น) - สำหรับสมาชิก
function tryLinkMemberLineAccount_(code, userId) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    if (!sheet) return { success: false };
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false };
    var rows = sheet.getRange(2, 1, lastRow - 1, 20).getValues();
    for (var i = 0; i < rows.length; i++) {
      var linkCode = (rows[i][19] || '').toString().trim();
      if (linkCode && linkCode === code.trim()) {
        sheet.getRange(i + 2, 19).setValue(userId);
        sheet.getRange(i + 2, 20).setValue('');
        logAudit_(rows[i][1], 'MEMBER_LINE_LINKED', rows[i][1], 'เชื่อมต่อบัญชี LINE สำเร็จผ่าน webhook');
        return { success: true, memberName: rows[i][1] };
      }
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}

// 🔧 จับคู่รหัสเชื่อมต่อกับ LINE userId ที่พิมพ์เข้ามา (เรียกจาก webhook เท่านั้น)
function tryLinkTrainerLineAccount_(code, userId) {
  try {
    var sheet = ensureTrainerSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false };
    var rows = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
    for (var i = 0; i < rows.length; i++) {
      var linkCode = (rows[i][17] || '').toString().trim();
      if (linkCode && linkCode === code.trim()) {
        sheet.getRange(i + 2, 17).setValue(userId);
        sheet.getRange(i + 2, 18).setValue('');
        logAudit_(rows[i][1], 'TRAINER_LINE_LINKED', rows[i][1], 'เชื่อมต่อบัญชี LINE สำเร็จผ่าน webhook');
        return { success: true, trainerName: rows[i][1] };
      }
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}

// 📩 จัดการ Webhook ที่ส่งมาจาก LINE (ข้อความ/follow event)
function handleLineWebhook_(payload) {
  try {
    (payload.events || []).forEach(function (event) {
      if (event.type === 'message' && event.message && event.message.type === 'text') {
        var userId = event.source ? event.source.userId : null;
        var text = (event.message.text || '').trim();
        if (userId && /^\d{6}$/.test(text)) {
          var trainerResult = tryLinkTrainerLineAccount_(text, userId);
          if (trainerResult.success) {
            replyLineMessage_(event.replyToken, '✅ เชื่อมต่อ LINE สำเร็จ! สวัสดีคุณ ' + trainerResult.trainerName + ' คุณจะได้รับแจ้งเตือนคิวใหม่ทาง LINE จากนี้ไปครับ');
            return;
          }
          var memberResult = tryLinkMemberLineAccount_(text, userId);
          if (memberResult.success) {
            replyLineMessage_(event.replyToken, '✅ เชื่อมต่อ LINE สำเร็จ! สวัสดีคุณ ' + memberResult.memberName + ' คุณจะได้รับแจ้งเตือนใกล้หมดอายุ โปรวันเกิด และคูปองใหม่ๆ ทาง LINE จากนี้ไปครับ');
            return;
          }
          replyLineMessage_(event.replyToken, '❌ รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาสร้างรหัสใหม่ในแอปแล้วลองอีกครั้ง');
        }
      }
    });
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
  }
}


// 📸 อัปโหลดรูปโปรไฟล์เทรนเนอร์ไปเก็บที่ Google Drive แล้วคืนลิงก์รูปกลับมา
function uploadTrainerPhoto(base64Data, mimeType, fileName, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var folders = DriveApp.getFoldersByName('TrainerPhotos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('TrainerPhotos');

    var decoded = Utilities.base64Decode(base64Data.split(',').pop());
    var blob = Utilities.newBlob(decoded, mimeType, fileName || ('trainer_' + Date.now()));
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // ใช้ลิงก์รูปแบบ googleusercontent (เสถียรกว่า uc?export=view มากสำหรับแสดงผลใน <img> โดยตรง)
    var photoUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w500';
    return { success: true, url: photoUrl };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 💳 QR รับเงิน (PromptPay) ตายตัวสำหรับใช้ตอนรับชำระเงินทุกช่องทาง
// ==========================================
function uploadPaymentQR(base64Data, mimeType, fileName, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var folders = DriveApp.getFoldersByName('PaymentQR');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PaymentQR');

    var decoded = Utilities.base64Decode(base64Data.split(',').pop());
    var blob = Utilities.newBlob(decoded, mimeType, fileName || ('payment_qr_' + Date.now()));
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var qrUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w800';
    PropertiesService.getScriptProperties().setProperty('paymentQrUrl', qrUrl);
    logAudit_(session.user, 'UPDATE_PAYMENT_QR', 'Payment QR', 'อัปโหลด QR รับเงินใหม่');
    return { success: true, url: qrUrl };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getPaymentQRInfo(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty('paymentQrUrl') || '',
    caption: props.getProperty('paymentQrCaption') || ''
  };
}

function updatePaymentQRCaption(caption, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    PropertiesService.getScriptProperties().setProperty('paymentQrCaption', (caption || '').toString());
    logAudit_(session.user, 'UPDATE_PAYMENT_QR_CAPTION', 'Payment QR', 'แก้ไขคำอธิบาย QR รับเงิน');
    return { success: true, message: 'บันทึกคำอธิบาย QR สำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getTrainerList(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureTrainerSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      list.push({
        rowNumber: i + 2,
        trainerId: rows[i][0],
        fullName: rows[i][1],
        specialty: rows[i][2],
        phone: rows[i][3] ? rows[i][3].toString() : "",
        workingDays: rows[i][4] ? rows[i][4].toString().split(',') : [],
        startHour: normalizeTimeValue_(rows[i][5]),
        endHour: normalizeTimeValue_(rows[i][6]),
        slotMinutes: rows[i][7] || 60,
        status: rows[i][8] || 'Active',
        photoUrl: rows[i][9] || '',
        bio: rows[i][10] || '',
        pin: rows[i][11] ? rows[i][11].toString() : '1234',
        busyStatus: rows[i][13] || 'Available',
        email: rows[i][15] || '',
        lineLinked: !!(rows[i][16] && rows[i][16].toString().trim()),
        lineLinkCode: rows[i][17] || ''
      });
    }
    return list;
  } catch (e) { return []; }
}

function addTrainerData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var trainerId = 'TR' + Utilities.getUuid().substring(0, 6).toUpperCase();
    sheet.appendRow([
      trainerId,
      data.fullName,
      data.specialty || '',
      "'" + (data.phone || ''),
      (data.workingDays || []).join(','),
      "'" + (data.startHour || '09:00'),
      "'" + (data.endHour || '18:00'),
      parseInt(data.slotMinutes) || 60,
      'Active',
      data.photoUrl || '',
      data.bio || '',
      "'1234", // 🔑 PIN เริ่มต้นสำหรับเข้าแอปเทรนเนอร์ - แจ้งเทรนเนอร์ให้เปลี่ยนเองในแอปภายหลัง
      '',
      'Available',
      '',
      (data.email || '').toString().trim()
    ]);
    logAudit_(session.user, 'ADD_TRAINER', data.fullName, 'เพิ่มเทรนเนอร์ใหม่ ID: ' + trainerId + ' (PIN เริ่มต้นแอปเทรนเนอร์: 1234)');
    return { success: true, message: 'เพิ่มเทรนเนอร์สำเร็จ! PIN เริ่มต้นสำหรับเข้าแอปเทรนเนอร์คือ 1234', trainerId: trainerId };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// รีเซ็ต PIN แอปเทรนเนอร์กลับเป็นค่าเริ่มต้น (ใช้เมื่อเทรนเนอร์ลืมรหัส)
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

function updateTrainerData(data, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(data.rowNumber);
    sheet.getRange(row, 2).setValue(data.fullName);
    sheet.getRange(row, 3).setValue(data.specialty || '');
    sheet.getRange(row, 4).setValue("'" + (data.phone || ''));
    sheet.getRange(row, 5).setValue((data.workingDays || []).join(','));
    sheet.getRange(row, 6).setValue("'" + (data.startHour || '09:00'));
    sheet.getRange(row, 7).setValue("'" + (data.endHour || '18:00'));
    sheet.getRange(row, 8).setValue(parseInt(data.slotMinutes) || 60);
    sheet.getRange(row, 9).setValue(data.status || 'Active');
    if (typeof data.photoUrl !== 'undefined' && data.photoUrl !== null) sheet.getRange(row, 10).setValue(data.photoUrl);
    sheet.getRange(row, 11).setValue(data.bio || '');
    sheet.getRange(row, 16).setValue((data.email || '').toString().trim());
    logAudit_(session.user, 'EDIT_TRAINER', data.fullName, 'แก้ไขข้อมูลเทรนเนอร์');
    return { success: true, message: 'อัปเดตข้อมูลเทรนเนอร์สำเร็จ!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteTrainerData(rowNumber, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureTrainerSheet_();
    var row = parseInt(rowNumber);
    var name = sheet.getRange(row, 2).getValue();
    sheet.deleteRow(row);
    logAudit_(session.user, 'DELETE_TRAINER', name, 'ลบเทรนเนอร์ออกจากระบบ');
    return { success: true, message: 'ลบเทรนเนอร์ "' + name + '" ออกจากระบบสำเร็จ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function ensureBookingSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bookings');
  if (!sheet) {
    sheet = ss.insertSheet('Bookings');
    sheet.appendRow(["Timestamp", "Booking ID", "Trainer ID", "Trainer Name", "Member Row", "Member Name", "Member Phone", "Date", "Time Slot", "Status", "Notes"]);
  }
  return sheet;
}

// ==========================================
// ⏳ ระบบ Waitlist - จองคิวที่เต็มไว้ล่วงหน้า พอมีคนยกเลิกจะแจ้งคนถัดไปทันที
// ==========================================
function ensureWaitlistSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Waitlist');
  if (!sheet) {
    sheet = ss.insertSheet('Waitlist');
    sheet.appendRow(["Timestamp", "Trainer ID", "Trainer Name", "Member Row", "Member Name", "Member Phone", "Date", "Time Slot", "Status"]);
  }
  return sheet;
}

// สมาชิกเข้าคิวรอสำหรับช่วงเวลาที่เต็มแล้ว
function joinWaitlist(token, trainerId, dateStr, timeSlot) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var trainerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Trainers');
    var tRows = trainerSheet.getDataRange().getValues();
    var trainerName = '';
    for (var i = 1; i < tRows.length; i++) {
      if (tRows[i][0] === trainerId) { trainerName = tRows[i][1]; break; }
    }
    if (!trainerName) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };

    var sheet = ensureWaitlistSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
      var tz = Session.getScriptTimeZone();
      for (var j = 0; j < rows.length; j++) {
        var rDate = rows[j][6] instanceof Date ? Utilities.formatDate(rows[j][6], tz, "yyyy-MM-dd") : rows[j][6].toString();
        if (rows[j][1] === trainerId && rDate === dateStr && rows[j][7] === timeSlot && rows[j][3] === session.rowNumber && rows[j][8] === 'Waiting') {
          return { success: false, message: 'คุณเข้าคิวรอช่วงเวลานี้ไว้อยู่แล้ว' };
        }
      }
    }

    sheet.appendRow([new Date(), trainerId, trainerName, session.rowNumber, session.fullName, session.phone, dateStr, timeSlot, 'Waiting']);
    logAudit_(session.fullName, 'MEMBER_JOIN_WAITLIST', trainerName, 'เข้าคิวรอวันที่ ' + dateStr + ' เวลา ' + timeSlot);
    return { success: true, message: '⏳ เข้าคิวรอสำเร็จ! ถ้ามีคนยกเลิกช่วงเวลานี้ ระบบจะแจ้งคุณทันทีทาง LINE/แอป' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ดูรายการที่ตัวเองเข้าคิวรอไว้
function getMyWaitlist(token) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureWaitlistSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][3] !== session.rowNumber) continue;
      if (rows[i][8] === 'Cancelled') continue;
      var rDate = rows[i][6] instanceof Date ? Utilities.formatDate(rows[i][6], tz, "yyyy-MM-dd") : rows[i][6].toString();
      list.push({
        rowNumber: i + 2,
        trainerName: rows[i][2],
        date: rDate,
        timeSlot: rows[i][7],
        status: rows[i][8]
      });
    }
    list.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : a.timeSlot.localeCompare(b.timeSlot)); });
    return list;
  } catch (e) { return []; }
}

// สมาชิกยกเลิกการรอคิวของตัวเอง
function cancelMyWaitlistEntry(token, waitlistRowNumber) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var sheet = ensureWaitlistSheet_();
    var row = parseInt(waitlistRowNumber);
    var ownerRow = sheet.getRange(row, 4).getValue();
    if (ownerRow !== session.rowNumber) return { success: false, message: 'ไม่ใช่รายการของคุณ' };
    sheet.getRange(row, 9).setValue('Cancelled');
    return { success: true, message: 'ยกเลิกการรอคิวเรียบร้อยแล้ว' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// 🔔 เมื่อมีคิวถูกยกเลิก ให้แจ้งคนที่รอคิวถัดไป (เรียงตามคนที่รอก่อน) ทันทีทั้ง LINE และอีเมล
function notifyNextWaitlistPerson_(trainerId, dateStr, timeSlot) {
  try {
    var sheet = ensureWaitlistSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var tz = Session.getScriptTimeZone();
    var earliestRow = -1;
    var earliestTimestamp = null;

    for (var i = 0; i < rows.length; i++) {
      var rDate = rows[i][6] instanceof Date ? Utilities.formatDate(rows[i][6], tz, "yyyy-MM-dd") : rows[i][6].toString();
      if (rows[i][1] === trainerId && rDate === dateStr && rows[i][7] === timeSlot && rows[i][8] === 'Waiting') {
        var ts = rows[i][0] instanceof Date ? rows[i][0].getTime() : new Date(rows[i][0]).getTime();
        if (earliestTimestamp === null || ts < earliestTimestamp) {
          earliestTimestamp = ts;
          earliestRow = i;
        }
      }
    }
    if (earliestRow === -1) return;

    var memberRowNum = rows[earliestRow][3];
    var memberName = rows[earliestRow][4];
    sheet.getRange(earliestRow + 2, 9).setValue('Notified');

    // ดึงข้อมูล LINE User ID + อีเมลของสมาชิกคนนี้เพื่อแจ้งเตือน
    var memberSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    if (memberSheet) {
      var numCols = Math.max(memberSheet.getLastColumn(), 19);
      var mData = memberSheet.getRange(memberRowNum, 1, 1, numCols).getValues()[0];
      var lineUserId = (mData[18] || '').toString().trim();
      var email = (mData[3] || '').toString().trim();
      var msgText = '🎉 มีคิวว่างแล้ว!\n\nสวัสดีคุณ ' + memberName + '\nช่วงเวลาที่คุณรอคิวไว้ (' + dateStr + ' เวลา ' + timeSlot + ') ว่างแล้ว!\n\nรีบเข้าแอปเพื่อจองคิวก่อนคนอื่นนะครับ';
      if (lineUserId) sendLineMessage_(lineUserId, msgText);
      if (email) {
        try {
          MailApp.sendEmail({ to: email, subject: '🎉 มีคิวว่างแล้ว! ' + dateStr + ' ' + timeSlot, htmlBody: msgText.replace(/\n/g, '<br>') });
        } catch (e2) { /* ไม่ให้ error ตรงนี้กระทบส่วนอื่น */ }
      }
    }
    logAudit_('SYSTEM (Auto)', 'WAITLIST_NOTIFY', memberName, 'แจ้งเตือนคิวว่างให้สมาชิกที่รอคิว วันที่ ' + dateStr + ' เวลา ' + timeSlot);
  } catch (e) { /* ไม่ให้ error ตรงนี้ทำให้การยกเลิกคิวหลักล้มเหลว */ }
}

function generateTimeSlots_(startHour, endHour, slotMinutes) {
  var slots = [];
  var start = timeStrToMinutes_(startHour);
  var end = timeStrToMinutes_(endHour);
  for (var t = start; t + slotMinutes <= end; t += slotMinutes) {
    slots.push(minutesToTimeStr_(t) + '-' + minutesToTimeStr_(t + slotMinutes));
  }
  return slots;
}

function timeStrToMinutes_(str) {
  if (str instanceof Date) {
    return str.getHours() * 60 + str.getMinutes();
  }
  var parts = str.toString().trim().split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

function minutesToTimeStr_(mins) {
  var h = Math.floor(mins / 60), m = mins % 60;
  return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
}

function normalizeTimeValue_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }
  return val ? val.toString() : "";
}

var TRAINER_DAY_MAP_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getAvailableTrainers(token) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var sheet = ensureTrainerSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][8] || 'Active') !== 'Active') continue;
      list.push({
        trainerId: rows[i][0],
        fullName: rows[i][1],
        specialty: rows[i][2],
        workingDays: rows[i][4] ? rows[i][4].toString().split(',') : [],
        startHour: normalizeTimeValue_(rows[i][5]),
        endHour: normalizeTimeValue_(rows[i][6]),
        slotMinutes: rows[i][7] || 60,
        photoUrl: rows[i][9] || '',
        bio: rows[i][10] || '',
        busyStatus: rows[i][13] || 'Available'
      });
    }
    return list;
  } catch (e) { return []; }
}

// 🔧 ตรรกะหลักคำนวณช่วงเวลาว่างของเทรนเนอร์ (ใช้ร่วมกันทั้งฝั่งสมาชิกและแอดมิน)
function computeAvailableSlots_(trainerId, dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trainerSheet = ss.getSheetByName('Trainers');
  var rows = trainerSheet.getDataRange().getValues();
  var trainer = null;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === trainerId) { trainer = rows[i]; break; }
  }
  if (!trainer) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ', slots: [] };

  var workingDays = trainer[4] ? trainer[4].toString().split(',') : [];
  var dayOfWeek = TRAINER_DAY_MAP_[new Date(dateStr).getDay()];
  if (workingDays.indexOf(dayOfWeek) === -1) {
    return { success: true, slots: [], message: 'เทรนเนอร์ไม่ทำงานในวันที่เลือก' };
  }

  var allSlots = generateTimeSlots_(trainer[5], trainer[6], trainer[7] || 60);

  var bookingSheet = ensureBookingSheet_();
  var bLastRow = bookingSheet.getLastRow();
  var bookedSlots = [];
  if (bLastRow > 1) {
    var bRows = bookingSheet.getRange(2, 1, bLastRow - 1, 11).getValues();
    var tz = Session.getScriptTimeZone();
    for (var j = 0; j < bRows.length; j++) {
      var bDate = bRows[j][7] instanceof Date ? Utilities.formatDate(bRows[j][7], tz, "yyyy-MM-dd") : bRows[j][7].toString();
      if (bRows[j][2] === trainerId && bDate === dateStr && bRows[j][9] === 'Booked') {
        bookedSlots.push(bRows[j][8]);
      }
    }
  }

  var tz2 = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz2, "yyyy-MM-dd");
  var nowMinutes = timeStrToMinutes_(Utilities.formatDate(new Date(), tz2, "HH:mm"));

  var freeSlots = allSlots.filter(function (s) {
    if (bookedSlots.indexOf(s) !== -1) return false;
    if (dateStr === today) {
      var slotStart = timeStrToMinutes_(s.split('-')[0]);
      if (slotStart <= nowMinutes) return false;
    }
    return true;
  });

  return { success: true, slots: freeSlots, bookedSlots: bookedSlots };
}

function getTrainerAvailableSlots(token, trainerId, dateStr) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    return computeAvailableSlots_(trainerId, dateStr);
  } catch (e) { return { success: false, message: e.toString(), slots: [] }; }
}

// เวอร์ชันแอดมิน - ใช้ตอนแอดมินจองคิวแทนสมาชิกที่หน้าเคาน์เตอร์
function getTrainerAvailableSlotsAdmin(token, trainerId, dateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    return computeAvailableSlots_(trainerId, dateStr);
  } catch (e) { return { success: false, message: e.toString(), slots: [] }; }
}

// 🔧 ตรรกะหลักสร้างการจองคิว (ใช้ร่วมกันทั้งฝั่งสมาชิกและแอดมิน)
function createBookingRecord_(trainerId, dateStr, timeSlot, memberRowNumber, memberName, memberPhone) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trainerSheet = ss.getSheetByName('Trainers');
  var tRows = trainerSheet.getDataRange().getValues();
  var trainerName = '';
  for (var i = 1; i < tRows.length; i++) {
    if (tRows[i][0] === trainerId) { trainerName = tRows[i][1]; break; }
  }
  if (!trainerName) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };

  var bookingSheet = ensureBookingSheet_();
  var bLastRow = bookingSheet.getLastRow();
  var tz = Session.getScriptTimeZone();
  if (bLastRow > 1) {
    var bRows = bookingSheet.getRange(2, 1, bLastRow - 1, 11).getValues();
    for (var j = 0; j < bRows.length; j++) {
      var bDate = bRows[j][7] instanceof Date ? Utilities.formatDate(bRows[j][7], tz, "yyyy-MM-dd") : bRows[j][7].toString();
      if (bRows[j][2] === trainerId && bDate === dateStr && bRows[j][8] === timeSlot && bRows[j][9] === 'Booked') {
        return { success: false, message: '❌ ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น' };
      }
    }
  }

  var bookingId = Utilities.getUuid();
  bookingSheet.appendRow([
    new Date(), bookingId, trainerId, trainerName,
    memberRowNumber, memberName, memberPhone,
    dateStr, timeSlot, 'Booked', ''
  ]);
  notifyTrainerNewBooking_(trainerId, memberName, memberPhone, dateStr, timeSlot);
  return { success: true, message: '🟢 จองคิวเทรนเนอร์ ' + trainerName + ' สำเร็จ! วันที่ ' + dateStr + ' เวลา ' + timeSlot, trainerName: trainerName };
}

function bookTrainerSlot(token, trainerId, dateStr, timeSlot) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var result = createBookingRecord_(trainerId, dateStr, timeSlot, session.rowNumber, session.fullName, session.phone);
    if (result.success) {
      logAudit_(session.fullName, 'MEMBER_BOOK_TRAINER', result.trainerName, 'จองคิววันที่ ' + dateStr + ' เวลา ' + timeSlot);
    }
    return { success: result.success, message: result.message };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// เวอร์ชันแอดมิน - จองคิวเทรนเนอร์แทนสมาชิกที่โทรมาจอง หรือมาติดต่อที่หน้าเคาน์เตอร์
function adminBookTrainerSlot(token, memberRowNumber, trainerId, dateStr, timeSlot) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var memberSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    var row = parseInt(memberRowNumber);
    var memberData = memberSheet.getRange(row, 1, 1, 3).getValues()[0];
    var memberName = memberData[1];
    var memberPhone = memberData[2] ? memberData[2].toString() : '';

    var result = createBookingRecord_(trainerId, dateStr, timeSlot, row, memberName, memberPhone);
    if (result.success) {
      logAudit_(session.user, 'ADMIN_BOOK_TRAINER', result.trainerName, 'จองคิวให้สมาชิก ' + memberName + ' วันที่ ' + dateStr + ' เวลา ' + timeSlot);
    }
    return result;
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getMyBookings(token) {
  var session = validateMemberSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][4] !== session.rowNumber) continue;
      var bDate = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
      list.push({
        bookingId: rows[i][1],
        trainerName: rows[i][3],
        date: bDate,
        timeSlot: rows[i][8],
        status: rows[i][9] || 'Booked'
      });
    }
    return list;
  } catch (e) { return []; }
}

function cancelMyBooking(token, bookingId) {
  var session = validateMemberSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบรายการจองนี้' };
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] === bookingId && rows[i][4] === session.rowNumber) {
        bookingSheet.getRange(i + 2, 10).setValue('Cancelled');
        var tz = Session.getScriptTimeZone();
        var cancelDateStr = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
        notifyNextWaitlistPerson_(rows[i][2], cancelDateStr, rows[i][8]);
        logAudit_(session.fullName, 'MEMBER_CANCEL_BOOKING', rows[i][3], 'ยกเลิกคิว วันที่ ' + rows[i][7] + ' เวลา ' + rows[i][8]);
        return { success: true, message: 'ยกเลิกคิวเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบรายการจองนี้ หรือไม่ใช่คิวของคุณ' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getAllBookings(token) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return [];
    var maxDisplay = 100;
    var startRow = Math.max(2, lastRow - maxDisplay + 1);
    var numRows = lastRow - startRow + 1;
    var rows = bookingSheet.getRange(startRow, 1, numRows, 11).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var bDate = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
      var ts = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], tz, "yyyy-MM-dd HH:mm") : rows[i][0].toString();
      list.push({
        timestamp: ts,
        bookingId: rows[i][1],
        trainerName: rows[i][3],
        memberName: rows[i][5],
        memberPhone: rows[i][6] ? rows[i][6].toString() : "",
        date: bDate,
        timeSlot: rows[i][8],
        status: rows[i][9] || 'Booked'
      });
    }
    return list;
  } catch (e) { return []; }
}

function getTrainerScheduleByDate(token, trainerId, dateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return [];
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    var tz = Session.getScriptTimeZone();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var bDate = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
      if (rows[i][2] === trainerId && bDate === dateStr) {
        list.push({
          bookingId: rows[i][1],
          memberName: rows[i][5],
          memberPhone: rows[i][6] ? rows[i][6].toString() : "",
          timeSlot: rows[i][8],
          status: rows[i][9] || 'Booked'
        });
      }
    }
    list.sort(function (a, b) { return a.timeSlot.localeCompare(b.timeSlot); });
    return list;
  } catch (e) { return []; }
}

function updateBookingStatus(bookingId, newStatus, token) {
  var session = validateSession(token);
  if (!session) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    var bookingSheet = ensureBookingSheet_();
    var lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'ไม่พบรายการจองนี้' };
    var rows = bookingSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] === bookingId) {
        bookingSheet.getRange(i + 2, 10).setValue(newStatus);
        if (newStatus === 'Cancelled') {
          var tz = Session.getScriptTimeZone();
          var cancelDateStr = rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz, "yyyy-MM-dd") : rows[i][7].toString();
          notifyNextWaitlistPerson_(rows[i][2], cancelDateStr, rows[i][8]);
        }
        logAudit_(session.user, 'UPDATE_BOOKING_STATUS', rows[i][3], 'เปลี่ยนสถานะคิวเป็น ' + newStatus + ' (สมาชิก: ' + rows[i][5] + ')');
        return { success: true, message: 'อัปเดตสถานะคิวเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบรายการจองนี้' };
  } catch (e) { return { success: false, message: e.toString() }; }
}