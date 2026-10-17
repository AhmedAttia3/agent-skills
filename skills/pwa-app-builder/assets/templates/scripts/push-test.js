'use strict';
/**
 * أداة تشخيص الإشعارات (Push): تُرسل إشعاراً فعلياً وتطبع رد مزوّد الإشعارات
 * (Apple/Google) لكل اشتراك — لتحديد السبب الحقيقي عندما "يُقال تم الإرسال"
 * ولا يظهر إشعار على الهاتف.
 *
 * الاستخدام:
 *   node scripts/push-test.js                 # كل المستخدمين
 *   node scripts/push-test.js admin@example.com
 *   node scripts/push-test.js --image=/icons/icon-512.png   # إشعار يحمل صورة
 *   node scripts/push-test.js --keys          # فحص زوج مفاتيح VAPID وحقل sub فقط
 *   VAPID_SUBJECT='mailto:you@gmail.com' node scripts/push-test.js --keys
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const ROOT = path.resolve(__dirname, '..');
const vapidFile = path.join(ROOT, 'data', 'vapid.json');
const keys = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));

const NO_KEYS = process.argv.includes('--keys');
const imageArg = (process.argv.find((arg) => arg.startsWith('--image=')) || '').slice('--image='.length);
const emailArg = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);

function derivePublicKey(privateKey) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  return ecdh.getPublicKey();
}

function checkKeys() {
  const derived = derivePublicKey(keys.privateKey);
  const stored = Buffer.from(keys.publicKey, 'base64url');
  const pairOk = derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  const subject = process.env.VAPID_SUBJECT || keys.subject || '(غير محدد)';
  const realDomain = /@(?:localhost|[\w-]+(?:\.[\w-]+)*\.(?:local|localhost|invalid|test|example))\b/i.test(subject);

  console.log('🔑 فحص مفاتيح VAPID');
  console.log('  المفتاح العام (الملف)   :', keys.publicKey);
  console.log('  المفتاح العام (مشتق)    :', derived.toString('base64'));
  console.log(pairOk ? '  ✅ الزوج العام/الخاص متطابق' : '  ❌ الزوج مكسور — Apple ستجيب بـ403 BadJwtToken');
  console.log('  subject                 :', subject);
  console.log(
    realDomain
      ? '  ❌ subject بنطاق غير حقيقي — Apple ترفضه (استخدم بريداً/رابطاً حقيقياً)'
      : '  ✅ صيغة subject مقبولة'
  );
  return pairOk && !realDomain;
}

async function main() {
  let ok = true;
  if (checkKeys() === false) ok = false;
  if (NO_KEYS) {
    process.exit(ok ? 0 : 1);
  }

  const { DatabaseSync } = require('node:sqlite');
  const { DB_FILE } = require('../server/config');
  const db = new DatabaseSync(DB_FILE);
  let subs = db
    .prepare('SELECT push_subs.*, users.email, users.name FROM push_subs LEFT JOIN users ON users.id = push_subs.user_id')
    .all();
  if (emailArg) subs = subs.filter((s) => s.email === emailArg);

  if (!subs.length) {
    console.log('\n⚠️  لا توجد اشتراكات مسجّلة' + (emailArg ? ` للمستخدم ${emailArg}` : '') + '.');
    console.log('   افتح التطبيق على الجهاز واضغط «تفعيل الإشعارات» أولاً.');
    process.exit(1);
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || keys.subject || 'mailto:admin@example.com', keys.publicKey, keys.privateKey);
  console.log(`\n📨 إرسال إشعار تجريبي إلى ${subs.length} اشتراك...`);
  if (imageArg) console.log(`   🖼️  صورة: ${imageArg} (تظهر على أندرويد/كروم — iOS يتجاهلها)`);

  for (const sub of subs) {
    const host = new URL(sub.endpoint).host;
    try {
      const res = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: '{{APP_NAME}} 🍽️',
          body: imageArg ? 'إشعار تشخيصي مع صورة' : 'إشعار تشخيصي',
          url: '/alarms',
          tag: '{{APP_SLUG}}-diag',
          ...(imageArg ? { image: imageArg } : {}),
        })
      );
      console.log(`  ✅ ${host} (${sub.email || 'ضيف'}) — APNs: ${res.statusCode}`);
    } catch (err) {
      ok = false;
      const status = err.statusCode || 'شبكة';
      let reason = err.body || err.message;
      try {
        reason = JSON.parse(err.body).reason;
      } catch {
        /* ليس JSON */
      }
      console.log(`  ❌ ${host} (${sub.email || 'ضيف'}) — ${status}: ${reason}`);
    }
  }

  if (!ok) {
    console.log('\nسبب شائع: BadJwtToken ⇒ زوج مفاتيح VAPID مكسور أو subject بنطاق غير حقيقي.');
    console.log('الحل: احذف data/vapid.json وأعد تشغيل السيرفر ثم أعد تفعيل الإشعارات على الجهاز.');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
