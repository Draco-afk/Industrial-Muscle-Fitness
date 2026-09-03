// Aggregates every module's Cloud Functions exports. Mirrors the module
// breakdown in apps-script-source-refactored/ so functions stay easy to
// trace back to their Apps Script origin.
'use strict';
const { setGlobalOptions } = require('firebase-functions/v2');

// Run in the same region as Firestore (asia-southeast1), and next door to the
// gym itself. On the us-central1 default every call paid for two Pacific
// crossings — browser to the function, then the function to the database and
// back for each read — which put an ~800ms floor under even a trivial lookup
// like getProductList. Same region collapses that to a local hop.
//
// Changing this moves the HTTP endpoints too, so the fingerprint reader and
// the LINE webhook have to be pointed at the new asia-southeast1 URLs.
setGlobalOptions({ region: 'asia-southeast1' });

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
  ...require('./src/17_line'),
  ...require('./src/18_monthlybills'),
  ...require('./src/19_attendance')
};
