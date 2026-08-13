import './style.css';
import Chart from 'chart.js/auto';

// Global state
let appData = {
  dates: [],
  source1Metrics: [],
  source2Metrics: [],
  source2RevMetrics: [],
  source2WithMetrics: [],
  customMetrics: [],
  validationWarnings: []
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

const COST_BLOCKS = [
  "Пополнения агенств",
  "Итого на агенствах",
  "У Агенств не распределенный ",
  "Баланс на акках агенства",
  "Спенд по агенствам"
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

  appData.validationWarnings = [];

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
  appData.source1Metrics = parseSource(rows1, allDates, 'Звіт тижневий: Кости і KPI', 'Загальний');
  appData.source2Metrics = parseSource(rows2, allDates, 'Звіт тижневий: Баланси', 'Загальний');
  appData.source2RevMetrics = parseSource(rows2_rev, allDates, 'Звіт тижневий: Баланси', 'Рекли Ревеню');
  appData.source2WithMetrics = parseSource(rows2_with, allDates, 'Звіт тижневий: Баланси', 'Рекли Вивід');

  calculateCustomMetrics();

  // Populate Date Filter for Main Tab
  const mainDateSelect = document.getElementById('main-period-date');
  mainDateSelect.innerHTML = '';
  allDates.forEach((date, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = date;
    mainDateSelect.appendChild(opt);
  });
  // Select the latest date by default
  if (allDates.length > 0) {
    mainDateSelect.value = allDates.length - 1;
  }
}

function getColumnLetter(colIndex) {
  let letter = '';
  while (colIndex >= 0) {
    letter = String.fromCharCode((colIndex % 26) + 65) + letter;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return letter;
}

// Robust parser that maps columns to global dates based on string matching
function parseSource(rows, globalDates, tableName, tabName) {
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
          // Only warn if this metric is somehow used in our dashboard. 
          // We assume any metric parsed might be used, but let's exclude completely blank rows
          // Only show warnings for the last 2 weeks and only for "Загальний" tab
          if (name !== "" && i >= globalDates.length - 2 && tabName === 'Загальний') {
            const rowNum = r + 1;
            const colLetter = getColumnLetter(colIdx);
            appData.validationWarnings.push(`Таблиця "${tableName}", вкладка "${tabName}": Комірка ${colLetter}${rowNum} (рядок "${name}", дата "${gDate}") не заповнена!`);
          }
        } else {
          val = val.toString().replace(/,/g, '.').replace(/\s/g, '');
          const parsed = parseFloat(val);
          if (isNaN(parsed)) {
            values.push(0);
          } else {
            values.push(parsed);
          }
        }
      } else {
        values.push(null); // No data for this date in this source
        if (name !== "" && i >= globalDates.length - 2 && tabName === 'Загальний') {
          appData.validationWarnings.push(`Таблиця "${tableName}", вкладка "${tabName}": рядок "${name}" за дату "${gDate}" не знайдено (відсутня колонка)!`);
        }
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

    margin.push(r_rev - s);
    frozen.push(r_bal + t);
  }

  appData.customMetrics = [
    { name: "Маржа без товарки итого", values: margin, highlight: true },
    { name: "Заморожені гроші без товарки", values: frozen, highlight: true }
  ];
}

// 4. Render Main Tab
function renderMainTab() {
  const mainDateSelect = document.getElementById('main-period-date');
  let selectedIndex = parseInt(mainDateSelect.value);
  if (isNaN(selectedIndex)) selectedIndex = appData.dates.length - 1;

  const numWeeks = 5;
  const startIndex = Math.max(0, selectedIndex - numWeeks + 1);
  const dates = appData.dates.slice(startIndex, selectedIndex + 1);
  
  // Table
  const tableData = [];
  
  MAIN_DASHBOARD_METRICS.forEach(name => {
    const m = getMetric(name);
    if (m) {
      tableData.push({
        name: m.name,
        values: m.values.slice(startIndex, selectedIndex + 1),
        highlight: m.name.toLowerCase().includes('итого') || m.name.toLowerCase().includes('баланс') || m.name.toLowerCase().includes('вивід') || m.name.toLowerCase().includes('ревеню')
      });
    }
  });

  appData.customMetrics.forEach(m => {
    tableData.push({
      name: m.name,
      values: m.values.slice(startIndex, selectedIndex + 1),
      highlight: true
    });
  });

  renderTableHTML('main-table', dates, tableData);
  renderMainCharts(dates, startIndex, selectedIndex + 1);
}

