// Global configuration constants — ported from
// apps-script-source-refactored/00_Config.js. SESSION_DURATION_SEC /
// MEMBER_SESSION_DURATION_SEC / TRAINER_SESSION_DURATION_SEC are kept for
// reference but are no longer enforced manually: Firebase Auth ID tokens
// manage their own refresh lifecycle client-side.
'use strict';

module.exports = {
  DEFAULT_DAILY_PRICE_STUDENT: 30,
  DEFAULT_DAILY_PRICE_ADULT: 50,
  EXPIRY_ALERT_DAYS: 7,
  SESSION_DURATION_SEC: 6 * 60 * 60,
  MEMBER_SESSION_DURATION_SEC: 24 * 60 * 60,
  TRAINER_SESSION_DURATION_SEC: 12 * 60 * 60,
  GYM_INFO: {
    name: 'INDUSTRIAL MUSCLE GYM',
    address: '678/13 ถ.เจ้าเงาะ ต.ในเมือง อ.บ้านไผ่ จ.ขอนแก่น 40110',
    taxId: '-',
    phone: '095-289-5441'
  },
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCK_DURATION_SEC: 15 * 60,
  REFERRAL_NEW_MEMBER_BONUS_DAYS: 3,
  REFERRAL_REFERRER_BONUS_DAYS: 7,
  DEFAULT_AUTO_INACTIVE_GRACE_DAYS: 3,
  FINGERPRINT_CACHE_KEY_: 'fingerprintRowMap',
  TRAINER_DAY_MAP_: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};
