// Shared admin header + nav bar, rendered into a placeholder element so
// every admin page doesn't need to repeat the same markup.
const PAGES = [
  { key: 'dashboard', href: 'dashboard.html', label: 'สรุป' },
  { key: 'members', href: 'members.html', label: 'สมาชิก' },
  { key: 'trainers', href: 'trainers.html', label: 'เทรนเนอร์' },
  { key: 'bookings', href: 'bookings.html', label: 'การจอง' },
  { key: 'pos', href: 'pos.html', label: 'POS รายวัน' },
  { key: 'payments', href: 'payments.html', label: 'ชำระเงิน' },
  { key: 'coupons', href: 'coupons.html', label: 'คูปอง' },
  { key: 'products', href: 'products.html', label: 'สินค้า' },
  { key: 'reports', href: 'reports.html', label: 'รายงาน' },
  { key: 'settings', href: 'settings.html', label: 'ตั้งค่า' }
];

export function renderNav(activeKey, adminRole) {
  const navLinks = PAGES.map((p) => `<a href="${p.href}" class="navlink${p.key === activeKey ? ' active' : ''}">${p.label}</a>`).join('');
  return `
    <header class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight font-['Urbanist']">INDUSTRIAL <span class="text-red-500">MUSCLE</span></h1>
        <p class="text-xs text-gray-500 uppercase tracking-widest">Admin</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-500">${adminRole || 'Admin'}</span>
        <button onclick="doLogout()" class="text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 px-4 py-2 rounded-lg">
          <i class="fa-solid fa-arrow-right-from-bracket mr-1"></i> ออกจากระบบ
        </button>
      </div>
    </header>
    <nav class="flex gap-1 mb-6 overflow-x-auto pb-1">${navLinks}</nav>
  `;
}
