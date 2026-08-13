// End-to-end verification against the running local emulator suite, per the
// migration plan's Verification section. Talks to the callable-functions
// HTTP protocol directly (no client SDK needed) and the Auth emulator's
// REST API to exchange a custom token for an ID token.
'use strict';

const FUNCTIONS_BASE = 'http://127.0.0.1:5001/demo-industrial-muscle/us-central1';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_HOST = 'localhost:8080';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.GCLOUD_PROJECT = 'demo-industrial-muscle';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-industrial-muscle' });
const db = admin.firestore();

let pass = 0, fail = 0;
function check(name, condition, detail) {
  if (condition) { console.log(`✅ PASS  ${name}`); pass++; }
  else { console.log(`❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function callFunction(name, data, idToken) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
    },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function signInWithCustomToken(customToken) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const json = await res.json();
  return json.idToken;
}

async function main() {
  // 1. loginMember success — known phone/PIN pair visible in data/members.csv pre-migration.
  const loginOk = await callFunction('loginMember', { phone: '0877740855', pin: '0001' });
  check('loginMember succeeds with correct phone+PIN', loginOk.body.result && loginOk.body.result.success === true && !!loginOk.body.result.token,
    JSON.stringify(loginOk.body));

  // 2. loginMember failure — wrong PIN, same phone.
  const loginBad = await callFunction('loginMember', { phone: '0877740855', pin: '9999' });
  check('loginMember fails with wrong PIN', loginBad.body.result && loginBad.body.result.success === false,
    JSON.stringify(loginBad.body));
  check('loginMember failure message matches original Thai copy',
    loginBad.body.result && loginBad.body.result.message === 'PIN 4 หลักไม่ถูกต้อง (รหัสเริ่มต้นคือ 1234)',
    loginBad.body.result && loginBad.body.result.message);

  // 3. Seed a throwaway test admin directly in Firestore (emulator-only, not real data),
  //    then loginAdmin -> exchange custom token -> call getMemberList as an authenticated admin.
  const crypto = require('crypto');
  const testPass = 'verify-test-pass-123';
  const passwordHash = crypto.createHash('sha256').update(testPass, 'utf8').digest('hex');
  await db.collection('admins').add({ username: 'verify-admin', passwordHash, role: 'Owner', email: 'test@example.com' });

  const adminLogin = await callFunction('loginAdmin', { user: 'verify-admin', pass: testPass });
  check('loginAdmin succeeds for seeded test admin', adminLogin.body.result && adminLogin.body.result.success === true,
    JSON.stringify(adminLogin.body));

  const adminIdToken = adminLogin.body.result && adminLogin.body.result.token
    ? await signInWithCustomToken(adminLogin.body.result.token)
    : null;
  check('custom token exchanges for a real ID token', !!adminIdToken);

  const memberList = await callFunction('getMemberList', {}, adminIdToken);
  check('getMemberList returns all 28 migrated members', Array.isArray(memberList.body.result) && memberList.body.result.length === 28,
    `got ${Array.isArray(memberList.body.result) ? memberList.body.result.length : JSON.stringify(memberList.body)}`);

  // 4. saveMemberData as the authenticated admin -> new member appears, pinHash set, no plaintext PIN field.
  const saveRes = await callFunction('saveMemberData', {
    fullName: 'ทดสอบ ระบบ Verify',
    phone: '0899999999',
    email: 'verify@example.com',
    package: 'Standard Monthly',
    startDate: '2026-08-13',
    expiryDate: '2026-09-13',
    pin: '4321'
  }, adminIdToken);
  check('saveMemberData succeeds', saveRes.body.result && saveRes.body.result.success === true, JSON.stringify(saveRes.body));

  const newDocId = saveRes.body.result && saveRes.body.result.memberDocId;
  if (newDocId) {
    const newDoc = await db.collection('members').doc(newDocId).get();
    const fields = Object.keys(newDoc.data() || {});
    check('new member has pinHash set', newDoc.exists && !!newDoc.data().pinHash);
    check('new member has NO plaintext pin field anywhere', !fields.some((f) => /^pin$|pincode|plainpin/i.test(f)),
      `fields: ${fields.join(', ')}`);
  } else {
    check('new member has pinHash set', false, 'no memberDocId returned');
    check('new member has NO plaintext pin field anywhere', false, 'no memberDocId returned');
  }

  const memberListAfter = await callFunction('getMemberList', {}, adminIdToken);
  check('getMemberList shows 29 members after saveMemberData', Array.isArray(memberListAfter.body.result) && memberListAfter.body.result.length === 29,
    `got ${Array.isArray(memberListAfter.body.result) ? memberListAfter.body.result.length : JSON.stringify(memberListAfter.body)}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
