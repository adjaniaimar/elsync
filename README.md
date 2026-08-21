# ELSYNC

## PROJECT STRUCTURE
```
elsync/
├── server/       
│   ├── config.js    
│   ├── modbus.js
│   ├── index.js
│   └── package.json
└── src/
    ├── index.html
    ├── style.css
    └── app.js
```

## SETUP

### 1. VALIDATE REGISTER MAP
Sebelum jalanin server, pastikan kamu sudah tahu:
- Address register untuk Tegangan, Arus, Daya, Frekuensi, kWh
- Tipe data (kemungkinan besar float32 / 2 register)
- Byte order (`ABCD` atau `CDAB` — coba dua-duanya kalau nilai yang muncul aneh)
- Scale factor (apakah perlu dikali 0.1, dsb)

### 2. FILL server/config.js
Ganti `SERIAL_PORT`, `BAUD_RATE`, `SLAVE_ID`, dan tiap `address`/`byteOrder`/`scale` di `REGISTERS` sesuai Modbus Poll.

### 3. DEPEDENCY INSTALL
```bash
cd elsync/server
npm install
```

### 4. RUN SERVER
```bash
npm start
```
Kalau sukses, terminal akan menampilkan:
```
ELSYNC server running at http://localhost:3001
[modbus] Connected on COM3 @ 9600bps, slave id 1
```

### 5. OPEN DASHBOARD
Buka browser ke `http://localhost:3001`

## TROUBLESHOOT

- **Server gagal connect ke Modbus** — cek kabel RS485 A/B tidak terbalik, power ke MAX485 module nyala, dan `SERIAL_PORT` di config.js sesuai dengan yang muncul di Device Manager.
- **Nilai yang terbaca aneh/kebesaran** — kemungkinan besar `byteOrder` salah, coba ganti dari `ABCD` ke `CDAB` di config.js untuk register yang bermasalah.