function renderMainCharts(dates, startIdx, endIdx) {
  const sliceVals = (name) => {
    const m = getMetric(name);
    return m ? m.values.slice(startIdx, endIdx) : new Array(dates.length).fill(0);
  };

  const frozen = appData.customMetrics.find(m => m.name === "Заморожені гроші без товарки").values.slice(startIdx, endIdx);
  const balPartners = sliceVals("Рекли Баланс");
  const totalAgencies = sliceVals("Итого на агенствах");

  const margin = appData.customMetrics.find(m => m.name === "Маржа без товарки итого").values.slice(startIdx, endIdx);
  const spendNoEcom = sliceVals("Спенд без урахування Ecom");
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
  
  const cbState = {
    "Пополнения агенств": document.getElementById('cb-popolneniya').checked,
    "Итого на агенствах": document.getElementById('cb-itogo').checked,
    "У Агенств не распределенный ": document.getElementById('cb-unallocated').checked,
    "Баланс на акках агенства": document.getElementById('cb-balance').checked,
    "Спенд по агенствам": document.getElementById('cb-spend').checked
  };

  const tbody = document.getElementById('cost-table-body');
  const theadRow = document.getElementById('cost-table-header');
  
  while (theadRow.children.length > 1) {
    theadRow.removeChild(theadRow.lastChild);
  }
  tbody.innerHTML = '';

  dates.forEach(date => {
    const th = document.createElement('th');
    th.textContent = date;
    theadRow.appendChild(th);
  });

  let currentBlock = null;
  let blockRows = [];

  // Re-organize source1 metrics into blocks
  appData.source1Metrics.forEach(m => {
    if (COST_BLOCKS.includes(m.name)) {
      currentBlock = m.name;
    }
    
    if (currentBlock && cbState[currentBlock]) {
      const isHeader = m.name === currentBlock;
      
      const tr = document.createElement('tr');
      if (isHeader) {
        tr.classList.add('block-header-row');
        tr.style.cursor = 'pointer';
        tr.onclick = () => {
          const rows = tbody.querySelectorAll(`.block-child-${currentBlock.replace(/\s+/g, '-')}`);
          rows.forEach(r => r.style.display = r.style.display === 'none' ? '' : 'none');
        };
      } else {
        tr.classList.add(`block-child-${currentBlock.replace(/\s+/g, '-')}`);
      }

      const tdName = document.createElement('td');
      tdName.classList.add('metric-col');
      if (!isHeader) {
        tdName.style.paddingLeft = '20px';
      }
      tdName.textContent = m.name;
      tr.appendChild(tdName);

      const sliceVals = m.values.slice(-numWeeks);
      sliceVals.forEach(val => {
        const td = document.createElement('td');
        td.textContent = formatNumber(val);
        if (val < 0) td.classList.add('val-negative');
        if (isHeader) td.style.fontWeight = 'bold';
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    }
  });
}

// 6. Render Revenue Tab
function renderRevenueTab() {
  const periodVal = document.getElementById('rev-period').value;
  const numWeeks = periodVal === 'all' ? appData.dates.length : (periodVal === '8w' ? 8 : 4);
  const dates = appData.dates.slice(-numWeeks);
  
  const partnerVal = document.getElementById('rev-partner').value;
  const sortVal = document.getElementById('rev-sort').value;
  
  let dataToRender = appData.source2Metrics.filter(m => !ALL_SUMMARY_NAMES.includes(m.name) && m.name !== " ");

  if (partnerVal !== 'all') {
    dataToRender = dataToRender.filter(m => m.name === partnerVal);
  }

  // Formatting values
  const formattedData = dataToRender.map(m => ({
    name: m.name,
    values: m.values.slice(-numWeeks)
  }));

  // Sorting
  if (sortVal === 'revenue-desc' && formattedData.length > 0) {
    formattedData.sort((a, b) => {
      const aVal = a.values[a.values.length - 1] || 0;
      const bVal = b.values[b.values.length - 1] || 0;
      return bVal - aVal;
    });
  }

  // Calculate Total Row
  const totals = new Array(dates.length).fill(0);
  formattedData.forEach(row => {
    row.values.forEach((v, i) => {
      totals[i] += (v || 0);
    });
  });

  formattedData.push({
    name: 'Итого',
    values: totals,
    highlight: true
  });

  renderTableHTML('revenue-table', dates, formattedData);

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

// 7. Render Validation Tab
function renderValidationTab() {
  // Warnings
  const warningsList = document.getElementById('validation-messages-list');
  warningsList.innerHTML = '';
  if (appData.validationWarnings.length === 0) {
    warningsList.innerHTML = '<p class="success-text">Всі необхідні дані заповнені!</p>';
  } else {
    // Only show unique warnings to avoid spam
    const uniqueWarnings = [...new Set(appData.validationWarnings)];
    uniqueWarnings.forEach(w => {
      const p = document.createElement('p');
      p.classList.add('warning-text');
      p.textContent = '⚠️ ' + w;
      warningsList.appendChild(p);
    });
  }

  // Validation Table
  const proverkaMetric = getMetric("Проверка");
  const mainDateSelect = document.getElementById('main-period-date');
  let selectedIndex = parseInt(mainDateSelect.value);
  if (isNaN(selectedIndex)) selectedIndex = appData.dates.length - 1;
  const numWeeks = 5;
  const startIndex = Math.max(0, selectedIndex - numWeeks + 1);
  const dates = appData.dates.slice(startIndex, selectedIndex + 1);

  if (proverkaMetric) {
    const tableData = [{
      name: proverkaMetric.name,
      values: proverkaMetric.values.slice(startIndex, selectedIndex + 1),
      highlight: true
    }];
    renderTableHTML('validation-table', dates, tableData);
  } else {
    document.getElementById('validation-table-body').innerHTML = '<tr><td colspan="6">Рядок "Проверка" не знайдено</td></tr>';
  }
}

// Utility to render HTML tables
function renderTableHTML(tableId, dates, metrics) {
  const theadRow = document.getElementById(`${tableId}-header`);
  const tbody = document.getElementById(`${tableId}-body`);
  
  if(!theadRow || !tbody) return;

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
    if (metric.name === 'Итого') tr.classList.add('total-row');

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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    if (btn.dataset.tab === 'tab-main') renderMainTab();
    if (btn.dataset.tab === 'tab-cost') renderCostTab();
    if (btn.dataset.tab === 'tab-revenue') renderRevenueTab();
    if (btn.dataset.tab === 'tab-validation') renderValidationTab();
  });
});

// Setup Filters
document.getElementById('main-period-date').addEventListener('change', () => {
  renderMainTab();
  renderValidationTab();
});
document.getElementById('cost-period').addEventListener('change', renderCostTab);
['cb-popolneniya', 'cb-itogo', 'cb-unallocated', 'cb-balance', 'cb-spend'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderCostTab);
});
document.getElementById('rev-period').addEventListener('change', renderRevenueTab);
document.getElementById('rev-partner').addEventListener('change', renderRevenueTab);
document.getElementById('rev-sort').addEventListener('change', renderRevenueTab);

// Init
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'Завантаження...';
  btn.disabled = true;
  await fetchData();
  
  // Render active tab only, or render all to prepare
  renderMainTab();
  renderCostTab();
  renderRevenueTab();
  renderValidationTab();
  
  btn.textContent = 'Оновити дані';
  btn.disabled = false;
});

// Run on load
document.getElementById('refresh-btn').click();
