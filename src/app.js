// CONFIG
const MAX_POINTS = 10;
const POLL_INTERVAL_MS = 10000;

const METRICS = ['arus', 'frekuensi', 'kwh', 'daya', 'tegangan'];

const METRIC_COLORS = {
  arus: '#B8860B',
  frekuensi: '#1E3A8A',
  kwh: '#6E0D12',
  daya: '#166534',
  tegangan: '#C2410C'
};

const METRIC_UNITS = {
  arus: 'A',
  frekuensi: 'Hz',
  kwh: 'kWh',
  daya: 'W',
  tegangan: 'V'
};

const METRIC_DECIMALS = {
  arus: 2,
  frekuensi: 2,
  kwh: 2,
  daya: 0,
  tegangan: 1
};

// RUNNING STATE
const history = { arus: [], frekuensi: [], kwh: [], daya: [], tegangan: [] };
const labels = [];
let activeMetric = 'all';
let chartPoints = [];
const hiddenMetrics = new Set();

// CHART SETUP
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 1000, VIEW_H = 300, ALL_PAD_Y = 12;
const STEP_X = VIEW_W / (MAX_POINTS - 1);

const chartPanel = document.getElementById('chartPanel');
const chartPlot = document.getElementById('chartPlot');
const chartGrid = document.getElementById('chartGrid');
const chartLine = document.getElementById('chartLine');
const chartArea = document.getElementById('chartArea');
const chartYAxis = document.getElementById('chartYAxis');
const chartLastDot = document.getElementById('chartLastDot');
const chartHoverDot = document.getElementById('chartHoverDot');
const chartCrosshair = document.getElementById('chartCrosshair');
const chartMetricEl = document.getElementById('chartMetric');
const chartValueEl = document.getElementById('chartValue');
const chartUnitEl = document.getElementById('chartUnit');
const statEls = {
  min: document.getElementById('statMin'),
  avg: document.getElementById('statAvg'),
  max: document.getElementById('statMax')
};

