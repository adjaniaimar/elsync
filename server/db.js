const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PANEL_ID, BILLING_TARIFF_PER_KWH } = require('./config');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'elsync.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

const COLUMNS_3P = [
  'tegangan_r', 'tegangan_s', 'tegangan_t',
  'tegangan_rs', 'tegangan_st', 'tegangan_tr',
  'arus_r', 'arus_s', 'arus_t',
  'daya_r', 'daya_s', 'daya_t', 'daya_total',
  'pf', 'frekuensi', 'kwh'
];

db.exec(`
  CREATE TABLE IF NOT EXISTS readings_3p (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id    TEXT NOT NULL,
    ${COLUMNS_3P.map((c) => `${c} REAL`).join(',\n    ')},
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_panel_time ON readings_3p (panel_id, recorded_at);
`);

const insertStmt = db.prepare(
  `INSERT INTO readings_3p (panel_id, ${COLUMNS_3P.join(', ')}) VALUES (?, ${COLUMNS_3P.map(() => '?').join(', ')})`
);
const selectStmt = db.prepare(
  `SELECT id, panel_id, ${COLUMNS_3P.join(', ')}, recorded_at FROM readings_3p ORDER BY recorded_at DESC LIMIT ?`
);

async function insertReading(reading) {
  insertStmt.run(PANEL_ID, ...COLUMNS_3P.map((c) => reading[c] ?? null));
}

async function getReadings(limit = 1000) {
  return selectStmt.all(limit).map((row) => ({ ...row }));
}

// HISTORY
const HISTORY_METRICS = {
  kwh: { expr: 'kwh', decimals: 2, label: 'KWH (kWh)' },
  arus: { expr: '(arus_r + arus_s + arus_t) / 3', decimals: 2, label: 'Arus (A)' },
  frekuensi: { expr: 'frekuensi', decimals: 2, label: 'Frekuensi (Hz)' },
  daya: { expr: 'daya_total', decimals: 0, label: 'Daya (W)' },
  tegangan: {
    expr: '(COALESCE(tegangan_r, tegangan_rs) + COALESCE(tegangan_s, tegangan_st) + COALESCE(tegangan_t, tegangan_tr)) / 3',
    decimals: 1,
    label: 'Tegangan (V)',
  },
};

const HISTORY_RANGES = {
  '1H': { bucket: 3600, count: 24 },
  '3H': { bucket: 3 * 3600, count: 24 },
  '12H': { bucket: 12 * 3600, count: 14 },
  '1D': { bucket: 86400, count: 30 },
  '1W': { bucket: 7 * 86400, count: 12, shift: 3 * 86400 },
  '1M': { months: 3 },
};

const historyStmts = {};
function historyStmt(metric, monthly) {
  const cacheKey = `${metric}:${monthly}`;
  if (historyStmts[cacheKey]) return historyStmts[cacheKey];
  const { expr } = HISTORY_METRICS[metric];
  // kWh angka akumulasi: pakai nilai terakhir tiap interval, bukan rata-rata
  const values = metric === 'kwh'
    ? 'kwh AS value, MAX(recorded_at) AS last_at'
    : `AVG(${expr}) AS value, MIN(${expr}) AS min, MAX(${expr}) AS max`;
  const bucketExpr = monthly
    ? "strftime('%Y-%m', recorded_at, ?)"
    : "CAST((strftime('%s', recorded_at) + ?) / ? AS INTEGER)";
  historyStmts[cacheKey] = db.prepare(`
    SELECT ${bucketExpr} AS bucket, ${values}
    FROM readings_3p
    WHERE panel_id = ? AND recorded_at >= ? AND ${expr} IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket DESC
  `);
  return historyStmts[cacheKey];
}

function historyWindow(metric, range) {
  const { bucket, count, shift = 0, months } = HISTORY_RANGES[range];
  const tzOffset = -new Date().getTimezoneOffset() * 60;
  const extra = metric === 'kwh' ? 1 : 0;

  if (months) {
    const now = new Date();
    const monthStart = (back) => new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      first: key(monthStart(months - 1)),
      since: monthStart(months - 1 + extra).toISOString(),
      time: (k) => new Date(+k.slice(0, 4), +k.slice(5) - 1, 1).toISOString(),
      params: [`${tzOffset >= 0 ? '+' : ''}${tzOffset} seconds`],
    };
  }

  const offset = tzOffset + shift;
  const first = Math.floor((Date.now() / 1000 + offset) / bucket) - count + 1;
  const time = (b) => new Date((b * bucket - offset) * 1000).toISOString();
  return { first, since: time(first - extra), time, params: [offset, bucket] };
}

async function getHistory(metric, range) {
  const { decimals } = HISTORY_METRICS[metric];
  const round = (value, digits) => (value == null ? null : +value.toFixed(digits));

  const { first, since, time, params } = historyWindow(metric, range);
  const rows = historyStmt(metric, Boolean(HISTORY_RANGES[range].months)).all(...params, PANEL_ID, since);

  return rows.filter((row) => row.bucket >= first).map((row, i) => {
    const base = { recorded_at: time(row.bucket), value: round(row.value, decimals) };
    if (metric !== 'kwh') {
      return { ...base, min: round(row.min, decimals), max: round(row.max, decimals) };
    }
    const older = rows[i + 1];
    const delta = older ? row.value - older.value : null;
    return { ...base, delta: delta == null || delta < 0 ? null : round(delta, 2) };
  });
}

// BILLING
const BILLING_YEARS = [2026, 2027];

const billingEdgeStmt = (order) => db.prepare(`
  SELECT kwh AS value FROM readings_3p
  WHERE panel_id = ? AND recorded_at >= ? AND recorded_at < ? AND kwh IS NOT NULL
  ORDER BY recorded_at ${order}
  LIMIT 1
`);
const billingFirstStmt = billingEdgeStmt('ASC');
const billingLastStmt = billingEdgeStmt('DESC');

async function getBilling(year) {
  const round = (value) => +value.toFixed(2);
  const monthEdges = (y, monthIndex) => {
    const params = [
      PANEL_ID,
      new Date(y, monthIndex, 1).toISOString(),
      new Date(y, monthIndex + 1, 1).toISOString(),
    ];
    return { first: billingFirstStmt.get(...params)?.value, last: billingLastStmt.get(...params)?.value };
  };

  const now = new Date();
  const months = [];
  let previousEnd = monthEdges(year - 1, 11).last;
  for (let month = 1; month <= 12; month++) {
    const { first, last: end } = monthEdges(year, month - 1);
    if (end === undefined) {
      months.push({ month, status: 'kosong', start: null, end: null, usage: null, total: null });
      previousEnd = undefined;
      continue;
    }

    let start = previousEnd ?? first;
    if (end < start) start = first;
    previousEnd = end;
    const usage = round(end - start);

    months.push({
      month,
      status: year === now.getFullYear() && month === now.getMonth() + 1 ? 'berjalan' : 'selesai',
      start: round(start),
      end: round(end),
      usage,
      total: BILLING_TARIFF_PER_KWH == null ? null : Math.round(usage * BILLING_TARIFF_PER_KWH),
    });
  }
  return { year, tariff: BILLING_TARIFF_PER_KWH, months };
}

async function closeDb() {
  try { db.close(); } catch { /* sudah tertutup */ }
}

module.exports = {
  insertReading,
  getReadings,
  getHistory,
  HISTORY_METRICS,
  HISTORY_RANGES,
  getBilling,
  BILLING_YEARS,
  closeDb,
  DB_FILE,
};
