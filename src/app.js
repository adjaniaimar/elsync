// CONFIG //
const MAX_POINTS = 20;
const POLL_INTERVAL_MS = 10000;

const METRICS = ['arus', 'frekuensi', 'kwh', 'daya', 'tegangan'];

const METRIC_COLORS = {
  arus: '#F4B183',
  frekuensi: '#ED9455',
  kwh: '#DE7C29',
  daya: '#B85C1E',
  tegangan: '#7A3B12'
};

const METRIC_UNITS = {
  arus: 'A',
  frekuensi: 'Hz',
  kwh: 'kWh',
  daya: 'W',
  tegangan: 'V'
};

// RUNNING STATE //
let kwhTotal = 142.881;
const history = { arus: [], frekuensi: [], kwh: [], daya: [], tegangan: [] };
const labels = [];

// SIMULATED DATA //
function simulateReading(){
  const tegangan = 219 + Math.random() * 3;
  const daya = 470 + Math.random() * 70;
  const arus = daya / tegangan;
  const frekuensi = 49.9 + Math.random() * 0.2;
  kwhTotal += (daya / 3600 / 1000) * (POLL_INTERVAL_MS / 1000);

  return {
    arus: +arus.toFixed(2),
    frekuensi: +frekuensi.toFixed(2),
    kwh: +kwhTotal.toFixed(3),
    daya: Math.round(daya),
    tegangan: +tegangan.toFixed(1)
  };
}

// CHART SETUP //
const svg = document.getElementById('realtimeChart');
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 1000, VIEW_H = 260, PAD_TOP = 12, PAD_BOTTOM = 24, PAD_X = 4;

const visibleMetrics = new Set(METRICS);

// GRIDLINES //
function drawGrid(){
  for (let i = 0; i <= 4; i++){
    const y = PAD_TOP + (i / 4) * (VIEW_H - PAD_TOP - PAD_BOTTOM);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', PAD_X);
    line.setAttribute('x2', VIEW_W - PAD_X);
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    line.setAttribute('stroke', '#EFEFEF');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }
}

const linePaths = {};
METRICS.forEach(m => {
  const path = document.createElementNS(SVG_NS, 'polyline');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', METRIC_COLORS[m]);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  linePaths[m] = path;
});

drawGrid();

function normalize(values){
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  return values.map(v => 1 - (v - min) / range);
}

function redrawChart(){
  METRICS.forEach(m => {
    const data = history[m];
    if (data.length < 2 || !visibleMetrics.has(m)){
      linePaths[m].setAttribute('points', '');
      linePaths[m].style.display = visibleMetrics.has(m) ? 'block' : 'none';
      return;
    }
    linePaths[m].style.display = 'block';
    const norm = normalize(data);
    const step = (VIEW_W - PAD_X * 2) / (MAX_POINTS - 1);
    const points = norm.map((v, idx) => {
      const x = PAD_X + idx * step;
      const y = PAD_TOP + v * (VIEW_H - PAD_TOP - PAD_BOTTOM);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    linePaths[m].setAttribute('points', points.join(' '));
  });
}

// LEGEND //
const legendEl = document.getElementById('chartLegend');
METRICS.forEach(m => {
  const item = document.createElement('div');
  item.className = 'legend-item';
  item.dataset.metric = m;
  item.style.borderColor = METRIC_COLORS[m];
  item.innerHTML = `<span class="legend-swatch" style="background:${METRIC_COLORS[m]}"></span>${m.toUpperCase()}`;
  item.addEventListener('click', () => toggleMetric(m));
  legendEl.appendChild(item);
});

function toggleMetric(metric){
  if (visibleMetrics.has(metric)){
    visibleMetrics.delete(metric);
  } else {
    visibleMetrics.add(metric);
  }
  legendEl.querySelector(`[data-metric="${metric}"]`).classList.toggle('hidden', !visibleMetrics.has(metric));
  redrawChart();
}

function setVisibleMetrics(metrics){
  visibleMetrics.clear();
  metrics.forEach(m => visibleMetrics.add(m));
  METRICS.forEach(m => {
    legendEl.querySelector(`[data-metric="${m}"]`).classList.toggle('hidden', !visibleMetrics.has(m));
  });
  redrawChart();
}

// SIDEBAR FILTER //
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const metric = btn.dataset.metric;
    setVisibleMetrics(metric === 'all' ? METRICS : [metric]);
  });
});

