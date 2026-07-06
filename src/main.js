import './style.css';
import Chart from 'chart.js/auto';

// Global state
let appData = {
  dates: [],
  source1Metrics: [],
  source2Metrics: [],
  source2RevMetrics: [],
  source2WithMetrics: [],
  customMetrics: []
};
let charts = {};

// Summary metrics we want to show on Main Tab
const MAIN_DASHBOARD_METRICS = [
  "Пополнения агенств",
  "Пополнения без Ecom",
  "Спенд по агенствам",
  "Спенд без урахування Ecom",
  "Итого на агенствах",
  "Итого на агенствах без Ecom",
  "Рекли Баланс",
  "Рекли Ревеню",
  "Рекли Вивід"
];

// Used for filtering out of Cost/Revenue specific tabs
const ALL_SUMMARY_NAMES = [
  "Пополнения агенств",
  "Пополнения без Ecom",
  "Спенд по агенствам",
  "Спенд без урахування Ecom",
  "Итого на агенствах",
  "Итого на агенствах без Ecom",
  "Баланс на акках агенства",
  "Баланс на акках без Ecom",
  "Рекли Баланс",
  "Рекли Ревеню",
  "Рекли Вивід"
];

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
}

// Fix Timezone issue for dates
function formatDateLocal(dateVal) {
  let dStr = dateVal.toString();
  if (dStr.includes('T')) {
    const d = new Date(dStr);
    d.setHours(d.getHours() + 4); // Shift to correct local day
    return d.toISOString().split('T')[0];
  }
  return dStr.substring(0, 10);
}

// 1. Fetch Data
async function fetchData() {
  const url = 'https://script.google.com/macros/s/AKfycbym4vG2or_iSusH5_afcYXBoZAhxoyCS-vFMx3HbcPSkn1bPLzLhFTjbHPIy1zLiW6y/exec';
  try {
    const response = await fetch(url);
    const result = await response.json();
    if (result.status === "error") throw new Error(result.message);
    
    processData(result);
  } catch (err) {
    console.error("Fetch error", err);
    alert("Помилка завантаження даних");
  }
}

// 2. Process Raw Data
function processData(result) {
  const rows1 = result.source1 || [];
  const rows2 = result.source2 || [];
  const rows2_rev = result.source2_revenue || [];
  const rows2_with = result.source2_withdrawal || [];

  // Extract MASTER dates from source1
  let dateRowIndex = 0;
  for (let i = 0; i < Math.min(5, rows1.length); i++) {
    if (rows1[i][0] && rows1[i][0].toString().includes('Контрольная дата')) {
      dateRowIndex = i;
      break;
    }
  }
  if (dateRowIndex === 0 && rows1.length > 1) dateRowIndex = 1;

  const dateRow = rows1[dateRowIndex] || [];
  const allDates = [];

  for (let i = 1; i < dateRow.length; i++) {
    const dateVal = dateRow[i];
    if (dateVal && dateVal.toString().trim() !== "") {
      allDates.push(formatDateLocal(dateVal)); 
    }
  }

  appData.dates = allDates;

  // Parse All Sources using the dynamic date mapper
  appData.source1Metrics = parseSource(rows1, allDates);
  appData.source2Metrics = parseSource(rows2, allDates);
  appData.source2RevMetrics = parseSource(rows2_rev, allDates);
  appData.source2WithMetrics = parseSource(rows2_with, allDates);

  calculateCustomMetrics();
}

// Robust parser that maps columns to global dates based on string matching
function parseSource(rows, globalDates) {
  if (!rows || rows.length === 0) return [];
  
  // Find date row in this specific source
  let dateRowIndex = -1;
  let localDateIndices = {}; // map: globalDateStr -> colIndex

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    let matchedDates = 0;
    let tempIndices = {};
    for (let c = 1; c < r.length; c++) {
      if (r[c]) {
        const dStr = formatDateLocal(r[c]);
        if (globalDates.includes(dStr)) {
          matchedDates++;
          tempIndices[dStr] = c;
        }
      }
    }
    if (matchedDates > 0) {
      dateRowIndex = i;
      localDateIndices = tempIndices;
      break;
    }
  }

  const metrics = [];
  for (let r = 0; r < rows.length; r++) {
    if (r === dateRowIndex) continue; // Skip header
    const row = rows[r];
    const name = row[0] ? row[0].toString().trim() : "";
    if (!name || name === "Контрольная дата" || name === "Контрольна дата") continue;

    const values = [];
    for (let i = 0; i < globalDates.length; i++) {
      const gDate = globalDates[i];
      const colIdx = localDateIndices[gDate];
      if (colIdx !== undefined && colIdx < row.length) {
        let val = row[colIdx];
        if (val === "" || val === null || val === undefined) {
          values.push(null);
        } else {
          val = val.toString().replace(/,/g, '.').replace(/\s/g, '');
          values.push(parseFloat(val) || 0);
        }
      } else {
        values.push(null); // No data for this date in this source
      }
    }
    metrics.push({ name, values });
  }
  return metrics;
}

