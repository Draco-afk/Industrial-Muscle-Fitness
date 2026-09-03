// Whether a membership is actually still good, worked out from its expiry
// date rather than its stored status field.
//
// The two disagree in practice. `status` only flips to Expired when the
// auto-expire job runs, and that automation is a toggle the owner can leave
// switched off — which it currently is, so every one of the 56 members reads
// "Active" while 9 of them are already past their date. Reading the date is
// right either way: it needs no scheduled job to have run, and it still
// agrees with `status` once the automation is on.
//
// Suspended is deliberately left alone. That's a decision someone made about
// the member, not a date, so it outranks the calendar.

// The gym day rolls over at Bangkok midnight, not the viewer's.
export function gymToday() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * @returns {{state:'expired'|'expiring'|'suspended'|'active'|'unknown',
 *            days:number, label:string, badgeClass:string, cardClass:string}}
 *   `days` is days until expiry; negative means that many days overdue.
 */
export function membershipState(member, warnWithinDays = 7) {
  const status = (member && member.status) || '';
  const expiry = (member && member.expiryDate) || '';

  if (status === 'Suspended') {
    return { state: 'suspended', days: 0, label: 'Suspended',
      badgeClass: 'badge badge-suspended',
      cardClass: 'bg-black/40 border border-yellow-900/60' };
  }
  if (!expiry) {
    return { state: 'unknown', days: 0, label: status || 'ไม่ระบุ',
      badgeClass: 'badge badge-other',
      cardClass: 'bg-black/40 border border-gray-800' };
  }

  const today = gymToday();
  // Both are YYYY-MM-DD, so a plain difference of day numbers is exact and
  // sidesteps timezone maths entirely.
  const days = Math.round((Date.parse(expiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);

  if (days < 0) {
    return { state: 'expired', days,
      label: `หมดอายุแล้ว ${Math.abs(days)} วัน`,
      badgeClass: 'badge badge-expired',
      cardClass: 'bg-red-950/25 border border-red-600' };
  }
  if (days <= warnWithinDays) {
    return { state: 'expiring', days,
      label: days === 0 ? 'หมดอายุวันนี้' : `เหลือ ${days} วัน`,
      badgeClass: 'badge badge-expiring',
      cardClass: 'bg-black/40 border border-yellow-700/70' };
  }
  return { state: 'active', days, label: status || 'Active',
    badgeClass: 'badge badge-active',
    cardClass: 'bg-black/40 border border-gray-800' };
}
