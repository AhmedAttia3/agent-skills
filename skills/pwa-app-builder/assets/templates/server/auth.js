'use strict';
/**
 * المصادقة: تشفير كلمة المرور بـ scrypt المدمج + جلسات موقّعة (HMAC) داخل HttpOnly Cookie.
 * لا نستخدم أي حزمة خارجية أو native binary.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, SESSION_TTL } = require('./config');
const { get, all } = require('./db');
const { normalizeEmail, passwordCandidates } = require('./normalize');

const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const COOKIE_NAME = '{{PREFIX}}_session';

function loadSecret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}
const SECRET = loadSecret();

/* ------------------------------- كلمات المرور ------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * تحقّق متسامح: يجرّب كلمة المرور كما كُتبت ثم بعد إزالة المحارف المخفية
 * والمسافات الطرفية. يجعل الدخول ينجح مع لوحات المفاتيح التي تُدخل U+200F
 * أو مسافة في آخر الحقل، ويُبقي الحسابات القديمة قابلة للدخول.
 */
function verifyPasswordLoose(password, salt, expectedHash) {
  return passwordCandidates(password).some((candidate) => verifyPassword(candidate, salt, expectedHash));
}

/**
 * يجد المستخدم بالبريد: مطابقة مباشرة أولاً، ثم مطابقة متسامحة (حسابات سابقة
 * خُزّن بريدها بمسافات أو محارف مخفية أو بحروف كبيرة).
 */
function findUserByEmail(email) {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  const exact = get('SELECT * FROM users WHERE email = ?', [clean]);
  if (exact) return exact;
  return all('SELECT * FROM users WHERE email IS NOT NULL').find((user) => normalizeEmail(user.email) === clean) || null;
}

/* --------------------------------- الجلسات -------------------------------- */

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function createToken(userId) {
  const payload = b64u(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/** يضبط كوكي الجلسة على الاستجابة. */
function setSession(res, userId) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${createToken(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure}`
  );
}

/** يحذف كوكي الجلسة. */
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Middleware: يحمّل المستخدم الحالي إن وُجدت جلسة صحيحة. */
function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const data = token ? readToken(token) : null;
  if (data) {
    const user = get('SELECT id, kind, email, name, theme, locale FROM users WHERE id = ?', [data.uid]);
    if (user) req.user = user;
  }
  next();
}

/** Middleware: يمنع الوصول لغير المسجّلين (بما فيهم جلسات الزائر). */
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول' });
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyPasswordLoose,
  findUserByEmail,
  setSession,
  clearSession,
  loadUser,
  requireAuth,
  COOKIE_NAME,
};
