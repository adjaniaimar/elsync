// SIMULATION DATA
(function(){
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!isLocal || new URLSearchParams(location.search).get('sim') !== '1') return;

  window.ELSYNC_SIM = true;

  const INTERVAL_MS = 2000;
  const state = { arus: 3.3, tegangan: 221, frekuensi: 50, pf: 0.96, kwh: 1242.3 };

  const drift = (value, step, min, max) =>
    Math.min(max, Math.max(min, value + (Math.random() - 0.5) * step));
  const round = (value, decimals) => +value.toFixed(decimals);
  const phase = (base, spread) => base + (Math.random() - 0.5) * spread;

  function nextReading(){
    state.frekuensi = drift(state.frekuensi, 0.04, 49.9, 50.1);
    state.pf = drift(state.pf, 0.01, 0.9, 0.99);
    state.arus = drift(state.arus, 0.2, 2.5, 4.5);
    state.tegangan = drift(state.tegangan, 0.6, 216, 226);

    const arus = [phase(state.arus, 0.3), phase(state.arus, 0.3), phase(state.arus, 0.3)];
    const tegangan = [phase(state.tegangan, 2), phase(state.tegangan, 2), phase(state.tegangan, 2)];
    const daya = arus.map((a, i) => a * tegangan[i] * state.pf);
    const dayaTotal = daya[0] + daya[1] + daya[2];
    state.kwh += dayaTotal * (INTERVAL_MS / 3600000) / 1000 * 20;

    return {
      arus: round((arus[0] + arus[1] + arus[2]) / 3, 2),
      frekuensi: round(state.frekuensi, 2),
      kwh: round(state.kwh, 2),
      daya: round(dayaTotal, 0),
      tegangan: round((tegangan[0] + tegangan[1] + tegangan[2]) / 3, 1),
      daya_total: round(dayaTotal, 0),
      pf: round(state.pf, 2),
      arus_r: round(arus[0], 2), arus_s: round(arus[1], 2), arus_t: round(arus[2], 2),
      daya_r: round(daya[0], 0), daya_s: round(daya[1], 0), daya_t: round(daya[2], 0),
      tegangan_r: round(tegangan[0], 1), tegangan_s: round(tegangan[1], 1), tegangan_t: round(tegangan[2], 1)
    };
  }

  function seedHistory(){
    labels.length = 0;
    logRows.length = 0;
    METRICS.forEach(m => { history[m].length = 0; });

    const now = Date.now();
    for (let i = MAX_POINTS - 1; i > 0; i--){
      const reading = nextReading();
      const ts = new Date(now - i * INTERVAL_MS).toTimeString().slice(0, 8);
      labels.push(ts);
      METRICS.forEach(m => history[m].push(reading[m]));
      logRows.unshift({ ts, reading });
    }
    logRows.length = Math.min(logRows.length, LOG_ROWS - 1);
  }

  const SIM_RANGES = {
    '1H': [3600, 24], '3H': [10800, 24], '12H': [43200, 14],
    '1D': [86400, 30], '1W': [604800, 12, 259200], '1M': [2592000, 3]
  };
  const SIM_BASE = {
    arus: [3.3, 0.5, 2], frekuensi: [50, 0.05, 2], daya: [2100, 300, 0], tegangan: [221, 3, 1]
  };

  window.ELSYNC_SIM_HISTORY = (metric, range) => {
    const [bucket, count, shift = 0] = SIM_RANGES[range];
    const offset = -new Date().getTimezoneOffset() * 60 + shift;
    const start = Math.floor((Date.now() / 1000 + offset) / bucket) * bucket - offset;
    const now = new Date();
    let kwh = state.kwh;
    const rows = [];

    for (let i = 0; i < count; i++){
      const time = range === '1M'
        ? new Date(now.getFullYear(), now.getMonth() - i, 1)
        : new Date((start - i * bucket) * 1000);
      const recorded_at = time.toISOString();
      if (metric === 'kwh'){
        const delta = (40 + Math.random() * 9.9) * bucket / SIM_RANGES['1M'][0];
        rows.push({ recorded_at, value: round(kwh, 2), delta: round(delta, 3) });
        kwh -= delta;
        continue;
      }
      const [base, spread, decimals] = SIM_BASE[metric];
      const value = phase(base, spread);
      rows.push({
        recorded_at,
        value: round(value, decimals),
        min: round(value - Math.random() * spread / 2, decimals),
        max: round(value + Math.random() * spread / 2, decimals)
      });
    }
    return Promise.resolve(rows);
  };

  const SIM_TARIFF = 1444.7;
  const simBilling = {};

  window.ELSYNC_SIM_BILLING = (yearText) => {
    const year = Number(yearText);
    if (simBilling[year]) return Promise.resolve(simBilling[year]);

    const now = new Date();
    const lastMonth = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;
    const usages = Array.from({ length: lastMonth }, () => 40 + Math.random() * 9.9);
    let start = state.kwh - usages.reduce((a, b) => a + b, 0);

    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      if (month > lastMonth) {
        return { month, status: 'kosong', start: null, end: null, usage: null, total: null };
      }
      const usage = round(usages[i], 2);
      const row = {
        month,
        status: year === now.getFullYear() && month === lastMonth ? 'berjalan' : 'selesai',
        start: round(start, 2),
        end: round(start + usages[i], 2),
        usage,
        total: Math.round(usage * SIM_TARIFF)
      };
      start += usages[i];
      return row;
    });

    simBilling[year] = { year, tariff: SIM_TARIFF, months };
    return Promise.resolve(simBilling[year]);
  };

  window.addEventListener('load', () => {
    disconnectedOverlay.classList.remove('show');
    seedHistory();
    updateDashboard(nextReading());
    setInterval(() => updateDashboard(nextReading()), INTERVAL_MS);
  });
})();
