// Global configuration constants used across all modules.
// Apps Script concatenates all .js files into one global scope at runtime,
// so these are available everywhere without an explicit import.

var DEFAULT_DAILY_PRICE_STUDENT = 30;

var DEFAULT_DAILY_PRICE_ADULT = 50;

var EXPIRY_ALERT_DAYS = 7;

var SESSION_DURATION_SEC = 6 * 60 * 60;

var MEMBER_SESSION_DURATION_SEC = 24 * 60 * 60;

var TRAINER_SESSION_DURATION_SEC = 12 * 60 * 60;

var GYM_INFO = {
  name: "INDUSTRIAL MUSCLE GYM",
  address: "678/13 ถ.เจ้าเงาะ ต.ในเมือง อ.บ้านไผ่ จ.ขอนแก่น 40110",
  taxId: "-",
  phone: "095-289-5441"
};

var MAX_LOGIN_ATTEMPTS = 5;

var LOGIN_LOCK_DURATION_SEC = 15 * 60;

var REFERRAL_NEW_MEMBER_BONUS_DAYS = 3;

var REFERRAL_REFERRER_BONUS_DAYS = 7;

var DEFAULT_AUTO_INACTIVE_GRACE_DAYS = 3;

var AUTO_EXPIRE_HANDLER_FN_ = 'autoExpireMembers';

var WINBACK_HANDLER_FN_ = 'checkWinBackCampaign_';

var MEMBER_LINE_NOTIFY_HANDLER_FN_ = 'checkMemberNotificationsLine_';

var FINGERPRINT_CACHE_KEY_ = 'fingerprintRowMap';

var TRAINER_DAY_MAP_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
