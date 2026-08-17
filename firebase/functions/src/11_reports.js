// Reports / Dashboard — ported from
// apps-script-source-refactored/13_Reports_Dashboard.js. Reads the full
// payments/dailyPayments/expenses/overrides collections and aggregates
// in-memory, same approach as the original's full-sheet scans (fine at this
// gym's data volume).
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth } = require('./util/authGuard');
const { daysUntil_ } = require('./util/dates');
const config = require('./00_config');

function isDayPassItemName_(n) { return (n || '').toString().indexOf('ค่าเข้าใช้บริการฟิตเนสรายวัน') !== -1; }
function isMembershipItemName_(n) { return (n || '').toString().indexOf('สมัครสมาชิกรายเดือน') !== -1; }
function isTrainerFeeItemName_(n) { return (n || '').toString().indexOf('ค่าเทรนเนอร์:') !== -1; }
// Coupon / manual discounts are stored as negative-price line items. They only
// ever apply to the day-pass subtotal (enforced in processDailyPayment), so
// they have to be booked against day-pass revenue. Without this they fall into
// the products catch-all below and show up as negative product revenue — and
// as bogus entries in the top-products list.
function isDiscountItemName_(n) { return (n || '').toString().indexOf('ส่วนลด') !== -1; }

// The gym is in Thailand, which has no DST, so a fixed offset is exact.
const GYM_UTC_OFFSET = '+07:00';
const GYM_OFFSET_MS = 7 * 60 * 60 * 1000;

// Which gym-day a timestamp belongs to.
function gymDayKey_(date) {
  return new Date(date.getTime() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}

exports.getMonthlyStats = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const monthsBack = 6;
    const now = new Date();
    const buckets = [];
    const keyIndex = {};
    for (let m = monthsBack - 1; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const bucket = { key, label, newMembers: 0, revenue: 0 };
      buckets.push(bucket);
      keyIndex[key] = bucket;
    }

    const memberSnap = await db.collection('members').get();
    memberSnap.forEach((doc) => {
      const startRaw = doc.data().startDate;
      if (!startRaw) return;
      const key = startRaw.slice(0, 7);
      if (keyIndex[key]) keyIndex[key].newMembers++;
    });

    const paySnap = await db.collection('payments').get();
    paySnap.forEach((doc) => {
      const p = doc.data();
      if (!p.timestamp || p.refundStatus === 'Refunded') return;
      const key = p.timestamp.toDate().toISOString().slice(0, 7);
      if (keyIndex[key]) keyIndex[key].revenue += p.amount || 0;
    });

    const dailySnap = await db.collection('dailyPayments').get();
    dailySnap.forEach((doc) => {
      const d = doc.data();
      if (!d.timestamp || d.refundStatus === 'Refunded') return;
      const key = d.timestamp.toDate().toISOString().slice(0, 7);
      if (keyIndex[key]) keyIndex[key].revenue += d.amount || 0;
    });

    return buckets;
  } catch (e) {
    return [];
  }
});

