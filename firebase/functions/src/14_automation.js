// Automation — ported from apps-script-source-refactored/14_Automation.js.
//
// Adaptation: the original dynamically installed/removed
// ScriptApp.newTrigger(...) time-based triggers as the "enable/disable"
// mechanism. Cloud Scheduler jobs backing onSchedule() are declared
// statically at deploy time instead — so these scheduled functions always
// run on their cadence, but each one checks a `config/automation` Firestore
// flag first and no-ops if the admin has it turned off. Same effective
// behavior (toggle from Settings), simpler than driving the Cloud Scheduler
// API dynamically.
//
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { db } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');
const { daysUntil_, isBirthdayMonth_ } = require('./util/dates');
const { sendLineMessage_ } = require('./util/lineClient');
const config = require('./00_config');

async function getAutomationConfig_() {
  const snap = await db.collection('config').doc('automation').get();
  return snap.exists ? snap.data() : {};
}

// ---- Auto-expire ----

exports.getAutoExpireSettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const c = await getAutomationConfig_();
  return { enabled: !!c.autoExpireEnabled, graceDays: typeof c.autoExpireGraceDays === 'number' ? c.autoExpireGraceDays : config.DEFAULT_AUTO_INACTIVE_GRACE_DAYS };
});

exports.toggleAutoExpireTrigger = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { enable, graceDays } = request.data || {};
  try {
    const gd = parseInt(graceDays, 10);
    if (isNaN(gd) || gd < 0) return { success: false, message: 'กรุณากรอกจำนวนวันผ่อนผันให้ถูกต้อง' };
    await db.collection('config').doc('automation').set({ autoExpireEnabled: !!enable, autoExpireGraceDays: gd }, { merge: true });
    if (enable) {
      await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ENABLE_AUTO_EXPIRE', 'System', `เปิดใช้งานปิดสถานะสมาชิกอัตโนมัติ (ผ่อนผัน ${gd} วัน)`);
      return { success: true, message: '🟢 เปิดใช้งานระบบปิดสถานะอัตโนมัติแล้ว! จะทำงานทุกวันช่วงตี 2' };
    }
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DISABLE_AUTO_EXPIRE', 'System', 'ปิดใช้งานปิดสถานะสมาชิกอัตโนมัติ');
    return { success: true, message: 'ปิดใช้งานระบบปิดสถานะอัตโนมัติแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.autoExpireMembers = onSchedule({ schedule: '0 2 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  try {
    const c = await getAutomationConfig_();
    if (!c.autoExpireEnabled) return;
    const graceDays = typeof c.autoExpireGraceDays === 'number' ? c.autoExpireGraceDays : config.DEFAULT_AUTO_INACTIVE_GRACE_DAYS;

    const snap = await db.collection('members').where('status', '==', 'Active').get();
    const changedNames = [];
    for (const doc of snap.docs) {
      const m = doc.data();
      if (!m.expiryDate) continue;
      const daysLeft = daysUntil_(m.expiryDate);
      if (daysLeft === null) continue;
      if (daysLeft < 0 && Math.abs(daysLeft) > graceDays) {
        await doc.ref.update({ status: 'Inactive' });
        changedNames.push(`${m.fullName} (หมดอายุเกิน ${Math.abs(daysLeft)} วัน)`);
      }
    }
    if (changedNames.length > 0) {
      await logAudit_('SYSTEM (Auto)', 'AUTO_SET_INACTIVE', 'Members', `ปิดสถานะสมาชิก ${changedNames.length} คนอัตโนมัติ: ${changedNames.join(', ')}`);
    }
  } catch (e) {
    await logAudit_('SYSTEM (Auto)', 'AUTO_SET_INACTIVE_ERROR', 'Members', e.toString());
  }
});

// ---- Win-back campaign ----

