---
name: pwa-app-builder
description: Build a production-ready, responsive, installable PWA (React 18 + Vite + Tailwind front end, one Express process, embedded node:sqlite, hand-written service worker, Web Push) from nothing but the user's project idea. Use this skill whenever the user asks to create, build, bootstrap, or scaffold a web app, PWA, mobile-installable web app, dashboard, tracker, portal, booking/ordering/notes/habit/fitness/expense-style app, or asks to "make an app for X" — even if they never say the words "PWA", "React", or "API". Also use it when someone wants a new app in an empty workspace and mentions installing it on their phone, pushing notifications, working offline, or sharing a public link.
license: MIT
compatibility: Node.js 22.5 or newer (for node:sqlite) and Python 3 for icon generation. No native build toolchain, database server, or sudo access required. Optional: cloudflared for public share links.
metadata:
  author: Ahmed Attia
  version: 1.0.0
---

# PWA App Builder

Turn a project idea into an app that is real on day one: runs locally, installs on a phone,
works offline, sends notifications, and can be shared with a public link. The stack below is
deliberately fixed — it is the only combination that survives the host constraints these
projects run on (no compiler, ~300MB RAM, no Postgres/MongoDB, no sudo). What changes from
project to project is the **domain**; what stays is the **skeleton**.

Read this whole file before doing anything. Then work the phases in order — they have gates.

---

## 0. The stack (non-negotiable)

| Layer | Choice | Why this and not the obvious alternative |
|---|---|---|
| Backend | Express 4, CommonJS, `'use strict'` | One process serves API + built UI + images → no CORS, one thing to restart, lowest memory |
| Database | `node:sqlite` (`DatabaseSync`) | Built into Node ≥22.5. Zero native modules. `better-sqlite3` cannot even install (no `gcc`) |
| Passwords | `crypto.scrypt` + `timingSafeEqual` | No `bcrypt` (native). Never store plaintext |
| Sessions | HMAC-signed token in an `HttpOnly` cookie | No `jsonwebtoken` dependency, no localStorage exposure to XSS |
| Frontend | React 18 + Vite 5 + Tailwind 3, built into `server/public` | Fast low-memory build, static output served by Express, no SSR needed |
| PWA | hand-written `sw.js` + `manifest.webmanifest` | No Workbox / `vite-plugin-pwa`; full control of cache policy |
| Push | `web-push` + locally generated VAPID keys | Free, no Firebase account |
| Images | compressed in the browser with Canvas before upload | No `sharp`/`multer` (native), less server RAM |
| i18n | small in-house dict, no `i18next` | Instant RTL/LTR switching, tiny bundle |

**Never add:** `better-sqlite3`, `mongodb`, `pg`, `bcrypt`, `argon2`, `jsonwebtoken`, `sharp`,
`canvas`, `multer`, `i18next`, Workbox, `vite-plugin-pwa`, `socket.io`, or any package with
native code. If a task seems to need one, solve it with the standard library or in the browser.

---

## 1. Phase 0 — Recon the host (do this first)

```bash
bash <skill>/scripts/check-host.sh      # node, compiler, RAM, swap, CPUs, ports, cloudflared
```

It prints a verdict. Two things you must carry into your plan:

- **No compiler** → the JS-only rule above is a hard fact, not a preference.
- **Low resources** (`⚠️ LOW RESOURCES`) → `npm install` and `npm run build` must run in the
  background with a log file that you poll; a foreground long command gets killed. See
  `references/host-constraints.md`.

### Browser rule (important, and it is *conditional*)

Default to verifying with `curl` and the API smoke test — that is faster and cheaper. But the
rule is **"do not launch a browser without asking for permission"**, not "never launch one":

- On a **comfortable host** (≥4 CPUs, swap present, plenty of free RAM): asking is a formality.
  Say you'd like to open a headless browser to check the rendered UI and let the user decide.
- On a **low-resource host** (like 2 vCPU / ~300MB / no swap): tell the user *why* up front,
  in the same breath as the request. A Chromium instance can consume the whole machine, get the
  server OOM-killed, and require a restart. Something like:

  > «تحتاج للتأكد البصري من الواجهة؟ تشغيل المتصفح على هذا السيرفر (٢ كور وبدون swap) قد يستهلك
  > الموارد بالكامل ويوقف السيرفر فيحتاج إعادة تشغيل. أفحص بـ`curl` واختبارات الـAPI بدلاً منه،
  > أم تفضّل أن أشغّل المتصفح؟»

