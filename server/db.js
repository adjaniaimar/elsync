const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PANEL_ID } = require('./config');

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

async function closeDb() {
  try { db.close(); } catch { /* sudah tertutup */ }
}

module.exports = { insertReading, getReadings, closeDb, DB_FILE };
