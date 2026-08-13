// LineIntegration — extracted from the original monolithic Code.js

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

function getLineAddFriendUrlForTrainer(token) {
  var session = validateTrainerSession(token);
  if (!session) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
  var props = PropertiesService.getScriptProperties();
  return { addFriendUrl: props.getProperty('lineAddFriendUrl') || '' };
}

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