Then respect the answer. Never launch a browser silently.

---

## 2. Phase 1 — Understand the idea, then interview the user (hard gate)

### 2a. Restate what you understood — in 5 lines, not 50

Cover: who uses it, the core loop (the action they repeat most), the data they store, and what
"done" looks like for a first version. Do not plan architecture yet.

### 2b. Ask for preferences before building — this is required, not optional

The user knows what they want to *see* long before they know what a service worker is. Getting
these answers up front is the difference between an app they love on the first try and three
rounds of "change the colors". Use the `system_ask_user` tool so the user can answer with one
tap — **at most 5 questions, each with exactly 3 options**. Pick the ones that most change the
build; skip what you can reasonably infer or decide yourself.

Question bank (adapt the wording to the project's domain; ask in the user's language):

| # | Question | Options |
|---|---|---|
| 1 | لغة الواجهة الافتراضية | عربي (RTL) مع تبديل EN · إنجليزي (LTR) مع تبديل AR · عربي فقط |
| 2 | الهوية اللونية | دافئة (برتقالي/عنبري) · هادئة (تركوازي/أزرق) · راقية (بنفسجي/نيلي) — أو حسب مجال المشروع |
| 3 | مزاج التصميم | بسيط وعملي وكثيف المعلومات · عصري بزوايا دائرية وحركات · داكن أنيق افتراضي |
| 4 | تخطيط الجوال أولاً أو سطح المكتب | تطبيق جوال بشريط سفلي · لوحة سطح مكتب بشريط جانبي · الاثنان معاً (الافتراضي المتجاوب) |
| 5 | الحسابات | تسجيل + وضع زائر بلا تسجيل · زائر فقط (ترقية لاحقاً) · بلا حسابات إطلاقاً |
| 6 | الإشعارات | تنبيهات مجدولة + Push · تنبيه داخل التطبيق فقط · لا إشعارات |
| 7 | محتوى عام جاهز | كتالوج محتوى يُغذّى من ملفات JSON · محتوى المستخدم فقط · لاحقاً |
| 8 | الاسم والشعار | اسم عربي + إنجليزي مع إيموجي · اسم واحد مع أيقونة مرسومة · اختر أنت الأفضل |

Rules for the interview: never ask more than 5; never ask something you can decide with good
taste (spacing, animation curve); if the user says «اختر أنت», decide and move on — don't
re-ask. Record the answers: they become the scaffold flags in Phase 3.

### 2c. Answer the plan back and wait

Give a short plan (stack already decided; screens; data model in one line; the phases) and stop.
Most users in this workflow want to approve before code is written — a one-line
«موافق، ابدأ» is worth more than a fast wrong build.

---

## 3. Phase 2 — Design the domain (small, concrete)

Before writing code, write down in the chat:

1. **Entities + fields** — every field the user's core loop needs; mark required vs optional.
   Keep required fields to the absolute minimum (a name and a category beats a ten-field form).
2. **Screens** — list them; each screen maps to one file in `web/src/pages/`.
3. **Routes** — one REST group per entity plus auth.
4. **Which optional modules apply** — accounts/guest, alarms+push, public share links, public
   content catalog. Each is already implemented in the templates; you are choosing, not inventing.

---

## 4. Phase 3 — Scaffold (one command, then verify)

```bash
node <skill>/scripts/scaffold.mjs \
  --dir <workspace> --name "اسم التطبيق" --name-en "AppName" \
  --slug appname --prefix ap --palette orange --ink warm [--with-catalog]
```

This plants ~68 files: the full working skeleton (auth, one demo CRUD entity, PWA shell, push,
i18n, UI kit, ops scripts) with the app identity, cookie prefix and brand palette already
substituted everywhere. Palettes: `orange amber rose violet indigo sky teal emerald`;
inks: `warm cool stone`.

Then, before touching anything else — prove the pipeline works:

