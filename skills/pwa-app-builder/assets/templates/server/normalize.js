'use strict';
/**
 * تطبيع المدخلات النصية المستخدمة في المصادقة.
 *
 * السبب: لوحات مفاتيح الأنظمة العربية وبعض لوحات مفاتيح الهواتف تُدخل محارف
 * اتجاه/عرض صفري غير مرئية (U+200E LRM، U+200F RLM، ZWJ، BOM…) داخل البريد أو
 * كلمة المرور، كما تُضيف مسافة في آخر الحقل. هذه المحارف لا يُزيلها trim() فتصل
 * للسيرفر وتُفسد المقارنة فيفشل تسجيل الدخول رغم أن المستخدم كتب البيانات صحيحة.
 */

const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** يزيل المحارف غير المرئية فقط (بلا مساس بالمسافات). */
const stripInvisible = (value) => String(value ?? '').replace(INVISIBLE, '');

/** بريد موحّد للتخزين والمقارنة: بلا محارف مخفية ولا مسافات، وبحروف صغيرة. */
const normalizeEmail = (value) => stripInvisible(value).replace(/\s+/g, '').toLowerCase();

/** كلمة مرور موحّدة: بلا محارف مخفية وبلا مسافات طرفية. */
const normalizePassword = (value) => stripInvisible(value).trim();

/**
 * صور كلمة المرور المحتملة عند التحقق: كما كُتبت، ثم بعد التطبيع.
 * يسمح للحسابات القديمة (المسجّلة قبل تطبيق التطبيع) بالدخول دون إعادة تعيين.
 */
function passwordCandidates(value) {
  const raw = String(value ?? '');
  return [...new Set([raw, normalizePassword(raw)])];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** هل النص بريد إلكتروني صحيح بعد التطبيع؟ */
const isEmail = (value) => EMAIL_RE.test(normalizeEmail(value));

/** اسم للعرض: بلا محارف مخفية وبلا مسافات طرفية. */
const normalizeName = (value) => stripInvisible(value).trim();

module.exports = { INVISIBLE, stripInvisible, normalizeEmail, normalizePassword, normalizeName, passwordCandidates, isEmail };
