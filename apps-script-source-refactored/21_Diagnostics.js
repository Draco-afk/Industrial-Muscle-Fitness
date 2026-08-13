// Diagnostics — extracted from the original monolithic Code.js

function testMailAuth() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "ทดสอบ", "ทดสอบสิทธิ์ส่งเมล");
}