async function getRevenueReportCore_(startDateStr, endDateStr) {
  // A "day" means a day at the gym, in Bangkok time — not UTC, which is what
  // Cloud Functions runs in. Without this a 9am sale lands in the report a day
  // early once the servers' date rolls over ahead of the shop's, and a day the
  // admin typed in by hand never matches the bucket it belongs to.
  const startDate = new Date(`${startDateStr}T00:00:00${GYM_UTC_OFFSET}`);
  const endDate = new Date(`${endDateStr}T23:59:59.999${GYM_UTC_OFFSET}`);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
    throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  }

  const dailyBuckets = {};
  const orderedKeys = [];
  // Walk the date strings themselves so the run of days can't drift with the
  // server's own timezone.
  const cursor = new Date(`${startDateStr}T00:00:00Z`);
  const lastDay = new Date(`${endDateStr}T00:00:00Z`);
  while (cursor <= lastDay) {
    const key = cursor.toISOString().slice(0, 10);
    dailyBuckets[key] = { date: key, membership: 0, dayPass: 0, products: 0, membershipCount: 0, dailyTxnCount: 0, expenses: 0, cash: 0, transfer: 0 };
    orderedKeys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let totalMembership = 0, totalDayPass = 0, totalProducts = 0, totalTrainerFees = 0, totalExpenses = 0, totalCash = 0, totalTransfer = 0;
  let membershipTxnCount = 0, dailyTxnCount = 0;
  const productRevenueMap = {};
  const trainerFeeMap = {};

  // 1) Membership renewals/signups — payments collection.
  const paySnap = await db.collection('payments').get();
  paySnap.forEach((doc) => {
    const p = doc.data();
    if (!p.timestamp || p.refundStatus === 'Refunded') return;
    const pDate = p.timestamp.toDate();
    if (pDate < startDate || pDate > endDate) return;
    const pKey = gymDayKey_(pDate);
    const pAmount = p.amount || 0;
    totalMembership += pAmount;
    membershipTxnCount++;
    if (dailyBuckets[pKey]) { dailyBuckets[pKey].membership += pAmount; dailyBuckets[pKey].membershipCount++; }
    if ((p.paymentMethod || 'เงินสด') === 'โอนเงิน') {
      totalTransfer += pAmount;
      if (dailyBuckets[pKey]) dailyBuckets[pKey].transfer += pAmount;
    } else {
      totalCash += pAmount;
      if (dailyBuckets[pKey]) dailyBuckets[pKey].cash += pAmount;
    }
  });

  // 2) Daily customers + product sales — dailyPayments collection.
  const dailySnap = await db.collection('dailyPayments').get();
  dailySnap.forEach((doc) => {
    const d = doc.data();
    if (!d.timestamp || d.refundStatus === 'Refunded') return;
    const dDate = d.timestamp.toDate();
    if (dDate < startDate || dDate > endDate) return;
    const dKey = gymDayKey_(dDate);

    let dItems = [];
    try { dItems = d.itemsJson ? JSON.parse(d.itemsJson) : []; } catch (e2) { dItems = []; }
    if (dItems.length === 0) dItems = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', price: d.amount || 0, qty: 1 }];

    dailyTxnCount++;
    if (dailyBuckets[dKey]) dailyBuckets[dKey].dailyTxnCount++;

    let dTrainerFeeAmount = 0;
    dItems.forEach((it) => {
      const lineTotal = (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || 1);
      if (isTrainerFeeItemName_(it.name)) {
        totalTrainerFees += lineTotal;
        const trainerName = it.name.replace('ค่าเทรนเนอร์: ', '');
        trainerFeeMap[trainerName] = (trainerFeeMap[trainerName] || 0) + lineTotal;
        dTrainerFeeAmount += lineTotal;
      } else if (isDayPassItemName_(it.name) || isDiscountItemName_(it.name)) {
        totalDayPass += lineTotal; // discounts carry a negative price
        if (dailyBuckets[dKey]) dailyBuckets[dKey].dayPass += lineTotal;
      } else if (isMembershipItemName_(it.name)) {
        totalMembership += lineTotal;
        membershipTxnCount++;
        if (dailyBuckets[dKey]) { dailyBuckets[dKey].membership += lineTotal; dailyBuckets[dKey].membershipCount++; }
      } else {
        totalProducts += lineTotal;
        if (dailyBuckets[dKey]) dailyBuckets[dKey].products += lineTotal;
        if (!productRevenueMap[it.name]) productRevenueMap[it.name] = { qty: 0, revenue: 0 };
        productRevenueMap[it.name].qty += (parseInt(it.qty, 10) || 1);
        productRevenueMap[it.name].revenue += lineTotal;
      }
    });

    const dGymPortion = (d.amount || 0) - dTrainerFeeAmount;
    if ((d.paymentMethod || 'เงินสด') === 'โอนเงิน') {
      totalTransfer += dGymPortion;
      if (dailyBuckets[dKey]) dailyBuckets[dKey].transfer += dGymPortion;
    } else {
      totalCash += dGymPortion;
      if (dailyBuckets[dKey]) dailyBuckets[dKey].cash += dGymPortion;
    }
  });

  // 3) Expenses. Only tallied here — the money is taken out of cash/transfer
  //    in step 5, after any hand-entered figures have been applied, so a
  //    purchase is deducted exactly once whether or not the day was typed in.
  const expensesByDay = {};
  const expenseSnap = await db.collection('expenses').get();
  expenseSnap.forEach((doc) => {
    const e = doc.data();
    if (e.date < startDateStr || e.date > endDateStr) return;
    const eAmount = e.amount || 0;
    totalExpenses += eAmount;
    if (dailyBuckets[e.date]) dailyBuckets[e.date].expenses += eAmount;

    // Blank counts as โอนเงิน, matching the original expensePaymentMethod_().
    const paidByTransfer = ((e.paymentMethod || '').toString().trim() || 'โอนเงิน') === 'โอนเงิน';
    if (!expensesByDay[e.date]) expensesByDay[e.date] = { cash: 0, transfer: 0 };
    expensesByDay[e.date][paidByTransfer ? 'transfer' : 'cash'] += eAmount;
  });

  // 4) Manual per-day overrides.
  const overriddenDays = [];
  const overrideSnap = await db.collection('dailyPaymentOverrides').get();
  overrideSnap.forEach((doc) => {
    const oKey = doc.id;
    if (oKey < startDateStr || oKey > endDateStr || !dailyBuckets[oKey]) return;
    const o = doc.data();

    // Keep what the bills actually add up to, so the UI can show the admin how
    // far the hand-entered figure drifts from reality.
    const autoMembership = dailyBuckets[oKey].membership;
    const autoDayPass = dailyBuckets[oKey].dayPass;
    const autoProducts = dailyBuckets[oKey].products;
    const autoCash = dailyBuckets[oKey].cash;
    const autoTransfer = dailyBuckets[oKey].transfer;

    totalCash -= dailyBuckets[oKey].cash;
    totalTransfer -= dailyBuckets[oKey].transfer;
    totalMembership -= dailyBuckets[oKey].membership;
    totalDayPass -= dailyBuckets[oKey].dayPass;
    totalProducts -= dailyBuckets[oKey].products;

    dailyBuckets[oKey].cash = o.cash || 0;
    dailyBuckets[oKey].transfer = o.transfer || 0;
    const hasFullOverride = o.membership !== '' && o.membership !== undefined && o.membership !== null;
    if (hasFullOverride) {
      dailyBuckets[oKey].membership = o.membership || 0;
      dailyBuckets[oKey].dayPass = o.dayPass || 0;
      dailyBuckets[oKey].products = o.products || 0;
    }
    dailyBuckets[oKey].cashTransferOverridden = true;

    totalCash += dailyBuckets[oKey].cash;
    totalTransfer += dailyBuckets[oKey].transfer;
    totalMembership += dailyBuckets[oKey].membership;
    totalDayPass += dailyBuckets[oKey].dayPass;
    totalProducts += dailyBuckets[oKey].products;

    overriddenDays.push({
      date: oKey,
      autoTotal: autoMembership + autoDayPass + autoProducts,
      autoCash, autoTransfer,
      shownTotal: dailyBuckets[oKey].membership + dailyBuckets[oKey].dayPass + dailyBuckets[oKey].products,
      shownCash: dailyBuckets[oKey].cash,
      shownTransfer: dailyBuckets[oKey].transfer,
      // How far this day's cash+transfer is from the money that should be left
      // (its takings minus its purchases). Anything other than 0 means the
      // month's cash/transfer totals can't tie out, so the UI surfaces it.
      cashBalanceDiff: Math.round((
        (dailyBuckets[oKey].cash + dailyBuckets[oKey].transfer)
        - (dailyBuckets[oKey].membership + dailyBuckets[oKey].dayPass + dailyBuckets[oKey].products - (dailyBuckets[oKey].expenses || 0))
      ) * 100) / 100,
      updatedBy: (o.updatedBy || '').toString(),
      updatedAt: o.updatedAt && o.updatedAt.toDate ? o.updatedAt.toDate().toISOString().slice(0, 16).replace('T', ' ') : ''
    });
  });
  overriddenDays.sort((a, b) => (a.date < b.date ? -1 : 1));

  // 5) Take the day's purchases out of cash/transfer, so those two add up to
  //    the money actually left on hand rather than the gross takings.
  //
  //    Skipped for hand-entered days: there the admin types what is left after
  //    paying for things (the edit form balances the two fields against
  //    revenue minus that day's expenses), so subtracting again would count
  //    every purchase twice.
  const handEnteredDays = new Set(overriddenDays.map((d) => d.date));
  for (const [dateKey, spent] of Object.entries(expensesByDay)) {
    if (handEnteredDays.has(dateKey)) continue;
    totalCash -= spent.cash;
    totalTransfer -= spent.transfer;
    if (dailyBuckets[dateKey]) {
      dailyBuckets[dateKey].cash -= spent.cash;
      dailyBuckets[dateKey].transfer -= spent.transfer;
    }
  }

  const breakdown = orderedKeys.map((k) => dailyBuckets[k]);
  const topProducts = Object.keys(productRevenueMap).map((name) => ({ name, qty: productRevenueMap[name].qty, revenue: productRevenueMap[name].revenue })).sort((a, b) => b.revenue - a.revenue);
  const trainerFeeBreakdown = Object.keys(trainerFeeMap).map((name) => ({ name, amount: trainerFeeMap[name] })).sort((a, b) => b.amount - a.amount);

  return {
    startDate: startDateStr, endDate: endDateStr,
    totals: {
      membership: totalMembership, dayPass: totalDayPass, products: totalProducts,
      grandTotal: totalMembership + totalDayPass + totalProducts,
      membershipCount: membershipTxnCount, dailyCount: dailyTxnCount,
      expenses: totalExpenses, netProfit: (totalMembership + totalDayPass + totalProducts) - totalExpenses,
      cash: totalCash, transfer: totalTransfer
    },
    breakdown, topProducts, overriddenDays,
    trainerFees: { total: totalTrainerFees, breakdown: trainerFeeBreakdown }
  };
}

