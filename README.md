# ELSYNC — Setup Backend

## Struktur project
```
elsync/
├── server/          # backend: Express + Socket.io + Modbus RTU polling
│   ├── config.js     # <- ISI DULU: COM port, baud rate, register map
│   ├── modbus.js
│   ├── index.js
│   └── package.json
└── src/              # frontend dashboard (sudah jalan sebagai mockup)
    ├── index.html
    ├── style.css
    └── app.js
```

## Langkah setup

### 1. Validasi register map lewat Modbus Poll
Sebelum jalanin server, pastikan kamu sudah tahu:
- Address register untuk Tegangan, Arus, Daya, Frekuensi, kWh
- Tipe data (kemungkinan besar float32 / 2 register)
- Byte order (`ABCD` atau `CDAB` — coba dua-duanya kalau nilai yang muncul aneh)
- Scale factor (apakah perlu dikali 0.1, dsb)

### 2. Isi `server/config.js`
Ganti `SERIAL_PORT`, `BAUD_RATE`, `SLAVE_ID`, dan tiap `address`/`byteOrder`/`scale` di `REGISTERS` sesuai temuan Modbus Poll kamu.

### 3. Install dependency
```bash
cd elsync/server
npm install
```

### 4. Jalankan server
```bash
npm start
```
Kalau sukses, terminal akan menampilkan:
```
ELSYNC server running at http://localhost:3000
[modbus] Connected on COM3 @ 9600bps, slave id 1
```

### 5. Buka dashboard
Buka browser ke `http://localhost:3000` (bukan buka `index.html` langsung). Dashboard otomatis switch dari data simulasi ke data live begitu Socket.io connect — cek console browser (F12) untuk log `Connected to server — switching to live Modbus data`.

## Troubleshooting

- **Server gagal connect ke Modbus** — cek kabel RS485 A/B tidak terbalik, power ke MAX485 module nyala, dan `SERIAL_PORT` di config.js sesuai dengan yang muncul di Device Manager.
- **Nilai yang terbaca aneh/kebesaran** — kemungkinan besar `byteOrder` salah, coba ganti dari `ABCD` ke `CDAB` di config.js untuk register yang bermasalah.
- **Dashboard tetap pakai data simulasi** — buka lewat `http://localhost:3000`, bukan buka file `index.html` langsung dari folder `src/`. Socket.io client cuma bisa connect kalau di-serve dari server Express.