// Helper to extract a single metric from multiple sources
const getVals = (name) => {
  let m = appData.source1Metrics.find(x => x.name === name);
  if (m) return m.values;
  m = appData.source2Metrics.find(x => x.name === name);
  if (m) return m.values;
  m = appData.source2RevMetrics.find(x => x.name === name);
  if (m) return m.values;
  m = appData.source2WithMetrics.find(x => x.name === name);
  if (m) return m.values;
  return new Array(appData.dates.length).fill(0);
};

const getMetric = (name) => {
  let m = appData.source1Metrics.find(x => x.name === name);
  if (m) return m;
  m = appData.source2Metrics.find(x => x.name === name);
  if (m) return m;
  m = appData.source2RevMetrics.find(x => x.name === name);
  if (m) return m;
  m = appData.source2WithMetrics.find(x => x.name === name);
  return m;
};

// 3. Calculate Custom Metrics
function calculateCustomMetrics() {
  const datesLen = appData.dates.length;

  const revAdvertisers = getVals("Рекли Баланс");
  const revRevenue = getVals("Рекли Ревеню");
  const spendNoEcom = getVals("Спенд без урахування Ecom");
  const totalAgencies = getVals("Итого на агенствах");

  const margin = [];
  const frozen = [];

  for (let i = 0; i < datesLen; i++) {
    const r_bal = revAdvertisers[i] || 0;
    const r_rev = revRevenue[i] || 0;
    const s = spendNoEcom[i] || 0;
    const t = totalAgencies[i] || 0;

    // Маржа без товарки итого = Рекли Ревеню - Спенд без урахування Ecom
    margin.push(r_rev - s);
    // Заморожені гроші без товарки = Рекли Баланс + Итого на агенствах
    frozen.push(r_bal + t);
  }

  appData.customMetrics = [
    { name: "Маржа без товарки итого", values: margin, highlight: true },
    { name: "Заморожені гроші без товарки", values: frozen, highlight: true }
  ];
}

// 4. Render Main Tab
function renderMainTab() {
  const numWeeks = 5;
  const dates = appData.dates.slice(-numWeeks);
  
  // Table
  const tableData = [];
  
  // Add required metrics in explicit order
  MAIN_DASHBOARD_METRICS.forEach(name => {
    const m = getMetric(name);
    if (m) {
      tableData.push({
        name: m.name,
        values: m.values.slice(-numWeeks),
        highlight: m.name.toLowerCase().includes('итого') || m.name.toLowerCase().includes('баланс') || m.name.toLowerCase().includes('вивід') || m.name.toLowerCase().includes('ревеню')
      });
    }
  });

  // Add Custom Metrics
  appData.customMetrics.forEach(m => {
    tableData.push({
      name: m.name,
      values: m.values.slice(-numWeeks),
      highlight: true
    });
  });

  renderTableHTML('main-table', dates, tableData);

  // Charts
  renderMainCharts(dates);
}

function renderMainCharts(dates) {
  const sliceVals = (name) => {
    const m = getMetric(name);
    return m ? m.values.slice(-dates.length) : new Array(dates.length).fill(0);
  };

  const frozen = appData.customMetrics.find(m => m.name === "Заморожені гроші без товарки").values.slice(-dates.length);
  const balPartners = sliceVals("Рекли Баланс");
  const totalAgencies = sliceVals("Итого на агенствах");

  const margin = appData.customMetrics.find(m => m.name === "Маржа без товарки итого").values.slice(-dates.length);
  const spendNoEcom = sliceVals("Спенд без урахування Ecom");
  const revAdvertisers = sliceVals("Рекли Баланс"); // This remains on the chart, or do they want 'Рекли Ревеню' on chart 2?
  // Let's use 'Рекли Ревеню' on chart 2 since margin is calculated using it now
  const revRevenue = sliceVals("Рекли Ревеню");

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f8fafc' } } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  };

  if (charts.chart1) charts.chart1.destroy();
  const ctx1 = document.getElementById('chart1').getContext('2d');
  charts.chart1 = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: 'Заморожені гроші', data: frozen, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.3 },
        { label: 'Рекли Баланс', data: balPartners, borderColor: '#3b82f6', tension: 0.3 },
        { label: 'Итого на агенствах', data: totalAgencies, borderColor: '#10b981', tension: 0.3 }
      ]
    },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Графік 1: Заморожені гроші', color: '#f8fafc' } } }
  });

  if (charts.chart2) charts.chart2.destroy();
  const ctx2 = document.getElementById('chart2').getContext('2d');
  charts.chart2 = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: 'Маржа', data: margin, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.3 },
        { label: 'Спенд без Ecom', data: spendNoEcom, borderColor: '#ef4444', tension: 0.3 },
        { label: 'Рекли Ревеню', data: revRevenue, borderColor: '#10b981', tension: 0.3 }
      ]
    },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Графік 2: Маржа та Спенд', color: '#f8fafc' } } }
  });
}