function formatNumber(value, decimals){
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// CHART HOME
const multiAreas = document.getElementById('chartMultiAreas');
const multiLines = document.getElementById('chartMultiLines');
const chartDefs = document.querySelector('#realtimeChart defs');
const legendEl = document.getElementById('chartLegend');
const series = {};

METRICS.forEach(m => {
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.id = `chartFill-${m}`;
  gradient.setAttribute('x1', 0);
  gradient.setAttribute('y1', 0);
  gradient.setAttribute('x2', 0);
  gradient.setAttribute('y2', 1);
  [[0, 0.24], [1, 0]].forEach(([offset, opacity]) => {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', METRIC_COLORS[m]);
    stop.setAttribute('stop-opacity', opacity);
    gradient.appendChild(stop);
  });
  chartDefs.appendChild(gradient);

  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('fill', `url(#chartFill-${m})`);
  multiAreas.appendChild(area);

  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', METRIC_COLORS[m]);
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  multiLines.appendChild(line);

  const lastDot = document.createElement('div');
  lastDot.className = 'chart-dot chart-dot-last chart-dot-multi';
  lastDot.style.background = METRIC_COLORS[m];
  chartPlot.appendChild(lastDot);

  const hoverDot = document.createElement('div');
  hoverDot.className = 'chart-dot chart-dot-hover chart-dot-multi';
  hoverDot.style.borderColor = METRIC_COLORS[m];
  chartPlot.appendChild(hoverDot);

  const legend = document.createElement('button');
  legend.className = 'chart-legend-item';
  legend.setAttribute('aria-pressed', 'true');
  const bar = document.createElement('i');
  bar.style.background = METRIC_COLORS[m];
  legend.append(bar, m.toUpperCase());
  legend.addEventListener('click', () => {
    const isHidden = hiddenMetrics.has(m);
    if (isHidden) hiddenMetrics.delete(m);
    else hiddenMetrics.add(m);
    legend.setAttribute('aria-pressed', String(isHidden));
    hideHover();
    redrawChart();
  });
  legendEl.appendChild(legend);

  series[m] = { area, line, lastDot, hoverDot, points: [] };
});

function chartDomain(values){
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || Math.max(Math.abs(max) * 0.02, 1);
  return [min - pad, max + pad];
}

function niceStep(range){
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function toY(value, lo, hi){
  return (1 - (value - lo) / (hi - lo)) * VIEW_H;
}

function drawAxis(lo, hi){
  chartGrid.innerHTML = '';
  chartYAxis.innerHTML = '';
  const step = niceStep(hi - lo);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step){
    const y = toY(t, lo, hi);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('x2', VIEW_W);
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    line.setAttribute('stroke', '#F0EDEA');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    chartGrid.appendChild(line);

    const label = document.createElement('span');
    // Hindari label "-0" dari sisa pembulatan float
    label.textContent = formatNumber(Math.abs(t) < step / 2 ? 0 : t, decimals);
    label.style.top = (y / VIEW_H * 100) + '%';
    chartYAxis.appendChild(label);
  }
}

function smoothPath(points){
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++){
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function placeAt(el, point){
  el.style.left = (point[0] / VIEW_W * 100) + '%';
  el.style.top = (point[1] / VIEW_H * 100) + '%';
}

function drawAllGrid(){
  chartGrid.innerHTML = '';
  chartYAxis.innerHTML = '';
  for (let i = 0; i < 5; i++){
    const y = ALL_PAD_Y + i * (VIEW_H - ALL_PAD_Y * 2) / 4;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('x2', VIEW_W);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#F0EDEA');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    chartGrid.appendChild(line);
  }
}

function drawAllMetrics(){
  drawAllGrid();
  METRICS.forEach(m => {
    const { area, line, lastDot } = series[m];
    const data = history[m].map(Number);
    const isHidden = hiddenMetrics.has(m) || !data.length;
    area.style.display = isHidden ? 'none' : '';
    line.style.display = isHidden ? 'none' : '';
    lastDot.style.visibility = isHidden ? 'hidden' : 'visible';
    if (!data.length) return;

    const min = Math.min(...data);
    const range = Math.max(...data) - min;
    series[m].points = data.map((v, i) => {
      const ratio = range ? (v - min) / range : 0.5;
      return [i * STEP_X, ALL_PAD_Y + (1 - ratio) * (VIEW_H - ALL_PAD_Y * 2)];
    });
    const last = series[m].points[series[m].points.length - 1];
    const path = smoothPath(series[m].points);
    line.setAttribute('d', path);
    area.setAttribute('d', `${path} L${last[0].toFixed(1)},${VIEW_H} L0,${VIEW_H} Z`);
    placeAt(lastDot, last);
  });
}

function redrawChart(){
  const isAll = activeMetric === 'all';
  chartPanel.classList.toggle('is-all', isAll);
  if (isAll){
    drawAllMetrics();
    return;
  }
  chartPanel.style.setProperty('--chart-color', METRIC_COLORS[activeMetric]);

  const data = history[activeMetric].map(Number);
  const decimals = METRIC_DECIMALS[activeMetric];
  chartMetricEl.textContent = activeMetric.toUpperCase();
  chartUnitEl.textContent = METRIC_UNITS[activeMetric];
  if (!data.length) return;

  const unit = ' ' + METRIC_UNITS[activeMetric];
  chartValueEl.textContent = formatNumber(data[data.length - 1], decimals);
  statEls.min.textContent = formatNumber(Math.min(...data), decimals) + unit;
  statEls.max.textContent = formatNumber(Math.max(...data), decimals) + unit;
  statEls.avg.textContent = formatNumber(data.reduce((a, b) => a + b, 0) / data.length, decimals) + unit;

  const [lo, hi] = chartDomain(data);
  drawAxis(lo, hi);

  chartPoints = data.map((v, i) => [i * STEP_X, toY(v, lo, hi)]);
  const last = chartPoints[chartPoints.length - 1];
  const line = smoothPath(chartPoints);
  chartLine.setAttribute('d', line);
  chartArea.setAttribute('d', `${line} L${last[0].toFixed(1)},${VIEW_H} L0,${VIEW_H} Z`);
  placeAt(chartLastDot, last);
}

// SIDEBAR / BOTTOM NAV
const pages = {
  dashboard: document.getElementById('dashboardPage'),
  history: document.getElementById('historyPage'),
  billing: document.getElementById('billingPage')
};
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const metric = btn.dataset.metric;
    navItems.forEach(b => b.classList.toggle('active', b.dataset.metric === metric));

    const page = pages[metric] ? metric : 'dashboard';
    if (pages[page].hidden) window.scrollTo(0, 0);
    Object.entries(pages).forEach(([name, el]) => { el.hidden = name !== page; });
    if (page === 'history') loadHistory();
    if (page === 'billing') loadBilling();
    if (page !== 'dashboard') return;

    activeMetric = metric;
    hideHover();
    redrawChart();
  });
});

