// Replaces validateSession/validateMemberSession/validateTrainerSession from
// apps-script-source-refactored/02_Auth_Session.js. Those checked an opaque
// CacheService token passed explicitly by the client; here the Firebase
// client SDK attaches a verified ID token automatically, and Cloud Functions
// exposes it as request.auth with our custom claims already decoded.
'use strict';
const { HttpsError } = require('firebase-functions/v2/https');

const SESSION_EXPIRED_MSG = 'Session หมดอายุ กรุณา Login ใหม่';

// Throws — matches original "get*" functions that did `throw new Error(...)`
// on an invalid session (getMemberList, getMemberProfile, etc.).
function requireAuth(request, role) {
  if (!request.auth) throw new HttpsError('unauthenticated', SESSION_EXPIRED_MSG);
  if (role && request.auth.token.role !== role) throw new HttpsError('permission-denied', SESSION_EXPIRED_MSG);
  return request.auth;
}

// Returns null instead of throwing — matches original "action" functions
// (saveMemberData, changeMemberPin, manualCheckIn, etc.) that returned
// { success: false, message: SESSION_EXPIRED_MSG } instead of throwing.
function authOrNull(request, role) {
  if (!request.auth) return null;
  if (role && request.auth.token.role !== role) return null;
  return request.auth;
}

module.exports = { requireAuth, authOrNull, SESSION_EXPIRED_MSG };
