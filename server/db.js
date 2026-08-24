const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'elsync_db',
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

module.exports = { insertReading };