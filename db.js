const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let mode = 'embedded'; // 'postgres' or 'embedded'
let pool = null;

// Initial state for embedded SQL store
const defaultData = {
  users: [
    { id: 1, username: 'Ahmad_Admin', role: 'admin', avatar: '👑', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, username: 'Taqat_Bot', role: 'bot', avatar: '🤖', created_at: new Date(Date.now() - 1800000).toISOString() }
  ],
  rooms: [
    { id: 1, name: 'general', description: 'الغرفة العامة للنقاشات السريعة', created_at: new Date().toISOString() },
    { id: 2, name: 'dev-chat', description: 'غرفة المطورين والباك إند', created_at: new Date().toISOString() },
    { id: 3, name: 'vip-lounge', description: 'غرفة كبار الشخصيات', created_at: new Date().toISOString() }
  ],
  messages: [
    { id: 1, room: 'general', username: 'Taqat_Bot', text: 'أهلاً بك في شات المنصة المتكامل مع قاعدة بيانات SQL!', created_at: new Date(Date.now() - 120000).toISOString() },
    { id: 2, room: 'general', username: 'Ahmad_Admin', text: 'الباك إند شغال بأعلى مواصفات وسرعة فائقة 🚀', created_at: new Date(Date.now() - 60000).toISOString() }
  ],
  nextIds: { users: 3, rooms: 4, messages: 3 }
};

function loadLocalData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading data file, using defaults:', err.message);
  }
  saveLocalData(defaultData);
  return defaultData;
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing data file:', err.message);
  }
}

let localStore = loadLocalData();

async function initDB() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    try {
      pool = new Pool({
        connectionString: dbUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      // Test connection
      const client = await pool.connect();
      console.log('Connected successfully to PostgreSQL!');
      
      // Auto-migrate tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          avatar VARCHAR(255) DEFAULT '👤',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rooms (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) UNIQUE NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          room VARCHAR(50) NOT NULL DEFAULT 'general',
          username VARCHAR(50) NOT NULL,
          text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed initial rooms if empty
      const roomCheck = await client.query('SELECT COUNT(*) FROM rooms');
      if (parseInt(roomCheck.rows[0].count, 10) === 0) {
        await client.query(`
          INSERT INTO rooms (name, description) VALUES
          ('general', 'الغرفة العامة للنقاشات السريعة'),
          ('dev-chat', 'غرفة المطورين والباك إند'),
          ('vip-lounge', 'غرفة كبار الشخصيات');
          INSERT INTO users (username, role, avatar) VALUES
          ('Ahmad_Admin', 'admin', '👑'),
          ('Taqat_Bot', 'bot', '🤖');
          INSERT INTO messages (room, username, text) VALUES
          ('general', 'Taqat_Bot', 'أهلاً بك في شات المنصة المتكامل مع PostgreSQL!');
        `);
      }

      client.release();
      mode = 'postgres';
      return { mode: 'postgres', success: true };
    } catch (err) {
      console.warn('PostgreSQL connection failed, falling back to embedded SQL store:', err.message);
      mode = 'embedded';
      return { mode: 'embedded', error: err.message };
    }
  } else {
    mode = 'embedded';
    return { mode: 'embedded', reason: 'DATABASE_URL not set' };
  }
}

// Unified Query interface
async function query(sqlText, params = []) {
  if (mode === 'postgres' && pool) {
    const result = await pool.query(sqlText, params);
    return { rows: result.rows, rowCount: result.rowCount, mode: 'postgres' };
  }

  // Embedded SQL simulator with persistent storage
  const cleanSql = sqlText.trim().replace(/;$/, '');
  const upper = cleanSql.toUpperCase();

  if (upper.startsWith('SELECT')) {
    // Determine table
    let table = 'messages';
    if (/FROM\s+users/i.test(cleanSql)) table = 'users';
    else if (/FROM\s+rooms/i.test(cleanSql)) table = 'rooms';

    let list = [...(localStore[table] || [])];

    // Filter by room
    const roomMatch = cleanSql.match(/WHERE\s+room\s*=\s*\$1/i);
    if (roomMatch && params[0]) {
      list = list.filter(item => item.room === params[0]);
    }

    // Order by
    if (/ORDER BY\s+id\s+DESC/i.test(cleanSql) || /ORDER BY\s+created_at\s+DESC/i.test(cleanSql)) {
      list.reverse();
    }

    // Limit
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+|\$\d+)/i);
    if (limitMatch) {
      const limitVal = limitMatch[1].startsWith('$') 
        ? params[parseInt(limitMatch[1].replace('$', ''), 10) - 1] 
        : parseInt(limitMatch[1], 10);
      list = list.slice(0, Number(limitVal) || 50);
    }

    return { rows: list, rowCount: list.length, mode: 'embedded' };
  }

  if (upper.startsWith('INSERT INTO MESSAGES')) {
    const [room, username, text] = params;
    const newMsg = {
      id: localStore.nextIds.messages++,
      room: room || 'general',
      username: username || 'مجهول',
      text: text || '',
      created_at: new Date().toISOString()
    };
    localStore.messages.push(newMsg);
    saveLocalData(localStore);
    return { rows: [newMsg], rowCount: 1, mode: 'embedded' };
  }

  if (upper.startsWith('INSERT INTO USERS')) {
    const [username, role, avatar] = params;
    const newUser = {
      id: localStore.nextIds.users++,
      username: username || 'User_' + Math.floor(Math.random() * 1000),
      role: role || 'user',
      avatar: avatar || '👤',
      created_at: new Date().toISOString()
    };
    localStore.users.push(newUser);
    saveLocalData(localStore);
    return { rows: [newUser], rowCount: 1, mode: 'embedded' };
  }

  if (upper.startsWith('DELETE FROM')) {
    let table = 'messages';
    if (/FROM\s+users/i.test(cleanSql)) table = 'users';
    localStore[table] = [];
    saveLocalData(localStore);
    return { rows: [], rowCount: 0, mode: 'embedded' };
  }

  return { rows: [], rowCount: 0, mode: 'embedded', message: 'Executed in embedded mode' };
}

function getStatus() {
  return {
    mode,
    isPostgres: mode === 'postgres',
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    counts: {
      users: localStore.users ? localStore.users.length : 0,
      rooms: localStore.rooms ? localStore.rooms.length : 0,
      messages: localStore.messages ? localStore.messages.length : 0
    }
  };
}

module.exports = {
  initDB,
  query,
  getStatus
};
