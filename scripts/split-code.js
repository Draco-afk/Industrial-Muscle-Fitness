// One-time build script: splits the monolithic Code.js into feature modules
// under apps-script-source-refactored/. Uses acorn to get exact source
// positions for every top-level declaration so no code is retyped by hand.
'use strict';
const acorn = require('acorn');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps-script-source', 'Code.js');
const OUT_DIR = path.join(__dirname, '..', 'apps-script-source-refactored');

const src = fs.readFileSync(SRC, 'utf8');
const comments = [];
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', onComment: comments, locations: true });

// Map function name -> module file (must cover every FunctionDeclaration in Code.js)
const MODULES = {
  '01_Routing.js': ['doGet', 'getScriptUrl'],
  '02_Auth_Session.js': [
    'checkRateLimit_', 'recordFailedAttempt_', 'clearFailedAttempts_',
    'createSession', 'validateSession', 'destroySession',
    'createMemberSession_', 'validateMemberSession', 'logoutMember', 'checkMemberTokenValid',
    'createTrainerSession_', 'validateTrainerSession', 'logoutTrainer', 'checkTrainerTokenValid',
    'hashPassword_', 'loginAdmin', 'logoutAdmin', 'loginMember', 'loginTrainer',
    'changeMemberPin', 'changeTrainerPin', 'resetTrainerPin'
  ],
  '03_Admins.js': [
    'getAdminList', 'addAdminData', 'deleteAdminData',
    'requestAdminPasswordReset', 'checkResetTokenValid', 'resetAdminPassword'
  ],
  '04_AuditLog.js': ['logAudit_', 'getAuditLog'],
  '05_Packages.js': [
    'ensurePackageSheet_', 'getPackageMap_', 'getPackageList', 'addPackageData',
    'updatePackageData', 'deletePackageData', 'daysUntil_',
    'getDailyPassPrices', 'updateDailyPassPrices'
  ],
  '06_Members.js': [
    'saveMemberData', 'updateMemberData', 'deleteMemberData', 'getMemberList',
    'getBirthdayDiscountSettings', 'updateBirthdayDiscountSettings', 'computeBirthdayDiscount_',
    'isBirthdayMonth_', 'getMemberFullHistory', 'getCheckInLeaderboard', 'manualCheckIn',
    'getMemberProfile', 'generateReferralCode_', 'getExpiringMembers', 'getBirthdayMembersThisMonth'
  ],
  '07_Trainers.js': [
    'getTrainerOwnProfile', 'updateTrainerOwnEmail', 'setTrainerBusyStatus', 'adminSetTrainerBusyStatus',
    'getTrainerOwnBookings', 'trainerUpdateBookingStatus', 'updateTrainerOwnProfile',
    'uploadTrainerPhotoSelf', 'deleteTrainerPhotoSelf', 'deleteTrainerPhoto', 'uploadTrainerPhoto',
    'getTrainerList', 'addTrainerData', 'updateTrainerData', 'deleteTrainerData', 'ensureTrainerSheet_'
  ],
  '08_Payments_Membership.js': [
    'getNextReceiptNumber_', 'ensurePaymentSheet_', 'processRenewalPayment',
    'getPaymentLogs', 'updatePaymentMethod', 'voidMembershipPayment'
  ],
  '09_Coupons.js': [
    'ensureCouponSheet_', 'getCouponList', 'addCouponData', 'updateCouponData', 'deleteCouponData',
    'validateCoupon_', 'applyCouponUsage_', 'previewCouponDiscount', 'broadcastLineToMembers_'
  ],
  '10_Products.js': [
    'ensureProductSheet_', 'getProductList', 'addProductData', 'updateProductData',
    'adjustProductStock', 'getLowStockProducts', 'deleteProductData'
  ],
  '11_DailyPOS.js': [
    'ensureDailySheet_', 'ensureExpenseSheet_', 'ensureCashTransferOverrideSheet_',
    'setDailyRevenueOverride', 'clearDailyRevenueOverride', 'addExpense', 'getExpenseList', 'deleteExpense',
    'processDailyPayment', 'getDailyPaymentLogs', 'updateDailyPaymentMethod', 'voidDailyPayment',
    'deleteDailyPaymentLog', 'isDayPassItemName_', 'isMembershipItemName_', 'isTrainerFeeItemName_'
  ],
  '12_Receipts_PDF.js': [
    'buildThermalReceiptHtml_', 'generateDailyReceiptPDF', 'generatePDFReport',
    'exportRevenueReportPDF', 'exportMembersPDF', 'exportPaymentsPDF', 'exportDailyPaymentsPDF',
    'generateReceiptPDF'
  ],
  '13_Reports_Dashboard.js': ['getMonthlyStats', 'getRevenueReport', 'getDashboardStats', 'getLatestCheckIn'],
  '14_Automation.js': [
    'getAutoExpireSettings', 'isAutoExpireTriggerInstalled_', 'toggleAutoExpireTrigger', 'autoExpireMembers',
    'toggleWinBackCampaign', 'getWinBackSettings', 'updateWinBackSettings', 'checkWinBackCampaign_',
    'toggleMemberLineNotifications', 'getMemberLineNotifySettings', 'checkMemberNotificationsLine_'
  ],
  '15_Backup.js': ['createFullBackup', 'clearTransactionData', 'getBackupSettings', 'toggleWeeklyBackup', 'createFullBackupAuto'],
  '16_WebhookApi.js': ['doPost'],
  '17_Fingerprint.js': [
    'buildFingerprintCache_', 'getFingerprintRowMap_', 'invalidateFingerprintCache_',
    'requestFingerprintEnrollment', 'cancelFingerprintEnrollmentRequest', 'getEnrollmentStatus',
    'handleEnrollmentAction_'
  ],
  '18_LineIntegration.js': [
    'testSendLineMessageToTrainer', 'notifyTrainerNewBooking_', 'getLineSettings', 'updateLineSettings',
    'sendLineMessage_', 'replyLineMessage_', 'generateTrainerLineLinkCode', 'generateMyLineLinkCode',
    'getLineAddFriendUrlForTrainer', 'unlinkMyLine', 'generateMyMemberLineLinkCode',
    'getLineAddFriendUrlForMember', 'unlinkMyMemberLine', 'tryLinkMemberLineAccount_',
    'tryLinkTrainerLineAccount_', 'handleLineWebhook_'
  ],
  '19_PaymentQR.js': ['uploadPaymentQR', 'getPaymentQRInfo', 'updatePaymentQRCaption'],
  '21_Diagnostics.js': ['testMailAuth'],
  '20_Bookings.js': [
    'ensureBookingSheet_', 'ensureWaitlistSheet_', 'joinWaitlist', 'getMyWaitlist', 'cancelMyWaitlistEntry',
    'notifyNextWaitlistPerson_', 'generateTimeSlots_', 'timeStrToMinutes_', 'minutesToTimeStr_',
    'normalizeTimeValue_', 'getAvailableTrainers', 'computeAvailableSlots_', 'getTrainerAvailableSlots',
    'getTrainerAvailableSlotsAdmin', 'createBookingRecord_', 'bookTrainerSlot', 'adminBookTrainerSlot',
    'getMyBookings', 'cancelMyBooking', 'getAllBookings', 'getTrainerScheduleByDate', 'updateBookingStatus'
  ]
};

