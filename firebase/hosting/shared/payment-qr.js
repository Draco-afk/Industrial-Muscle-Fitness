// "Show the PromptPay QR for the customer to scan" popup.
//
// The QR image itself is uploaded once in Settings; every payment screen just
// puts it on screen large enough to scan across a counter. Shared so POS and
// member signup can't drift apart on it.
let cached = null;

function ensureModal() {
  let el = document.getElementById('paymentQrModal');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'paymentQrModal';
  el.className = 'hidden fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[60]';
  el.innerHTML = `
    <div class="bg-[#0f0f0f] border border-gray-800 rounded-3xl p-6 max-w-md w-full text-center">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold"><i class="fa-solid fa-qrcode text-red-500 mr-2"></i>สแกน QR เพื่อชำระเงิน</h2>
        <button data-qr-close class="text-gray-500 hover:text-white text-2xl leading-none px-2">&times;</button>
      </div>
      <div id="paymentQrBody" class="min-h-[16rem] flex items-center justify-center">
        <i class="fa-solid fa-circle-notch fa-spin text-2xl text-red-500"></i>
      </div>
      <p id="paymentQrCaption" class="text-gray-400 text-xs mt-4"></p>
    </div>`;
  document.body.appendChild(el);

  const close = () => el.classList.add('hidden');
  el.querySelector('[data-qr-close]').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return el;
}

/**
 * @param {Function} callServer the page's callServer helper
 */
export async function showPaymentQr(callServer) {
  const el = ensureModal();
  const body = document.getElementById('paymentQrBody');
  const caption = document.getElementById('paymentQrCaption');
  el.classList.remove('hidden');

  if (!cached) {
    body.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-2xl text-red-500"></i>';
    try {
      cached = await callServer('getPaymentQRInfo');
    } catch (e) {
      body.innerHTML = `<p class="text-red-400 text-sm">โหลด QR ไม่สำเร็จ: ${e.message || e}</p>`;
      return;
    }
  }

  if (!cached.url) {
    body.innerHTML = `
      <div class="text-center px-4">
        <i class="fa-solid fa-image text-4xl text-gray-700 mb-3"></i>
        <p class="text-gray-400 text-sm">ยังไม่ได้อัปโหลดรูป QR รับเงิน</p>
        <a href="settings.html" class="text-red-400 hover:text-red-300 text-xs underline">ไปอัปโหลดที่หน้าตั้งค่า</a>
      </div>`;
    caption.textContent = '';
    return;
  }

  body.innerHTML = `<img src="${cached.url}" alt="QR รับเงิน" class="w-full max-h-[60vh] object-contain rounded-2xl bg-white p-3">`;
  caption.textContent = cached.caption || '';
}

// Call after the QR is replaced in Settings so the next open refetches.
export function clearPaymentQrCache() { cached = null; }
