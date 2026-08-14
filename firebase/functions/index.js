// Aggregates every module's Cloud Functions exports. Mirrors the module
// breakdown in apps-script-source-refactored/ so functions stay easy to
// trace back to their Apps Script origin.
'use strict';

module.exports = {
  ...require('./src/01_auth'),
  ...require('./src/02_members'),
  ...require('./src/03_packages'),
  ...require('./src/04_trainers'),
  ...require('./src/05_bookings'),
  ...require('./src/06_coupons'),
  ...require('./src/07_products'),
  ...require('./src/08_payments'),
  ...require('./src/09_dailypos'),
  ...require('./src/10_receipts'),
  ...require('./src/11_reports'),
  ...require('./src/12_admins'),
  ...require('./src/13_paymentqr'),
  ...require('./src/14_automation'),
  ...require('./src/15_backup'),
  ...require('./src/16_fingerprint'),
  ...require('./src/17_line')
};