// CARD HIGHLIGHT
document.querySelectorAll('.metric-card').forEach(card => {
  card.addEventListener('click', () => {
    const metric = card.dataset.metric;
    const target = document.querySelector(`.nav-item[data-metric="${metric}"]`);
    if (target) target.click();
  });
});

// LOG TABLE
const LOG_ROWS = 8;
const HEAT_METRICS = ['arus', 'daya', 'tegangan'];

const logBody = document.getElementById('logBody');
const logRows = [];

function pushLogRow(ts, reading){
  logRows.unshift({ ts, reading });
  if (logRows.length > LOG_ROWS) logRows.pop();
  renderLog();
}

function deltaMark(value, prev){
  if (prev === undefined || value === prev) return '<span class="log-delta same">•</span>';
  return value > prev
    ? '<span class="log-delta up">▲</span>'
    : '<span class="log-delta down">▼</span>';
}

function heatStyle(value, min, max){
  const t = max > min ? (value - min) / (max - min) : 0;
  return ` style="background:rgba(110,13,18,${(0.04 + 0.26 * t).toFixed(3)})"`;
}

function renderLog(){
  const ranges = {};
  HEAT_METRICS.forEach(m => {
    const values = logRows.map(r => Number(r.reading[m]));
    ranges[m] = [Math.min(...values), Math.max(...values)];
  });

  logBody.innerHTML = logRows.map((row, i) => {
    const older = logRows[i + 1];
    const cells = METRICS.map(m => {
      const value = Number(row.reading[m]);
      const prev = older ? Number(older.reading[m]) : undefined;
      let style = '';
      if (ranges[m]){
        style = heatStyle(value, ...ranges[m]);
      }
      return `<td data-label="${m.toUpperCase()} (${METRIC_UNITS[m]})"><span class="log-cell"${style}>${formatNumber(value, METRIC_DECIMALS[m])}${deltaMark(value, prev)}</span></td>`;
    }).join('');
    return `<tr><td data-label="TIMESTAMP">${row.ts}</td>${cells}</tr>`;
  }).join('');
}

// TIMESTAMP AXIS
const timestampsEl = document.getElementById('chartTimestamps');
function updateTimestamps(){
  timestampsEl.innerHTML = '';
  if (labels.length < 2) return;

  const slots = labels.length;
  const step = (labels.length - 1) / (slots - 1);

  for (let i = 0; i < slots; i++){
    const idx = Math.round(i * step);
    const percent = (idx / (MAX_POINTS - 1)) * 100;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const fullLabel = labels[idx] || '';

    const span = document.createElement('span');
    span.textContent = isMobile ? fullLabel.slice(-2) : fullLabel;
    span.style.left = percent + '%';

    if (percent < 5) span.style.transform = 'translateX(0)';
    else if (percent > 95) span.style.transform = 'translateX(-100%)';
    else span.style.transform = 'translateX(-50%)';

    timestampsEl.appendChild(span);
  }
}

