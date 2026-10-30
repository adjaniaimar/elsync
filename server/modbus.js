const ModbusRTU = require('modbus-serial');
const { METER_HOST, METER_PORT, MODBUS_MODE, SLAVE_ID, MODBUS_TIMEOUT_MS, REGISTERS } = require('./config');

const client = new ModbusRTU();
let connected = false;
let stopping = false;
let ctRatio = 1;

async function readCtRatio() {
  const res = await client.readHoldingRegisters(0x0006, 1);
  const irat = res.data[0];
  if (!irat) throw new Error('IrAt terbaca 0');
  ctRatio = irat;
}

function openConnection() {
  const opts = { port: METER_PORT };
  if (MODBUS_MODE === 'rtu-over-tcp') return client.connectTcpRTUBuffered(METER_HOST, opts);
  return client.connectTCP(METER_HOST, opts);
}

async function connect() {
  const RETRY_DELAY_MS = 5000;
  let attempt = 0;

  while (!connected && !stopping) {
    attempt++;
    try {
      await openConnection();
      client.setID(SLAVE_ID);
      client.setTimeout(MODBUS_TIMEOUT_MS);
      await readCtRatio();
      connected = true;
      console.log(`[modbus] Connected ke ${METER_HOST}:${METER_PORT} (${MODBUS_MODE}), slave id ${SLAVE_ID}, rasio CT (IrAt) ${ctRatio} (percobaan ke-${attempt})`);
    } catch (err) {
      await closeClient();
      console.error(`[modbus] Percobaan ke-${attempt} gagal connect ${METER_HOST}:${METER_PORT}: ${err.message}`);
      console.error(`[modbus] Cek: DR302 menyala, kabel LAN, IP/port di config.js, dan PC satu subnet dengan DR302. Coba lagi dalam ${RETRY_DELAY_MS / 1000} detik...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

function isConnected() {
  return connected;
}

let reconnecting = false;

function closeClient() {
  return new Promise((resolve) => {
    if (!client.isOpen) return resolve();
    const timer = setTimeout(resolve, 2000);
    try {
      client.close(() => { clearTimeout(timer); resolve(); });
    } catch (e) {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function handleDisconnect() {
  connected = false;
  if (reconnecting) return;
  reconnecting = true;

  console.error('[modbus] Koneksi terputus berkali-kali. Menutup port lama dan mencoba reconnect...');

  await closeClient();
  await connect();

  reconnecting = false;
}

async function close() {
  stopping = true;
  connected = false;
  await closeClient();
}

// CONVERT 2 REGISTERS
function bytesToFloat(buffer, byteOrder) {
  if (byteOrder === 'CDAB') {
    const swapped = Buffer.from([buffer[2], buffer[3], buffer[0], buffer[1]]);
    return swapped.readFloatBE(0);
  }
  return buffer.readFloatBE(0);
}

async function readMetric(key, reg) {
  const result = await client.readHoldingRegisters(reg.address, reg.length);

  let value;
  if (reg.length === 2) {
    value = bytesToFloat(result.buffer, reg.byteOrder || 'ABCD');
  } else {
    value = result.data[0];
  }

  value = value * (reg.scale ?? 1) * (reg.kaliCT ? ctRatio : 1);
  return +value.toFixed(reg.decimals ?? 2);
}

function addSummary(r) {
  const avg = (a, b, c) => +((a + b + c) / 3).toFixed(2);
  r.tegangan = 'tegangan_r' in r
    ? avg(r.tegangan_r, r.tegangan_s, r.tegangan_t)
    : avg(r.tegangan_rs, r.tegangan_st, r.tegangan_tr);
  r.arus = avg(r.arus_r, r.arus_s, r.arus_t);
  r.daya = r.daya_total;
  return r;
}

async function pollOnce() {
  const reading = {};
  for (const [key, reg] of Object.entries(REGISTERS)) {
    reading[key] = await readMetric(key, reg);
  }
  return addSummary(reading);
}

module.exports = { connect, isConnected, pollOnce, handleDisconnect, close };