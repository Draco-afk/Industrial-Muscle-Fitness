// Chart.js and SheetJS are only needed on the two pages that draw charts or
// export spreadsheets, and only once the admin actually asks. Loading them
// on demand keeps every other page's first paint free of ~400KB of JS.
const loaded = {};

function loadScript(key, src) {
  if (loaded[key]) return loaded[key];
  loaded[key] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { loaded[key] = null; reject(new Error('โหลดไลบรารีไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต')); };
    document.head.appendChild(s);
  });
  return loaded[key];
}

export async function ensureChartJs() {
  // jsDelivr, not the cdnjs path the Apps Script original used — that URL
  // 404s for Chart.js 4.x, so the original's charts silently never render.
  if (!window.Chart) await loadScript('chart', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js');
  return window.Chart;
}

export async function ensureXlsx() {
  if (!window.XLSX) await loadScript('xlsx', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  return window.XLSX;
}

/** Writes rows (array of plain objects) out as a .xlsx download. */
export async function exportRowsToExcel(rows, sheetName, filenamePrefix) {
  if (!rows || !rows.length) { alert('ไม่มีข้อมูลให้ Export'); return; }
  const XLSX = await ensureXlsx();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Shared Chart.js look so charts match the dark red theme without each page
// repeating the same option blob.
export const chartTheme = {
  grid: 'rgba(255,255,255,0.06)',
  tick: '#6b7280',
  red: '#ef4444',
  redFill: 'rgba(239,68,68,0.15)',
  blue: '#3b82f6',
  blueFill: 'rgba(59,130,246,0.15)'
};

export function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartTheme.tick, font: { family: 'Prompt', size: 11 } } },
      tooltip: { titleFont: { family: 'Prompt' }, bodyFont: { family: 'Prompt' } }
    },
    scales: {
      x: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.tick, font: { family: 'Prompt', size: 10 } } },
      y: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.tick, font: { family: 'Prompt', size: 10 } }, beginAtZero: true }
    },
    ...extra
  };
}