// MAIN LOOP
const subValueEls = document.querySelectorAll('.metric-sub [data-key]');

function updateDashboard(reading){
  METRICS.forEach(m => {
    document.getElementById(`val-${m}`).textContent = reading[m];
  });

  const isRealReading = 'daya_total' in reading;
  subValueEls.forEach(el => {
    if (isRealReading) el.parentElement.hidden = !(el.dataset.key in reading);
    el.textContent = reading[el.dataset.key] ?? '--';
  });

  const ts = new Date().toTimeString().slice(0, 8);
  labels.push(ts);
  if (labels.length > MAX_POINTS) labels.shift();

  METRICS.forEach(m => {
    history[m].push(reading[m]);
    if (history[m].length > MAX_POINTS) history[m].shift();
  });
  redrawChart();
  updateTimestamps();

  pushLogRow(ts, reading);
}

const emptyReading = { arus: 0, frekuensi: 0, kwh: 0, daya: 0, tegangan: 0 };
updateDashboard(emptyReading);

// LIVE REAL TIME DATA SOCKET.IO
const disconnectedOverlay = document.getElementById('disconnectedOverlay');
disconnectedOverlay.classList.add('show');

if (typeof io !== 'undefined' && !window.ELSYNC_SIM) {
  const socket = io();

  socket.on('meterData', (reading) => {
    disconnectedOverlay.classList.remove('show');
    updateDashboard(reading);
  });

  socket.on('meterError', () => {
    disconnectedOverlay.classList.add('show');
  });

  socket.on('disconnect', () => {
    disconnectedOverlay.classList.add('show');
    updateDashboard(emptyReading);
  });
}

// CHART HOVER TOOLTIP
const tooltip = document.getElementById('chartTooltip');

function hideHover(){
  tooltip.style.display = 'none';
  chartHoverDot.style.display = 'none';
  chartCrosshair.style.display = 'none';
  METRICS.forEach(m => { series[m].hoverDot.style.display = 'none'; });
}

function showAllTooltip(idx){
  const visible = METRICS.filter(m => !hiddenMetrics.has(m));
  if (!visible.length){
    hideHover();
    return;
  }

  const time = document.createElement('span');
  time.className = 'chart-tooltip-time';
  time.textContent = labels[idx];
  tooltip.replaceChildren(time);

  METRICS.forEach(m => { series[m].hoverDot.style.display = 'none'; });
  visible.forEach(m => {
    const row = document.createElement('span');
    row.className = 'chart-tooltip-row';
    const swatch = document.createElement('i');
    swatch.style.background = METRIC_COLORS[m];
    row.append(swatch, `${formatNumber(history[m][idx], METRIC_DECIMALS[m])} ${METRIC_UNITS[m]}`);
    tooltip.appendChild(row);

    placeAt(series[m].hoverDot, series[m].points[idx]);
    series[m].hoverDot.style.display = 'block';
  });

  const x = idx * STEP_X;
  tooltip.classList.add('is-side');
  tooltip.classList.toggle('is-flipped', x > VIEW_W * 0.7);
  tooltip.style.left = (x / VIEW_W * 100) + '%';
  tooltip.style.top = '14px';
  chartCrosshair.style.left = tooltip.style.left;
  tooltip.style.display = 'flex';
  chartCrosshair.style.display = 'block';
}

