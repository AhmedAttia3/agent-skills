'use strict';
/**
 * توليد مفاتيح الإشعارات (VAPID) ومفتاح الجلسات مسبقاً.
 * الاستخدام: npm run setup:keys
 * (السيرفر يولّدها تلقائياً عند أول تشغيل إن لم تكن موجودة.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const vapidFile = path.join(DATA_DIR, 'vapid.json');
const secretFile = path.join(DATA_DIR, 'secret.key');

if (fs.existsSync(vapidFile)) {
  console.log('ℹ️  مفاتيح VAPID موجودة بالفعل:', vapidFile);
} else {
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.log('✅ تم توليد مفاتيح VAPID:', vapidFile);
}

if (fs.existsSync(secretFile)) {
  console.log('ℹ️  مفتاح الجلسات موجود بالفعل:', secretFile);
} else {
  fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  console.log('✅ تم توليد مفتاح الجلسات:', secretFile);
}
