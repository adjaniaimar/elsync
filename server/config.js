module.exports = {
  // SERIAL //
  SERIAL_PORT: 'COM3',
  BAUD_RATE: 9600,
  PARITY: 'none',
  STOP_BITS: 2,
  SLAVE_ID: 1,

  // POLLING //
  POLL_INTERVAL_MS: 10000,

  // HTTP SERVER //
  HTTP_PORT: 3001,

  // REGISTER MAP //
  REGISTERS: {
    tegangan: {
      address: 0x2000,
      length: 2,    
      byteOrder: 'ABCD',
      scale: 1,
      decimals: 2
    },
    arus: {
      address: 0x2002,
      length: 2,
      byteOrder: 'ABCD',
      scale: 1,
      decimals: 2
    },
    daya: {
      address: 0x2004,
      length: 2,
      byteOrder: 'ABCD',
      scale: 1,
      decimals: 2
    },
    frekuensi: {
      address: 0x200E,
      length: 2,
      byteOrder: 'ABCD',
      scale: 1,
      decimals: 2
    },
    kwh: {
      address: 0x4000,
      length: 2,
      byteOrder: 'ABCD',
      scale: 1,
      decimals: 2
    }
  }
};