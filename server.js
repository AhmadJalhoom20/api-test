const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');
const fs = require('fs');
require('dotenv').config();

const db = require('./db');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with strict CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// 1. Disable identifying headers
app.disable('x-powered-by');

// 2. Enterprise Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// 3. Additional custom enterprise security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.removeHeader('X-Powered-By');
  next();
});

// 4. Standard parsers & CORS
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Initialize database
db.initDB().then((res) => {
  console.log(`Database initialized in [${res.mode}] mode.`);
});

// Socket.io Real-time Chat
let onlineCount = 0;

io.on('connection', (socket) => {
  onlineCount++;
  io.emit('userCount', onlineCount);

  let currentRoom = 'general';
  let currentUser = 'Anonymous';

  socket.on('joinRoom', async ({ room, username }) => {
    socket.leave(currentRoom);
    currentRoom = room || 'general';
    currentUser = username || 'Anonymous';
    socket.join(currentRoom);

    try {
      const result = await db.query(
        'SELECT * FROM messages WHERE room = $1 ORDER BY id DESC LIMIT 50',
        [currentRoom]
      );
      const messages = [...result.rows].reverse();
      socket.emit('roomHistory', messages);
    } catch (err) {
      console.error('Error fetching room history:', err.message);
    }
  });

  socket.on('chatMessage', async (data) => {
    const room = data.room || currentRoom || 'general';
    const username = data.username || currentUser || 'Anonymous';
    const text = (data.text || '').trim();

    if (!text) return;

    try {
      const result = await db.query(
        'INSERT INTO messages (room, username, text, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [room, username, text, new Date().toISOString()]
      );

      const savedMessage = result.rows[0] || {
        room,
        username,
        text,
        created_at: new Date().toISOString()
      };

      io.to(room).emit('message', savedMessage);
    } catch (err) {
      console.error('Error saving message to SQL:', err.message);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.room || currentRoom).emit('userTyping', {
      username: data.username || currentUser,
      room: data.room || currentRoom
    });
  });

  socket.on('disconnect', () => {
    onlineCount = Math.max(0, onlineCount - 1);
    io.emit('userCount', onlineCount);
  });
});

