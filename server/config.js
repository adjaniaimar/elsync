const f32 = (address, scale, decimals = 2) => ({ address, length: 2, byteOrder: 'ABCD', scale, decimals });
const ct = (reg) => ({ ...reg, kaliCT: true });

module.exports = {
  METER_HOST: '192.168.0.7',
  METER_PORT: 502,
  MODBUS_MODE: 'tcp',
  SLAVE_ID: 1,
  MODBUS_TIMEOUT_MS: 2000,

  // POLLING
  POLL_INTERVAL_MS: 10000,

  // HTTP SERVER
  HTTP_PORT: 3001,

  SISTEM: '3P3W',

  // PANEL
  PANEL_ID: 'panel-1',
};

// REGISTER MAP DTSU666 — R/S/T = phase A/B/C
const COMMON = {
  arus_r:     ct(f32(0x200C, 0.001, 3)),
  arus_s:     ct(f32(0x200E, 0.001, 3)),
  arus_t:     ct(f32(0x2010, 0.001, 3)),
  daya_total: ct(f32(0x2012, 0.1)),
  pf:         f32(0x202A, 0.001, 3),
  frekuensi:  f32(0x2044, 0.01),
  kwh:        ct(f32(0x401E, 1))
};

const PER_SISTEM = {
  '3P4W': {
    tegangan_r: f32(0x2006, 0.1),
    tegangan_s: f32(0x2008, 0.1),
    tegangan_t: f32(0x200A, 0.1),
    daya_r:     ct(f32(0x2014, 0.1)),
    daya_s:     ct(f32(0x2016, 0.1)),
    daya_t:     ct(f32(0x2018, 0.1))
  },
  
  '3P3W': {
    tegangan_rs: f32(0x2000, 0.1, 1),
    tegangan_st: f32(0x2002, 0.1, 1),
    tegangan_tr: f32(0x2004, 0.1, 1)
  }
};

if (!PER_SISTEM[module.exports.SISTEM]) {
  throw new Error(`[config] SISTEM harus '3P4W' atau '3P3W', bukan '${module.exports.SISTEM}'`);
}
module.exports.REGISTERS = { ...PER_SISTEM[module.exports.SISTEM], ...COMMON };