exports.getRevenueReport = onCall(async (request) => {
  requireAuth(request, 'admin');
  const { startDateStr, endDateStr } = request.data || {};
  return getRevenueReportCore_(startDateStr, endDateStr);
});

module.exports.getRevenueReportCore_ = getRevenueReportCore_;

exports.getDashboardStats = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const memberSnap = await db.collection('members').get();
    let total = 0, active = 0;
    const today = new Date();
    memberSnap.forEach((doc) => {
      const m = doc.data();
      total++;
      const status = m.status || 'Active';
      const expiry = new Date(m.expiryDate);
      if (status === 'Active' && expiry >= today) active++;
    });

    const logSnap = await db.collection('checkinLogs').orderBy('timestamp', 'desc').limit(15).get();
    const logs = logSnap.docs.map((doc) => {
      const l = doc.data();
      return { time: l.timestamp ? l.timestamp.toDate().toTimeString().slice(0, 8) : '', name: l.name, uid: l.fingerprintId, status: l.status, details: l.details };
    });

    return { total, active, logs };
  } catch (e) {
    return { total: 0, active: 0, logs: [] };
  }
});

exports.getLatestCheckIn = onCall(async (request) => {
  requireAuth(request, 'admin');
  try {
    const snap = await db.collection('checkinLogs').orderBy('timestamp', 'desc').limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const l = doc.data();
    const tsDate = l.timestamp ? l.timestamp.toDate() : new Date();

    const result = {
      logDocId: doc.id, timestamp: tsDate.getTime(), timeStr: tsDate.toTimeString().slice(0, 8),
      name: l.name, fingerprintId: l.fingerprintId, status: l.status, details: l.details
    };

    if (result.status === 'SUCCESS' && result.fingerprintId) {
      const memberSnap = await db.collection('members').where('fingerprintId', '==', result.fingerprintId).limit(1).get();
      if (!memberSnap.empty) {
        const m = memberSnap.docs[0].data();
        result.package = m.package;
        result.expiryDate = m.expiryDate || '';
        result.checkInCount = m.checkInCount || 0;
        const daysLeft = daysUntil_(m.expiryDate);
        result.daysLeft = daysLeft;
        result.nearExpiry = daysLeft !== null && daysLeft >= 0 && daysLeft <= config.EXPIRY_ALERT_DAYS;
      }
    }
    return result;
  } catch (e) {
    return null;
  }
});
