/**
 * تطبيع المدخلات في الواجهة (نسخة مطابقة لـserver/normalize.js).
 * يمنع وصول محارف اتجاه غير مرئية (RLM/LRM/ZWJ/BOM) أو مسافات زائدة من لوحة
 * المفاتيح إلى السيرفر، وهي سبب شائع لفشل تسجيل الدخول في الواجهات العربية.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export const stripInvisible = (value) => String(value ?? '').replace(INVISIBLE, '');

/** بريد موحّد: بلا محارف مخفية ولا مسافات، وبحروف صغيرة. */
export const normalizeEmail = (value) => stripInvisible(value).replace(/\s+/g, '').toLowerCase();

/** كلمة مرور موحّدة: بلا محارف مخفية وبلا مسافات طرفية. */
export const normalizePassword = (value) => stripInvisible(value).trim();

/** اسم للعرض: بلا محارف مخفية وبلا مسافات طرفية. */
export const normalizeName = (value) => stripInvisible(value).trim();
