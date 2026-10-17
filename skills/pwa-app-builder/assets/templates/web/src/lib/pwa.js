/** إدارة PWA: تسجيل Service Worker + اشتراك Web Push + تنبيهات محلية بديلة. */

/**
 * ألوان شريط الحالة، محسوبة لتطابق اللون الفعلي للشريط العلوي (AppBar) بعد الشفافية:
 * - light: أبيض 85% (bg-white/85) فوق خلفية ink-50 مع لمسة دافئة من .app-bg
 * - dark:  ink-900/80 فوق خلفية ink-900 = {{THEME_DARK}}
 */
export const STATUS_BAR_COLORS = {
  light: '{{THEME_LIGHT}}',
  dark: '{{THEME_DARK}}',
};

/**
 * يزامن لون شريط الحالة مع ثيم التطبيق (وليس مع ثيم نظام التشغيل)،
 * لأن وسوم index.html تحمل media="(prefers-color-scheme: …)".
 * @param {'light'|'dark'} theme
 * @returns {string} اللون المطبَّق
 */
export function syncStatusBarColor(theme) {
  const color = STATUS_BAR_COLORS[theme === 'dark' ? 'dark' : 'light'];
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color));
  return color;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('SW registration failed', err);
    return null;
  }
}

/** URL-safe base64 → Uint8Array (مطلوب لاشتراك Push). */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/** المفتاح العام الذي سُجّل به الاشتراك الحالي على هذا الجهاز. */
const SUBSCRIBED_KEY_STORAGE = '{{PREFIX}}_push_key';

/** انتظار محدود — serviceWorker.ready لا يُحل أبداً إن لم يُسجَّل عامل خدمة. */
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

function sameKey(a, b) {
  if (!a || !b) return false;
  const left = new Uint8Array(a);
  if (left.length !== b.length) return false;
  return left.every((byte, index) => byte === b[index]);
}

/**
 * يقارن الاشتراك المحلي بمفتاح السيرفر الحالي (يُستخدم للتشخيص من الـConsole).
 * @returns {Promise<boolean>} true إن كان الاشتراك مطابقاً للمفتاح الحالي
 */
export async function subscriptionMatchesServerKey(getVapidKey) {
  if (!pushSupported()) return false;
  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 5000);
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return false;
    const { publicKey } = await getVapidKey();
    return sameKey(subscription.options?.applicationServerKey, urlBase64ToUint8Array(publicKey));
  } catch {
    return false;
  }
}

/**
 * يضمن وجود اشتراك Push صالح **مطابق لمفتاح السيرفر الحالي**.
 * إن تغيّر مفتاح VAPID (مثلاً بعد إصلاح زوج المفاتيح) فالاشتراك القديم يصبح
 * عديم الفائدة وتعيد Apple رفض الإرسال — لذلك نلغي الاشتراك ونعيده بالمفتاح الجديد.
 * يعيد الحالة: granted | denied | unsupported | error | skip
 */
export async function ensurePushSubscription(getVapidKey, subscribe) {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'skip';

  try {
    const { publicKey } = await getVapidKey();
    if (!publicKey) return 'error';
    const appServerKey = urlBase64ToUint8Array(publicKey);

    const registration = await withTimeout(navigator.serviceWorker.ready, 10000);
    if (!registration?.pushManager) return 'error';

    const subscribedKey = localStorage.getItem(SUBSCRIBED_KEY_STORAGE);
    let subscription = await registration.pushManager.getSubscription();
    const browserKey = subscription?.options?.applicationServerKey
      ? new Uint8Array(subscription.options.applicationServerKey)
      : null;
    // الاشتراك قديم إن كان مسجّلاً بمفتاح سيرفر سابق، أو مصدره غير معروف أصلاً
    // (اشتراك أُنشئ قبل إضافة هذا السجل) — في الحالتين لن تقبله Apple بعد تدوير المفاتيح.
    const stale =
      Boolean(subscription) &&
      ((subscribedKey ? subscribedKey !== publicKey : false) ||
        (browserKey ? !sameKey(browserKey, appServerKey) : false) ||
        (!subscribedKey && !browserKey));
    if (stale) {
      await subscription.unsubscribe();
      subscription = null;
    }

    const isFresh = !subscription;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
    }

    if (isFresh || subscribedKey !== publicKey) {
      await subscribe(subscription.toJSON());
      localStorage.setItem(SUBSCRIBED_KEY_STORAGE, publicKey);
    }
    return 'granted';
  } catch (err) {
    console.warn('push subscribe failed', err);
    return 'error';
  }
}

/**
 * يطلب إذن الإشعارات ويسجّل الجهاز في Web Push.
 * يعيد الحالة: granted | denied | unsupported | error
 */
export async function enablePush(getVapidKey, subscribe) {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  return ensurePushSubscription(getVapidKey, subscribe);
}

/** تنبيه محلي عبر Service Worker (يعمل عند فتح التطبيق حتى بدون Web Push). */
export async function showLocalNotification(title, body, url = '/alarms') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active) {
    registration.active.postMessage({ type: 'SHOW_NOTIFICATION', title, body, url });
  } else {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
}

/* ------------------------------ التثبيت (A2HS) ---------------------------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  window.dispatchEvent(new Event('ew:installable'));
});

export function canInstall() {
  return Boolean(deferredPrompt);
}

/** كشف iOS/iPadOS: لا يدعم التثبيت التلقائي — يحتاج "إضافة إلى الشاشة الرئيسية" يدوياً. */
export function isIOS() {
  const ua = window.navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ يُعرّف نفسه كـMac مع دعم اللمس
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/** هل المتصفح قادر على عرض زر التثبيت؟ (Chrome/Edge/Samsung) */
export function supportsAutoInstall() {
  return 'onbeforeinstallprompt' in window;
}

/** حالة التثبيت على هذا الجهاز: installed | prompt | ios | manual */
export function installState() {
  if (isStandalone()) return 'installed';
  if (canInstall()) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}