chartPlot.addEventListener('mousemove', (e) => {
  const rect = chartPlot.getBoundingClientRect();
  const xRatio = (e.clientX - rect.left) / rect.width;
  const idx = Math.max(0, Math.min(MAX_POINTS - 1, Math.round(xRatio * (MAX_POINTS - 1))));
  if (idx >= labels.length){
    hideHover();
    return;
  }
  if (activeMetric === 'all'){
    showAllTooltip(idx);
    return;
  }

  const point = chartPoints[idx];
  tooltip.classList.remove('is-side', 'is-flipped');
  tooltip.innerHTML = `<span class="chart-tooltip-time">${labels[idx]}</span>
    <span>${formatNumber(history[activeMetric][idx], METRIC_DECIMALS[activeMetric])} ${METRIC_UNITS[activeMetric]}</span>`;
  placeAt(tooltip, point);
  placeAt(chartHoverDot, point);
  chartCrosshair.style.left = tooltip.style.left;
  tooltip.style.display = 'flex';
  chartHoverDot.style.display = 'block';
  chartCrosshair.style.display = 'block';
});

chartPlot.addEventListener('mouseleave', hideHover);

// HISTORY
const HISTORY_BUCKET_LABELS = {
  '1H': 'jam',
  '3H': '3 jam',
  '12H': '12 jam',
  '1D': 'hari',
  '1W': 'minggu',
  '1M': 'bulan'
};

const historyHead = document.getElementById('historyHead');
const historyBody = document.getElementById('historyBody');
const historyMessage = document.getElementById('historyMessage');
const historyExportBtn = document.querySelector('#historyExport .export-btn');
let historyMetric = 'kwh';
let historyRange = '1H';
let historyRequest = 0;

function fetchHistory(metric, range){
  return fetch(`/api/history?metric=${metric}&range=${range}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => data.rows);
}

function formatHistoryTime(iso, range){
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (range === '1D' || range === '1W') return `${date}/${d.getFullYear()}`;
  return `${date} ${pad(d.getHours())}:00`;
}

function historyColumns(metric, range){
  const unit = METRIC_UNITS[metric];
  const decimals = METRIC_DECIMALS[metric];
  if (metric === 'kwh'){
    return [
      { key: 'value', label: 'KWH', unit, decimals },
      { key: 'delta', label: 'KONSUMSI', unit: `kWh / ${HISTORY_BUCKET_LABELS[range]}`, decimals: 2, highlight: true }
    ];
  }
  return [
    { key: 'value', label: 'RATA-RATA', unit, decimals, highlight: true },
    { key: 'min', label: 'MIN', unit, decimals },
    { key: 'max', label: 'MAKS', unit, decimals }
  ];
}

function renderHistory(rows){
  const columns = historyColumns(historyMetric, historyRange);
  historyHead.innerHTML = `<th>TIMESTAMP</th>${columns.map(col => `<th>${col.label}<small>${col.unit}</small></th>`).join('')}`;

  const main = columns.find(col => col.highlight);
  const mainValues = rows.map(r => r[main.key]).filter(v => v != null);
  const min = Math.min(...mainValues);
  const max = Math.max(...mainValues);

  historyBody.innerHTML = rows.map((row, i) => {
    const cells = columns.map(col => {
      const value = row[col.key];
      const label = `${col.label} (${col.unit})`;
      if (value == null) return `<td data-label="${label}"><span class="log-cell">–</span></td>`;
      const text = formatNumber(value, col.decimals);
      if (col !== main) return `<td data-label="${label}"><span class="log-cell">${text}</span></td>`;
      const older = rows[i + 1] ? rows[i + 1][col.key] : undefined;
      return `<td data-label="${label}"><span class="log-cell"${heatStyle(value, min, max)}>${text}${deltaMark(value, older ?? undefined)}</span></td>`;
    }).join('');
    return `<tr><td data-label="TIMESTAMP">${formatHistoryTime(row.recorded_at, historyRange)}</td>${cells}</tr>`;
  }).join('');

  historyMessage.hidden = rows.length > 0;
  historyMessage.textContent = 'Belum ada data';
  historyExportBtn.disabled = !rows.length;
}

function loadHistory(){
  const request = ++historyRequest;
  const source = window.ELSYNC_SIM_HISTORY || fetchHistory;
  source(historyMetric, historyRange)
    .then(rows => {
      if (request === historyRequest) renderHistory(rows);
    })
    .catch(() => {
      if (request !== historyRequest) return;
      historyHead.innerHTML = '';
      historyBody.innerHTML = '';
      historyMessage.textContent = 'Belum ada data';
      historyMessage.hidden = false;
      historyExportBtn.disabled = true;
    });
}

function wirePills(groupId, onSelect){
  const buttons = document.querySelectorAll(`#${groupId} button`);
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      onSelect(btn.dataset.value);
    });
  });
}

