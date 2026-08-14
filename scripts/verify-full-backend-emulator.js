// End-to-end verification for Coupons, Products, Payments, DailyPOS,
// Reports, Admins, PaymentQR, and Automation settings against the running
// local emulator suite.
'use strict';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'industrial-muscle-fitness';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;
const admin = require('firebase-admin');
admin.initializeApp({ projectId: PROJECT_ID });

let pass = 0, fail = 0;
function check(name, condition, detail) {
  if (condition) { console.log(`✅ PASS  ${name}`); pass++; }
  else { console.log(`❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function callFunction(name, data, idToken) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data })
  });
  return res.json();
}

async function signInWithCustomToken(customToken) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  return (await res.json()).idToken;
}

async function main() {
  const adminLogin = await callFunction('loginAdmin', { user: 'admin', pass: 'test1234' });
  check('admin login works', adminLogin.result?.success === true, JSON.stringify(adminLogin));
  const adminIdToken = await signInWithCustomToken(adminLogin.result.token);

  const memberList = await callFunction('getMemberList', {}, adminIdToken);
  const testMember = memberList.result[0];
  check('have a member to test against', !!testMember);

  // --- Coupons ---
  const couponCode = 'TESTCOUPON' + Date.now();
  const addCoupon = await callFunction('addCouponData', { code: couponCode, discountType: 'Percent', discountValue: 10, applicableTo: 'daily' }, adminIdToken);
  check('addCouponData succeeds', addCoupon.result?.success === true, JSON.stringify(addCoupon));
  const preview = await callFunction('previewCouponDiscount', { code: couponCode, amount: 100, scope: 'daily' }, adminIdToken);
  check('previewCouponDiscount computes 10% off 100 correctly', preview.result?.valid === true && preview.result.discountAmount === 10, JSON.stringify(preview));

  // --- Products ---
  const addProduct = await callFunction('addProductData', { name: 'น้ำดื่ม Test', price: 10, stock: 5 }, adminIdToken);
  check('addProductData succeeds', addProduct.result?.success === true, JSON.stringify(addProduct));
  const products = await callFunction('getProductList', {}, adminIdToken);
  const testProduct = products.result.find((p) => p.name === 'น้ำดื่ม Test');
  check('new product appears in getProductList with stock 5', testProduct?.stock === 5, JSON.stringify(testProduct));

  // --- DailyPOS: buy 2 water bottles, check stock decremented ---
  const posRes = await callFunction('processDailyPayment', {
    customerName: 'ลูกค้าทดสอบ POS', dayPassItems: [{ type: 'adult', qty: 1 }],
    items: [{ name: 'น้ำดื่ม Test', price: 10, qty: 2 }], paymentMethod: 'cash'
  }, adminIdToken);
  check('processDailyPayment succeeds', posRes.result?.success === true, JSON.stringify(posRes));

  const productsAfter = await callFunction('getProductList', {}, adminIdToken);
  const testProductAfter = productsAfter.result.find((p) => p.name === 'น้ำดื่ม Test');
  check('stock decremented by 2 after sale', testProductAfter?.stock === 3, JSON.stringify(testProductAfter));

  const dailyLogs = await callFunction('getDailyPaymentLogs', {}, adminIdToken);
  check('sale appears in getDailyPaymentLogs', dailyLogs.result?.some((l) => l.receiptNo === posRes.result.receiptNo), JSON.stringify(dailyLogs.result?.length));

  // --- Membership renewal payment ---
  const addPkg = await callFunction('addPackageData', { name: 'TestPkg' + Date.now(), price: 500, durationMonths: 1 }, adminIdToken);
  const pkgName = addPkg.result.success ? (await callFunction('getPackageList', {}, adminIdToken)).result.slice(-1)[0].name : null;
  const renewRes = await callFunction('processRenewalPayment', {
    memberDocId: testMember.docId, package: pkgName, qrData: 'QR-TEST-' + Date.now(), paymentMethod: 'cash'
  }, adminIdToken);
  check('processRenewalPayment succeeds', renewRes.result?.success === true, JSON.stringify(renewRes));

  const paymentLogs = await callFunction('getPaymentLogs', {}, adminIdToken);
  check('renewal appears in getPaymentLogs', paymentLogs.result?.some((p) => p.receiptNo === renewRes.result.receiptNo), JSON.stringify(paymentLogs.result?.length));

  const voidRes = await callFunction('voidMembershipPayment', { receiptNo: renewRes.result.receiptNo, reason: 'test void' }, adminIdToken);
  check('voidMembershipPayment succeeds', voidRes.result?.success === true, JSON.stringify(voidRes));

  // --- Reports ---
  const today = new Date().toISOString().slice(0, 10);
  const report = await callFunction('getRevenueReport', { startDateStr: today, endDateStr: today }, adminIdToken);
  check('getRevenueReport returns today with dayPass/products > 0', report.result?.totals?.dayPass > 0 && report.result?.totals?.products > 0, JSON.stringify(report.result?.totals));

  const dashboard = await callFunction('getDashboardStats', {}, adminIdToken);
  check('getDashboardStats returns member counts', dashboard.result?.total === memberList.result.length, JSON.stringify(dashboard.result));

  // --- Admins CRUD ---
  const newAdminUser = 'testadmin' + Date.now();
  const addAdmin = await callFunction('addAdminData', { user: newAdminUser, pass: 'somepass123', role: 'Staff' }, adminIdToken);
  check('addAdminData succeeds', addAdmin.result?.success === true, JSON.stringify(addAdmin));
  const adminList = await callFunction('getAdminList', {}, adminIdToken);
  check('new admin appears in getAdminList', adminList.result?.some((a) => a.user === newAdminUser), JSON.stringify(adminList.result?.length));
  const deleteAdmin = await callFunction('deleteAdminData', { username: newAdminUser }, adminIdToken);
  check('deleteAdminData succeeds', deleteAdmin.result?.success === true, JSON.stringify(deleteAdmin));

  // --- Automation settings toggles ---
  const toggleAutoExpire = await callFunction('toggleAutoExpireTrigger', { enable: true, graceDays: 5 }, adminIdToken);
  check('toggleAutoExpireTrigger succeeds', toggleAutoExpire.result?.success === true, JSON.stringify(toggleAutoExpire));
  const autoExpireSettings = await callFunction('getAutoExpireSettings', {}, adminIdToken);
  check('getAutoExpireSettings reflects enabled + graceDays', autoExpireSettings.result?.enabled === true && autoExpireSettings.result?.graceDays === 5, JSON.stringify(autoExpireSettings.result));

  // --- Audit log ---
  const audit = await callFunction('getAuditLog', {}, adminIdToken);
  check('getAuditLog returns entries', Array.isArray(audit.result) && audit.result.length > 0, JSON.stringify(audit.result?.length));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
