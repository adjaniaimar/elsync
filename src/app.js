// CONFIG
const MAX_POINTS = 10;
const POLL_INTERVAL_MS = 10000;

const METRICS = ['arus', 'frekuensi', 'kwh', 'daya', 'tegangan'];

const DEFAULT_CHART_METRIC = 'daya';

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
let activeMetric = DEFAULT_CHART_METRIC;
let chartPoints = [];

// CHART SETUP
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 1000, VIEW_H = 300;
const STEP_X = VIEW_W / (MAX_POINTS - 1);

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

function redrawChart(){
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
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const metric = btn.dataset.metric;
    navItems.forEach(b => b.classList.toggle('active', b.dataset.metric === metric));
    activeMetric = metric === 'all' ? DEFAULT_CHART_METRIC : metric;
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
        const [min, max] = ranges[m];
        const t = max > min ? (value - min) / (max - min) : 0;
        style = ` style="background:rgba(110,13,18,${(0.04 + 0.26 * t).toFixed(3)})"`;
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

if (typeof io !== 'undefined') {
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
}

chartPlot.addEventListener('mousemove', (e) => {
  const rect = chartPlot.getBoundingClientRect();
  const xRatio = (e.clientX - rect.left) / rect.width;
  const idx = Math.max(0, Math.min(MAX_POINTS - 1, Math.round(xRatio * (MAX_POINTS - 1))));
  const point = chartPoints[idx];
  if (!point){
    hideHover();
    return;
  }

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

// LOGOUT
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fetch('/api/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => { window.location.href = 'login.html'; });
  });
});

// WIRING
const exportControl = document.getElementById('exportControl');
const exportBtn = document.getElementById('exportBtn');

exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportControl.classList.toggle('open');
});
document.addEventListener('click', () => exportControl.classList.remove('open'));

document.querySelectorAll('.export-option').forEach(opt => {
  opt.addEventListener('click', () => {
    const format = opt.dataset.format;
    const link = document.createElement('a');
    link.href = `/api/logs/export?format=${format}`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    exportControl.classList.remove('open');
  });
});