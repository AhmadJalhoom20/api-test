# Ahmad Enterprise Backend API - Documentation

توثيق شامل وكامل لنظام الباك إند: المسارات (Endpoints)، الدوال (HTTP Methods)، هيدرز الأمان (Security Headers)، وآليات العمل مع شرح تفصيلي لفائدة كل عنصر.

---

## 1. معلومات السيرفر العامة (Base URL)

- **الرابط السحابي المباشر:** `https://ahmadjalhoom.apps.taqat.academy`
- **المنفذ الافتراضي للحاوية:** `PORT=5000` (أو `3000` محلياً)
- **بروتوكول الاتصال:** HTTPS + WSS (WebSockets)
- **نوع الاستجابة:** `application/json` بنسبة 100% (Pure Backend API)

---

## 2. هيدرز الحماية والأمان (Security Headers) وشرح فائدتها

يقوم السيرفر بتطبيق حزمة هيدرز أمان مشددة على كل استجابة عبر `helmet` و middleware مخصص:

| الهيدر (Header) | القيمة المطبقة (Value) | الفائدة والحماية الأمنية |
| :--- | :--- | :--- |
| **Strict-Transport-Security (HSTS)** | `max-age=31536000; includeSubDomains; preload` | يجبر المتصفح على الاتصال فقط عبر HTTPS المشفر لمدة سنة كاملة، ويمنع هجمات التجسس وخفض التشفير (SSL Stripping / Man-in-the-Middle). |
| **X-Frame-Options** | `DENY` | يمنع منعاً باتاً فتح أو تضمين هذا الـ API داخل `<iframe>` أو `<frame>` على أي موقع آخر، مما يمنع ثغرات اختطاف النقر (Clickjacking). |
| **X-Content-Type-Options** | `nosniff` | يجبر المتصفح على احترام الـ MIME Type المحدد فقط وعدم محاولة تخمين نوع الملف، مما يمنع تنفيذ الملفات الخبيثة المتخفية كصور أو نصوص (MIME Confusion Attacks). |
| **Content-Security-Policy (CSP)** | `default-src 'none'; frame-ancestors 'none'` | سياسة أمان للمحتوى تمنع المتصفح من تشغيل أي سكريبتات غير مصرح بها، وتغلق تماماً ثغرات حقن السكريبتات عبر المواقع (XSS). |
| **X-XSS-Protection** | `1; mode=block` | تفعيل فلتر الحماية المدمج في المتصفحات القديمة لحظر أي صفحة يكتشف فيها هجوم Cross-Site Scripting. |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | يحمي خصوصية المستخدمين عبر منع إرسال مسار الرابط الكامل والمعلومات الحساسة عند الانتقال لمواقع خارجية. |
| **Permissions-Policy** | `geolocation=(), camera=(), microphone=(), payment=()` | يعطل صلاحيات الوصول للكاميرا، الميكروفون، والموقع الجغرافي تماماً عن الـ API لمنع استغلالها من أي طرف ثالث. |
| **إزالة X-Powered-By** | `null` (محذوف تماماً) | يخفي معلومة أن السيرفر يعمل بـ `Express / Node.js` لمنع القراصنة من معرفة نوع المحرك والبحث عن ثغرات مخصصة له (Information Disclosure Prevention). |
| **Access-Control-Allow-Origin (CORS)** | `*` (أو محدد) | يسمح لتطبيقات الفرونت إند والتطبيقات المتنقلة بالتواصل مع الـ API دون حظر المتصفح. |

---

## 3. نقاط الاتصال (API Endpoints & HTTP Methods)

---

### 1) نقطة البداية واكتشاف الخدمة (Service Discovery)
- **المسار:** `GET /`
- **الفائدة:** يتيح لأي عميل (Frontend / App / Monitoring) معرفة أن السيرفر يعمل وحالته نشطة، ويعرض خريطة بجميع المسارات المتاحة وإعدادات الأمان الحالية بدون إرجاع صفحات HTML.
- **مثال الاستجابة (Response):**
```json
{
  "service": "Ahmad Enterprise Backend API",
  "status": "ONLINE",
  "version": "1.0.0",
  "type": "RESTful API & WebSockets Server",
  "environment": "production",
  "securityHeaders": {
    "helmet": "ENABLED",
    "hsts": "ACTIVE",
    "contentSecurityPolicy": "ACTIVE",
    "xFrameOptions": "DENY",
    "xContentTypeOptions": "nosniff",
    "xPoweredBy": "HIDDEN"
  },
  "runtime": {
    "node": "v22.14.0",
    "port": 5000,
    "uptimeSeconds": 1420,
    "database": "embedded"
  },
  "endpoints": {
    "root": "GET /",
    "health": "GET /api/health",
    "hardware": "GET /api/hardware",
    "stats": "GET /api/stats",
    "chatHistory": "GET /api/chat/messages?room=general&limit=50",
    "chatSend": "POST /api/chat/send",
    "dbStatus": "GET /api/db/status",
    "dbQuery": "POST /api/db/query"
  }
}
```