// CARD HIGHLIGHT //
document.querySelectorAll('.metric-card').forEach(card => {
  card.addEventListener('click', () => {
    const metric = card.dataset.metric;
    const target = document.querySelector(`.nav-item[data-metric="${metric}"]`);
    if (target) target.click();
  });
});

// LOG TABLE //
const logBody = document.getElementById('logBody');
function pushLogRow(ts, reading){
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${ts}</td>
    <td>${reading.arus} A</td>
    <td>${reading.frekuensi} Hz</td>
    <td>${reading.kwh} kWh</td>
    <td>${reading.daya} W</td>
    <td>${reading.tegangan} V</td>
  `;
  logBody.prepend(row);
  while (logBody.children.length > 8) logBody.removeChild(logBody.lastChild);
}

// TIMESTAMP AXIS //
const timestampsEl = document.getElementById('chartTimestamps');
function updateTimestamps(){
  timestampsEl.innerHTML = '';
  if (labels.length < 2) return;

  const maxSlots = 5;
  const slots = Math.min(maxSlots, labels.length);
  const step = (labels.length - 1) / (slots - 1);

  for (let i = 0; i < slots; i++){
    const idx = Math.round(i * step);
    const percent = (idx / (MAX_POINTS - 1)) * 100;

    const span = document.createElement('span');
    span.textContent = labels[idx] || '';
    span.style.left = percent + '%';

    if (percent < 5) span.style.transform = 'translateX(0)';
    else if (percent > 95) span.style.transform = 'translateX(-100%)';
    else span.style.transform = 'translateX(-50%)';

    timestampsEl.appendChild(span);
  }
}

// MAIN LOOP //
function updateDashboard(reading){
  METRICS.forEach(m => {
    document.getElementById(`val-${m}`).textContent = reading[m];
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

setInterval(() => {
  if (!usingLiveData) updateDashboard(simulateReading());
}, POLL_INTERVAL_MS);
updateDashboard(simulateReading());

// LIVE REAL TIME DATA SOCKET.IO //
let usingLiveData = false;

if (typeof io !== 'undefined') {
  const socket = io();

  socket.on('connect', () => {
    console.log('[elsync] Connected to server — switching to live Modbus data');
    usingLiveData = true;
  });

  socket.on('meterData', (reading) => {
    usingLiveData = true;
    updateDashboard(reading);
  });

  socket.on('meterError', (err) => {
    console.warn('[elsync] Modbus read error:', err.message);
  });

  socket.on('disconnect', () => {
    console.log('[elsync] Server disconnected — back to simulated data');
    usingLiveData = false;
  });
}

// CHART HOVER TOOLTIP //
const hitlayer = document.getElementById('chartHitlayer');
const tooltip = document.getElementById('chartTooltip');

hitlayer.addEventListener('mousemove', (e) => {
  const rect = hitlayer.getBoundingClientRect();
  const xRatio = (e.clientX - rect.left) / rect.width;
  const maxIdx = MAX_POINTS - 1;
  const idx = Math.max(0, Math.min(maxIdx, Math.round(xRatio * maxIdx)));

  if (idx >= labels.length){
    tooltip.style.display = 'none';
    return;
  }

  let html = '';
  METRICS.forEach(m => {
    if (!visibleMetrics.has(m)) return;
    const val = history[m][idx];
    if (val === undefined) return;
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
      <span style="width:7px;height:7px;border-radius:50%;background:${METRIC_COLORS[m]}"></span>
      ${val} ${METRIC_UNITS[m]}
    </div>`;
  });
  tooltip.innerHTML = html || 'No data';

  const xPercent = (idx / maxIdx) * 100;
  tooltip.style.left = xPercent + '%';
  tooltip.style.display = 'block';
});

hitlayer.addEventListener('mouseleave', () => {
  tooltip.style.display = 'none';
});