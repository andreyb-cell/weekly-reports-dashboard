import './style.css';
import Chart from 'chart.js/auto';

// Global state
let currentData = null;
let charts = {};

// Summary metrics we want to show
const SUMMARY_METRICS = [
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

function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
}

// 1. Fetch Data
async function fetchData() {
  const url = 'https://script.google.com/macros/s/AKfycbym4vG2or_iSusH5_afcYXBoZAhxoyCS-vFMx3HbcPSkn1bPLzLhFTjbHPIy1zLiW6y/exec';
  try {
    const response = await fetch(url);
    const result = await response.json();
    if (result.status === "error") throw new Error(result.message);
    return parseSheetData(result.source1);
  } catch (err) {
    console.error("Fetch error", err);
    alert("Помилка завантаження даних");
    return null;
  }
}

// Transform raw 2D array to our dashboard structure
function parseSheetData(rows) {
  const allDates = [];
  const dateIndices = [];

  // Знайдемо рядок, де містяться дати (там де перший елемент 'Контрольная дата' або просто візьмемо 2-й рядок, бо 1-й пустий)
  let dateRowIndex = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i][0] && rows[i][0].toString().includes('Контрольная дата')) {
      dateRowIndex = i;
      break;
    }
  }
  // Якщо не знайшли по слову, візьмемо 1 індекс (2-й рядок)
  if (dateRowIndex === 0 && rows.length > 1) dateRowIndex = 1;

  const dateRow = rows[dateRowIndex];

  // Parse Dates
  for (let i = 1; i < dateRow.length; i++) {
    const dateVal = dateRow[i];
    if (dateVal && dateVal.toString().trim() !== "") {
      let dStr = dateVal.toString();
      if (dStr.includes('T')) dStr = dStr.split('T')[0];
      else dStr = dStr.substring(0, 10);
      allDates.push(dStr); 
      dateIndices.push(i);
    }
  }

  // WE ONLY WANT THE LAST 5 WEEKS for the table
  const numWeeks = 5;
  const recentDates = allDates.slice(-numWeeks);
  const recentIndices = dateIndices.slice(-numWeeks);

  const metrics = [];
  
  // Parse Rows
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0] ? row[0].toString().trim() : "";
    
    // ONLY include the specific metrics for the summary table
    if (!name || !SUMMARY_METRICS.includes(name)) continue;

    const values = [];
    for (let i = 0; i < recentIndices.length; i++) {
      const c = recentIndices[i];
      let val = row[c];
      if (val === "" || val === null || val === undefined) {
        values.push(null);
      } else {
        val = val.toString().replace(/,/g, '.').replace(/\s/g, '');
        values.push(parseFloat(val) || 0);
      }
    }

    metrics.push({
      name: name,
      values: values,
      groupEnd: name.includes('без Ecom'),
      highlight: name.toLowerCase().includes('итого') || name.toLowerCase().includes('баланс')
    });
  }

  // Sort metrics to match the exact order requested
  metrics.sort((a, b) => SUMMARY_METRICS.indexOf(a.name) - SUMMARY_METRICS.indexOf(b.name));

  return { dates: recentDates, metrics };
}

// 2. Render Table
function renderTable(data) {
  if (!data) return;
  const theadRow = document.getElementById('table-header-row');
  const tbody = document.getElementById('table-body');
  
  while (theadRow.children.length > 1) {
    theadRow.removeChild(theadRow.lastChild);
  }
  tbody.innerHTML = '';

  data.dates.forEach(date => {
    const th = document.createElement('th');
    th.textContent = date;
    theadRow.appendChild(th);
  });

  data.metrics.forEach(metric => {
    const tr = document.createElement('tr');
    if (metric.groupEnd) tr.classList.add('row-group-end');
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

// 3. Render Charts
function renderCharts(data) {
  if (!data || !data.metrics || data.metrics.length === 0) return;

  const dates = data.dates;
  const revMetric = data.metrics.find(m => m.name.includes("Рекли Ревеню") || m.name.includes("Ревеню"));
  const spendMetric = data.metrics.find(m => m.name.includes("Спенд по агенствам") || m.name.includes("Спенд"));

  const revData = revMetric ? revMetric.values : new Array(dates.length).fill(0);
  const spendData = spendMetric ? spendMetric.values : new Array(dates.length).fill(0);

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f8fafc' } } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  };

  if (charts.revenue) charts.revenue.destroy();
  if (charts.spend) charts.spend.destroy();

  const ctxRev = document.getElementById('revenueChart').getContext('2d');
  charts.revenue = new Chart(ctxRev, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Рекли Ревеню',
        data: revData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: commonOptions
  });

  const ctxSpend = document.getElementById('spendChart').getContext('2d');
  charts.spend = new Chart(ctxSpend, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Спенд по агенствам',
        data: spendData,
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: commonOptions
  });
}

// 4. Run Validations
function runValidations(data) {
  if (!data) return;
  const valSection = document.getElementById('validation-block');
  const valContainer = document.getElementById('validation-messages');
  valContainer.innerHTML = '';
  
  let hasErrors = false;
  const itogoMetric = data.metrics.find(m => m.name === "Итого на агенствах");
  if (itogoMetric) {
    const invalidVals = itogoMetric.values.filter(v => v !== null && v > 0);
    if (invalidVals.length > 0) {
      hasErrors = true;
      valContainer.innerHTML += `<div class="alert alert-danger">
        <strong>Помилка:</strong> Знайдено позитивні значення у 'Итого на агенствах', очікуються від'ємні.
      </div>`;
    }
  }
  
  if (!hasErrors) {
    valContainer.innerHTML = `<div class="alert alert-success">
      <strong>Успіх:</strong> Усі дані сходяться, баланси перевірено.
    </div>`;
  }
  valSection.classList.remove('hidden');
}

// Main App Initialization
async function initApp() {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.textContent = 'Завантаження...';
  refreshBtn.disabled = true;

  try {
    currentData = await fetchData();
    renderTable(currentData);
    renderCharts(currentData);
    runValidations(currentData);
  } finally {
    refreshBtn.textContent = 'Оновити дані';
    refreshBtn.disabled = false;
  }
}

// Event Listeners
document.getElementById('refresh-btn').addEventListener('click', initApp);
document.getElementById('source-selector').addEventListener('change', (e) => {
  const detailsContent = document.querySelector('.details-content');
  const val = e.target.value;
  if (val === 'all') {
    detailsContent.innerHTML = `<div class="empty-state">Оберіть партнера для деталізації</div>`;
  } else {
    detailsContent.innerHTML = `<div style="padding: 2rem; color: #94a3b8;">Дані для партнера <strong>${val}</strong> будуть завантажені тут.</div>`;
  }
});

initApp();
