// Packages — extracted from the original monolithic Code.js

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

function daysUntil_(dateVal) {
  if (!dateVal) return null;
  var expDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(expDate.getTime())) return null;
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var expMid = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  return Math.round((expMid - todayMid) / (1000 * 60 * 60 * 24));
}

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
