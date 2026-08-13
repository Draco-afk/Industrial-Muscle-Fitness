// Aggregates every module's Cloud Functions exports. Mirrors the module
// breakdown in apps-script-source-refactored/ so functions stay easy to
// trace back to their Apps Script origin.
'use strict';

module.exports = {
  ...require('./src/01_auth'),
  ...require('./src/02_members'),
  ...require('./src/03_packages'),
  ...require('./src/04_trainers'),
  ...require('./src/05_bookings')
};
