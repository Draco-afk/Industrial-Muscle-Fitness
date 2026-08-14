// LINE Integration — ported from
// apps-script-source-refactored/18_LineIntegration.js. sendLineMessage_ /
// replyLineMessage_ / broadcastLineToMembers_ live in util/lineClient.js
// (shared with 05_bookings.js, 06_coupons.js, 14_automation.js, which
// previously had no-op stubs — now wired to the real thing).
//
// Link codes: trainers use `lineLinkCode` (Trainers col R), members use
// `lineLinkCode` (Members col T) — a 6-digit code the person types into the
// LINE chat, matched in handleLineWebhook_ below.
'use strict';
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { sendLineMessage_, replyLineMessage_ } = require('./util/lineClient');

function gen6DigitCode_() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.getLineSettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await db.collection('config').doc('lineSettings').get();
  const d = snap.exists ? snap.data() : {};
  return { hasToken: !!d.channelAccessToken, addFriendUrl: d.addFriendUrl || '', webhookUrl: '(ดูได้จาก Firebase Console หลัง deploy ฟังก์ชัน lineWebhook)' };
});

exports.updateLineSettings = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { channelAccessToken, addFriendUrl } = request.data || {};
  try {
    const update = { addFriendUrl: (addFriendUrl || '').toString().trim() };
    if (channelAccessToken && channelAccessToken.trim()) update.channelAccessToken = channelAccessToken.trim();
    await db.collection('config').doc('lineSettings').set(update, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_LINE_SETTINGS', 'System', 'อัปเดตการตั้งค่า LINE Official Account');
    return { success: true, message: '🟢 บันทึกการตั้งค่า LINE สำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Trainer LINE linking ----

exports.generateTrainerLineLinkCode = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const code = gen6DigitCode_();
    await db.collection('trainers').doc(docId).update({ lineLinkCode: code });
    return { success: true, code };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.generateMyLineLinkCode = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const code = gen6DigitCode_();
    await db.collection('trainers').doc(authCtx.uid).update({ lineLinkCode: code });
    return { success: true, code };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getLineAddFriendUrlForTrainer = onCall(async (request) => {
  requireAuth(request, 'trainer');
  const snap = await db.collection('config').doc('lineSettings').get();
  return { addFriendUrl: snap.exists ? (snap.data().addFriendUrl || '') : '' };
});

exports.unlinkMyLine = onCall(async (request) => {
  const authCtx = authOrNull(request, 'trainer');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    await db.collection('trainers').doc(authCtx.uid).update({ lineUserId: '', lineLinkCode: '' });
    return { success: true, message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// ---- Member LINE linking ----

exports.generateMyMemberLineLinkCode = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const code = gen6DigitCode_();
    await db.collection('members').doc(authCtx.uid).update({ lineLinkCode: code });
    return { success: true, code };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getLineAddFriendUrlForMember = onCall(async (request) => {
  requireAuth(request, 'member');
  const snap = await db.collection('config').doc('lineSettings').get();
  return { addFriendUrl: snap.exists ? (snap.data().addFriendUrl || '') : '' };
});

exports.unlinkMyMemberLine = onCall(async (request) => {
  const authCtx = authOrNull(request, 'member');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    await db.collection('members').doc(authCtx.uid).update({ lineUserId: '', lineLinkCode: '' });
    return { success: true, message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

async function tryLinkMemberLineAccount_(code, userId) {
  try {
    const snap = await db.collection('members').where('lineLinkCode', '==', code.trim()).limit(1).get();
    if (snap.empty) return { success: false };
    const doc = snap.docs[0];
    await doc.ref.update({ lineUserId: userId, lineLinkCode: '' });
    const memberName = doc.data().fullName;
    await logAudit_(memberName, 'MEMBER_LINE_LINKED', memberName, 'เชื่อมต่อบัญชี LINE สำเร็จผ่าน webhook');
    return { success: true, memberName };
  } catch (e) {
    return { success: false };
  }
}

async function tryLinkTrainerLineAccount_(code, userId) {
  try {
    const snap = await db.collection('trainers').where('lineLinkCode', '==', code.trim()).limit(1).get();
    if (snap.empty) return { success: false };
    const doc = snap.docs[0];
    await doc.ref.update({ lineUserId: userId, lineLinkCode: '' });
    const trainerName = doc.data().fullName;
    await logAudit_(trainerName, 'TRAINER_LINE_LINKED', trainerName, 'เชื่อมต่อบัญชี LINE สำเร็จผ่าน webhook');
    return { success: true, trainerName };
  } catch (e) {
    return { success: false };
  }
}

// ---- HTTP webhook (LINE Developers Console -> Webhook URL) ----

exports.lineWebhook = onRequest(async (req, res) => {
  try {
    const events = (req.body && req.body.events) || [];
    for (const event of events) {
      if (event.type === 'message' && event.message && event.message.type === 'text') {
        const userId = event.source ? event.source.userId : null;
        const text = (event.message.text || '').trim();
        if (userId && /^\d{6}$/.test(text)) {
          const trainerResult = await tryLinkTrainerLineAccount_(text, userId);
          if (trainerResult.success) {
            await replyLineMessage_(event.replyToken, `✅ เชื่อมต่อ LINE สำเร็จ! สวัสดีคุณ ${trainerResult.trainerName} คุณจะได้รับแจ้งเตือนคิวใหม่ทาง LINE จากนี้ไปครับ`);
            continue;
          }
          const memberResult = await tryLinkMemberLineAccount_(text, userId);
          if (memberResult.success) {
            await replyLineMessage_(event.replyToken, `✅ เชื่อมต่อ LINE สำเร็จ! สวัสดีคุณ ${memberResult.memberName} คุณจะได้รับแจ้งเตือนใกล้หมดอายุ โปรวันเกิด และคูปองใหม่ๆ ทาง LINE จากนี้ไปครับ`);
            continue;
          }
          await replyLineMessage_(event.replyToken, '❌ รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาสร้างรหัสใหม่ในแอปแล้วลองอีกครั้ง');
        }
      }
    }
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(200).json({ success: false });
  }
});

// ---- Manual test utility (was a Apps Script editor-only debug function) ----

exports.testSendLineMessageToTrainer = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { docId } = request.data || {};
  try {
    const snap = await db.collection('trainers').doc(docId).get();
    if (!snap.exists) return { success: false, message: 'ไม่พบเทรนเนอร์นี้ในระบบ' };
    const t = snap.data();
    if (!t.lineUserId) return { success: false, message: '❌ เทรนเนอร์คนนี้ยังไม่มี LINE User ID บันทึกไว้ - ยังไม่ได้เชื่อมต่อ' };
    await sendLineMessage_(t.lineUserId, '🧪 นี่คือข้อความทดสอบจากระบบ Industrial Muscle - ถ้าคุณได้รับข้อความนี้ แปลว่าระบบแจ้งเตือน LINE ทำงานถูกต้องแล้ว!');
    return { success: true, message: `ส่งข้อความทดสอบไปยัง ${t.fullName} แล้ว เช็คมือถือเทรนเนอร์ว่าได้รับข้อความไหม` };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});
