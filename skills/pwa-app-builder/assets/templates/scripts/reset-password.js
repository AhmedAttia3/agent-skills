#!/usr/bin/env node
'use strict';
/**
 * إعادة تعيين كلمة مرور حساب من سطر الأوامر (لاستعادة الوصول للحساب).
 *
 * الاستخدام:
 *   node scripts/reset-password.js --list                     # عرض الحسابات المسجّلة
 *   node scripts/reset-password.js <البريد>                   # توليد كلمة مرور جديدة وطبعها
 *   node scripts/reset-password.js <البريد> <كلمة المرور>      # تعيين كلمة مرور محددة
 *
 * ملاحظة: يعمل على data/{{APP_SLUG}}.db افتراضياً، ويمكن توجيهه لقاعدة أخرى بـDB_FILE.
 */
const crypto = require('crypto');
const { all, run } = require('../server/db');
const { hashPassword, findUserByEmail } = require('../server/auth');
const { normalizeEmail, normalizePassword } = require('../server/normalize');

function listAccounts() {
  const rows = all('SELECT id, kind, email, name, created_at FROM users ORDER BY id');
  if (!rows.length) {
    console.log('لا توجد حسابات بعد.');
    return;
  }
  console.log('\nالحسابات:');
  for (const row of rows) {
    const kind = row.kind === 'guest' ? 'زائر' : 'دائم';
    console.log(`  #${row.id}  ${kind.padEnd(4)}  ${(row.email || '(بلا بريد)').padEnd(28)}  ${row.name}  — ${row.created_at}`);
  }
  console.log('');
}

function makePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);

  if (!emailArg || emailArg === '--list' || emailArg === '-l') {
    listAccounts();
    if (!emailArg) {
      console.log('الاستخدام: node scripts/reset-password.js <البريد> [كلمة المرور الجديدة]\n');
      process.exit(emailArg ? 0 : 1);
    }
    return;
  }

  const user = findUserByEmail(emailArg);
  if (!user) {
    console.error(`❌ لا يوجد حساب بالبريد: ${normalizeEmail(emailArg)}`);
    listAccounts();
    process.exit(1);
  }

  const password = normalizePassword(passwordArg || makePassword());
  if (password.length < 6) {
    console.error('❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    process.exit(1);
  }

  const { salt, hash } = hashPassword(password);
  run('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?', [hash, salt, user.id]);

  console.log(`✅ تم تحديث كلمة المرور للحساب #${user.id} (${user.email})`);
  if (!passwordArg) console.log(`   كلمة المرور الجديدة: ${password}`);
  console.log('   سجّل الدخول بالبريد وكلمة المرور فقط، ثم غيّر كلمة المرور من الإعدادات إن أردت.\n');
}

main();
