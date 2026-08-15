// Shared admin sidebar, rendered into a placeholder element so every admin
// page doesn't need to repeat the same markup. Mirrors the original Apps
// Script system's left sidebar layout (logo, icon nav, logout at bottom).
const PAGES = [
  { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: 'fa-chart-line' },
  { key: 'checkin', href: 'checkin.html', label: 'เช็คอินลูกค้า', icon: 'fa-clipboard-check' },
  { key: 'checkin-display', href: 'checkin-display.html', label: 'จอหน้าประตู', icon: 'fa-tv' },
  { key: 'members', href: 'members.html', label: 'Member Mgmt', icon: 'fa-users-gear' },
  { key: 'trainers', href: 'trainers.html', label: 'Trainers', icon: 'fa-person-running' },
  { key: 'bookings', href: 'bookings.html', label: 'การจอง', icon: 'fa-calendar-check' },
  { key: 'pos', href: 'pos.html', label: 'POS รายวัน', icon: 'fa-cash-register' },
  { key: 'payments', href: 'payments.html', label: 'Payment & Renewal', icon: 'fa-credit-card' },
  { key: 'coupons', href: 'coupons.html', label: 'คูปอง', icon: 'fa-ticket' },
  { key: 'products', href: 'products.html', label: 'สินค้า', icon: 'fa-boxes-stacked' },
  { key: 'reports', href: 'reports.html', label: 'รายงานสรุป', icon: 'fa-chart-pie' },
  { key: 'settings', href: 'settings.html', label: 'Settings', icon: 'fa-gears' }
];

export function renderNav(activeKey, adminRole) {
  const navLinks = PAGES.map((p) => `
    <a href="${p.href}" class="sidebar-item${p.key === activeKey ? ' active' : ''}">
      <i class="fa-solid ${p.icon} mr-3 text-base w-5 text-center"></i>${p.label}
    </a>`).join('');

  window.toggleSidebar = () => {
    document.getElementById('adminSidebar').classList.toggle('-translate-x-full');
    document.getElementById('sidebarOverlay').classList.toggle('hidden');
  };

  return `
    <header class="md:hidden fixed top-0 left-0 right-0 z-40 bg-black border-b border-gray-800 px-4 py-3 flex justify-between items-center">
      <h1 class="text-lg font-black tracking-tight font-['Urbanist'] leading-none">INDUSTRIAL <span class="text-red-500">MUSCLE</span></h1>
      <button onclick="toggleSidebar()" class="text-gray-400 hover:text-white text-xl p-1"><i class="fa-solid fa-bars"></i></button>
    </header>

    <aside id="adminSidebar" class="fixed top-0 bottom-0 left-0 z-40 w-64 bg-black border-r border-gray-800 flex flex-col p-5 -translate-x-full md:translate-x-0 transition-transform duration-300 ease-in-out overflow-y-auto">
      <div class="mb-8 mt-1 hidden md:block">
        <h1 class="text-2xl font-black tracking-tight font-['Urbanist'] leading-none">INDUSTRIAL</h1>
        <p class="text-red-500 font-bold tracking-[0.3em] text-[10px] uppercase mt-1">Muscle</p>
      </div>
      <p class="text-gray-600 text-[10px] uppercase tracking-widest mb-4 mt-14 md:mt-0">${adminRole || 'Admin'}</p>
      <nav class="space-y-1.5 flex-grow">${navLinks}</nav>
      <div class="border-t border-gray-800 pt-4 mt-4">
        <button onclick="doLogout()" class="sidebar-item w-full text-red-500 hover:bg-red-500/10">
          <i class="fa-solid fa-right-from-bracket mr-3 text-base w-5 text-center"></i>ออกจากระบบ
        </button>
      </div>
    </aside>
    <div id="sidebarOverlay" onclick="toggleSidebar()" class="fixed inset-0 bg-black/70 z-30 hidden md:hidden"></div>
  `;
}
