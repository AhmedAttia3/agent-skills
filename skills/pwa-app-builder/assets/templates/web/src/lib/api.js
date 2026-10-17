/** طبقة الاتصال بالـAPI: كل الطلبات تمر من هنا مع credentials وكشف الأخطاء بشكل موحّد. */
import { normalizeEmail, normalizePassword, normalizeName } from './normalize';

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(data?.message || 'حدث خطأ غير متوقع', data?.error || 'HTTP_ERROR', res.status);
  }
  return data;
}

/**
 * يوحّد بيانات الدخول/التسجيل قبل الإرسال:
 * - البريد: بلا مسافات أو محارف اتجاه غير مرئية وبحروف صغيرة (سبب شائع لفشل الدخول).
 * - كلمة المرور: بلا مسافات طرفية أو محارف مخفية.
 * - الاسم: يُرسل للتسجيل/الترقية فقط، ولا يُرسل أبداً عند تسجيل الدخول.
 */
function credentialBody(payload = {}) {
  const body = { email: normalizeEmail(payload.email), password: normalizePassword(payload.password) };
  const name = normalizeName(payload.name);
  if (name) body.name = name;
  return body;
}

export const api = {
  /* المصادقة */
  me: () => request('/auth/me'),
  register: (payload) => request('/auth/register', { method: 'POST', body: credentialBody(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: credentialBody(payload) }),
  guest: () => request('/auth/guest', { method: 'POST' }),
  upgrade: (payload) => request('/auth/upgrade', { method: 'POST', body: credentialBody(payload) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (payload) =>
    request('/auth/password', {
      method: 'POST',
      body: { currentPassword: normalizePassword(payload.currentPassword), newPassword: normalizePassword(payload.newPassword) },
    }),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  deleteAccount: () => request('/auth/me', { method: 'DELETE' }),

  /* الوجبات */
  listMeals: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return request(`/meals${qs ? `?${qs}` : ''}`);
  },
  getMeal: (id) => request(`/meals/${id}`),
  createMeal: (payload) => request('/meals', { method: 'POST', body: payload }),
  updateMeal: (id, payload) => request(`/meals/${id}`, { method: 'PATCH', body: payload }),
  deleteMeal: (id) => request(`/meals/${id}`, { method: 'DELETE' }),
  rateMeal: (id, payload) => request(`/meals/${id}/rate`, { method: 'POST', body: payload }),
  shareMeal: (id) => request(`/meals/${id}/share`, { method: 'POST' }),
  unshareMeal: (id) => request(`/meals/${id}/share`, { method: 'DELETE' }),
  stats: () => request('/meals/meta/stats'),

  /* الاقتراح */
  suggest: (payload) => request('/suggest', { method: 'POST', body: payload }),
  suggestOutcome: (payload) => request('/suggest/outcome', { method: 'POST', body: payload }),

  /* التنبيهات */
  listAlarms: () => request('/alarms'),
  createAlarm: (payload) => request('/alarms', { method: 'POST', body: payload }),
  updateAlarm: (id, payload) => request(`/alarms/${id}`, { method: 'PATCH', body: payload }),
  deleteAlarm: (id) => request(`/alarms/${id}`, { method: 'DELETE' }),

  /* الإشعارات */
  vapidKey: () => request('/push/public-key'),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
  unsubscribePush: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  testPush: () => request('/push/test', { method: 'POST' }),

  /* كتالوج الوصفات العام */
  listCatalog: (params = {}) => request(`/catalog?${new URLSearchParams(cleanParams(params))}`),
  catalogTags: () => request('/catalog/tags'),
  catalogMeal: (slug) => request(`/catalog/${encodeURIComponent(slug)}`),
  addCatalogMeal: (slug, body) => request(`/catalog/${encodeURIComponent(slug)}/add`, { method: 'POST', body: body || {} }),
  randomCatalog: (category = 'all') => request(`/catalog/random?category=${encodeURIComponent(category)}`),

  /* عام */
  publicMeal: (token) => request(`/public/meal/${token}`),
  importSharedMeal: (token) => request(`/public/meal/${token}/import`, { method: 'POST' }),
};

/** تصغير الصورة في المتصفح (Canvas) قبل الرفع — يوفّر البيانات والذاكرة على السيرفر. */
export function compressImage(file, { maxSize = 1000, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('IMAGE_ONLY'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('DECODE_FAILED'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** يحذف القيم الفارغة من بارامترات البحث. */
function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null));
}

/** يعيد فئات الوجبة كمصفوفة (يدعم الوجبات القديمة بفئة واحدة). */
export function mealCategories(meal) {
  if (!meal) return [];
  if (Array.isArray(meal.categories) && meal.categories.length) return meal.categories;
  return meal.category ? [meal.category] : [];
}

/** معلومات الفئات: المفتاح + الإيموجي + اللون. */
export const CATEGORY_META = {
  breakfast: { key: 'cat.breakfast', emoji: '🌅' },
  lunch: { key: 'cat.lunch', emoji: '🍲' },
  dinner: { key: 'cat.dinner', emoji: '🌙' },
  snack: { key: 'cat.snack', emoji: '🍎' },
};
export const CATEGORIES = Object.keys(CATEGORY_META);
