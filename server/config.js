// ===========================================================
// ELSYNC — Konfigurasi koneksi Modbus RTU ke CHINT DDSU666
// ===========================================================
// PENTING: address, length, byteOrder, dan scale di bawah ini
// MASIH PLACEHOLDER. Kamu WAJIB isi ulang berdasarkan hasil
// scan Modbus Poll kamu sendiri sebelum menjalankan server ini.
//
// Cara ambil nilainya dari Modbus Poll:
// 1. Buka koneksi ke COM port meter kamu di Modbus Poll
// 2. Function code: 03 (Read Holding Registers)
// 3. Catat address tiap parameter (Voltage, Current, Power,
//    Frequency, Energy) yang menunjukkan nilai masuk akal
// 4. Cek tipe datanya — biasanya float32 (2 register / 4 byte).
//    Kalau nilai yang muncul di Modbus Poll aneh (kebesaran/
//    kekecilan atau 0), coba ganti byteOrder antara 'ABCD' dan
//    'CDAB' sampai nilainya masuk akal
// 5. Cek scale — kalau meter kirim raw integer (bukan float),
//    kadang perlu dikali 0.1 atau 0.01
// ===========================================================

module.exports = {
  // ---- Koneksi serial ----
  SERIAL_PORT: 'COM3',        // ganti sesuai port di device manager kamu
  BAUD_RATE: 9600,             // cek setting baud rate di keypad meter (default umum 9600)
  PARITY: 'none',              // 'none' | 'even' | 'odd' — cek juga di keypad meter
  SLAVE_ID: 1,                  // alamat slave Modbus meter kamu

  // ---- Polling ----
  POLL_INTERVAL_MS: 2000,

  // ---- HTTP server ----
  HTTP_PORT: 3000,

  // ---- Register map (PLACEHOLDER — validasi via Modbus Poll) ----
  REGISTERS: {
    tegangan: {
      address: 0x2000,
      length: 2,          // 2 register = float32 (4 byte)
      byteOrder: 'ABCD',  // 'ABCD' atau 'CDAB', tergantung hasil scan
      scale: 1,
      decimals: 1
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
      decimals: 0
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
      decimals: 3
    }
  }
};
