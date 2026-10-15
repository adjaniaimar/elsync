const mysql = require('mysql2/promise');

const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

if (DB_USER === 'root' || DB_PASS === '') {
  console.warn(
    '[security] Database is using the root account and/or an empty password. ' +
    'Create a dedicated MySQL user with only INSERT/SELECT on elsync_db and set ' +
    'DB_USER/DB_PASS in server/.env.'
  );
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: DB_USER,
  password: DB_PASS,
  database: process.env.DB_NAME || 'elsync_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

const COLUMNS_3P = [
  'tegangan_r', 'tegangan_s', 'tegangan_t',
  'arus_r', 'arus_s', 'arus_t',
  'daya_r', 'daya_s', 'daya_t', 'daya_total',
  'pf', 'frekuensi', 'kwh'
];

async function insertReading(reading) {
  const placeholders = COLUMNS_3P.map(() => '?').join(', ');
  await pool.query(
    `INSERT INTO readings_3p (${COLUMNS_3P.join(', ')}) VALUES (${placeholders})`,
    COLUMNS_3P.map((c) => reading[c])
  );
}

async function getReadings(limit = 1000) {
  const [rows] = await pool.query(
    `SELECT id, ${COLUMNS_3P.join(', ')}, recorded_at FROM readings_3p ORDER BY recorded_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

async function closePool() {
  await pool.end();
}

module.exports = { insertReading, getReadings, closePool };
