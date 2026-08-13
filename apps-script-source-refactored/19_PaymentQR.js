// PaymentQR — extracted from the original monolithic Code.js

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
