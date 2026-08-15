// Verifies the reports page's backend: expenses (with payment method) reducing
// the right channel, manual per-day overrides, the overriddenDays comparison
// data, and the auto-clear that drops an override once a real bill lands.
'use strict';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'industrial-muscle-fitness';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';

let pass = 0, fail = 0;
function check(name, condition, detail) {
  if (condition) { console.log(`PASS  ${name}`); pass++; }
  else { console.log(`FAIL  ${name}${detail ? ' -- ' + detail : ''}`); fail++; }
}

async function call(name, data, idToken) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data })
  });
  return (await res.json()).result;
}

async function main() {
  const login = await call('loginAdmin', { user: 'admin', pass: 'test1234' });
  check('admin login works', login && login.success === true, JSON.stringify(login));

  const idToken = (await (await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: login.token, returnSecureToken: true }) }
  )).json()).idToken;

  const today = new Date().toISOString().slice(0, 10);
  const range = { startDateStr: today, endDateStr: today };

  // A real day-pass sale: 2 adults at 75 = 150, paid in cash.
  const sale = await call('processDailyPayment', {
    customerName: 'ลูกค้าทดสอบรายงาน', dayPassItems: [{ type: 'adult', qty: 2, price: 75 }], paymentMethod: 'cash'
  }, idToken);
  check('day-pass sale succeeds', sale && sale.success === true, JSON.stringify(sale));

  let rep = await call('getRevenueReport', range, idToken);
  const baseDayPass = rep.totals.dayPass;
  const baseCash = rep.totals.cash;
  check('sale lands in dayPass revenue', baseDayPass >= 150, `dayPass=${baseDayPass}`);

  // --- Expense paid by CASH should come out of cash, not transfer ---
  const cashExp = await call('addExpense', { dateStr: today, description: 'น้ำยาถูพื้น (ทดสอบเงินสด)', amount: 40, paymentMethod: 'cash' }, idToken);
  check('addExpense (cash) succeeds', cashExp && cashExp.success === true, JSON.stringify(cashExp));

  rep = await call('getRevenueReport', range, idToken);
  check('cash expense reduces cash total by 40', Math.abs((baseCash - 40) - rep.totals.cash) < 0.01, `before=${baseCash} after=${rep.totals.cash}`);
  check('cash expense counted in totals.expenses', rep.totals.expenses >= 40, `expenses=${rep.totals.expenses}`);
  const cashAfterCashExp = rep.totals.cash;
  const transferAfterCashExp = rep.totals.transfer;

  // --- Expense paid by TRANSFER should come out of transfer, leaving cash alone ---
  const trExp = await call('addExpense', { dateStr: today, description: 'สลิง 6มิล (ทดสอบโอน)', amount: 60, paymentMethod: 'transfer' }, idToken);
  check('addExpense (transfer) succeeds', trExp && trExp.success === true, JSON.stringify(trExp));

  rep = await call('getRevenueReport', range, idToken);
  check('transfer expense reduces transfer total by 60', Math.abs((transferAfterCashExp - 60) - rep.totals.transfer) < 0.01, `before=${transferAfterCashExp} after=${rep.totals.transfer}`);
  check('transfer expense leaves cash untouched', Math.abs(cashAfterCashExp - rep.totals.cash) < 0.01, `cash=${rep.totals.cash}`);

  const expenses = await call('getExpenseList', range, idToken);
  const cashRow = expenses.find((e) => e.description.indexOf('น้ำยาถูพื้น') !== -1);
  const trRow = expenses.find((e) => e.description.indexOf('สลิง 6มิล') !== -1);
  check('getExpenseList returns paymentMethod เงินสด', cashRow && cashRow.paymentMethod === 'เงินสด', JSON.stringify(cashRow));
  check('getExpenseList returns paymentMethod โอนเงิน', trRow && trRow.paymentMethod === 'โอนเงิน', JSON.stringify(trRow));

  // --- Manual override replaces the whole day's figures ---
  const ov = await call('setDailyRevenueOverride', {
    dateStr: today, membership: 1000, dayPass: 500, products: 250, cash: 900, transfer: 850
  }, idToken);
  check('setDailyRevenueOverride succeeds', ov && ov.success === true, JSON.stringify(ov));

  rep = await call('getRevenueReport', range, idToken);
  check('override replaces membership/dayPass/products', rep.totals.membership === 1000 && rep.totals.dayPass === 500 && rep.totals.products === 250,
    JSON.stringify(rep.totals));
  check('override day is flagged in breakdown', rep.breakdown.some((d) => d.date === today && d.cashTransferOverridden === true));

  const od = (rep.overriddenDays || []).find((d) => d.date === today);
  check('overriddenDays reports the day', !!od, JSON.stringify(rep.overriddenDays));
  check('overriddenDays shows hand-entered total', od && od.shownTotal === 1750, JSON.stringify(od));
  check('overriddenDays keeps the real bill total for comparison', od && od.autoTotal >= 150 && od.autoTotal !== od.shownTotal, JSON.stringify(od));
  check('overriddenDays records who edited it', od && !!od.updatedBy, JSON.stringify(od));

  // --- A new real bill must drop the override automatically ---
  const sale2 = await call('processDailyPayment', {
    customerName: 'ลูกค้าหลังแก้ยอด', dayPassItems: [{ type: 'adult', qty: 1, price: 75 }], paymentMethod: 'cash'
  }, idToken);
  check('second sale succeeds', sale2 && sale2.success === true, JSON.stringify(sale2));

  rep = await call('getRevenueReport', range, idToken);
  check('new bill auto-clears the manual override', !(rep.overriddenDays || []).some((d) => d.date === today),
    JSON.stringify(rep.overriddenDays));
  check('totals go back to real bills after auto-clear', rep.totals.membership !== 1000 && rep.totals.dayPass !== 500,
    JSON.stringify(rep.totals));

  // --- Manual revert path ---
  await call('setDailyRevenueOverride', { dateStr: today, membership: 5, dayPass: 5, products: 5, cash: 5, transfer: 5 }, idToken);
  rep = await call('getRevenueReport', range, idToken);
  check('override re-applied for revert test', (rep.overriddenDays || []).some((d) => d.date === today));

  const cleared = await call('clearDailyRevenueOverride', { dateStr: today }, idToken);
  check('clearDailyRevenueOverride succeeds', cleared && cleared.success === true, JSON.stringify(cleared));
  rep = await call('getRevenueReport', range, idToken);
  check('report drops the override after manual revert', !(rep.overriddenDays || []).some((d) => d.date === today));

  // --- Deleting an expense puts the money back in its channel ---
  const cashBeforeDelete = rep.totals.cash;
  const delRes = await call('deleteExpense', { docId: cashRow.docId }, idToken);
  check('deleteExpense succeeds', delRes && delRes.success === true, JSON.stringify(delRes));
  rep = await call('getRevenueReport', range, idToken);
  check('deleting the cash expense restores 40 to cash', Math.abs((cashBeforeDelete + 40) - rep.totals.cash) < 0.01,
    `before=${cashBeforeDelete} after=${rep.totals.cash}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
