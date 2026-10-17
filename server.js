const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const path = require('path');
require('dotenv').config();

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

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
  let currentUser = 'مجهول';

  // Join Room
  socket.on('joinRoom', async ({ room, username }) => {
    socket.leave(currentRoom);
    currentRoom = room || 'general';
    currentUser = username || 'مجهول';
    socket.join(currentRoom);

    // Fetch message history for this room from SQL DB
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

  // Handle incoming chat message
  socket.on('chatMessage', async (data) => {
    const room = data.room || currentRoom || 'general';
    const username = data.username || currentUser || 'مجهول';
    const text = (data.text || '').trim();

    if (!text) return;

    try {
      // Save to SQL Database
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

      // Broadcast to everyone in the room
      io.to(room).emit('message', savedMessage);
    } catch (err) {
      console.error('Error saving message to SQL:', err.message);
    }
  });

  // User typing notification
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

// REST API Endpoints

function getDetailedHardwareInfo() {
  const fs = require('fs');
  // RAM Info (parses /proc/meminfo on Linux for exact host values like `free -h`)
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
          if (!isNaN(val)) memMap[key] = val; // values in kB
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

  // Disk Info (using fs.statfsSync on root /)
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

  // CPU Info
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
  if (d > 0) parts.push(`${d} يوم`);
  if (h > 0) parts.push(`${h} ساعة`);
  if (m > 0) parts.push(`${m} دقيقة`);
  parts.push(`${s} ثانية`);
  return parts.join(' و ');
}

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

// GET /api/hardware (Detailed Server Specs)
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

// POST /api/chat/send (REST fallback for chat)
app.post('/api/chat/send', async (req, res) => {
  const { room, username, text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'text is required' });
  }

  const roomName = room || 'general';
  const userName = username || 'مجهول';

  try {
    const result = await db.query(
      'INSERT INTO messages (room, username, text, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomName, userName, text.trim(), new Date().toISOString()]
    );
    const saved = result.rows[0];

    // Also broadcast to connected websockets
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

// POST /api/db/query (Interactive SQL Runner for Studio)
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

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start HTTP + WebSocket Server
server.listen(PORT, HOST, () => {
  console.log(`Server running with WebSockets & SQL on http://${HOST}:${PORT}`);
});
