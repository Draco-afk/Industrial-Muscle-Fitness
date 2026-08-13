// Routing — extracted from the original monolithic Code.js

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

// Used by HTML templates via <?!= include('PartialName'); ?> to stitch
// separately-maintained style/script partials back into one page at render time.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
