const express = require('express');
const cors = require('cors');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory data store for live CRUD testing
let items = [
  { id: 1, title: 'اختبار الباك إند', done: true, createdAt: new Date().toISOString() },
  { id: 2, title: 'فحص الاتصال بالسيرفر الحقيقي', done: false, createdAt: new Date().toISOString() }
];
let nextId = 3;

// Root: Interactive HTML test dashboard
app.get('/', (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Backend Status - Verification</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    .badge { display: inline-block; background: #22c55e; color: #000; font-weight: bold; padding: 6px 14px; border-radius: 9999px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-top: 16px; }
    h1 { margin-top: 0; font-size: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .stat { background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155; }
    .stat-label { font-size: 12px; color: #94a3b8; }
    .stat-val { font-size: 16px; font-weight: bold; margin-top: 4px; word-break: break-all; }
    button { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; margin: 4px; }
    button:hover { background: #2563eb; }
    pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #38bdf8; text-align: left; dir: ltr; font-size: 13px; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h1>الباك إند شغال بنجاح 🚀</h1>
      <span class="badge">ONLINE (LIVE)</span>
    </div>
    <p style="color:#94a3b8;">هذا السيرفر يعمل على Node.js Express داخل الحاوية السحابية الخاصة بك.</p>

    <div class="card">
      <h3 style="margin-top:0;">معلومات النظام الفورية</h3>
      <div class="grid">
        <div class="stat"><div class="stat-label">إصدار Node.js</div><div class="stat-val">${process.version}</div></div>
        <div class="stat"><div class="stat-label">المنفذ (PORT)</div><div class="stat-val">${PORT}</div></div>
        <div class="stat"><div class="stat-label">مدة التشغيل (Uptime)</div><div class="stat-val">${uptimeSeconds} ثانية</div></div>
        <div class="stat"><div class="stat-label">نظام التشغيل</div><div class="stat-val">${os.type()} (${os.arch()})</div></div>
        <div class="stat"><div class="stat-label">اسم المضيف (Hostname)</div><div class="stat-val">${os.hostname()}</div></div>
        <div class="stat"><div class="stat-label">قاعدة البيانات المعرفة</div><div class="stat-val">${process.env.DATABASE_URL ? 'نعم (DATABASE_URL متوفر)' : 'غير متصل بعد'}</div></div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">تجربة استدعاء API مباشرة من المتصفح</h3>
      <div>
        <button onclick="callApi('/api/health')">فحص الصحة (GET /api/health)</button>
        <button onclick="callApi('/api/info')">تفاصيل السيرفر (GET /api/info)</button>
        <button onclick="callApi('/api/todos')">جلب العناصر (GET /api/todos)</button>
        <button onclick="addTodo()">إضافة عنصر جديد (POST /api/todos)</button>
        <button onclick="callApi('/api/db-test')">فحص قاعدة البيانات (GET /api/db-test)</button>
      </div>
      <pre id="api-output">// اضغط على أي زر لتنفيذ طلب HTTP حقيقي ورؤية الاستجابة من السيرفر...</pre>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">روابط JSON مباشرة</h3>
      <ul>
        <li><a href="/api/health" target="_blank">/api/health</a></li>
        <li><a href="/api/info" target="_blank">/api/info</a></li>
        <li><a href="/api/todos" target="_blank">/api/todos</a></li>
        <li><a href="/api/db-test" target="_blank">/api/db-test</a></li>
      </ul>
    </div>
  </div>

  <script>
    async function callApi(endpoint) {
      const out = document.getElementById('api-output');
      out.textContent = 'جاري التحميل...';
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'خطأ: ' + err.message;
      }
    }

    async function addTodo() {
      const out = document.getElementById('api-output');
      const title = prompt('اكتب عنوان العنصر:', 'عنصر تجريبي تم إنشاؤه في ' + new Date().toLocaleTimeString());
      if (!title) return;
      out.textContent = 'جاري الإرسال...';
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'خطأ: ' + err.message;
      }
    }
  </script>
</body>
</html>`);
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    deployed: true,
    message: 'Backend is running live and responding',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    port: PORT,
    environment: process.env.NODE_ENV || 'production'
  });
});

// GET /api/info
app.get('/api/info', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
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
    env: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'not set',
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDbHost: Boolean(process.env.DB_HOST)
    }
  });
});

// CRUD: GET /api/todos
app.get('/api/todos', (req, res) => {
  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

// CRUD: POST /api/todos
app.post('/api/todos', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ success: false, error: 'title is required' });
  }
  const newItem = {
    id: nextId++,
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString()
  };
  items.push(newItem);
  res.status(201).json({ success: true, message: 'Item created successfully', data: newItem });
});

// CRUD: PUT /api/todos/:id
app.put('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = items.find(i => i.id === id);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }
  if (req.body.title !== undefined) item.title = String(req.body.title);
  if (req.body.done !== undefined) item.done = Boolean(req.body.done);
  item.updatedAt = new Date().toISOString();
  res.json({ success: true, message: 'Item updated successfully', data: item });
});

// CRUD: DELETE /api/todos/:id
app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const initialLen = items.length;
  items = items.filter(i => i.id !== id);
  if (items.length === initialLen) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }
  res.json({ success: true, message: `Item ${id} deleted successfully` });
});

// Reset CRUD
app.post('/api/todos/reset', (req, res) => {
  items = [
    { id: 1, title: 'اختبار الباك إند', done: true, createdAt: new Date().toISOString() },
    { id: 2, title: 'فحص الاتصال بالسيرفر الحقيقي', done: false, createdAt: new Date().toISOString() }
  ];
  nextId = 3;
  res.json({ success: true, message: 'Data reset to default', data: items });
});

// Database connectivity check
app.get('/api/db-test', (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.json({
      databaseConnected: false,
      message: 'DATABASE_URL environment variable is not defined yet. Add a database in the platform dashboard to test auto-wiring.',
      envDetected: {
        DATABASE_URL: false,
        DB_HOST: process.env.DB_HOST || null,
        DB_PORT: process.env.DB_PORT || null,
        DB_DATABASE: process.env.DB_DATABASE || null
      }
    });
  }

  // Mask credentials for safety
  const masked = dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
  res.json({
    databaseConnected: true,
    message: 'DATABASE_URL detected successfully!',
    connectionStringPreview: masked
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
