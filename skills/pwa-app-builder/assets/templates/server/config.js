'use strict';
/**
 * إعدادات عامة للمشروع: المسارات، المنفذ، وثوابت النطاق (Domain constants).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
/** مجلد ملفات محتوى الكتالوج (مصدر التغذية) ونسخ الصور المحلية. */
const CATALOG_DIR = path.join(DATA_DIR, 'catalog');
const CATALOG_IMAGES_DIR = path.join(DATA_DIR, 'catalog-images');
/** ملف قاعدة البيانات — يمكن تجاوزه بـDB_FILE (تستخدمه الاختبارات لقاعدة منفصلة). */
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, '{{APP_SLUG}}.db');

for (const dir of [DATA_DIR, UPLOADS_DIR, CATALOG_DIR, CATALOG_IMAGES_DIR, path.dirname(DB_FILE)]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** الفئات المتاحة للوجبات (مفتاح ثابت يُستخدم في الواجهة والـAPI). */
const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack'];

/** أقصى حجم للصورة الواردة كـ data URL (بعد تصغيرها في المتصفح). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** مدة صلاحية جلسة المستخدم بالثواني (30 يوم). */
const SESSION_TTL = 30 * 24 * 60 * 60;

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const APP_NAME = '{{APP_NAME}}';

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOADS_DIR,
  PUBLIC_DIR,
  CATALOG_DIR,
  CATALOG_IMAGES_DIR,
  DB_FILE,
  CATEGORIES,
  MAX_IMAGE_BYTES,
  SESSION_TTL,
  PORT,
  HOST,
  APP_NAME,
};