wirePills('historyMetrics', value => { historyMetric = value; loadHistory(); });
wirePills('historyRanges', value => { historyRange = value; loadHistory(); });

// BILLING
const BILLING_MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

const billingGrid = document.getElementById('billingGrid');
const billingMessage = document.getElementById('billingMessage');
const billingExportBtn = document.querySelector('#billingExport .export-btn');
let billingYear = '2026';
let billingRequest = 0;

function fetchBilling(year){
  return fetch(`/api/billing?year=${year}`).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function formatRupiah(value, decimals = 0){
  if (value == null) return '–';
  return 'Rp ' + Number(value).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function receiptHtml(item, data){
  const body = item.status === 'kosong'
    ? '<div class="receipt-empty">Belum ada data</div>'
    : `<div class="receipt-row"><span>Meter awal</span><b>${formatNumber(item.start, 2)} kWh</b></div>
       <div class="receipt-row"><span>Meter akhir</span><b>${formatNumber(item.end, 2)} kWh</b></div>
       <hr class="receipt-cut">
       <div class="receipt-usage"><span>PEMAKAIAN</span><b>${formatNumber(item.usage, 2)}<small>kWh</small></b></div>
       <div class="receipt-row"><span>Tarif per kWh</span><b>${formatRupiah(data.tariff, 2)}</b></div>
       <div class="receipt-total"><span>TOTAL</span><b>${formatRupiah(item.total)}</b></div>`;
  return `<article class="receipt">
    <div class="receipt-paper">
      <div><span class="receipt-month">${BILLING_MONTHS[item.month - 1]}</span><span class="receipt-year">${data.year}</span></div>
      <hr class="receipt-cut">
      ${body}
    </div>
    <div class="receipt-tear"></div>
  </article>`;
}

function loadBilling(){
  const request = ++billingRequest;
  const source = window.ELSYNC_SIM_BILLING || fetchBilling;
  source(billingYear)
    .then(data => {
      if (request !== billingRequest) return;
      billingGrid.innerHTML = data.months.map(item => receiptHtml(item, data)).join('');
      billingMessage.hidden = true;
      billingExportBtn.disabled = data.months.every(item => item.status === 'kosong');
    })
    .catch(() => {
      if (request !== billingRequest) return;
      billingGrid.innerHTML = '';
      billingMessage.textContent = 'Belum ada data';
      billingMessage.hidden = false;
      billingExportBtn.disabled = true;
    });
}

wirePills('billingYears', value => { billingYear = value; loadBilling(); });

// LOGOUT
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fetch('/api/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => { window.location.href = 'login.html'; });
  });
});

// WIRING
const exportControls = document.querySelectorAll('.export-control');

function exportUrl(control, format){
  if (control.id === 'historyExport'){
    return `/api/history/export?format=${format}&metric=${historyMetric}&range=${historyRange}`;
  }
  if (control.id === 'billingExport'){
    return `/api/billing/export?format=${format}&year=${billingYear}`;
  }
  return `/api/logs/export?format=${format}`;
}

exportControls.forEach(control => {
  control.querySelector('.export-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    control.classList.toggle('open');
  });

  control.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = exportUrl(control, opt.dataset.format);
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      control.classList.remove('open');
    });
  });
});

document.addEventListener('click', () => {
  exportControls.forEach(control => control.classList.remove('open'));
});
