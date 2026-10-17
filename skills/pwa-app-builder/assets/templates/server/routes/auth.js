'use strict';
/** مسارات المصادقة: تسجيل، دخول، جلسة زائر، ترقية الزائر، خروج، إعدادات الحساب */
const express = require('express');
const { get, run } = require('../db');
const {
  hashPassword,
  verifyPasswordLoose,
  findUserByEmail,
  setSession,
  clearSession,
  requireAuth,
} = require('../auth');
const { normalizeEmail, normalizePassword, normalizeName, isEmail } = require('../normalize');

const router = express.Router();

const publicUser = (u) => ({
  id: u.id,
  kind: u.kind,
  email: u.email,
  name: u.name,
  theme: u.theme,
  locale: u.locale,
  isGuest: u.kind === 'guest',
});

const BAD_CREDENTIALS = { error: 'BAD_CREDENTIALS', message: 'البريد أو كلمة المرور غير صحيحة' };

function validateCredentials(email, password) {
  if (!isEmail(email)) return 'البريد الإلكتروني غير صحيح';
  if (normalizePassword(password).length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  return null;
}

/** الاسم المعروض: ما كتبه المستخدم، وإلا الجزء الأول من بريده. */
const displayName = (name, email) => normalizeName(name) || normalizeEmail(email).split('@')[0];

/* --------------------------------- التسجيل -------------------------------- */
router.post('/register', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  const error = validateCredentials(email, password);
  if (error) return res.status(400).json({ error: 'VALIDATION', message: error });

  const cleanEmail = normalizeEmail(email);
  if (findUserByEmail(cleanEmail)) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'هذا البريد مسجّل مسبقاً' });
  }

  const { salt, hash } = hashPassword(normalizePassword(password));
  const info = run(
    'INSERT INTO users (kind, email, name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
    ['user', cleanEmail, displayName(name, cleanEmail), hash, salt]
  );
  setSession(res, Number(info.lastInsertRowid));
  const user = get('SELECT * FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
  res.status(201).json({ user: publicUser(user) });
});

/* ------------------------------- تسجيل الدخول ------------------------------ */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = normalizeEmail(email);
  const user = cleanEmail ? findUserByEmail(cleanEmail) : null;

  // لا نطلب الاسم هنا إطلاقاً: الدخول بالبريد وكلمة المرور فقط.
  if (!user || !verifyPasswordLoose(password, user.password_salt, user.password_hash)) {
    // سجل تشخيصي: يكشف سبب الفشل للمشرف دون تسريب أي معلومة للعميل.
    console.warn(
      `[auth] فشل تسجيل الدخول: email=${cleanEmail || '(فارغ)'} — الحساب=${user ? 'موجود' : 'غير موجود'}`
    );
    return res.status(401).json(BAD_CREDENTIALS);
  }
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

/* -------------------------------- وضع الزائر ------------------------------ */
router.post('/guest', (req, res) => {
  const info = run('INSERT INTO users (kind, name) VALUES (?, ?)', ['guest', 'ضيف']);
  const id = Number(info.lastInsertRowid);
  setSession(res, id);
  res.status(201).json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [id])) });
});

/** ترقية حساب الزائر إلى حساب دائم مع الحفاظ على كل بياناته. */
router.post('/upgrade', requireAuth, (req, res) => {
  if (req.user.kind !== 'guest') {
    return res.status(400).json({ error: 'NOT_GUEST', message: 'الحساب دائم بالفعل' });
  }
  const { email, password, name = '' } = req.body || {};
  const error = validateCredentials(email, password);
  if (error) return res.status(400).json({ error: 'VALIDATION', message: error });

  const cleanEmail = normalizeEmail(email);
  const existing = findUserByEmail(cleanEmail);
  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'هذا البريد مسجّل مسبقاً' });
  }
  const { salt, hash } = hashPassword(normalizePassword(password));
  run('UPDATE users SET kind = ?, email = ?, name = ?, password_hash = ?, password_salt = ? WHERE id = ?', [
    'user',
    cleanEmail,
    displayName(name, cleanEmail),
    hash,
    salt,
    req.user.id,
  ]);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

/* ----------------------------- تغيير كلمة المرور --------------------------- */
router.post('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول' });
  if (user.kind === 'guest') {
    return res.status(400).json({ error: 'GUEST_ACCOUNT', message: 'حساب الزائر بلا كلمة مرور — استخدم ترقية الحساب' });
  }
  if (!verifyPasswordLoose(currentPassword, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'كلمة المرور الحالية غير صحيحة' });
  }
  if (normalizePassword(newPassword).length < 6) {
    return res.status(400).json({ error: 'VALIDATION', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }
  const { salt, hash } = hashPassword(normalizePassword(newPassword));
  run('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?', [hash, salt, user.id]);
  res.json({ ok: true });
});

/* --------------------------------- الخروج -------------------------------- */
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/* ------------------------------- المستخدم الحالي --------------------------- */
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

/** تعديل الإعدادات (الاسم، الثيم، اللغة). */
router.patch('/me', requireAuth, (req, res) => {
  const { name, theme, locale } = req.body || {};
  const fields = [];
  const values = [];
  if (typeof name === 'string' && normalizeName(name)) {
    fields.push('name = ?');
    values.push(normalizeName(name));
  }
  if (theme === 'light' || theme === 'dark') {
    fields.push('theme = ?');
    values.push(theme);
  }
  if (locale === 'ar' || locale === 'en') {
    fields.push('locale = ?');
    values.push(locale);
  }
  if (!fields.length) return res.status(400).json({ error: 'NOTHING_TO_UPDATE', message: 'لا توجد بيانات للتحديث' });
  values.push(req.user.id);
  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

/** حذف الحساب وكل بياناته (متاح للزائر أيضاً). */
router.delete('/me', requireAuth, (req, res) => {
  run('DELETE FROM users WHERE id = ?', [req.user.id]);
  clearSession(res);
  res.json({ ok: true });
});

module.exports = router;
