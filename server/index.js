require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const { Worker } = require('worker_threads');

const modbus = require('./modbus');
const { insertReading, getReadings, closePool } = require('./db');
const { POLL_INTERVAL_MS, HTTP_PORT } = require('./config');

const app = express();
app.disable('x-powered-by');
// No reverse proxy sits in front of this server, so X-Forwarded-For must NOT be
// trusted — otherwise a client could spoof it to rotate its apparent IP and bypass
// the login rate limiter. If you later run behind nginx/traefik, set this to the
// number of proxy hops instead (e.g. app.set('trust proxy', 1)).
app.set('trust proxy', false);

const server = http.createServer(app);
const io = new Server(server);

// ---- SESSION SECRET ---- //
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[security] SESSION_SECRET is not set. Using a random secret for this run only; ' +
    'all sessions will be invalidated on restart. Set SESSION_SECRET in server/.env.'
  );
}

// ---- SECURITY HEADERS ---- //
// Served over plain HTTP unless COOKIE_SECURE=true. HTTPS-only directives
// (upgrade-insecure-requests, HSTS) would break the app over HTTP by forcing
// requests to an https:// origin that has no listener, so enable them only on HTTPS.
const ON_HTTPS = process.env.COOKIE_SECURE === 'true';
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        // null removes the directive helmet would otherwise add by default.
        upgradeInsecureRequests: ON_HTTPS ? [] : null,
      },
    },
    hsts: ON_HTTPS,
    crossOriginEmbedderPolicy: false,
  })
);

// ---- SESSION ---- //
const sessionMiddleware = session({
  name: 'elsync.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 1000 * 60 * 60 * 8,
  },
});
app.use(sessionMiddleware);

app.use(express.json({ limit: '64kb' }));

// ---- AUTH HELPERS ---- //
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function verifyPassword(input, stored) {
  if (!stored) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return bcrypt.compareSync(String(input), stored);
    } catch {
      return false;
    }
  }
  return safeEqual(input, stored);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.accepts('html')) return res.redirect('/');
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

// ---- LOGIN ---- //
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }

  const userOk = safeEqual(username, process.env.ELSYNC_USER || '');
  const passOk = verifyPassword(password, process.env.ELSYNC_PASS || '');

  if (userOk && passOk) {
    req.session.regenerate((err) => {
      if (err) {
        console.error('[security] Session regenerate failed:', err.message);
        return res.status(500).json({ success: false, message: 'Login failed.' });
      }
      req.session.authenticated = true;
      req.session.user = username;
      res.json({ success: true });
    });
    return;
  }

  res.status(401).json({ success: false, message: 'Username or password is incorrect.' });
});

// ---- LOGOUT ---- //
app.post('/api/logout', (req, res) => {
  if (!req.session) return res.json({ success: true });
  req.session.destroy(() => {
    res.clearCookie('elsync.sid');
    res.json({ success: true });
  });
});

// ---- ROOT ROUTE TO LOGIN PAGE ---- //
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'login.html'));
});

// ---- EXPORT (protected) ---- //
const ALLOWED_FORMATS = new Set(['json', 'csv', 'xlsx', 'pdf']);
const EXPORT_TIMEOUT_MS = 30000;

app.get('/api/logs/export', requireAuth, async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ message: 'Format tidak dikenali' });
    }

    const rows = await getReadings();
    const filename = `elsync-log-${Date.now()}`;

    const worker = new Worker(path.join(__dirname, 'exportWorker.js'), {
      workerData: { format, rows },
    });

    // Ensure the request is answered exactly once, the worker is always torn
    // down, and a hung worker can't leave the request open forever.
    let settled = false;
    const finish = (respond) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      respond();
    };

    const timer = setTimeout(() => {
      console.error('[export] Worker timed out after', EXPORT_TIMEOUT_MS, 'ms');
      finish(() => res.status(503).json({ message: 'Export timeout' }));
    }, EXPORT_TIMEOUT_MS);

    worker.once('message', (msg) => {
      if (!msg.success) {
        console.error('[export] Worker error:', msg.error);
        return finish(() => res.status(500).json({ message: 'Export gagal' }));
      }

      const contentTypes = {
        json: 'application/json',
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      };

      finish(() => {
        res.setHeader('Content-Type', contentTypes[format] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`);
        res.send(msg.type === 'buffer' ? Buffer.from(msg.data) : msg.data);
      });
    });

    worker.once('error', (err) => {
      console.error('[export] Worker crashed:', err.message);
      finish(() => res.status(500).json({ message: 'Export gagal' }));
    });
  } catch (err) {
    console.error('[export] Error:', err.message);
    res.status(500).json({ message: 'Export gagal' });
  }
});

// ---- DASHBOARD ---- //
const PUBLIC_PATHS = new Set(['/', '/login.html', '/login.js', '/login.css', '/favicon.ico']);
app.use(
  (req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) return next();
    return requireAuth(req, res, next);
  },
  express.static(path.join(__dirname, '..', 'src'))
);

// ---- SOCKET.IO AUTH ---- //
io.engine.use(sessionMiddleware);
io.use((socket, next) => {
  const sess = socket.request.session;
  if (sess && sess.authenticated) return next();
  next(new Error('unauthorized'));
});

let latestReading = null;
let pollTimer = null;
let pollingStopped = false;

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

  // Schedule the next poll only after the current one fully settles, so polls
  // never overlap on the (non-reentrant) serial client even if a read runs long.
  const scheduleNext = () => {
    if (pollingStopped) return;
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  async function poll() {
    if (!modbus.isConnected()) {
      return scheduleNext();
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
        await modbus.handleDisconnect();
      }
    } finally {
      scheduleNext();
    }
  }

  poll();
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

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, closing gracefully...`);

  pollingStopped = true;
  if (pollTimer) clearTimeout(pollTimer);

  // Force-exit if any close hangs, so pm2 restarts aren't held up.
  const forceExit = setTimeout(() => process.exit(0), 5000);
  forceExit.unref();

  try { await modbus.close(); } catch (err) { console.error('[shutdown] modbus:', err.message); }
  try { await closePool(); } catch (err) { console.error('[shutdown] db pool:', err.message); }
  io.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