const nameToModule = {};
for (const [file, names] of Object.entries(MODULES)) {
  for (const n of names) {
    if (nameToModule[n]) throw new Error(`Duplicate mapping for ${n}`);
    nameToModule[n] = file;
  }
}

// Sort comments by start pos for lookup
comments.sort((a, b) => a.start - b.start);

function leadingCommentBlock(nodeStart) {
  // Walk backwards through comments immediately preceding this node (no blank-line gap > 1 line, and not shared with a previous node)
  let idx = comments.length - 1;
  let blockStart = nodeStart;
  let collected = [];
  while (idx >= 0 && comments[idx].end <= blockStart) {
    const c = comments[idx];
    const gap = src.slice(c.end, blockStart);
    if (gap.split('\n').length > 3) break; // more than blank line gap -> not directly attached
    collected.unshift(c);
    blockStart = c.start;
    idx--;
  }
  return collected.length ? src.slice(collected[0].start, nodeStart) : '';
}

const buckets = {};
for (const file of Object.keys(MODULES)) buckets[file] = [];

const topVarDecls = [];
const unhandled = [];

for (const node of ast.body) {
  if (node.type === 'FunctionDeclaration') {
    const name = node.id.name;
    const file = nameToModule[name];
    if (!file) { unhandled.push(name); continue; }
    const leading = leadingCommentBlock(node.start);
    const text = leading + src.slice(node.start, node.end) + '\n';
    buckets[file].push(text);
  } else if (node.type === 'VariableDeclaration') {
    const leading = leadingCommentBlock(node.start);
    topVarDecls.push(leading + src.slice(node.start, node.end) + '\n');
  } else {
    unhandled.push(`(${node.type} at ${node.start})`);
  }
}

if (unhandled.length) {
  console.error('UNHANDLED top-level nodes, aborting:', unhandled);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// 00_Config.js
fs.writeFileSync(
  path.join(OUT_DIR, '00_Config.js'),
  '// Global configuration constants used across all modules.\n' +
  '// Apps Script concatenates all .js files into one global scope at runtime,\n' +
  "// so these are available everywhere without an explicit import.\n\n" +
  topVarDecls.join('\n')
);

for (const [file, parts] of Object.entries(MODULES)) {
  const header = `// ${file.replace(/^\d+_/, '').replace(/\.js$/, '').replace(/_/g, ' ')} — extracted from the original monolithic Code.js\n\n`;
  fs.writeFileSync(path.join(OUT_DIR, file), header + buckets[file].join('\n'));
}

console.log('Done. Wrote', Object.keys(MODULES).length + 1, 'files to', OUT_DIR);
console.log('Total functions placed:', Object.values(buckets).reduce((s, a) => s + a.length, 0));
console.log('Total top-level var decls placed:', topVarDecls.length);
