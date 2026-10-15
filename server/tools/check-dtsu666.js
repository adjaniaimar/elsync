const ModbusRTU = require('modbus-serial');
const config = require('../config');

const host = process.argv[2] || config.METER_HOST;
const port = Number(process.argv[3]) || config.METER_PORT;

async function main() {
  const client = new ModbusRTU();
  const opts = { port };
  if (config.MODBUS_MODE === 'rtu-over-tcp') await client.connectTcpRTUBuffered(host, opts);
  else await client.connectTCP(host, opts);
  client.setID(config.SLAVE_ID);
  client.setTimeout(config.MODBUS_TIMEOUT_MS);
  console.log(`Connected ke ${host}:${port} (${config.MODBUS_MODE}), slave id ${config.SLAVE_ID}\n`);

  try {
    const ratio = await client.readHoldingRegisters(0x0006, 2);
    console.log(`IrAt (rasio CT) = ${ratio.data[0]}   UrAt (rasio PT) = ${ratio.data[1]}\n`);
  } catch (err) {
    console.log(`Gagal baca IrAt/UrAt: ${err.message}\n`);
  }

  const rows = [];
  for (const [key, reg] of Object.entries(config.REGISTERS)) {
    try {
      const res = await client.readHoldingRegisters(reg.address, reg.length);
      const raw = res.buffer.readFloatBE(0);
      rows.push({
        metric: key,
        register: '0x' + reg.address.toString(16).toUpperCase(),
        raw: +raw.toFixed(3),
        skala: reg.scale,
        hasil: +(raw * reg.scale).toFixed(reg.decimals)
      });
    } catch (err) {
      rows.push({ metric: key, register: '0x' + reg.address.toString(16).toUpperCase(), raw: 'ERROR', skala: reg.scale, hasil: err.message });
    }
  }
  console.table(rows);
  client.close(() => {});
}

main().catch((err) => {
  console.error(`Gagal: ${err.message}`);
  console.error('Cek IP/port DR302, mode Modbus TCP di DR302, dan setting serial DR302 = setting meter.');
  process.exit(1);
});