---

### 2) فحص الصحة والحيوية (Health Check)
- **المسار:** `GET /api/health`
- **الفائدة:** يستخدم بواسطة أنظمة الـ DevOps والـ Load Balancers وKubernetes للتأكد أن الحاوية قادرة على استقبال الطلبات بنجاح. إذا تعطل السيرفر تقوم المنصة بإعادة تشغيله تلقائياً بناءً على هذا المسار.
- **مثال الاستجابة (Response):**
```json
{
  "status": "ok",
  "deployed": true,
  "platform": "Taqat Cloud",
  "timestamp": "2026-10-17T13:40:00.000Z",
  "uptimeSeconds": 1420,
  "nodeVersion": "v22.14.0",
  "port": 5000,
  "database": "embedded"
}
```

---

### 3) فحص عتاد ومواصفات السيرفر (Hardware & Host Specs)
- **المسار:** `GET /api/hardware`
- **الفائدة:** يقرأ بيانات العتاد الحقيقي من قلب نظام لينكس مباشرة (`/proc/meminfo`, `/proc/cpuinfo`, `statfs`):
  - يعطي حجم الرام الإجمالي، المستخدم، المتاح، ونسبة الاستهلاك.
  - يعطي تفاصيل ذاكرة الـ Swap.
  - يعطي حجم القرص الصلب (المساحة الكلية، المستهلكة، والمتبقية).
  - يعطي اسم وموديل المعالج وعدد الأنوية ومعدل الضغط (Load Average).
- **مثال الاستجابة (Response):**
```json
{
  "ram": {
    "totalGB": 31.25,
    "usedGB": 18.5,
    "availableGB": 12.75,
    "freeGB": 2.8,
    "usedPercent": 59.2,
    "swapTotalGB": 4.0,
    "swapUsedGB": 4.0,
    "swapFreeGB": 0.0,
    "swapUsedPercent": 100,
    "source": "/proc/meminfo (Linux Host)"
  },
  "disk": {
    "totalGB": 193.5,
    "usedGB": 42.1,
    "freeGB": 151.4,
    "usedPercent": 21.8,
    "mount": "/"
  },
  "cpu": {
    "model": "AMD EPYC / Intel Xeon",
    "cores": 8,
    "speedMHz": 2400,
    "loadAvg": {
      "1m": 0.15,
      "5m": 0.22,
      "15m": 0.18
    }
  },
  "system": {
    "platform": "linux",
    "type": "Linux",
    "release": "6.1.0-xx-amd64",
    "arch": "x64",
    "hostname": "cda1d8e008f2",
    "uptimeSeconds": 864000,
    "uptimeFormatted": "10d 0h 0m 0s"
  },
  "process": {
    "pid": 21,
    "nodeVersion": "v22.14.0",
    "appUptimeSeconds": 1420,
    "heapUsedMB": 38.5,
    "heapTotalMB": 65.2,
    "rssMB": 85.1
  }
}
```

---

### 4) الإحصائيات المجمعة للمنظومة (System & Runtime Stats)
- **المسار:** `GET /api/stats`
- **الفائدة:** يجمع معلومات العتاد مع عدد المستخدمين المتصلين بالشات الحي في هذه اللحظة، وحالة قاعدة البيانات، لتمكين لوحات التحكم الإدارية من مراقبة النشاط.
- **مثال الاستجابة (Response):**
```json
{
  "hardware": { "...بيانات العتاد..." },
  "chat": {
    "onlineUsers": 3
  },
  "database": {
    "mode": "embedded",
    "isPostgres": false,
    "databaseUrlPresent": false,
    "counts": {
      "users": 2,
      "rooms": 3,
      "messages": 25
    }
  }
}
```

---

### 5) جلب رسائل الشات من قاعدة البيانات (Get Chat Messages)
- **المسار:** `GET /api/chat/messages`
- **المعاملات الاختيارية (Query Params):**
  - `room`: اسم الغرفة (افتراضي: `general`). غرف مدعومة: `general`, `dev-chat`, `vip-lounge`.
  - `limit`: عدد الرسائل المطلوبة (افتراضي: `50`).
- **الفائدة:** يستعلم من جدول `messages` في قاعدة بيانات SQL لجلب السجل التاريخي للرسائل مع الترتيب الزمني.
- **مثال الطلب:**
  `GET /api/chat/messages?room=dev-chat&limit=10`
- **مثال الاستجابة (Response):**
```json
{
  "success": true,
  "room": "dev-chat",
  "count": 2,
  "data": [
    {
      "id": 1,
      "room": "dev-chat",
      "username": "Ahmad_Admin",
      "text": "تم تدشين الباك إند بنجاح",
      "created_at": "2026-10-17T13:30:00.000Z"
    }
  ]
}
```

