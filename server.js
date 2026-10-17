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

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    system: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      nodeVersion: process.version,
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024)
    },
    process: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024)
    },
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