// Helper for Hardware and Specs
function getDetailedHardwareInfo() {
  let ram = {
    totalGB: +(os.totalmem() / (1024 ** 3)).toFixed(2),
    freeGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
    usedGB: +((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(2),
    usedPercent: +(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
    availableGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
    swapTotalGB: 0,
    swapUsedGB: 0,
    swapFreeGB: 0,
    swapUsedPercent: 0,
    source: 'os'
  };

  try {
    if (fs.existsSync('/proc/meminfo')) {
      const content = fs.readFileSync('/proc/meminfo', 'utf8');
      const lines = content.split('\n');
      const memMap = {};
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parseInt(parts[1].trim(), 10);
          if (!isNaN(val)) memMap[key] = val;
        }
      }
      if (memMap.MemTotal) {
        const totalKB = memMap.MemTotal;
        const availKB = memMap.MemAvailable || (memMap.MemFree + (memMap.Buffers || 0) + (memMap.Cached || 0));
        const freeKB = memMap.MemFree || 0;
        const usedKB = totalKB - availKB;

        const swapTotalKB = memMap.SwapTotal || 0;
        const swapFreeKB = memMap.SwapFree || 0;
        const swapUsedKB = swapTotalKB - swapFreeKB;

        ram = {
          totalGB: +(totalKB / 1024 / 1024).toFixed(2),
          usedGB: +(usedKB / 1024 / 1024).toFixed(2),
          availableGB: +(availKB / 1024 / 1024).toFixed(2),
          freeKB: +(freeKB / 1024 / 1024).toFixed(2),
          usedPercent: +((usedKB / totalKB) * 100).toFixed(1),
          swapTotalGB: +(swapTotalKB / 1024 / 1024).toFixed(2),
          swapUsedGB: +(swapUsedKB / 1024 / 1024).toFixed(2),
          swapFreeGB: +(swapFreeKB / 1024 / 1024).toFixed(2),
          swapUsedPercent: swapTotalKB > 0 ? +((swapUsedKB / swapTotalKB) * 100).toFixed(1) : 0,
          source: '/proc/meminfo (Linux Host)'
        };
      }
    }
  } catch (err) {
    console.error('Error reading /proc/meminfo:', err.message);
  }

  let disk = {
    totalGB: 0,
    usedGB: 0,
    freeGB: 0,
    usedPercent: 0
  };
  try {
    const rootPath = os.platform() === 'win32' ? process.cwd() : '/';
    const stat = fs.statfsSync(rootPath);
    const totalBytes = stat.bsize * stat.blocks;
    const freeBytes = stat.bsize * stat.bavail;
    const usedBytes = totalBytes - freeBytes;
    disk = {
      totalGB: +(totalBytes / (1024 ** 3)).toFixed(2),
      usedGB: +(usedBytes / (1024 ** 3)).toFixed(2),
      freeGB: +(freeBytes / (1024 ** 3)).toFixed(2),
      usedPercent: totalBytes > 0 ? +((usedBytes / totalBytes) * 100).toFixed(1) : 0,
      mount: rootPath
    };
  } catch (err) {
    console.error('Error reading disk stat:', err.message);
  }

  const cpus = os.cpus() || [];
  let cpuModel = cpus[0]?.model || 'Unknown CPU';
  try {
    if (fs.existsSync('/proc/cpuinfo')) {
      const cpuContent = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const match = cpuContent.match(/model name\s*:\s*(.+)/i);
      if (match && match[1]) cpuModel = match[1].trim();
    }
  } catch (err) {}

  const loadAvg = os.loadavg();

  return {
    ram,
    disk,
    cpu: {
      model: cpuModel,
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || 0,
      loadAvg: {
        '1m': +loadAvg[0].toFixed(2),
        '5m': +loadAvg[1].toFixed(2),
        '15m': +loadAvg[2].toFixed(2)
      }
    },
    system: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(os.uptime()),
      uptimeFormatted: formatUptime(os.uptime())
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      appUptimeSeconds: Math.floor(process.uptime()),
      heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1),
      rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1)
    }
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// ROOT: Pure JSON Welcome & Service Discovery (NO HTML)
app.get('/', (req, res) => {
  res.json({
    service: 'Ahmad Enterprise Backend API',
    status: 'ONLINE',
    version: '1.0.0',
    type: 'RESTful API & WebSockets Server',
    environment: process.env.NODE_ENV || 'production',
    securityHeaders: {
      helmet: 'ENABLED',
      hsts: 'ACTIVE',
      contentSecurityPolicy: 'ACTIVE',
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      xPoweredBy: 'HIDDEN'
    },
    runtime: {
      node: process.version,
      port: PORT,
      uptimeSeconds: Math.floor(process.uptime()),
      database: db.getStatus().mode
    },
    endpoints: {
      root: 'GET /',
      health: 'GET /api/health',
      hardware: 'GET /api/hardware',
      stats: 'GET /api/stats',
      chatHistory: 'GET /api/chat/messages?room=general&limit=50',
      chatSend: 'POST /api/chat/send',
      dbStatus: 'GET /api/db/status',
      dbQuery: 'POST /api/db/query'
    }
  });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    deployed: true,
    platform: 'Taqat Cloud',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    port: PORT,
    database: db.getStatus().mode
  });
});

// GET /api/hardware (Server Specs: RAM, CPU, Disk, Swap)
app.get('/api/hardware', (req, res) => {
  res.json(getDetailedHardwareInfo());
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const hw = getDetailedHardwareInfo();
  res.json({
    hardware: hw,
    chat: {
      onlineUsers: onlineCount
    },
    database: db.getStatus()
  });
});

// GET /api/chat/messages
app.get('/api/chat/messages', async (req, res) => {
  const room = req.query.room || 'general';
  const limit = parseInt(req.query.limit, 10) || 50;
  try {
    const result = await db.query(
      'SELECT * FROM messages WHERE room = $1 ORDER BY id DESC LIMIT $2',
      [room, limit]
    );
    res.json({
      success: true,
      room,
      count: result.rows.length,
      data: result.rows.reverse()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/send
app.post('/api/chat/send', async (req, res) => {
  const { room, username, text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'text is required' });
  }

  const roomName = room || 'general';
  const userName = username || 'Anonymous';

  try {
    const result = await db.query(
      'INSERT INTO messages (room, username, text, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomName, userName, text.trim(), new Date().toISOString()]
    );
    const saved = result.rows[0];

    io.to(roomName).emit('message', saved);

    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/db/status
app.get('/api/db/status', (req, res) => {
  res.json(db.getStatus());
});

// POST /api/db/query
app.post('/api/db/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'SQL query string is required' });
  }

  try {
    const result = await db.query(sql);
    res.json({
      success: true,
      mode: result.mode,
      rowCount: result.rowCount,
      rows: result.rows
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 404 Handler (JSON only)
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested API endpoint does not exist',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler (JSON only)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Start Server
server.listen(PORT, HOST, () => {
  console.log(`Pure Backend API running on http://${HOST}:${PORT}`);
});
