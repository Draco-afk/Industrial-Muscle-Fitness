// Ported from apps-script-source-refactored/04_AuditLog.js — logAudit_.
// Fire-and-forget, swallows errors exactly like the original (a failed audit
// write must never fail the calling operation).
'use strict';
const { db, FieldValue } = require('./admin');

async function logAudit_(user, action, target, details) {
  try {
    await db.collection('auditLog').add({
      timestamp: FieldValue.serverTimestamp(),
      user,
      action,
      target,
      details: details || ''
    });
  } catch (e) { /* ignore, matches original try/catch(e){} */ }
}

module.exports = { logAudit_ };
