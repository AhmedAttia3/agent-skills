/* {{APP_NAME}} — Service Worker:
   - تخزين هيكل التطبيق (app shell) للعمل بلا إنترنت
   - استراتيجية: network-first للتنقل، cache-first لأصول Vite المُهشّرة، network-only للـAPI
   - استقبال إشعارات Web Push وعرضها */
const VERSION = '{{APP_SLUG}}-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // الـAPI دائماً من الشبكة

  // التنقل: من الشبكة أولاً مع الرجوع لنسخة مخزّنة عند انقطاع الإنترنت
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || Response.error())
    );
    return;
  }

  // أصول ثابتة (JS/CSS/صور/خطوط): كاش أولاً
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && (response.type === 'basic' || response.type === 'default')) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached || Response.error());
    })
  );
});

/* ------------------------------- Web Push -------------------------------- */
/** روابط الصور في الإشعارات يجب أن تكون مطلقة — نحوّلها نسبةً لأصل التطبيق. */
function absoluteUrl(url) {
  if (!url || typeof url !== 'string') return undefined;
  try {
    return new URL(url, self.location.origin).href;
  } catch {
    return undefined;
  }
}

/** خيارات الإشعار المشتركة بين Push والتنبيه المحلي. */
function notificationOptions(data = {}) {
  return {
    body: data.body || '',
    icon: absoluteUrl(data.icon) || '/icons/icon-192.png',
    badge: absoluteUrl(data.badge) || '/icons/icon-192.png',
    // الصورة الكبيرة: Chrome/Android يعرضها، وiOS يتجاهلها (WebKit غير مدعوم)
    image: absoluteUrl(data.image),
    tag: data.tag || '{{APP_SLUG}}',
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '{{APP_NAME}}', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '{{APP_NAME}} 🍽️';
  event.waitUntil(self.registration.showNotification(title, notificationOptions(data)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// تنبيه محلي (بديل عند غياب Web Push) — يُرسل من الصفحة عبر postMessage
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(
      msg.title || '{{APP_NAME}} 🍽️',
      notificationOptions({ ...msg, tag: msg.tag || '{{APP_SLUG}}-local', url: msg.url || '/alarms' })
    );
  }
});
