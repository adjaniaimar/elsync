const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const modbus = require('./modbus');
const { POLL_INTERVAL_MS, HTTP_PORT } = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve the dashboard frontend directly from ../src
app.use(express.static(path.join(__dirname, '..', 'src')));

let latestReading = null;
let pollTimer = null;

async function startPolling() {
  try {
    await modbus.connect();
  } catch (err) {
    console.error('[modbus] Failed to connect:', err.message);
    console.error('[modbus] Cek: kabel RS485, COM port di config.js, dan power ke MAX485 module.');
    return;
  }

  pollTimer = setInterval(async () => {
    try {
      const reading = await modbus.pollOnce();
      latestReading = reading;
      io.emit('meterData', reading);
    } catch (err) {
      console.error('[modbus] Poll error:', err.message);
      io.emit('meterError', { message: err.message });
    }
  }, POLL_INTERVAL_MS);
}

io.on('connection', (socket) => {
  console.log('[socket] Client connected:', socket.id);
  if (latestReading) socket.emit('meterData', latestReading);

  socket.on('disconnect', () => {
    console.log('[socket] Client disconnected:', socket.id);
  });
});

server.listen(HTTP_PORT, () => {
  console.log(`ELSYNC server running at http://localhost:${HTTP_PORT}`);
  startPolling();
});

process.on('SIGINT', () => {
  if (pollTimer) clearInterval(pollTimer);
  server.close(() => process.exit(0));
});
