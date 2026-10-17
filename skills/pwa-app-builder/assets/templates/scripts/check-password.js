#!/usr/bin/env node
'use strict';
/**
 * فحص كلمة مرور محتملة مقابل الحساب المخزَّن — بلا أي تعديل على قاعدة البيانات.
 *
 * السبب: قد تكون كلمة المرور المخزَّنة نسخة مختلفة قليلاً عمّا يتذكّره المستخدم
 * (مسافة/محرف اتجاه/حرف أول كبير) أو مشفّرة ببارامترات قديمة. الأداة تجرّب
 * كل هذه الاحتمالات وتخبرك أيّها يطابق.
 *
 * الاستخدام:
 *   EW_PASSWORD='...' node scripts/check-password.js <البريد>   # بلا سجل محفوظ في الشِل
 *   node scripts/check-password.js <البريد>                     # يُطلب منك الكتابة بدون إظهار
 */
const crypto = require('crypto');
const readline = require('readline');
const { findUserByEmail } = require('../server/auth');
const { stripInvisible, normalizeEmail } = require('../server/normalize');

/** صور مختلفة محتملة لكلمة المرور المُدخلة. */
function variants(password) {
  const raw = String(password);
  const clean = stripInvisible(raw);
  const upperFirst = clean.charAt(0).toUpperCase() + clean.slice(1);
  return [...new Set([raw, clean, clean.trim(), raw + '\n', clean + ' ', clean.toLowerCase(), upperFirst, `\u200f${clean}`, `${clean}\u200f`])].filter(Boolean);
}

/** كل دوال التشفير الممكنة (الحالية والقديمة) مع بارامتراتها. */
function schemes(password, salt) {
  const list = [];
  const push = (name, fn) => {
    try {
      list.push([name, Buffer.from(fn(), 'hex')]);
    } catch {
      /* بارامترات غير مقبولة — نتجاهلها */
    }
  };

  // scrypt الحالي + بارامترات قديمة محتملة
  for (const keylen of [64, 32]) {
    push(`scrypt-default/${keylen}`, () => crypto.scryptSync(password, salt, keylen).toString('hex'));
  }
  for (const N of [1024, 2048, 4096, 8192, 32768]) {
    push(`scrypt-N${N}`, () => crypto.scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex'));
  }
  // PBKDF2 بمرات تكرار مختلفة
  for (const iterations of [1, 1000, 10000, 100000, 210000, 310000]) {
    push(`pbkdf2-sha256/${iterations}`, () => crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex'));
    push(`pbkdf2-sha512/${iterations}`, () => crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha512').toString('hex'));
  }
  // تجزئات بسيطة (لو استُخدمت في نسخة مبكرة)
  for (const algo of ['sha256', 'sha512', 'md5']) {
    push(`${algo}(pw+salt)`, () => crypto.createHash(algo).update(password + salt).digest('hex'));
    push(`${algo}(salt+pw)`, () => crypto.createHash(algo).update(salt + password).digest('hex'));
  }
  return list;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (!['\n', '\r', '\u0004'].includes(char.toString())) {
        readline.moveCursor(process.stdout, -1, 0);
        process.stdout.write('*');
        readline.moveCursor(process.stdout, 1, 0);
      }
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      process.stdin.off('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = normalizeEmail(process.argv[2] || '');
  if (!email) {
    console.error('الاستخدام: node scripts/check-password.js <البريد>');
    process.exit(1);
  }

  const user = findUserByEmail(email);
  if (!user) {
    console.error(`❌ لا يوجد حساب بالبريد: ${email}`);
    process.exit(1);
  }

  const password = process.env.EW_PASSWORD ?? (await askHidden('اكتب كلمة المرور المحتملة (لن تظهر): '));
  if (!password) {
    console.error('❌ لم تُدخل كلمة مرور.');
    process.exit(1);
  }

  const expected = Buffer.from(user.password_hash, 'hex');
  const started = Date.now();
  let tried = 0;
  let match = null;

  for (const variant of variants(password)) {
    for (const [scheme, actual] of schemes(variant, user.password_salt)) {
      tried += 1;
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
        match = { variant, scheme };
        break;
      }
    }
    if (match) break;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nالحساب: #${user.id} ${user.email} — جُرِّبت ${tried} تركيبة في ${seconds} ثانية.`);
  if (match) {
    console.log(`✅ مطابقة! الطريقة: ${match.scheme}`);
    console.log(`   الصورة المطابقة لكلمة المرور: ${JSON.stringify(match.variant)}`);
    if (match.variant !== password) console.log('   أي أن كلمة المرور المخزَّنة تختلف قليلاً عن التي كتبتها (مسافة/محرف مخفي/حالة أحرف).');
    console.log('   يمكنك الآن تسجيل الدخول بها كما هي.\n');
  } else {
    console.log('❌ لا مطابقة: كلمة المرور هذه (ولا أي صورة قريبة منها) هي المخزَّنة لهذا الحساب.');
    console.log(`   لإعادة التعيين: node scripts/reset-password.js ${user.email} "كلمة مرور جديدة"\n`);
  }
}

main();
