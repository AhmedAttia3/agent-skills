'use strict';
/**
 * الإشعارات: Web Push بمفاتيح VAPID مولّدة محلياً (data/vapid.json).
 * تُستخدم الحزمة web-push (JS خالص، بدون native).
 *
 * ملاحظتان مهمتان تخصّان خدمة Apple (web.push.apple.com) — وإلا فشل الإرسال
 * بـ403 BadJwtToken حتى لو كان الاشتراك سليماً:
 *  1) المفتاح العام يجب أن يطابق المفتاح الخاص فعلاً (نتحقق عند الإقلاع).
 *  2) حقل sub في توكن VAPID يجب أن يكون بريداً/رابطاً بنطاق حقيقي قابل للحل
 *     — النطاقات مثل admin@{{APP_SLUG}}.local أو @localhost ترفضها Apple.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const webpush = require('web-push');
const { DATA_DIR } = require('../config');
const { all, run } = require('../db');
const { requireAuth } = require('../auth');

const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

/** مرسل الإشعارات: يجب أن يكون نطاقاً حقيقياً (env VAPID_SUBJECT للتغيير). */
const DEFAULT_SUBJECT = 'mailto:admin@example.com';

/** نطاقات ترفضها Apple (غير قابلة للحل) — تُعتبر غير صالحة. */
const INVALID_SUBJECT = /@(?:localhost|[\w-]+(?:\.[\w-]+)*\.(?:local|localhost|invalid|test|example))\b/i;

function isValidSubject(subject) {
  if (typeof subject !== 'string') return false;
  if (!/^(mailto:|https:\/\/)/i.test(subject)) return false;
  return !INVALID_SUBJECT.test(subject);
}

/** المفتاح العام المشتق من المفتاح الخاص (uncompressed P-256). */
function derivePublicKey(privateKey) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  return ecdh.getPublicKey(); // Buffer: 0x04 || X(32) || Y(32)
}

/** هل الزوج العام/الخاص متطابق فعلاً؟ (زوج مكسور = 403 BadJwtToken من Apple). */
function isValidKeyPair(keys) {
  if (!keys?.publicKey || !keys?.privateKey) return false;
  try {
    const derived = derivePublicKey(keys.privateKey);
    const stored = Buffer.from(keys.publicKey, 'base64url');
    return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

/**
 * يحمّل مفاتيح VAPID أو يولّدها عند أول تشغيل.
 * عند وجود زوج مكسور (أو ملف تالف) يولّد زوجاً جديداً ويلغي الاشتراكات القديمة،
 * لأن الاشتراكات مرتبطة بالمفتاح العام القديم ولا يمكن إصلاحها.
 */
function loadVapidKeys() {
  let keys = null;
  if (fs.existsSync(VAPID_FILE)) {
    try {
      keys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
    } catch {
      keys = null;
    }
  }

  if (keys && !isValidKeyPair(keys)) {
    console.warn('[push] ⚠️  مفتاح VAPID العام لا يطابق الخاص — سيُولَّد زوج جديد وتُلغى الاشتراكات القديمة.');
    keys = null;
  }

  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    try {
      run('DELETE FROM push_subs'); // اشتراكات مربوطة بالمفتاح القديم — لا تعمل بعد الآن
    } catch {
      /* قاعدة البيانات قد لا تكون جاهزة */
    }
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  }

  // subject محفوظ في الملف (ويمكن تجاوزه بـVAPID_SUBJECT)، مع ترحيل النطاقات غير الصالحة
  const subject = process.env.VAPID_SUBJECT || (isValidSubject(keys.subject) ? keys.subject : DEFAULT_SUBJECT);
  if (keys.subject !== subject) {
    keys.subject = subject;
    try {
      fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
    } catch {
      /* الملف للقراءة فقط — نكمل بالقيمة في الذاكرة */
    }
  }
  return keys;
}

const keys = loadVapidKeys();
webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
if (process.env.PUSH_DEBUG) console.log('[push] subject =', keys.subject);

const router = express.Router();

/** استخراج سبب الرفض من جسم رد مزوّد الإشعارات (APNs/FCM). */
function failureReason(err) {
  const raw = err?.body || err?.message || '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.reason) return String(parsed.reason);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* ليس JSON */
  }
  return String(raw).slice(0, 200) || 'UNKNOWN';
}