---

### 6) إرسال رسالة شات جديدة عبر REST (Send Message via REST)
- **المسار:** `POST /api/chat/send`
- **الهيدرز المطلوبة:** `Content-Type: application/json`
- **الفائدة:** يسمح للأنظمة الخارجية (مثل الـ Webhooks أو تطبيقات الجوال) بإرسال رسائل جديدة ليتم تخزينها في قاعدة بيانات SQL وبثها فورياً لكل المشتركين في الـ WebSockets.
- **جسم الطلب (Request Body):**
```json
{
  "room": "general",
  "username": "Ahmad",
  "text": "مرحباً بكم من الـ API المباشر!"
}
```
- **مثال الاستجابة (Response):**
```json
{
  "success": true,
  "data": {
    "id": 26,
    "room": "general",
    "username": "Ahmad",
    "text": "مرحباً بكم من الـ API المباشر!",
    "created_at": "2026-10-17T13:42:15.000Z"
  }
}
```

---

### 7) فحص حالة قاعدة بيانات SQL (Database Status)
- **المسار:** `GET /api/db/status`
- **الفائدة:** يحدد نوع الاتصال بقاعدة البيانات؛ هل هو `PostgreSQL` سحابي مربوط بـ `DATABASE_URL`، أم محرك SQL مدمج محلي، ويعرض عدد السجلات في كل جدول.
- **مثال الاستجابة (Response):**
```json
{
  "mode": "postgres",
  "isPostgres": true,
  "databaseUrlPresent": true,
  "counts": {
    "users": 2,
    "rooms": 3,
    "messages": 26
  }
}
```

---

### 8) تنفيذ استعلامات SQL حرة ومباشرة (SQL Query Runner)
- **المسار:** `POST /api/db/query`
- **الهيدرز المطلوبة:** `Content-Type: application/json`
- **الفائدة:** يتيح تنفيذ أوامر SQL مثل `SELECT`, `INSERT`, `UPDATE`, `DELETE` مباشرة عبر الـ API واسترجاع النتائج كمصفوفة صفوف (Rows Array).
- **جسم الطلب (Request Body):**
```json
{
  "sql": "SELECT id, username, role FROM users LIMIT 5;"
}
```
- **مثال الاستجابة (Response):**
```json
{
  "success": true,
  "mode": "embedded",
  "rowCount": 2,
  "rows": [
    {
      "id": 1,
      "username": "Ahmad_Admin",
      "role": "admin"
    },
    {
      "id": 2,
      "username": "Taqat_Bot",
      "role": "bot"
    }
  ]
}
```

---

## 4. أحداث الشات الحي عبر WebSockets (Socket.io Events)

يعمل السيرفر بمحرك WebSockets ثنائي الاتجاه بالوقت الفعلي على نفس المنفذ:

| اسم الحدث (Event) | النوع | المعاملات (Payload) | الفائدة والشرح |
| :--- | :--- | :--- | :--- |
| `connection` | خادم تلقائي | - | يُشعر السيرفر باتصال مستخدم جديد ويزيد عداد المتصلين. |
| `joinRoom` | العميل يُرسل (Emit) | `{ "room": "general", "username": "Ahmad" }` | ينقل المستخدم للغرفة المحددة، ويرسل له السيرفر فوراً آخر 50 رسالة عبر حدث `roomHistory`. |
| `chatMessage` | العميل يُرسل (Emit) | `{ "room": "general", "username": "Ahmad", "text": "نص" }` | يستقبل الرسالة، يحفظها في قاعدة بيانات SQL، ويبثها لجميع الموجودين بالغرفة عبر حدث `message`. |
| `typing` | العميل يُرسل (Emit) | `{ "room": "general", "username": "Ahmad" }` | يبث إشعار "يكتب الآن..." لبقية المستخدمين في الغرفة. |
| `userCount` | السيرفر يبث (Broadcast) | `عدد رقمي (مثلاً 5)` | يُحدّث عداد المتصلين في الوقت الفعلي لدى جميع التطبيقات. |
| `disconnect` | خادم تلقائي | - | يُنقص عداد المتصلين فور إغلاق التطبيق أو فقدان الاتصال. |

---

## 5. أكواد الحالة (HTTP Status Codes) المستخدمة

- **200 OK:** تم تنفيذ الطلب بنجاح.
- **201 Created:** تم إنشاء سجل جديد (رسالة / عنصر) وحفظه بنجاح.
- **400 Bad Request:** خطأ في البيانات المدخلة في الـ Body (مثل عدم إرسال نص الرسالة).
- **404 Not Found:** الرابط أو المسار غير موجود، ويرجع كائن JSON يوضح الرابط الخاطئ.
- **500 Internal Server Error:** خطأ داخلي في معالجة الاستعلام بقاعدة البيانات مع إرجاع كائن خطأ منظم.
