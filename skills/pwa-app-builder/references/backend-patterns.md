# Backend patterns

CommonJS, `'use strict'`, parameterized SQL only — there is no ORM and no query builder.
Everything here already exists in the templates; this file explains the *why*, the conventions,
and the traps.

## config.js — one source of truth for paths and constants

```js
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'app.db');
for (const dir of [DATA_DIR, UPLOADS_DIR, CATALOG_DIR, path.dirname(DB_FILE)]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
```

`DB_FILE` and `PORT` env overrides are what make the isolated test server possible — keep them.
Never hard-code absolute paths, secrets, personal emails or public URLs in source.

## db.js — schema, migrations, helpers

```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (...); CREATE TABLE IF NOT EXISTS <entity> (...);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_<entity>_user ON <entity>(user_id, created_at)');

for (const migration of [
  "ALTER TABLE <entity> ADD COLUMN <col> TEXT NOT NULL DEFAULT ''",
]) {
  try { db.exec(migration); } catch { /* column already exists */ }
}

const all = (sql, params = []) => db.prepare(sql).all(...params);
const get = (sql, params = []) => db.prepare(sql).get(...params);
const run = (sql, params = []) => db.prepare(sql).run(...params);
module.exports = { db, all, get, run };
```

Rules that keep data safe:
- **Migrations are append-only.** Never edit an existing `CREATE TABLE` — an installed database
  would never receive the change. New installs get the column from the definition, existing ones
  from the migration; each entry tolerates already-applied state.
- `PRAGMA foreign_keys = ON` + `ON DELETE CASCADE` means deleting a user removes their data. That
  is intended only for the user's own account deletion.
- Public/shared content is soft-deleted (`is_active = 0`) so links don't 404.
- WAL mode leaves `-wal`/`-shm` siblings; backups must copy all three.
- **Every user-scoped query filters by `user_id`.** A missing filter is the most dangerous bug in
  this codebase class — grep your new queries for it before committing.

## auth.js — scrypt + HMAC cookie + guests

```js
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
```

- Sessions are `base64url(payload).hmac` cookies named `<prefix>_session`, `HttpOnly`, `SameSite=Lax`,
  30-day expiry (`SESSION_TTL`), `Secure` only when `COOKIE_SECURE=1` (tunnels terminate TLS, so the
  app itself speaks HTTP locally).
- The secret is `data/secret.key` (mode 600), generated on first boot. Rotating it logs everyone out.
- Signature comparison must be constant-time and length-checked before `timingSafeEqual`.
- `loadUser` attaches `req.user` if the cookie is valid; `requireAuth` only requires *a session*.
- **Guests are real `users` rows** with `kind = 'guest'`, no email/password. `requireAuth` accepts
  them on purpose. Branch on `user.kind` when behaviour differs, and use explicit guards for
  guest-only actions (`NOT_GUEST`) versus permanent-account-only actions (`GUEST_ACCOUNT`).
- Guests upgrade in place (`POST /auth/upgrade`) — the same row gets email/password/name, so all
  their data survives. Never implement "upgrade" as a new account + copy.
- Verify with `verifyPasswordLoose` (tries the raw and the normalised candidate) — see
  `references/pitfalls.md` #1.

## normalize.js — identical on both sides

`stripInvisible` (U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF),
`normalizeEmail` (strip invisible + remove all whitespace + lowercase), `normalizePassword`
(strip invisible + trim), `normalizeName`, `passwordCandidates`, `isEmail`.
`server/normalize.js` and `web/src/lib/normalize.js` must stay behaviourally identical — change
one, change the other, and re-run the tests.

## Writing a router

Copy `routes/meals.js` as the shape. The essentials:

```js
'use strict';
const express = require('express');
const { all, get, run } = require('../db');
const { requireAuth } = require('../auth');
const { normalizeCategories, categoryFilter } = require('../categories');
const { saveImage, removeImage } = require('../images');
const router = express.Router();
router.use(requireAuth);

const OPTIONAL_FIELDS = ['description', 'ingredients', 'steps', 'tags', 'prepMinutes', 'servings'];

/** Maps a DB row to the client shape (camelCase, arrays, computed aggregates). */
function toEntity(row) { return { id: row.id, name: row.name, tags: csv(row.tags), ... }; }

router.get('/', (req, res) => {
  const filters = ['user_id = ?'];
  const params = [req.user.id];
  if (req.query.category && req.query.category !== 'all') { filters.push(categoryFilter(req.query.category)); }
  const rows = all(`SELECT * FROM <entity> WHERE ${filters.join(' AND ')} ORDER BY ...`, params);
  res.json({ items: rows.map(toEntity) });
});

router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'VALIDATION', message: 'اسم العنصر مطلوب' });
  const { lastInsertRowid } = run('INSERT INTO <entity> (user_id, name, ...) VALUES (?, ?, ...)', [...]);
  res.status(201).json({ item: toEntity(get('SELECT * FROM <entity> WHERE id = ?', [lastInsertRowid])) });
});

module.exports = { router };   // ⚠️ or `module.exports = router` — match server/index.js
```

Conventions worth keeping:
- **Required fields are minimal** (a name and a category beat a ten-field form). Everything else is
  optional and stored with a `DEFAULT ''` / `NULL`, so PATCH can be partial.
- Dynamic PATCH builds `SET` clauses from provided keys only and returns
  `NOTHING_TO_UPDATE` (400) when no updatable key was sent.
- Multi-value fields go through `categories.js` helpers (`parseCategories`,
  `normalizeCategories`, `categoryFilter`) — never hand-write a CSV `LIKE` condition.
- `ORDER BY RANDOM()` is the whole "pick one for me" implementation; exclude the previous pick via a
  logged `suggestions`-style table when the set has more than one row.
- Delete endpoints remove the stored image file too (`removeImage`).

## Images

Client compresses to a JPEG data URL with Canvas (`compressImage`, max 1000px, quality 0.82) and
POSTs the string; the server validates `image/jpeg|png|webp` and a 3MB cap (`MAX_IMAGE_BYTES`),
writes a random filename under `data/uploads/` and stores **only the filename** in the row.
Responses expose `imageUrl`. Never accept a remote URL into the row, never `eval` a data URL, and
never trust the client's claimed MIME type alone.

For a shared/public record, copy the file (`copyImage`) instead of sharing the path — one owner
deleting their record must not break another user's.

## Scheduler (alarms / reminders)

`server/scheduler.js` ticks every 30 seconds, converts `now` into the user's timezone using the
stored `tz_offset` (minutes from UTC), matches `time` (`HH:MM`) and the optional day mask
(`0=Sunday`, empty = every day), and fires push at most once per day per alarm
(`last_fired` acts as the idempotency key). It runs inside the same process started by
`server/index.js` — there is no cron on these hosts.

## Adding a background job or scheduled work

Keep it in-process and idempotent: a timer plus a persisted "last run" marker. It must tolerate
being skipped during restarts without double-firing.