/** اشتراكات لا يمكن إصلاحها: منتهية (404/410) أو توكن مرفوض (403 BadJwtToken). */
function isPermanentFailure(statusCode, reason) {
  if (statusCode === 404 || statusCode === 410) return true;
  return statusCode === 403 && /BadJwtToken|BadVapid/i.test(reason);
}

/**
 * إرسال إشعار لمستخدم واحد عبر كل اشتراكاته، مع نتائج حقيقية لكل اشتراك
 * (وليس مجرد "تم"). الاشتراكات الميتة تُحذف تلقائياً.
 * @returns {Promise<{total:number, sent:number, failed:Array<{status:number, reason:string}>}>}
 */
async function sendToUser(userId, payload) {
  const subs = all('SELECT * FROM push_subs WHERE user_id = ?', [userId]);
  const body = JSON.stringify(payload);
  const result = { total: subs.length, sent: 0, failed: [] };

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        result.sent += 1;
      } catch (err) {
        const status = Number(err?.statusCode || 0);
        const reason = failureReason(err);
        result.failed.push({ status, reason });
        if (isPermanentFailure(status, reason)) {
          try {
            run('DELETE FROM push_subs WHERE id = ?', [sub.id]); // اشتراك ميت
          } catch {
            /* تجاهل */
          }
        }
        console.warn(`[push] فشل إرسال (${status || 'شبكة'}): ${reason}`);
      }
    })
  );

  return result;
}

router.get('/public-key', (_req, res) => {
  res.json({ publicKey: keys.publicKey, enabled: true });
});

router.post('/subscribe', requireAuth, (req, res) => {
  const sub = req.body?.subscription || req.body;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'VALIDATION', message: 'بيانات الاشتراك غير مكتملة' });
  }
  run(
    `INSERT INTO push_subs (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [req.user.id, endpoint, p256dh, auth]
  );
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', [endpoint, req.user.id]);
  res.json({ ok: true });
});

/** رابط صورة صالح لحمولة الإشعار (نسبي أو مطلق) — يُفتح في الجهاز من نطاق التطبيق. */
function normalizeImageUrl(value) {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  if (!url || url.length > 500) return undefined;
  if (!/^(https?:\/\/|\/)/.test(url)) return undefined;
  return url;
}

/**
 * إشعار تجريبي من شاشة التنبيهات — ينتظر نتيجة التسليم الفعلية من مزوّد الإشعارات
 * حتى تُعرض للمستخدم رسالة صادقة (نجاح/فشل بسبب واضح) بدل "تم الإرسال" دائماً.
 * يقبل `{ image }` اختيارياً: الصورة الكبيرة تعمل على أندرويد/كروم فقط؛ iOS يتجاهلها.
 */
router.post('/test', requireAuth, async (req, res) => {
  const image = normalizeImageUrl(req.body?.image);
  const result = await sendToUser(req.user.id, {
    title: '{{APP_NAME}} 🍽️',
    body: image ? 'إشعار تجريبي مع صورة — التنبيهات تعمل بنجاح' : 'هذا إشعار تجريبي — التنبيهات تعمل بنجاح',
    url: '/alarms',
    tag: '{{APP_SLUG}}-test',
    ...(image ? { image } : {}),
  });
  res.json({
    ok: result.sent > 0,
    subscriptions: result.total,
    sent: result.sent,
    failed: result.failed,
    image: image || null,
  });
});

module.exports = { router, sendToUser, vapidPublicKey: keys.publicKey, vapidSubject: keys.subject, normalizeImageUrl };
