// Bookings — extracted from the original monolithic Code.js

function ensureBookingSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bookings');
  if (!sheet) {
    sheet = ss.insertSheet('Bookings');
    sheet.appendRow(["Timestamp", "Booking ID", "Trainer ID", "Trainer Name", "Member Row", "Member Name", "Member Phone", "Date", "Time Slot", "Status", "Notes"]);
  }
  return sheet;
}

function ensureWaitlistSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Waitlist');
  if (!sheet) {
    sheet = ss.insertSheet('Waitlist');
    sheet.appendRow(["Timestamp", "Trainer ID", "Trainer Name", "Member Row", "Member Name", "Member Phone", "Date", "Time Slot", "Status"]);
  }
  return sheet;
}

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

function getTrainerAvailableSlotsAdmin(token, trainerId, dateStr) {
  var session = validateSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  try {
    return computeAvailableSlots_(trainerId, dateStr);
  } catch (e) { return { success: false, message: e.toString(), slots: [] }; }
}

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
