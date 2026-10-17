'use strict';
/**
 * نقطة تشغيل السيرفر: Express يخدم الـAPI + ملفات الواجهة المبنية (Vite) + الصور + PWA.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { PORT, HOST, PUBLIC_DIR, UPLOADS_DIR, CATALOG_IMAGES_DIR, APP_NAME } = require('./config');
const { loadUser } = require('./auth');
const { startScheduler } = require('./scheduler');

const authRoutes = require('./routes/auth');
const { router: mealRoutes } = require('./routes/meals');
const suggestRoutes = require('./routes/suggest');
const { router: alarmRoutes } = require('./routes/alarms');
const { router: pushRoutes } = require('./routes/push');
const { router: publicRoutes } = require('./routes/public');
const { router: catalogRoutes } = require('./routes/catalog');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use(loadUser);

/* ------------------------------- ملفات ثابتة ------------------------------- */
// الصور المرفوعة: تُخزَّن على القرص وتُخدم مع كاش طويل (أسماء الملفات فريدة).
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, index: false })
);
// صور الكتالوج: نُسخ محلية جاهزة (960px) اسم ملفها ثابت لكل طبق.
app.use(
  '/catalog-images',
  express.static(CATALOG_IMAGES_DIR, { maxAge: '7d', index: false, fallthrough: true })
);

const indexHtml = path.join(PUBLIC_DIR, 'index.html');
const hasBuild = fs.existsSync(indexHtml);

if (hasBuild) {
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      etag: true,
      setHeaders(res, filePath) {
        // ملفات Vite تحتوي هاش في الاسم → كاش طويل. غيرها (sw/manifest) بلا كاش.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/sw\.js$|manifest\.webmanifest$|index\.html$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
} else {
  console.warn('[warn] لم يتم العثور على بناء الواجهة في server/public — شغّل "npm run build" أولاً.');
}

/* ----------------------------------- API ---------------------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, app: APP_NAME, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api', suggestRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'المسار غير موجود' }));

/* ------------------------ SPA fallback (React Router) --------------------- */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/catalog-images')) return next();
  if (!hasBuild) {
    return res
      .status(503)
      .type('html')
      .send('<div dir="rtl" style="font-family:sans-serif;padding:2rem">الواجهة غير مبنية بعد. شغّل: npm run build</div>');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexHtml);
});

/* ------------------------------ معالج الأخطاء ----------------------------- */
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: 'SERVER_ERROR', message: err.message || 'خطأ في السيرفر' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`✅ ${APP_NAME} يعمل على http://${HOST}:${PORT}`);
  });
  startScheduler();
}

module.exports = app;
