import './style.css';
import Chart from 'chart.js/auto';

// Global state
let appData = {
  dates: [],
  source1Metrics: [],
  source2Metrics: [],
  customMetrics: []
};
let charts = {};

// Summary metrics we want to show on Main Tab
const SUMMARY_METRICS = [
  "Пополнения агенств",
  "Пополнения без Ecom",
  "Спенд по агенствам",
  "Спенд без урахування Ecom",
  "Итого на агенствах",
  "Итого на агенствах без Ecom",
  "Баланс на акках агенства",
  "Баланс на акках без Ecom"
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
    
    processData(result.source1, result.source2);
  } catch (err) {
    console.error("Fetch error", err);
    alert("Помилка завантаження даних");
  }
}

// 2. Process Raw Data
function processData(rows1, rows2) {
  // Extract dates from source1 (Row 1 usually contains 'Контрольная дата')
  let dateRowIndex = 0;
  for (let i = 0; i < Math.min(5, rows1.length); i++) {
    if (rows1[i][0] && rows1[i][0].toString().includes('Контрольная дата')) {
      dateRowIndex = i;
      break;
    }
  }
  if (dateRowIndex === 0 && rows1.length > 1) dateRowIndex = 1;

  const dateRow = rows1[dateRowIndex];
  const allDates = [];
  const dateIndices = [];

  for (let i = 1; i < dateRow.length; i++) {
    const dateVal = dateRow[i];
    if (dateVal && dateVal.toString().trim() !== "") {
      allDates.push(formatDateLocal(dateVal)); 
      dateIndices.push(i);
    }
  }

  appData.dates = allDates;

  // Parse Source 1
  appData.source1Metrics = parseRows(rows1, dateIndices);
  // Parse Source 2
  appData.source2Metrics = parseRows(rows2, dateIndices);

  calculateCustomMetrics();
}

function parseRows(rows, dateIndices) {
  const metrics = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0] ? row[0].toString().trim() : "";
    if (!name || name === "Контрольная дата") continue;

    const values = [];
    for (let i = 0; i < dateIndices.length; i++) {
      const c = dateIndices[i];
      let val = row[c];
      if (val === "" || val === null || val === undefined) {
        values.push(null);
      } else {
        val = val.toString().replace(/,/g, '.').replace(/\s/g, '');
        values.push(parseFloat(val) || 0);
      }
    }
    metrics.push({ name, values });
  }
  return metrics;
}

// 3. Calculate Custom Metrics
function calculateCustomMetrics() {
  const s1 = appData.source1Metrics;
  const s2 = appData.source2Metrics;
  const datesLen = appData.dates.length;

  const getVals = (src, name) => {
    const m = src.find(x => x.name === name);
    return m ? m.values : new Array(datesLen).fill(0);
  };

  const revAdvertisers = getVals(s2, "Рекли Баланс");
  const spendNoEcom = getVals(s1, "Спенд без урахування Ecom");
  const balanceAccount = getVals(s1, "Баланс на акках агенства");

  const margin = [];
  const frozen = [];

  for (let i = 0; i < datesLen; i++) {
    const r = revAdvertisers[i] || 0;
    const s = spendNoEcom[i] || 0;
    const b = balanceAccount[i] || 0;

    // Маржа без товарки итого = revenue рекламодавців - spend без е-ком
    margin.push(r - s);
    // Заморожені гроші без товарки = Баланс на партнерах (Рекли Баланс) + баланс на аккаунт
    frozen.push(r + b);
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
  
  // Add hardcoded Summary Metrics from Source 1
  SUMMARY_METRICS.forEach(name => {
    const m = appData.source1Metrics.find(x => x.name === name);
    if (m) {
      tableData.push({
        name: m.name,
        values: m.values.slice(-numWeeks),
        highlight: m.name.toLowerCase().includes('итого') || m.name.toLowerCase().includes('баланс')
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
  const sliceVals = (src, name) => {
    const m = src.find(x => x.name === name);
    return m ? m.values.slice(-dates.length) : new Array(dates.length).fill(0);
  };

  const frozen = appData.customMetrics.find(m => m.name === "Заморожені гроші без товарки").values.slice(-dates.length);
  const balPartners = sliceVals(appData.source2Metrics, "Рекли Баланс");
  const balAccounts = sliceVals(appData.source1Metrics, "Баланс на акках агенства");

  const margin = appData.customMetrics.find(m => m.name === "Маржа без товарки итого").values.slice(-dates.length);
  const spendNoEcom = sliceVals(appData.source1Metrics, "Спенд без урахування Ecom");
  const revAdvertisers = sliceVals(appData.source2Metrics, "Рекли Баланс");

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
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        { label: 'Заморожені гроші', data: frozen, backgroundColor: '#8b5cf6' },
        { label: 'Баланс на партнерах', data: balPartners, backgroundColor: '#3b82f6' },
        { label: 'Баланс на аккаунтах', data: balAccounts, backgroundColor: '#10b981' }
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
        { label: 'Revenue рекламодавців', data: revAdvertisers, borderColor: '#10b981', tension: 0.3 }
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
  let dataToRender = appData.source1Metrics.filter(m => !SUMMARY_METRICS.includes(m.name) && !m.name.includes("Итого"));

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
    appData.source1Metrics.filter(m => !SUMMARY_METRICS.includes(m.name) && !m.name.includes("Итого")).forEach(m => {
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
  let dataToRender = appData.source2Metrics.filter(m => m.name !== "Рекли Баланс" && m.name !== " ");

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
    appData.source2Metrics.filter(m => m.name !== "Рекли Баланс" && m.name !== " ").forEach(m => {
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
