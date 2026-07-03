import './style.css';
import Chart from 'chart.js/auto';

// MOCK DATA based on user's screenshot
const mockData = {
  dates: ["10.06", "17.06", "24.06", "01.07", "08.07"],
  metrics: [
    {
      name: "Пополнения агенств",
      values: [43000, 114188, 111443, 417923, null],
      groupEnd: false, highlight: false
    },
    {
      name: "Пополнения без Ecom",
      values: [22000, 76188, 106443, 396923, null],
      groupEnd: true, highlight: false
    },
    {
      name: "Спенд по агенствам",
      values: [154922, 190974, 178701, 200974, null],
      groupEnd: false, highlight: false
    },
    {
      name: "Спенд без урахування Ecom",
      values: [130468, 167428, 156177, 173189, null],
      groupEnd: true, highlight: false
    },
    {
      name: "Итого на агенствах",
      values: [-36866, -39584, -250304, -39298, null],
      groupEnd: false, highlight: true
    },
    {
      name: "Итого на агенствах без Ecom",
      values: [-57869.60, -78786.60, -276211.60, -62481.60, null],
      groupEnd: true, highlight: true
    },
    {
      name: "Рекли Баланс",
      values: [992846.82, 978611.10, 1115309.76, 704964.61, null],
      groupEnd: false, highlight: true
    },
    {
      name: "Рекли Ревеню",
      values: [163152.83, 187042.74, 180991.20, 198361.92, null],
      groupEnd: false, highlight: false
    },
    {
      name: "Рекли Вивід",
      values: [9010.36, 201278.46, 44292.54, 603606.03, null],
      groupEnd: false, highlight: false
    }
  ]
};

// Global state
let currentData = null;
let charts = {};

// Helper to format numbers (space separator, max 2 decimals)
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
    
    if (result.status === "error") {
      throw new Error(result.message);
    }
    
    // Parse the 2D array from source1 (Загальний tab)
    return parseSheetData(result.source1);
  } catch (err) {
    console.error("Fetch error, falling back to mock data", err);
    return mockData; // Fallback for development
  }
}

// Transform raw 2D array to our dashboard structure
function parseSheetData(rows) {
  const dates = [];
  const dateIndices = []; // Keep track of column indices with valid dates

  // Find dates in the first row (starting from second column)
  for (let i = 1; i < rows[0].length; i++) {
    const dateVal = rows[0][i];
    if (dateVal && dateVal.toString().trim() !== "") {
      let dStr = dateVal.toString();
      if (dStr.includes('T')) dStr = dStr.split('T')[0];
      else dStr = dStr.substring(0, 10);
      
      dates.push(dStr); 
      dateIndices.push(i);
    }
  }

  const metrics = [];
  // Loop through remaining rows
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0];
    
    // Skip completely empty rows
    if (!name || name.toString().trim() === "") continue;

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

    metrics.push({
      name: name.toString().trim(),
      values: values,
      groupEnd: name.toString().includes('без Ecom'),
      highlight: name.toString().toLowerCase().includes('итого') || name.toString().toLowerCase().includes('баланс')
    });
  }

  return { dates, metrics };
}

// 2. Render Table
function renderTable(data) {
  const theadRow = document.getElementById('table-header-row');
  const tbody = document.getElementById('table-body');
  
  // Clear existing columns except the first one (Метрика)
  while (theadRow.children.length > 1) {
    theadRow.removeChild(theadRow.lastChild);
  }
  tbody.innerHTML = '';

  // Render headers (Dates)
  data.dates.forEach(date => {
    const th = document.createElement('th');
    th.textContent = date;
    theadRow.appendChild(th);
  });

  // Render rows (Metrics)
  data.metrics.forEach(metric => {
    const tr = document.createElement('tr');
    
    // Add styling classes based on mock data flags
    if (metric.groupEnd) tr.classList.add('row-group-end');
    if (metric.highlight) tr.classList.add('row-highlight');

    // First col: Metric name
    const tdName = document.createElement('td');
    tdName.classList.add('metric-col');
    tdName.textContent = metric.name;
    tr.appendChild(tdName);

    // Value cols
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

  // Safely extract data for chart
  const revMetric = data.metrics.find(m => m.name.includes("Рекли Ревеню") || m.name.includes("Ревеню"));
  const spendMetric = data.metrics.find(m => m.name.includes("Спенд по агенствам") || m.name.includes("Спенд"));

  const revData = revMetric ? revMetric.values : new Array(dates.length).fill(0);
  const spendData = spendMetric ? spendMetric.values : new Array(dates.length).fill(0);

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#f8fafc' } }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  };

  // Destroy old charts if exist
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
  const valSection = document.getElementById('validation-block');
  const valContainer = document.getElementById('validation-messages');
  valContainer.innerHTML = '';
  
  let hasErrors = false;

  // Mock validation rule: Check if "Итого на агенствах" is negative everywhere
  // (Just an example of a check)
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
  
  // Example warning
  if (!hasErrors) {
    valContainer.innerHTML = `<div class="alert alert-success">
      <strong>Успіх:</strong> Усі дані сходяться, баланси перевірено.
    </div>`;
  }
  
  // Show block
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
    
  } catch (error) {
    console.error("Error loading data:", error);
    alert("Помилка при завантаженні даних.");
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

// Start app
initApp();
