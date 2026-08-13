// Trainers — extracted from the original monolithic Code.js

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
