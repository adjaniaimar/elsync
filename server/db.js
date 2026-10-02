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

async function insertReading(reading) {
  const { tegangan, arus, daya, frekuensi, kwh } = reading;
  await pool.query(
    `INSERT INTO readings (tegangan, arus, daya, frekuensi, kwh) VALUES (?, ?, ?, ?, ?)`,
    [tegangan, arus, daya, frekuensi, kwh]
  );
}

async function getReadings(limit = 1000) {
  const [rows] = await pool.query(
    `SELECT id, tegangan, arus, daya, frekuensi, kwh, recorded_at FROM readings ORDER BY recorded_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = { insertReading, getReadings };
