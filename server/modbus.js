const ModbusRTU = require('modbus-serial');
const { SERIAL_PORT, BAUD_RATE, PARITY, STOP_BITS, SLAVE_ID, REGISTERS } = require('./config');

const client = new ModbusRTU();
let connected = false;

async function connect() {
  await client.connectRTUBuffered(SERIAL_PORT, {
    baudRate: BAUD_RATE,
    parity: PARITY,
    dataBits: 8,
    stopBits: STOP_BITS
  });
  client.setID(SLAVE_ID);
  client.setTimeout(1000);
  connected = true;
  console.log(`[modbus] Connected on ${SERIAL_PORT} @ ${BAUD_RATE}bps, slave id ${SLAVE_ID}`);
}

function isConnected() {
  return connected;
}

// Convert 2 register (4 byte) response into a float32 value.
// CHINT meters commonly send big-endian word order (ABCD),
// but some firmware sends word-swapped (CDAB) — verify with Modbus Poll.
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

module.exports = { connect, isConnected, pollOnce };