```bash
export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"   # Node is not on PATH on these hosts
npm install            # low-RAM host? run in background with a log and poll it
npm run build
./scripts/run.sh start
curl -s http://127.0.0.1:3000/api/health
npm run test:api       # expects "110 ناجح، 2 فاشل" on a fresh demo scaffold
```

The 2 failures are the catalog assertions that need real image files
(`npm run catalog:images` fetches them; requires network). Everything else must be green **before**
you start changing the domain — otherwise you won't know whether a later failure is yours.

Read `references/templates-guide.md` for what each planted file is and which parts are the
demo domain you are about to replace.

---

## 5. Phase 4 — Replace the demo domain with the real one

The scaffold ships a complete worked example (a meals app) precisely so you can copy its shape.
Work outward from the data layer so nothing dangles:

1. `server/db.js` — rewrite the demo tables for your entities. **Always additive**: new tables in
   the `CREATE TABLE IF NOT EXISTS` block, new columns appended to the migration array. Then
   write the query functions.
2. `server/routes/<entity>.js` — copy `routes/meals.js` as the canonical CRUD router
   (`optionalFields`, a `toEntity()` mapper, INSERT/PATCH). Match the export style to how
   `server/index.js` imports it (`module.exports = router` vs `{ router }` — the repo is
   inconsistent, check before you write).
3. Mount the router in `server/index.js`; add the API prefix to nothing else (SPA fallback
   already excludes `/api`).
4. `web/src/lib/api.js` — one method per route. **No `fetch` in pages or components, ever.**
5. `web/src/pages/*` + routes in `web/src/App.jsx`.
6. `scripts/smoke-test.js` — rewrite the demo assertions using the existing
   `check(name, condition, extra)` + `call(path, {method, body})` helpers. This is your proof.

Delete what your domain doesn't need (the demo entity's router, page, api methods and i18n keys)
rather than leaving dead code around.

---

## 6. Phase 5 — Front end: RTL-first, both languages, one design system

- Every user-facing string goes in **both** `dict.ar` and `dict.en` in `web/src/lib/i18n.js`, read
  with `t('key')`, interpolation via `{name}` placeholders. A key in one dict only is a bug.
- Use logical utilities (`start-*`/`end-*`/`ps-*`/`pe-*`/`ms-*`/`me-*`) so RTL and LTR both work.
  The deliberate exception: password inputs are `dir="ltr"` and therefore use physical
  `pr-12` / `right-3`.
- Reuse the component classes in `web/src/styles.css` (`.card`, `.btn-primary`, `.input`, `.label`,
  `.chip`) and the primitives in `web/src/components/ui.jsx` before writing scattered Tailwind.
- Theme is class-based on `documentElement`, persisted in `localStorage`, and applied by an inline
  script in `web/index.html` **before first paint** (kills the flash and fixes the iOS status bar).
- Responsive: mobile-first with a bottom nav that becomes a side rail from `md:` up (`AppShell.jsx`).
- Verify RTL/LTR on: forms, lists, the app bar, modals, and the toast position.

---

## 7. Phase 6 — PWA + notifications

`sw.js` and `manifest.webmanifest` are planted. Two things you must not forget:

1. **Bump `VERSION` in `web/public/sw.js` every time you change that file**, or installed clients
   keep the stale cache forever.
2. VAPID keys are generated on first boot into `data/vapid.json`. The VAPID `sub` **must be a real
   resolvable domain** (`mailto:someone@real-domain.com`) — Apple rejects `*.local`/`@localhost`
   with `403 BadJwtToken` while Google accepts it, which produces the classic "works on Android,
   silently fails on iPhone". Override with `VAPID_SUBJECT`; never hard-code a personal address.
3. Never report push success without the provider's real answer: `sendToUser` returns
   `{total, sent, failed:[{status, reason}]}` and prunes dead subscriptions (404/410/403).
4. iOS requires the app to be **installed to the home screen** and permission requested from a
   tap. Keep the in-app local-notification fallback (`useAlarmWatcher` in `App.jsx`) working.

Details and the platform limits (images in notifications, status-bar colour, standalone
letterboxing) are in `references/pwa-and-push.md` — read it before promising anything about iOS.

---

## 8. Phase 7 — Verify (this is the deliverable's proof)

