const ModbusRTU = require('modbus-serial');
const { SERIAL_PORT, BAUD_RATE, PARITY, STOP_BITS, SLAVE_ID, REGISTERS } = require('./config');

const client = new ModbusRTU();
let connected = false;

async function connect() {
  const RETRY_DELAY_MS = 5000;
  let attempt = 0;

  while (!connected) {
    attempt++;
    try {
      await client.connectRTUBuffered(SERIAL_PORT, {
        baudRate: BAUD_RATE,
        parity: PARITY,
        dataBits: 8,
        stopBits: STOP_BITS
      });
      client.setID(SLAVE_ID);
      client.setTimeout(1000);
      connected = true;
      console.log(`[modbus] Connected on ${SERIAL_PORT} @ ${BAUD_RATE}bps, slave id ${SLAVE_ID} (percobaan ke-${attempt})`);
    } catch (err) {
      console.error(`[modbus] Percobaan ke-${attempt} gagal connect ${SERIAL_PORT}: ${err.message}`);
      console.error(`[modbus] Kemungkinan port belum siap (misal baru saja boot Windows) atau kabel/power MAX485 bermasalah. Coba lagi dalam ${RETRY_DELAY_MS / 1000} detik...`);
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
    try {
      client.close(() => resolve());
    } catch (e) {
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

// CONVERT 2 REGISTERS //
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

  value = value * (reg.scale ?? 1);
  return +value.toFixed(reg.decimals ?? 2);
}

async function pollOnce() {
  const reading = {};
  for (const [key, reg] of Object.entries(REGISTERS)) {
    reading[key] = await readMetric(key, reg);
  }
  return reading;
}

module.exports = { connect, isConnected, pollOnce, handleDisconnect };