exports.toggleWinBackCampaign = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { enable } = request.data || {};
  try {
    await db.collection('config').doc('automation').set({ winbackEnabled: !!enable }, { merge: true });
    if (enable) {
      await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ENABLE_WINBACK', 'System', 'เปิดใช้งานระบบดึงสมาชิกที่หายไปกลับมาอัตโนมัติ');
      return { success: true, message: '🟢 เปิดใช้งานระบบ Win-back Campaign แล้ว! จะทำงานทุกวันช่วง 10 โมงเช้า' };
    }
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DISABLE_WINBACK', 'System', 'ปิดใช้งานระบบดึงสมาชิกที่หายไปกลับมา');
    return { success: true, message: 'ปิดใช้งานระบบ Win-back Campaign แล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getWinBackSettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const c = await getAutomationConfig_();
  return {
    enabled: !!c.winbackEnabled,
    inactiveDays: c.winbackInactiveDays || 30,
    discountPercent: c.winbackDiscountPercent || 20,
    validDays: c.winbackValidDays || 14
  };
});

exports.updateWinBackSettings = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { inactiveDays, discountPercent, validDays } = request.data || {};
  try {
    await db.collection('config').doc('automation').set({
      winbackInactiveDays: parseInt(inactiveDays, 10) || 30,
      winbackDiscountPercent: parseInt(discountPercent, 10) || 20,
      winbackValidDays: parseInt(validDays, 10) || 14
    }, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'UPDATE_WINBACK_SETTINGS', 'System', 'อัปเดตการตั้งค่า Win-back Campaign');
    return { success: true, message: '🟢 บันทึกการตั้งค่า Win-back Campaign สำเร็จแล้ว!' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.checkWinBackCampaign_ = onSchedule({ schedule: '0 10 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  try {
    const c = await getAutomationConfig_();
    if (!c.winbackEnabled) return;
    const inactiveDaysThreshold = c.winbackInactiveDays || 30;
    const discountPercent = c.winbackDiscountPercent || 20;
    const validDays = c.winbackValidDays || 14;

    const snap = await db.collection('members').where('status', '==', 'Inactive').get();
    let sentCount = 0;
    for (const doc of snap.docs) {
      const m = doc.data();
      if (!m.expiryDate) continue;
      const daysLeft = daysUntil_(m.expiryDate);
      if (daysLeft === null || daysLeft >= 0) continue;
      if (Math.abs(daysLeft) < inactiveDaysThreshold) continue;
      if ((m.winbackCouponCode || '').toString().trim()) continue;

      const lineUserId = (m.lineUserId || '').toString().trim();
      const email = (m.email || '').toString().trim();
      if (!lineUserId && !email) continue;

      const uniqueCode = 'COMEBACK' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const expiryDateStr = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await db.collection('coupons').doc(uniqueCode).set({
        discountType: 'Percent', discountValue: discountPercent, usageLimit: 1, usedCount: 0,
        expiryDate: expiryDateStr, minPurchaseAmount: 0, applicableTo: 'Membership', status: 'Active',
        description: `Win-back campaign สำหรับ ${m.fullName}`
      });

      const msgText = `🥺 เราคิดถึงคุณนะ ${m.fullName}!\n\nนานแล้วที่ไม่ได้เจอกัน กลับมาออกกำลังกายกับเราอีกครั้งไหม?\n\n🎁 รับส่วนลดพิเศษ ${discountPercent}% เมื่อกลับมาต่ออายุสมาชิกภาพ\nใช้โค้ด: ${uniqueCode}\nหมดเขต: ${expiryDateStr}\n\nแวะมาคุยกับเราได้เลยครับ!`;
      if (lineUserId) await sendLineMessage_(lineUserId, msgText);
      // Email delivery not configured (no email provider set up yet).

      await doc.ref.update({ winbackCouponCode: uniqueCode });
      sentCount++;
    }
    if (sentCount > 0) await logAudit_('SYSTEM (Auto)', 'WINBACK_CAMPAIGN', 'Members', `ส่งคูปอง Win-back ให้สมาชิก ${sentCount} คน`);
  } catch (e) {
    await logAudit_('SYSTEM (Auto)', 'WINBACK_CAMPAIGN_ERROR', 'Members', e.toString());
  }
});

// ---- Member LINE notifications (expiry + birthday) ----

exports.toggleMemberLineNotifications = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { enable } = request.data || {};
  try {
    await db.collection('config').doc('automation').set({ memberLineNotifyEnabled: !!enable }, { merge: true });
    if (enable) {
      await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ENABLE_MEMBER_LINE_NOTIFY', 'System', 'เปิดใช้งานแจ้งเตือนสมาชิกทาง LINE อัตโนมัติ (ใกล้หมดอายุ/วันเกิด)');
      return { success: true, message: '🟢 เปิดใช้งานแจ้งเตือนสมาชิกทาง LINE แล้ว! จะทำงานทุกวันช่วง 9 โมงเช้า' };
    }
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DISABLE_MEMBER_LINE_NOTIFY', 'System', 'ปิดใช้งานแจ้งเตือนสมาชิกทาง LINE อัตโนมัติ');
    return { success: true, message: 'ปิดใช้งานแจ้งเตือนสมาชิกทาง LINE แล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getMemberLineNotifySettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const c = await getAutomationConfig_();
  return { enabled: !!c.memberLineNotifyEnabled };
});

exports.checkMemberNotificationsLine_ = onSchedule({ schedule: '0 9 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  try {
    const c = await getAutomationConfig_();
    if (!c.memberLineNotifyEnabled) return;

    const snap = await db.collection('members').get();
    const today = new Date();
    const currentYear = today.getFullYear();
    let notifiedCount = 0;

    for (const doc of snap.docs) {
      const m = doc.data();
      const lineUserId = (m.lineUserId || '').toString().trim();
      if (!lineUserId) continue;

      if ((m.status || 'Active') === 'Active' && m.expiryDate) {
        const daysLeft = daysUntil_(m.expiryDate);
        const alreadyNotifiedFor = (m.expiryLineNotifiedFor || '').toString();
        if (daysLeft !== null && daysLeft >= 0 && daysLeft <= config.EXPIRY_ALERT_DAYS && alreadyNotifiedFor !== m.expiryDate) {
          await sendLineMessage_(lineUserId, `⚠️ แจ้งเตือนสมาชิกภาพใกล้หมดอายุ\n\nสวัสดีคุณ ${m.fullName}\nสมาชิกภาพของคุณจะหมดอายุในวันที่ ${m.expiryDate} (เหลืออีก ${daysLeft} วัน)\n\nแวะมาต่ออายุได้เลยที่ยิม หรือติดต่อแอดมินล่วงหน้าได้ครับ`);
          await doc.ref.update({ expiryLineNotifiedFor: m.expiryDate });
          notifiedCount++;
        }
      }

      if (m.dob && isBirthdayMonth_(m.dob)) {
        const dob = new Date(m.dob);
        if (!isNaN(dob.getTime()) && dob.getDate() === today.getDate()) {
          if (m.birthdayLineNotifiedYear !== currentYear) {
            const discSnap = await db.collection('config').doc('birthdayDiscount').get();
            const dType = discSnap.exists ? (discSnap.data().type || 'Percent') : 'Percent';
            const dValue = discSnap.exists ? (parseFloat(discSnap.data().value) || 5) : 5;
            const bdLabel = dType === 'Fixed' ? dValue.toLocaleString('th-TH') + ' บาท' : dValue + '%';
            await sendLineMessage_(lineUserId, `🎂 สุขสันต์วันเกิดค่ะ/ครับ คุณ ${m.fullName}!\n\nเป็นของขวัญวันเกิดจากเรา รับส่วนลด ${bdLabel} ทันทีเมื่อต่ออายุสมาชิกภายในเดือนนี้ 🎁\n\nแวะมาฉลองวันเกิดด้วยการออกกำลังกายกับเรานะครับ!`);
            await doc.ref.update({ birthdayLineNotifiedYear: currentYear });
            notifiedCount++;
          }
        }
      }
    }
    if (notifiedCount > 0) await logAudit_('SYSTEM (Auto)', 'MEMBER_LINE_NOTIFY', 'Members', `ส่งแจ้งเตือน LINE ให้สมาชิก ${notifiedCount} รายการ`);
  } catch (e) {
    await logAudit_('SYSTEM (Auto)', 'MEMBER_LINE_NOTIFY_ERROR', 'Members', e.toString());
  }
});
