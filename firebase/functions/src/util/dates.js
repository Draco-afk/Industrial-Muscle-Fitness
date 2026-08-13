// Date helpers ported byte-for-byte (logic-wise) from
// apps-script-source-refactored/05_Packages.js (daysUntil_) and
// apps-script-source-refactored/06_Members.js (isBirthdayMonth_).
// Dates are stored in Firestore as "yyyy-MM-dd" strings (matching what the
// original already formatted for the client), so these accept strings or Date.
'use strict';

function daysUntil_(dateVal) {
  if (!dateVal) return null;
  const expDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(expDate.getTime())) return null;
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expMid = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  return Math.round((expMid - todayMid) / (1000 * 60 * 60 * 24));
}

function isBirthdayMonth_(dobValue) {
  if (!dobValue) return false;
  const dob = dobValue instanceof Date ? dobValue : new Date(dobValue);
  if (isNaN(dob.getTime())) return false;
  const now = new Date();
  return dob.getMonth() === now.getMonth();
}

module.exports = { daysUntil_, isBirthdayMonth_ };
