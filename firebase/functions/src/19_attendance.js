// Footfall — how many people actually came through the door each day.
//
// Two separate sources, because the gym admits people two different ways:
//   * Members scan in, which writes a checkinLogs row (fingerprint reader, or
//     a manual check-in when the reader is down).
//   * Day-pass customers pay at the counter and never scan, so the only
//     record they leave is the day-pass line item on their POS sale.
//
// Counting one without the other undercounts the day badly, so this reads both
// and reports them side by side as well as combined.
//
// Note on wording: the door hardware records entry only, never exit, so every
// figure here is arrivals. There is no data that could support an "in and out"
// count, and inventing one would be worse than saying so.
'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db } = require('./util/admin');
const { requireAuth } = require('./util/authGuard');

function isDayPassItemName_(n) { return (n || '').toString().indexOf('ค่าเข้าใช้บริการฟิตเนสรายวัน') !== -1; }

// Thailand has no DST, so a fixed offset gives the exact gym-day boundary.
const GYM_OFFSET_MS = 7 * 60 * 60 * 1000;
function gymDayKey_(date) {
  return new Date(date.getTime() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}
function gymHour_(date) {
  return new Date(date.getTime() + GYM_OFFSET_MS).getUTCHours();
}

exports.getCheckinStats = onCall(async (request) => {
  requireAuth(request, 'admin');
  const data = request.data || {};
  try {
    const today = gymDayKey_(new Date());
    const startDateStr = data.startDateStr || `${today.slice(0, 7)}-01`;
    const endDateStr = data.endDateStr || today;

    const startDate = new Date(`${startDateStr}T00:00:00+07:00`);
    const endDate = new Date(`${endDateStr}T23:59:59+07:00`);

    // One bucket per calendar day in range, so quiet days show as a real zero
    // instead of silently vanishing from the table.
    const buckets = {};
    const orderedKeys = [];
    const cursor = new Date(`${startDateStr}T00:00:00Z`);
    const lastDay = new Date(`${endDateStr}T00:00:00Z`);
    while (cursor <= lastDay) {
      const key = cursor.toISOString().slice(0, 10);
      buckets[key] = {
        date: key,
        memberVisits: 0,     // scans, including the same member returning later
        memberPeople: 0,     // distinct members, filled in from memberNames below
        dayPass: 0,          // heads, not transactions — a 2-person sale counts 2
        total: 0
      };
      orderedKeys.push(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // Distinct-member tracking is kept out of the returned buckets so the
    // response stays small on long ranges.
    const memberNames = {};
    orderedKeys.forEach((k) => { memberNames[k] = new Set(); });

    const byHour = new Array(24).fill(0);
    const uniqueMembersInRange = new Set();

    // 1) Members. Only SUCCESS rows are arrivals — BLOCKED (expired card) and
    //    UNKNOWN (unrecognised finger) mean the person was turned away.
    const logSnap = await db.collection('checkinLogs')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();
    logSnap.forEach((doc) => {
      const c = doc.data();
      if (!c.timestamp || c.status !== 'SUCCESS') return;
      const when = c.timestamp.toDate();
      const key = gymDayKey_(when);
      if (!buckets[key]) return;
      buckets[key].memberVisits++;
      const nm = (c.name || '').toString().trim();
      if (nm) { memberNames[key].add(nm); uniqueMembersInRange.add(nm); }
      byHour[gymHour_(when)]++;
    });

    // 2) Day-pass customers. Counted by quantity, not by receipt: one sale of
    //    "รายวัน x3" is three people walking in, and a sale with no day-pass
    //    line (someone just buying a drink) is nobody walking in.
    const daySnap = await db.collection('dailyPayments').get();
    daySnap.forEach((doc) => {
      const d = doc.data();
      if (!d.timestamp || d.refundStatus === 'Refunded') return;
      const when = d.timestamp.toDate();
      if (when < startDate || when > endDate) return;
      const key = gymDayKey_(when);
      if (!buckets[key]) return;

      let items = [];
      try { items = d.itemsJson ? JSON.parse(d.itemsJson) : []; } catch (e) { items = []; }
      // Older rows predate itemsJson; those were day-pass-only sales.
      if (!items.length) items = [{ name: 'ค่าเข้าใช้บริการฟิตเนสรายวัน (Day Pass)', qty: 1 }];

      let heads = 0;
      items.forEach((it) => {
        if (isDayPassItemName_(it.name)) heads += (parseInt(it.qty, 10) || 1);
      });
      if (heads > 0) {
        buckets[key].dayPass += heads;
        byHour[gymHour_(when)] += heads;
      }
    });

    const breakdown = orderedKeys.map((k) => {
      const b = buckets[k];
      b.memberPeople = memberNames[k].size;
      b.total = b.memberPeople + b.dayPass;
      return b;
    });

    let totalMemberVisits = 0, totalDayPass = 0, totalPeople = 0;
    let busiest = { date: '', total: 0 };
    let activeDays = 0;
    breakdown.forEach((b) => {
      totalMemberVisits += b.memberVisits;
      totalDayPass += b.dayPass;
      totalPeople += b.total;
      if (b.total > 0) activeDays++;
      if (b.total > busiest.total) busiest = { date: b.date, total: b.total };
    });

    // Averaged over days the gym actually saw someone. Dividing by every day in
    // the range would drag the figure down with days that haven't happened yet
    // when the owner looks at the current month mid-month.
    const avgPerDay = activeDays ? Math.round((totalPeople / activeDays) * 10) / 10 : 0;

    let peakHour = -1, peakHourCount = 0;
    byHour.forEach((n, h) => { if (n > peakHourCount) { peakHourCount = n; peakHour = h; } });

    const todayBucket = buckets[today] || null;

    return {
      startDateStr,
      endDateStr,
      breakdown,
      byHour,
      totals: {
        memberVisits: totalMemberVisits,
        memberPeople: uniqueMembersInRange.size,
        dayPass: totalDayPass,
        totalPeople,
        activeDays,
        daysInRange: orderedKeys.length,
        avgPerDay,
        busiestDate: busiest.date,
        busiestTotal: busiest.total,
        peakHour,
        peakHourCount
      },
      today: todayBucket
        ? { date: today, memberVisits: todayBucket.memberVisits, memberPeople: memberNames[today].size, dayPass: todayBucket.dayPass, total: memberNames[today].size + todayBucket.dayPass }
        : { date: today, memberVisits: 0, memberPeople: 0, dayPass: 0, total: 0 }
    };
  } catch (e) {
    return { error: e.toString(), breakdown: [], byHour: new Array(24).fill(0), totals: {}, today: null };
  }
});
