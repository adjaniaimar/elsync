CREATE TABLE IF NOT EXISTS readings_3p (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tegangan_r  FLOAT, tegangan_s FLOAT, tegangan_t FLOAT,
  arus_r      FLOAT, arus_s     FLOAT, arus_t     FLOAT,
  daya_r      FLOAT, daya_s     FLOAT, daya_t     FLOAT,
  daya_total  FLOAT,
  pf          FLOAT,
  frekuensi   FLOAT,
  kwh         DOUBLE,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recorded_at (recorded_at)
);