// 5. Render Cost Tab
function renderCostTab() {
  const periodVal = document.getElementById('cost-period').value;
  const numWeeks = periodVal === 'all' ? appData.dates.length : (periodVal === '8w' ? 8 : 4);
  const dates = appData.dates.slice(-numWeeks);
  
  const agencyVal = document.getElementById('cost-agency').value;
  
  // Exclude summary metrics, only show actual agencies
  let dataToRender = appData.source1Metrics.filter(m => !ALL_SUMMARY_NAMES.includes(m.name) && !m.name.includes("Итого"));

  if (agencyVal !== 'all') {
    dataToRender = dataToRender.filter(m => m.name === agencyVal);
  }

  const tableData = dataToRender.map(m => ({
    name: m.name,
    values: m.values.slice(-numWeeks)
  }));

  renderTableHTML('cost-table', dates, tableData);

  // Populate filter dropdown if empty
  const select = document.getElementById('cost-agency');
  if (select.options.length <= 1) {
    appData.source1Metrics.filter(m => !ALL_SUMMARY_NAMES.includes(m.name) && !m.name.includes("Итого")).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
  }
}

// 6. Render Revenue Tab
function renderRevenueTab() {
  const periodVal = document.getElementById('rev-period').value;
  const numWeeks = periodVal === 'all' ? appData.dates.length : (periodVal === '8w' ? 8 : 4);
  const dates = appData.dates.slice(-numWeeks);
  
  const partnerVal = document.getElementById('rev-partner').value;
  
  // Exclude main summary metrics if any
  let dataToRender = appData.source2Metrics.filter(m => !ALL_SUMMARY_NAMES.includes(m.name) && m.name !== " ");

  if (partnerVal !== 'all') {
    dataToRender = dataToRender.filter(m => m.name === partnerVal);
  }

  const tableData = dataToRender.map(m => ({
    name: m.name,
    values: m.values.slice(-numWeeks)
  }));

  renderTableHTML('revenue-table', dates, tableData);

  // Populate filter dropdown if empty
  const select = document.getElementById('rev-partner');
  if (select.options.length <= 1) {
    appData.source2Metrics.filter(m => !ALL_SUMMARY_NAMES.includes(m.name) && m.name !== " ").forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
  }
}

// Utility to render HTML tables
function renderTableHTML(tableId, dates, metrics) {
  const theadRow = document.getElementById(`${tableId}-header`);
  const tbody = document.getElementById(`${tableId}-body`);
  
  while (theadRow.children.length > 1) {
    theadRow.removeChild(theadRow.lastChild);
  }
  tbody.innerHTML = '';

  dates.forEach(date => {
    const th = document.createElement('th');
    th.textContent = date;
    theadRow.appendChild(th);
  });

  metrics.forEach(metric => {
    const tr = document.createElement('tr');
    if (metric.highlight) tr.classList.add('row-highlight');

    const tdName = document.createElement('td');
    tdName.classList.add('metric-col');
    tdName.textContent = metric.name;
    tr.appendChild(tdName);

    metric.values.forEach(val => {
      const td = document.createElement('td');
      td.textContent = formatNumber(val);
      if (val < 0) td.classList.add('val-negative');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Setup Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked tab and its content
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    // Re-render based on active tab
    if (btn.dataset.tab === 'tab-main') renderMainTab();
    if (btn.dataset.tab === 'tab-cost') renderCostTab();
    if (btn.dataset.tab === 'tab-revenue') renderRevenueTab();
  });
});

// Setup Filters
document.getElementById('cost-period').addEventListener('change', renderCostTab);
document.getElementById('cost-agency').addEventListener('change', renderCostTab);
document.getElementById('rev-period').addEventListener('change', renderRevenueTab);
document.getElementById('rev-partner').addEventListener('change', renderRevenueTab);

// Init
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'Завантаження...';
  btn.disabled = true;
  await fetchData();
  renderMainTab();
  renderCostTab();
  renderRevenueTab();
  btn.textContent = 'Оновити дані';
  btn.disabled = false;
});

// Run on load
document.getElementById('refresh-btn').click();