```bash
npm run test:api                                    # isolated data/test.db on port 3100, live DB untouched
npm run build && ./scripts/run.sh restart
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3000/ | head -3            # the built SPA is served
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/manifest.webmanifest
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/sw.js
```

Also exercise the real user path with `curl` (register/guest → create → read → update → delete) so
you can report real output, not "should work". Then, if a browser is allowed, use it for the visual
pass on a phone-sized viewport.

Report the exact commands and their actual output. If something failed, say so with the error.

---

## 9. Phase 8 — Deliver

1. **Local git repo + first commit** (`git init -b main`), so there is a known-good state to return
   to before any risky experiment. Never `push` unless asked. Conventional Commits with an Arabic
   subject: `feat(meals): إضافة فلتر الفئات`.
2. **Public link** via the Cloudflare quick tunnel (`./scripts/tunnel.sh start`, then read the URL
   from `tunnel.log`). Ask before starting a tunnel: it exposes the app publicly, and the free
   quick-tunnel hostname is random per restart and carries a bad reputation with Chrome's password
   heuristics (expect a "check your passwords" nag — it is the domain, not your code).
3. **Docs, once the app is stable**: `docs/API.md` (every route + a copy-paste `curl`),
   `README.md` (features, run, test), `AGENTS.md` (the repo contract for future sessions). Write
   `AGENTS.md` from the *final* code — it is the highest-leverage file in the repo, and it should
   state the same rules as this skill: stack, golden DB rule, verification commands, boundaries.
4. Leave the tree clean: no `tmp-*.js`, no stray logs in the repo root, no secrets committed.

---

## 10. Golden rules (violating these is how these projects break)

- **Never delete or truncate the live database.** Schema change = append an `ALTER TABLE` line to
  the migration array (each is wrapped in `try/catch`), never edit an existing `CREATE TABLE`.
  Run `npm run db:backup` first.
- **Scope every query by the session's `user_id`.** A missing `user_id` filter is the most
  dangerous bug in this codebase class. Guests are real `users` rows with `kind='guest'` —
  `requireAuth` accepts them, so branch on `user.kind` when it matters.
- **Tests never touch live data.** `npm run test:api` uses `data/test.db` on port 3100.
- **Errors are `{ error, message }`** with a display-ready Arabic `message` and a stable code
  (`VALIDATION`, `AUTH_REQUIRED`, `BAD_CREDENTIALS`, `EMAIL_TAKEN`, `NOT_FOUND`, `NO_MEALS`,
  `BAD_IMAGE`, `NOTHING_TO_UPDATE`, `GUEST_ACCOUNT`, `NOT_GUEST`, `SERVER_ERROR`).
- **Secrets live in `data/`** (`secret.key`, `vapid.json`, mode 600) and are git-ignored. Never
  print, commit, or regenerate them casually — rotating `secret.key` logs everyone out, rotating
  VAPID invalidates every push subscription.
- **Port 8090 belongs to the agent service.** Use 3000 for the app, 3100 for tests.
- Kill processes with the bracket trick (`pkill -f "server/inde[x].js"`) or you kill your own shell.

---

## 11. References — read the one you need

| File | Read it when |
|---|---|
| `references/host-constraints.md` | Phase 0, and any time a command dies, a port is busy, or a background process vanishes |
| `references/templates-guide.md` | Phase 3/4 — what the 68 planted files are, and which parts are the demo domain |
| `references/blueprint.md` | Phase 4 — you need the full tree, the request path, or the "adding a route/field/string" checklists |
| `references/backend-patterns.md` | Phase 4 — writing schema, auth, routes, images, scheduler code |
| `references/frontend-patterns.md` | Phase 5 — writing pages, forms, i18n, RTL, design-system code |
| `references/pwa-and-push.md` | Phase 6 — service worker, manifest, install prompts, Web Push, alarms |
| `references/pitfalls.md` | Phase 7 — before finalising anything — the seven bugs that actually cost us days, with root causes |
| `references/ops-and-verification.md` | Phase 7/8 — scripts, backups, tunnels, password tooling, and the exact verification commands |

Scripts: `scripts/check-host.sh` (Phase 0) · `scripts/scaffold.mjs` (Phase 3).
