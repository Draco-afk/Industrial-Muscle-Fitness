// Non-blocking confirmation messages.
//
// alert() stops everything until it's dismissed, which on a busy counter means
// the staff member taps OK on every single sale before they can serve the next
// customer. That dismissal was a real part of why the till felt slow — the
// request itself finishes in about a tenth of a second. A toast says the same
// thing without standing in the way.
//
// Errors are deliberately left on alert() elsewhere: those need to stop the
// person and be acknowledged.

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.id = 'toastHost';
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;'
    + 'flex-direction:column;gap:8px;pointer-events:none;max-width:min(92vw,26rem)';
  document.body.appendChild(host);
  return host;
}

/**
 * @param {string} message  Text to show.
 * @param {'success'|'error'|'info'} [type]
 * @param {number} [ms]  How long before it fades out.
 */
export function toast(message, type = 'success', ms = 3200) {
  const el = document.createElement('div');
  const colors = {
    success: ['#052e16', '#16a34a', '#86efac'],
    error: ['#3f0a0a', '#dc2626', '#fca5a5'],
    info: ['#0f172a', '#334155', '#cbd5e1']
  }[type] || ['#0f172a', '#334155', '#cbd5e1'];

  el.style.cssText = `background:${colors[0]};border:1px solid ${colors[1]};color:${colors[2]};`
    + 'padding:12px 16px;border-radius:12px;font-size:13px;font-weight:600;'
    + 'box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;transform:translateY(-8px);'
    + 'transition:opacity .18s ease,transform .18s ease;pointer-events:auto;'
    + 'font-family:Prompt,sans-serif;white-space:pre-line';
  el.textContent = message;
  ensureHost().appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });

  const close = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener('click', close);
  setTimeout(close, ms);
  return el;
}
