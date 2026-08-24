require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const modbus = require('./modbus');
const { insertReading } = require('./db');
const { POLL_INTERVAL_MS, HTTP_PORT } = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// LOGIN ENDPOINT //
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ELSYNC_USER && password === process.env.ELSYNC_PASS) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Username or password is incorrect.' });
  }
});

// ROOT ROUTE TO LOGIN PAGE //
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'login.html'));
});

// DASHBOARD SHOWN //
app.use(express.static(path.join(__dirname, '..', 'src')));

let latestReading = null;
let pollTimer = null;

async function startPolling() {
  try {
    await modbus.connect();
  } catch (err) {
    console.error('[modbus] Failed to connect:', err.message);
    console.error('[modbus] Check: RS485, COM port in config.js, and power to MAX485 module.');
    return;
  }

  let consecutiveFailures = 0;
  const MAX_FAILURES_BEFORE_RECONNECT = 3;

  pollTimer = setInterval(async () => {
    if (!modbus.isConnected()) {
      return;
    }

    try {
      const reading = await modbus.pollOnce();
      consecutiveFailures = 0;
      latestReading = reading;

    try {
      await insertReading(reading);
      console.log('[mysql] Reading saved:', reading);
    } catch (err) {
      console.error('[mysql] Failed to save reading:', err.message);
    }

      io.emit('meterData', reading);
    } catch (err) {
      consecutiveFailures++;
      console.error(`[modbus] Poll error (gagal ke-${consecutiveFailures}/${MAX_FAILURES_BEFORE_RECONNECT}):`, err.message);
      io.emit('meterError', { message: err.message });

      if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECONNECT) {
        consecutiveFailures = 0;
        modbus.handleDisconnect();
      }
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