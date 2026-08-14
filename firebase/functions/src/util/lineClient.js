// Ported from apps-script-source-refactored/18_LineIntegration.js —
// sendLineMessage_ / replyLineMessage_. PropertiesService -> config/lineSettings.
'use strict';
const { db } = require('./admin');

async function getLineAccessToken_() {
  const snap = await db.collection('config').doc('lineSettings').get();
  return snap.exists ? (snap.data().channelAccessToken || '') : '';
}

async function sendLineMessage_(userId, text) {
  try {
    const accessToken = await getLineAccessToken_();
    if (!accessToken) { console.log('sendLineMessage_: ไม่มี Channel Access Token บันทึกไว้ในระบบ'); return; }
    if (!userId) { console.log('sendLineMessage_: ไม่มี userId'); return; }
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] })
    });
    if (res.status !== 200) console.log(`sendLineMessage_ ล้มเหลว! HTTP ${res.status} - ${await res.text()}`);
  } catch (e) { console.log('sendLineMessage_ เกิด exception: ' + e.toString()); }
}

async function replyLineMessage_(replyToken, text) {
  try {
    const accessToken = await getLineAccessToken_();
    if (!accessToken) { console.log('replyLineMessage_: ไม่มี Channel Access Token บันทึกไว้ในระบบ'); return; }
    if (!replyToken) { console.log('replyLineMessage_: ไม่มี replyToken'); return; }
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
    });
    if (res.status !== 200) console.log(`replyLineMessage_ ล้มเหลว! HTTP ${res.status} - ${await res.text()}`);
  } catch (e) { console.log('replyLineMessage_ เกิด exception: ' + e.toString()); }
}

async function broadcastLineToMembers_(text) {
  try {
    const memberSnap = await db.collection('members').get();
    const userIds = [];
    memberSnap.forEach((doc) => {
      const uid = (doc.data().lineUserId || '').toString().trim();
      if (uid) userIds.push(uid);
    });
    if (userIds.length === 0) return { sentCount: 0 };

    const accessToken = await getLineAccessToken_();
    if (!accessToken) { console.log('broadcastLineToMembers_: ไม่มี Channel Access Token'); return { sentCount: 0 }; }

    const batchSize = 500;
    let totalSent = 0;
    for (let b = 0; b < userIds.length; b += batchSize) {
      const batch = userIds.slice(b, b + batchSize);
      const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to: batch, messages: [{ type: 'text', text }] })
      });
      if (res.status === 200) totalSent += batch.length;
      else console.log(`broadcastLineToMembers_ ล้มเหลว! HTTP ${res.status} - ${await res.text()}`);
    }
    return { sentCount: totalSent };
  } catch (e) {
    console.log('broadcastLineToMembers_ เกิด exception: ' + e.toString());
    return { sentCount: 0 };
  }
}

module.exports = { sendLineMessage_, replyLineMessage_, broadcastLineToMembers_, getLineAccessToken_ };
