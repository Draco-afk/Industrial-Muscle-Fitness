// Backup — ported from apps-script-source-refactored/15_Backup.js.
//
// Adaptation: the original copied the entire Google Sheet file via
// DriveApp.makeCopy(). The Firestore equivalent is a managed export to
// Cloud Storage (Firestore Admin API's exportDocuments), which is the
// standard GCP-native backup/restore mechanism — actually more robust than
// a spreadsheet copy (restorable via `gcloud firestore import`). Requires
// the Cloud Functions runtime service account to have the "Cloud Datastore
// Import Export Admin" IAM role (roles/datastore.importExportAdmin).
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { GoogleAuth } = require('google-auth-library');
const { db, bucket, FieldValue } = require('./util/admin');
const { requireAuth, authOrNull } = require('./util/authGuard');
const { logAudit_ } = require('./util/auditLog');

const BACKUP_HANDLER_FN_ = 'createFullBackupAuto';

async function exportFirestoreBackup_(labelPrefix) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const projectId = await auth.getProjectId();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPrefix = `gs://${bucket.name}/firestore-backups/${labelPrefix}-${timestamp}`;

  const res = await client.request({
    url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`,
    method: 'POST',
    data: { outputUriPrefix: outputPrefix }
  });

  return { outputPrefix, operationName: res.data.name };
}

exports.createFullBackup = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  try {
    const { outputPrefix } = await exportFirestoreBackup_('manual');
    await db.collection('config').doc('backup').set({ lastBackupAt: FieldValue.serverTimestamp() }, { merge: true });
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'CREATE_BACKUP', 'System', `สร้างไฟล์สำรองข้อมูล: ${outputPrefix}`);
    return { success: true, message: '🟢 สร้างไฟล์สำรองข้อมูลสำเร็จ!', backupPath: outputPrefix };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.clearTransactionData = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { confirmPhrase } = request.data || {};
  try {
    if ((confirmPhrase || '').toString().trim() !== 'ลบข้อมูลถาวร') {
      return { success: false, message: 'ข้อความยืนยันไม่ถูกต้อง กรุณาพิมพ์ "ลบข้อมูลถาวร" ให้ตรงตัวเป๊ะๆ' };
    }

    const { outputPrefix } = await exportFirestoreBackup_('before-clear');
    await db.collection('config').doc('backup').set({ lastBackupAt: FieldValue.serverTimestamp() }, { merge: true });

    const clearedSheets = [];
    for (const [collName, label] of [['payments', 'ประวัติชำระเงินสมาชิก'], ['dailyPayments', 'ประวัติลูกค้ารายวัน/ขายสินค้า']]) {
      const snap = await db.collection(collName).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      clearedSheets.push(`${label} (${snap.size} รายการ)`);
    }

    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'CLEAR_TRANSACTION_DATA', 'System',
      `⚠️ ล้างข้อมูลการซื้อขายทั้งหมดถาวร: ${clearedSheets.join(', ') || 'ไม่มีข้อมูลให้ลบ'} (สำรองไว้ที่: ${outputPrefix})`);

    return {
      success: true,
      message: clearedSheets.length > 0
        ? `🟢 ล้างข้อมูลการซื้อขายเรียบร้อยแล้ว: ${clearedSheets.join(', ')}\n\n📁 สำรองข้อมูลไว้ก่อนลบแล้วที่: "${outputPrefix}"`
        : 'ไม่มีข้อมูลการซื้อขายให้ล้าง (สำรองข้อมูลไว้แล้วเผื่อไว้)',
      backupPath: outputPrefix
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

exports.getBackupSettings = onCall(async (request) => {
  requireAuth(request, 'admin');
  const snap = await db.collection('config').doc('backup').get();
  const d = snap.exists ? snap.data() : {};
  return {
    enabled: !!d.weeklyBackupEnabled,
    lastBackupAt: d.lastBackupAt ? d.lastBackupAt.toDate().toISOString() : ''
  };
});

exports.toggleWeeklyBackup = onCall(async (request) => {
  const authCtx = authOrNull(request, 'admin');
  if (!authCtx) return { success: false, message: 'Session หมดอายุ กรุณา Login ใหม่' };
  const { enable } = request.data || {};
  try {
    await db.collection('config').doc('backup').set({ weeklyBackupEnabled: !!enable }, { merge: true });
    if (enable) {
      await logAudit_(authCtx.token.adminRole || authCtx.uid, 'ENABLE_WEEKLY_BACKUP', 'System', 'เปิดใช้งานสำรองข้อมูลอัตโนมัติทุกสัปดาห์');
      return { success: true, message: '🟢 เปิดใช้งานสำรองข้อมูลอัตโนมัติแล้ว! จะสำรองให้ทุกวันอาทิตย์ช่วงตี 3' };
    }
    await logAudit_(authCtx.token.adminRole || authCtx.uid, 'DISABLE_WEEKLY_BACKUP', 'System', 'ปิดใช้งานสำรองข้อมูลอัตโนมัติทุกสัปดาห์');
    return { success: true, message: 'ปิดใช้งานสำรองข้อมูลอัตโนมัติแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// Same "always runs, checks a Firestore flag" pattern as 14_automation.js —
// see the note there about why dynamic Cloud Scheduler toggling isn't used.
exports[BACKUP_HANDLER_FN_] = onSchedule({ schedule: '0 3 * * 0', timeZone: 'Asia/Bangkok' }, async () => {
  try {
    const snap = await db.collection('config').doc('backup').get();
    if (!snap.exists || !snap.data().weeklyBackupEnabled) return;
    const { outputPrefix } = await exportFirestoreBackup_('auto-weekly');
    await db.collection('config').doc('backup').set({ lastBackupAt: FieldValue.serverTimestamp() }, { merge: true });
    await logAudit_('SYSTEM (Auto)', 'AUTO_BACKUP', 'System', `สร้างไฟล์สำรองข้อมูลอัตโนมัติ: ${outputPrefix}`);
  } catch (e) {
    await logAudit_('SYSTEM (Auto)', 'AUTO_BACKUP_ERROR', 'System', e.toString());
  }
});
