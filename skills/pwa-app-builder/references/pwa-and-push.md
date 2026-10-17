# PWA, push and alarms

## manifest.webmanifest

```json
{
  "name": "<الاسم العربي> — <English name>",
  "short_name": "<الاسم القصير>",
  "lang": "ar", "dir": "rtl",
  "start_url": "/?source=pwa", "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "<brand-50>", "theme_color": "<brand-600>",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ],
  "shortcuts": [{ "name": "<الإجراء الأساسي>", "url": "/<primary-action>" }]
}
```

Run `npm run icons` after scaffolding (or after any palette change) — the icons are rasterised
locally by `scripts/gen-icons.py` (stdlib only) and are **not** part of the templates. Without them
the manifest 404s its icons and the installed app looks unbranded.

`index.html` must also carry `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`,
`apple-touch-icon`, and `theme-color` (light + dark). Do **not** add `viewport-fit=cover` and do
**not** add `apple-mobile-web-app-status-bar-style: black-translucent` — see
`references/pitfalls.md` #3 for the letterboxed-bottom-nav reason.

## Service worker (hand-written, no Workbox)

Cache policy is deliberate — do not change it without a reason:

| Request | Strategy | Why |
|---|---|---|
| `mode === 'navigate'` | network-first, fall back to the cached `/index.html` | Users get fresh HTML when online, the app shell when offline |
| hashed `/assets/*` | cache-first, one-year immutable | Filenames change when content changes, so this is always safe |
| `/api/*` | never cached (network only) | Stale API responses are a data-correctness bug, not a perf win |
| `sw.js`, `manifest.webmanifest`, `index.html` | `no-cache` from Express | Otherwise clients stay on an old shell forever |
| images/other GETs | cache-first with network fill | Cheap wins for uploads and catalog images |

**Bump `VERSION` in `sw.js` on every edit to that file.** The `activate` handler deletes every cache
that doesn't start with the current `VERSION`, which is the only way existing installs pick up the
change.

The worker also owns notification display: `push` → `showNotification`, `notificationclick` → focus
an existing client or open one at `data.url`, and a `message` handler for local notifications sent
from the page (`{type:'SHOW_NOTIFICATION', ...}`). Relative image URLs in payloads must be
converted to absolute (`new URL(url, self.location.origin)`) — the worker has no page base URL.
Note that a `push` event which shows no visible notification causes the browser to unsubscribe the
user, so always call `showNotification`.

## Install (A2HS)

- Chrome/Edge/Samsung: capture `beforeinstallprompt`, keep the event, call `prompt()` from a user
  gesture, read `userChoice.outcome`. Never call it automatically.
- iOS/iPadOS: no automatic prompt at all — the user must use Share → "Add to Home Screen". Detect
  (`isIOS()` incl. iPadOS-as-MacIntel) and show step-by-step instructions with a screenshot-style
  guide (`InstallGuide.jsx`).
- Detect the installed state with `matchMedia('(display-mode: standalone)')` or
  `navigator.standalone`, and hide install affordances once installed.

## Web Push — the parts that fail silently

```js
// server: keys live in data/vapid.json (mode 600); subject MUST be a resolvable domain
const subject = process.env.VAPID_SUBJECT || 'mailto:team@real-domain.com';
webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
```

1. **Apple rejects an unresolvable VAPID `sub`** (`*.local`, `localhost`, `example`, `invalid`) with
   `403 {"reason":"BadJwtToken"}` even when the signature is valid. Google/FCM accepts it, so the
   bug looks like "works on Android, broken on iPhone". Migrate bad stored subjects automatically and
   let `VAPID_SUBJECT` override.
2. **Report real delivery**: `sendToUser()` is async, awaits the provider and returns
   `{ total, sent, failed: [{ status, reason }] }`; prune subscriptions on 404/410/403-`BadJwtToken`.
   Never answer "sent" from a subscription count — that produced a false success message in the UI.
3. **Rotating VAPID keys invalidates every existing subscription** (subscriptions are bound to the
   public key). Validate the pair at boot; if it doesn't match, regenerate and warn.
4. **Self-heal the client**: `ensurePushSubscription()` compares the locally stored server key with
   the current one and re-subscribes on change; call it on app open (`App.jsx`) and before a test
   send. Without it a device silently keeps a subscription the provider has already rejected.
5. **Permission from a gesture**: request it from a tap, and keep the code path that reuses an
   existing subscription when permission is already granted.

### iOS conditions you cannot code around

1. The app must be installed to the Home Screen (`display: standalone`); Safari tabs have no
   `Notification` at all.
2. Permission must be requested from a direct user interaction.
3. Per-app permission lives in Settings → Notifications → the app name.
4. Focus / Do-Not-Disturb suppresses the banner even when delivery succeeded.
5. Testing needs real HTTPS with a trusted certificate — `http://` and self-signed certs won't do.
   Use the Cloudflare tunnel.
6. **Images in notifications are not supported on iOS** (WebKit #280161); a custom `icon` is also
   ignored, and `actions`/`tag` have no practical effect. Sending one with `image` does **not**
   fail — it arrives text-only. Android/Chrome/desktop show the image. So: keep `image` support
   (Android benefits), and for iOS rely on text + tapping through to the item screen.

Note: an existing subscription created with an older VAPID key will keep failing until the client
re-subscribes; that is exactly what the self-heal in item 4 is for.

### Diagnosing a "sent but nothing arrived"

```bash
npm run push:test --keys          # validates the VAPID pair and prints the subject
npm run push:test                 # sends for real, prints the provider response per subscription
npm run push:test --image=/icons/icon-512.png
```

Interpretation: `201` from `web.push.apple.com` = accepted by APNs (so the problem is on-device
permission/focus/install); `403 BadJwtToken` = the VAPID subject (item 1); `404/410` = dead
subscription (pruned automatically). Also verify there are rows in `push_subs` at all — an empty
table means the subscription never reached the server.

## Alarms (scheduled reminders)

- `POST /api/alarms {title?, time:"HH:MM", days?:[0..6], tzOffset?: minutes-from-UTC, itemId?}`;
  empty `days` means every day; Sunday is `0`.
- The 30-second scheduler evaluates the time in the user's timezone (`tz_offset`), not the
  server's, and fires at most once per alarm per day.
- Fallback that always works: `useAlarmWatcher()` in `App.jsx` polls every 60s while the app is open
  and shows a local notification through the service worker. Alarms therefore still work when push
  is unavailable (iOS not installed, permission denied, provider issues).
- Ask for notification permission when the user creates their first alarm, not on app load.

## Offline behaviour

The app shell + hashed assets are cached, so the UI loads offline. API calls fail — surface that as
a friendly offline toast (`err.offline`) rather than an error screen, and let the user keep
navigating. Local-first/offline mutation (queue + sync) is **not** part of this stack; if a project
truly needs it, say so explicitly and design the conflict rules before writing code.
