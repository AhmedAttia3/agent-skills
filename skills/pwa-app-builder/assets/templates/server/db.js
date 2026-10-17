'use strict';
/**
 * طبقة قاعدة البيانات: SQLite المدمج في Node (node:sqlite) بدون أي حزمة native.
 * الملف: data/{{APP_SLUG}}.db
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DB_FILE } = require('./config');

const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL DEFAULT 'user',      -- user | guest
  email         TEXT UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  password_salt TEXT,
  theme         TEXT NOT NULL DEFAULT 'light',     -- light | dark
  locale        TEXT NOT NULL DEFAULT 'ar',        -- ar | en
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,                         -- الفئة الأساسية (الأولى)
  categories TEXT NOT NULL DEFAULT '',              -- كل الفئات csv: breakfast,dinner
  recipe      TEXT NOT NULL DEFAULT '',             -- نص حر (توافق قديم)
  description TEXT NOT NULL DEFAULT '',             -- وصف مختصر (اختياري)
  ingredients TEXT NOT NULL DEFAULT '',             -- سطر لكل مكوّن (اختياري)
  steps       TEXT NOT NULL DEFAULT '',             -- خطوة لكل سطر (اختياري)
  tags        TEXT NOT NULL DEFAULT '',             -- تصنيفات إضافية csv (اختياري)
  prep_minutes INTEGER,                             -- زمن التحضير بالدقائق (اختياري)
  servings    INTEGER,                              -- عدد الحصص (اختياري)
  image      TEXT,                                  -- اسم الملف داخل data/uploads
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_user ON meals(user_id, category);

CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id    INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER,                               -- 1..5 أو NULL
  liked      INTEGER,                               -- 1 | -1 | NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(meal_id, user_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_id    INTEGER REFERENCES meals(id) ON DELETE SET NULL,
  category   TEXT,
  outcome    TEXT NOT NULL DEFAULT 'shown',         -- shown | accepted
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sugg_user ON suggestions(user_id, created_at);

CREATE TABLE IF NOT EXISTS shares (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id    INTEGER NOT NULL UNIQUE REFERENCES meals(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alarms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_id    INTEGER REFERENCES meals(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT '',
  time       TEXT NOT NULL,                          -- HH:MM (24h)
  days       TEXT NOT NULL DEFAULT '',               -- csv 0..6 (الأحد=0)، فراغ = كل يوم
  tz_offset  INTEGER NOT NULL DEFAULT 0,             -- فرق توقيت المستخدم بالدقائق عن UTC
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_fired TEXT,                                   -- YYYY-MM-DD HH:MM
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alarms_user ON alarms(user_id, enabled);

CREATE TABLE IF NOT EXISTS push_subs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ── كتالوج الوصفات العام ─────────────────────────────────────────────
   يُملأ من ملفات data/catalog/*.json عبر scripts/catalog-sync.js
   ولا يرتبط بأي مستخدم: القراءة عامة، والإضافة لقائمة المستخدم تنسخ الصف. */
CREATE TABLE IF NOT EXISTS catalog_tags (
  slug       TEXT PRIMARY KEY,                     -- egyptian, grilled, ...
  name_ar    TEXT NOT NULL,
  name_en    TEXT NOT NULL DEFAULT '',
  emoji      TEXT NOT NULL DEFAULT '🍽️',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalog_meals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,              -- مفتاح ثابت للتحديث
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL DEFAULT '',
  aliases       TEXT NOT NULL DEFAULT '',          -- مرادفات للبحث csv
  short_desc    TEXT NOT NULL DEFAULT '',
  ingredients   TEXT NOT NULL DEFAULT '',          -- سطر لكل مكوّن
  steps         TEXT NOT NULL DEFAULT '',          -- خطوة لكل سطر
  meal_times    TEXT NOT NULL DEFAULT '',          -- فطور,غداء,عشاء,خفيفة
  tags          TEXT NOT NULL DEFAULT '',          -- slugs csv
  region        TEXT NOT NULL DEFAULT '',          -- egypt | levant | gulf | maghreb | world
  prep_minutes  INTEGER,
  servings      INTEGER,
  emoji         TEXT NOT NULL DEFAULT '🍽️',
  image_query   TEXT NOT NULL DEFAULT '',          -- كلمات البحث في ويكيميديا (imageQuery)
  image_file    TEXT,                              -- اسم الملف داخل data/catalog-images
  image_credit  TEXT NOT NULL DEFAULT '',          -- اسم المصوّر
  image_license TEXT NOT NULL DEFAULT '',          -- CC BY-SA 4.0 | CC0 | Public domain
  image_source  TEXT NOT NULL DEFAULT '',          -- رابط صفحة المصدر
  is_active     INTEGER NOT NULL DEFAULT 1,        -- حذف ناعم
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_active ON catalog_meals(is_active, sort_order);
`);

/* ترقيات بسيطة لقواعد موجودة مسبقاً (تُتجاهل إن كان العمود موجوداً). */
for (const migration of [
  'ALTER TABLE alarms ADD COLUMN tz_offset INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE meals ADD COLUMN categories TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE meals ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE meals ADD COLUMN ingredients TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE meals ADD COLUMN steps TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE meals ADD COLUMN tags TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE meals ADD COLUMN prep_minutes INTEGER',
  'ALTER TABLE meals ADD COLUMN servings INTEGER',
  "UPDATE meals SET categories = category WHERE categories = '' OR categories IS NULL",
]) {
  try {
    db.exec(migration);
  } catch {
    /* العمود موجود بالفعل أو التحديث غير مطلوب */
  }
}

/** تنفيذ استعلام يُرجع عدة صفوف. */
const all = (sql, params = []) => db.prepare(sql).all(...params);
/** تنفيذ استعلام يُرجع صفاً واحداً أو undefined. */
const get = (sql, params = []) => db.prepare(sql).get(...params);
/** تنفيذ أمر تعديل/إضافة. */
const run = (sql, params = []) => db.prepare(sql).run(...params);

module.exports = { db, all, get, run };
