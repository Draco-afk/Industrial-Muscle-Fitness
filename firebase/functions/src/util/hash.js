// Ported from apps-script-source-refactored/02_Auth_Session.js — hashPassword_.
// Node's crypto sha256 hex digest is byte-identical to the original
// Utilities.computeDigest(SHA_256) + hex-join, so hashes computed by the
// live Apps Script system remain valid after migration.
'use strict';
const crypto = require('crypto');

function hashPassword_(plainText) {
  return crypto.createHash('sha256').update(plainText, 'utf8').digest('hex');
}

module.exports = { hashPassword_ };
