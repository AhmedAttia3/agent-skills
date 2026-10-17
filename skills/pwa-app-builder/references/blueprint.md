# Blueprint — tree, request path, and the "don't forget the other file" checklists

## Tree

```
<workspace>/
├── server/                     Backend — Express, CommonJS, 'use strict' throughout
│   ├── index.js                Entry: middleware → static mounts → API mounts → SPA fallback → error handler
│   ├── config.js               Paths, ports, constants (CATEGORIES, MAX_IMAGE_BYTES, SESSION_TTL)
│   ├── db.js                   Schema + additive migration array + all/get/run helpers
│   ├── auth.js                 scrypt, HMAC session cookie, loadUser / requireAuth
│   ├── normalize.js            Email/password/name normalisation (strips RLM/ZWSP/whitespace)
│   ├── categories.js           parse/normalise/filter CSV category fields
│   ├── images.js               saveImage / removeImage / copyImage (base64 data URLs)
│   ├── scheduler.js            Alarm tick (30s) evaluated in the user's tz_offset
│   ├── catalog.js              Public catalog read layer (optional module)
│   ├── routes/                 auth · <entity> · alarms · push · public · catalog · suggest
│   └── public/                 Vite build output — generated, never edit by hand
├── web/                        Frontend — React 18 + Vite, ESM/JSX
│   ├── index.html              Pre-paint theme script, theme-color metas, manifest link
│   ├── tailwind.config.cjs     brand/ink ramps, darkMode class, animations
│   ├── public/                 manifest.webmanifest · sw.js · icons (generated)
│   └── src/
│       ├── main.jsx            Root, router, providers, SW registration
│       ├── App.jsx             Routes + Protected + alarm watcher
│       ├── styles.css          .card .btn .input .label .chip + mobile guards
│       ├── lib/                api · i18n · providers · pwa · normalize
│       ├── components/         AppShell · ui · <entity>Content · ShareSheet · InstallGuide
│       └── pages/              One file per route
├── scripts/                    run · tunnel · start-all · test-api · db-backup · smoke-test
│                               gen-icons · gen-keys · push-test · reset-password · check-password
├── data/                       Runtime (git-ignored): app.db (+WAL/SHM), uploads/, catalog-images/,
│                               secret.key, vapid.json, backups/<timestamp>/ · catalog/*.json (tracked)
├── docs/                       API.md · TECH-STACK.md · TROUBLESHOOTING.md
├── AGENTS.md                   The repo contract for future sessions
└── README.md
```

## Request path

Browser → Express (`loadUser` attaches `req.user` from the session cookie) → route handler runs
parameterized SQL through `db.js` → camelCase JSON back → React renders it. Images are files on
disk; nothing is processed server-side. One process, one port, no CORS.

## Checklists — each change spans several files, and missing one is the classic break

### Add or change an API route
1. Create/edit the router in `server/routes/`.
2. Match its **export style** to the import in `server/index.js` (`module.exports = router` in
   `auth.js`/`suggest.js`, `module.exports = { router }` in the others — check, don't guess).
3. Mount it in `server/index.js` (the API mounts are grouped together).
4. Add a `check(...)` assertion to `scripts/smoke-test.js`.
5. Document it in `docs/API.md` (table row + a copy-pasteable `curl`).
6. Add the client method in `web/src/lib/api.js` — pages never call `fetch` directly.

### Add an entity field
`server/db.js` (new `ALTER TABLE` appended to the migration array) → `server/routes/<entity>.js`
(`optionalFields`, mapper, INSERT, PATCH) → every other route that returns that entity (public
share, catalog copy) → `web/src/pages/<Entity>Form.jsx` → `web/src/components/<Entity>Content.jsx`
→ `web/src/lib/i18n.js` (both dicts) → `scripts/smoke-test.js`.

### Add a user-facing string
Add the key to **both** `dict.ar` and `dict.en` in `web/src/lib/i18n.js`, then read it with
`t('key')`; interpolate with `{name}` placeholders: `t('home.candidates', { n: 3 })`.

### Add a static (non-API) path prefix
Also add it to the SPA fallback exclusion list in `server/index.js`, or deep links will resolve to
`index.html` instead of the file.

### Add a catalog item (optional module)
Edit `data/catalog/*.json` → `npm run catalog:sync` → `npm run catalog:images --only=<slug>`.
Content lives in JSON, never hand-written into the database.

### Change the schema
1. `npm run db:backup` first.
2. Append to the migration array — never edit an existing `CREATE TABLE`.
3. Public catalog content is soft-deleted (`is_active = 0`), never `DELETE`d.
4. User rows are never deleted except by the user's own "delete account" (which cascades by design).

## Error contract

Every API error is `{ error, message }` with a stable code and a display-ready Arabic `message`:

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | No valid session |
| `BAD_CREDENTIALS` | 401 | Wrong email/password |
| `EMAIL_TAKEN` | 409 | Email already registered |
| `VALIDATION` | 400 | Bad input (message explains it in Arabic) |
| `NOT_FOUND` | 404 | Missing resource |
| `NOTHING_TO_UPDATE` | 400 | PATCH with no updatable field |
| `BAD_IMAGE` | 400 | Unsupported type or too large |
| `NO_ITEMS`/`NO_MEALS` | 404 | Nothing to suggest yet |
| `GUEST_ACCOUNT` / `NOT_GUEST` | 400 | Guest-flow misuse |
| `SERVER_ERROR` | 500 | Unhandled — logged, message not leaked beyond `err.message` |

## Response shape conventions

- camelCase keys, `createdAt`/`updatedAt` as `YYYY-MM-DD HH:MM:SS` strings (SQLite `datetime('now')`).
- Multi-value fields are arrays in JSON and CSV in the database (`tags`, `categories`, `days`),
  with a primary/first value mirrored for compatibility.
- Booleans are `0/1` in SQLite, `true/false` in JSON.
- Collections return a wrapper object (`{ meals }`, `{ alarms }`, `{ meals, total }`) so extra
  metadata can be added later without breaking clients.
- Auth responses return `{ user }` where `user` includes `isGuest` — the client relies on it.
