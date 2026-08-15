// Reads the QR code out of a bank transfer slip image.
//
// The decoded payload is what the backend stores as `qrData` and checks for
// reuse, so scanning the slip rather than typing a code by hand is what
// actually makes the duplicate-slip check meaningful.
//
// jsQR is loaded lazily from CDN on first use — the admin pages that never
// take a transfer payment shouldn't pay for the download.
let jsQRReady = null;

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQRReady) return jsQRReady;
  jsQRReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error('โหลดตัวอ่าน QR ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
  return jsQRReady;
}

async function decodeQrFromFile(file) {
  const jsQR = await loadJsQR();
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่เปิดได้'));
    i.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code ? code.data : null;
}

/**
 * Wires a drop zone + hidden file input so dropping or picking a slip image
 * fills the target field with the decoded QR payload.
 *
 * @param {{dropId: string, fileId: string, targetId: string, statusId: string, iconId: string}} ids
 */
export function initSlipScanner(ids) {
  const drop = document.getElementById(ids.dropId);
  const fileInput = document.getElementById(ids.fileId);
  const target = document.getElementById(ids.targetId);
  const status = document.getElementById(ids.statusId);
  const icon = document.getElementById(ids.iconId);
  if (!drop || !fileInput || !target) return;

  const setState = (text, iconClass, colorClass) => {
    if (status) status.textContent = text;
    if (icon) icon.className = `${iconClass} text-2xl ${colorClass}`;
  };

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setState('กำลังอ่านรหัสจากสลิป...', 'fa-solid fa-circle-notch fa-spin', 'text-gray-400');
    try {
      const decoded = await decodeQrFromFile(file);
      if (decoded) {
        target.value = decoded;
        setState('อ่านรหัสสลิปสำเร็จ', 'fa-solid fa-circle-check', 'text-green-500');
      } else {
        setState('ไม่พบ QR Code ในรูปนี้ — กรอกรหัสเองด้านล่างได้', 'fa-solid fa-triangle-exclamation', 'text-yellow-500');
      }
    } catch (e) {
      setState(e.message || 'อ่านสลิปไม่สำเร็จ', 'fa-solid fa-circle-xmark', 'text-red-500');
    }
  }

  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-red-500'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('border-red-500'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('border-red-500');
    handleFile(e.dataTransfer.files[0]);
  });

  return () => {
    fileInput.value = '';
    setState('ลากรูปสลิปโอนเงินมาวาง หรือคลิกเพื่อเลือกไฟล์', 'fa-solid fa-qrcode', 'text-gray-600');
  };
}
