// Dates on the gym's calendar, for the browser.
//
// The trap this exists to avoid: `new Date(2026, 8, 1)` builds midnight on
// 1 September *in the browser's timezone*, which in Bangkok is 31 August
// 17:00 UTC — so `.toISOString().slice(0, 10)` hands back "2026-08-31". That
// is why the "เดือนนี้" preset was starting a day into the previous month.
// The same call also returns yesterday's date any time between midnight and
// 07:00 local, which this gym is open for.
//
// Everything below anchors on the Bangkok date as a "yyyy-MM-dd" string and
// then does arithmetic purely in UTC, so no local-timezone conversion is ever
// applied and the result can't drift. Matches util/dates.js on the server.

const GYM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Today's date at the gym, "yyyy-MM-dd". */
export function gymToday() {
  return new Date(Date.now() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}

/** A Date -> the gym-calendar day it falls on. */
export function gymDateStr(date) {
  return new Date(date.getTime() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}

const parse = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');

/** Shift a "yyyy-MM-dd" by whole days. */
export function addDays(dateStr, n) {
  return fmt(new Date(parse(dateStr).getTime() + n * 86400000));
}

/**
 * Shift by whole months, keeping the existing end-of-month behaviour: 31 Jan
 * + 1 month rolls into March, exactly as the server's renewal maths does.
 */
export function addMonths(dateStr, n) {
  const d = parse(dateStr);
  d.setUTCMonth(d.getUTCMonth() + n);
  return fmt(d);
}

/** First day of the month a date belongs to. */
export function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

/** Last day of the month a date belongs to. */
export function monthEnd(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`, -1);
}
