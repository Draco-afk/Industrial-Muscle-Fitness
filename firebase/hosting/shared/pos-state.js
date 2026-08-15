// Open POS ticket, shared between pos.html and members.html.
//
// The original Apps Script app was a single page, so "register a member and
// add the package to the current daily bill" was just a variable in memory.
// Here those are two separate pages, so the in-progress ticket is parked in
// sessionStorage across the navigation instead. sessionStorage (not local)
// keeps it scoped to the tab and clears when the browser session ends, so a
// half-finished ticket never resurfaces days later on a shared front-desk PC.
const KEY = 'im_pos_ticket';

export function emptyPosState() {
  return {
    customers: [{ name: '', phone: '' }],
    cart: [],                 // [{ name, price, qty }]
    dayPass: { student: 0, adult: 0 },
    trainerFees: [],          // [{ name, amount }]
    coupon: null,             // { code, discountAmount }
    manualDiscount: null,     // { type: 'Percent'|'Fixed', value, discountAmount }
    paymentMethod: 'cash',
    pendingMembership: false
  };
}

export function loadPosState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return emptyPosState();
    return { ...emptyPosState(), ...JSON.parse(raw) };
  } catch (e) {
    return emptyPosState();
  }
}

export function savePosState(state) {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode / quota */ }
}

export function clearPosState() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
