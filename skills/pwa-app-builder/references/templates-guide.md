# What the scaffold plants (68 files) and how to adapt it

`scripts/scaffold.mjs` copies `assets/templates/**` into the target workspace, substituting
`{{APP_NAME}}`, `{{APP_NAME_EN}}`, `{{APP_SLUG}}`, `{{PREFIX}}` (cookie / localStorage prefix),
the brand ramp, the ink ramp and the theme colours. Those templates are **copies of a working
shipped app**, not sketches — that is why the scaffolded project builds, runs, installs and
passes its API tests before you write a single line.

Legend: **KEEP** = generic infrastructure, adapt only names · **ADAPT** = carries the demo domain
(meals/food) and must be rewritten for your domain · **OPTIONAL** = drop it if the feature isn't in
scope.

## Root / infra

| File | | Notes |
|---|---|---|
| `package.json` | KEEP | Three runtime deps only (`express`, `cookie-parser`, `web-push`) + Vite/React/Tailwind dev deps. Fix `description`. |
| `vite.config.mjs` | KEEP | `root: 'web'` → `outDir: '../server/public'`, `emptyOutDir: true` (never hand-place assets there), dev proxy to 3000. |
| `.gitignore` | KEEP | Ignores `data/*`, `server/public`, `*.log`, `node_modules`, `.sanad` — **except** `data/catalog/` which is source content and must be committed. |

## `scripts/` — ops

| File | | Notes |
|---|---|---|
| `run.sh` | KEEP | `start\|stop\|restart\|status\|logs`, PID file + `server.log`, health-check based liveness, bracket-trick kill. |
| `tunnel.sh` | KEEP | Cloudflare quick tunnel; finds `cloudflared` in the workspace, `$HOME/.sanad/workspaces/first-workspace/`, or `PATH`. |
| `start-all.sh` | KEEP | Server + tunnel, then prints both statuses. |
| `test-api.sh` | KEEP | Boots a test server on **3100** with `data/test.db`, syncs the catalog into it, runs the smoke test, exits with its status. |
| `db-backup.sh` | KEEP | Timestamped copy of DB (+WAL/SHM), uploads, catalog images and catalog JSON. |
| `gen-icons.py` | KEEP | Rasterises all PWA icons (incl. maskable + apple-touch) using only `zlib`/`struct`. Recolour by editing `BG`; needs `python3`, no pip. |
| `gen-keys.js` | KEEP | Generates `data/vapid.json` + `data/secret.key` (mode 600). The server also does this on first boot. |
| `push-test.js` | KEEP | Sends a **real** push and prints the provider's response per subscription; `--keys` validates the VAPID pair and `sub`. This is the tool that proves iOS delivery. |
| `reset-password.js` | KEEP | `--list` to list accounts, or set a new password. |
| `check-password.js` | KEEP | Read-only: tests a candidate password (and ~150 variants) against the stored hash. |
| `smoke-test.reference.js` | ADAPT | Lands in the project as **`smoke-test.js`**, so `npm run test:api` is green from minute one. Rewrite its assertions for your domain; keep the `check()`/`call()` helpers and the auth-flow shape. |

## `server/` — backend

| File | | Notes |
|---|---|---|
| `index.js` | KEEP | Middleware order, static mounts, API mounts (~line 65), `/api` 404, SPA fallback with the prefix exclusion list, error handler. Mount your new routers here. |
| `config.js` | KEEP | Paths, `APP_NAME`, `CATEGORIES`, `MAX_IMAGE_BYTES`, `SESSION_TTL`, `PORT`, `HOST`. `DB_FILE` env override is what makes isolated tests possible. |
| `db.js` | ADAPT | Schema + additive migration array + `all/get/run` helpers. Replace the demo tables with your entities; keep the migration pattern and the helpers. |
| `auth.js` | KEEP | scrypt hashing, tolerant verify, HMAC session cookie, `loadUser`, `requireAuth`. Read it before touching auth. |
| `normalize.js` | KEEP | Invisible-character/whitespace normalisation — the fix for pitfall #1. Must stay identical to `web/src/lib/normalize.js`. |
| `images.js` | KEEP | `saveImage`/`removeImage`/`copyImage` for base64 data URLs, random filenames, type+size validation. |
| `scheduler.js` | KEEP | 30s tick evaluated in the user's `tz_offset`; sends push once per alarm per day. |
| `categories.js` | ADAPT | CSV helpers (`parseCategories`/`normalizeCategories`/`categoryFilter`) for multi-value classification. Keep the helpers; the category list itself is in `config.js`. |
| `catalog.js` | OPTIONAL | Read layer for a public content catalog (search incl. aliases, tag counts, soft-delete). |
| `routes/auth.js` | KEEP | register · login · guest · upgrade · logout · me (GET/PATCH/DELETE) · password. The clearest example of the `{error, message}` convention. |
| `routes/meals.js` | ADAPT | **The canonical CRUD router to copy**: `optionalFields`, `toMeal()` mapper, INSERT/PATCH with dynamic SET, rating, share token, stats. |
| `routes/suggest.js` | ADAPT | Random pick (`ORDER BY RANDOM`) + outcome logging. Good pattern for any "pick one for me" feature. |
| `routes/alarms.js` | KEEP | Alarm CRUD with `tzOffset` and day masks. |
| `routes/push.js` | KEEP | VAPID public key, subscribe/unsubscribe, real-delivery `sendToUser`, dead-subscription pruning, self-healing key migration. |
| `routes/public.js` | OPTIONAL | Public share link (`/api/public/meal/:token`) + import with duplicate detection. |
| `routes/catalog.js` | OPTIONAL | Public catalog browsing + "copy into my account". |

## `web/` — frontend

| File | | Notes |
|---|---|---|
| `index.html` | KEEP | RTL by default, `theme-color` metas, and the **pre-paint theme script** (see pitfalls #3/#7). No `viewport-fit=cover` — deliberate. |
| `tailwind.config.cjs` | KEEP | `darkMode: 'class'`, brand + ink ramps (substituted by the scaffold), Cairo font, card/pop shadows, fade-up/pop/slide-in animations. |
| `postcss.config.cjs` | KEEP | Points Tailwind at the config by absolute path. |
| `public/manifest.webmanifest` | KEEP | `standalone`, `dir: rtl`, icons incl. maskable, shortcuts. Update `start_url`/shortcuts for your domain. |
| `public/sw.js` | KEEP | Hand-written: network-first navigation, cache-first hashed assets, never caches `/api`, push + notificationclick + local-notification `postMessage`. **Bump `VERSION` on every edit.** |
| `src/main.jsx` | KEEP | React root, `BrowserRouter`, providers, SW registration. |
| `src/App.jsx` | ADAPT | Routes + `Protected` wrapper + `useAlarmWatcher` + push self-heal + offline toast. Rewrite the route list for your pages; keep the wrappers. |
| `src/styles.css` | KEEP | `@tailwind` layers, `.card .btn .btn-primary .btn-ghost .btn-soft .btn-danger .input .label .chip`, skeleton shimmer, `.no-scrollbar`, mobile 16px input guard, safe-area vars. |
| `src/lib/api.js` | ADAPT | `request()` + `ApiError`, `credentialBody()` normalisation, `compressImage()` (Canvas), `mealCategories()`. Replace the method list with your endpoints — **every** call goes through here. |
| `src/lib/providers.jsx` | KEEP | `SettingsProvider` (theme/locale/`t`, persists + syncs to account), `AuthProvider`, `ToastProvider`. |
| `src/lib/i18n.js` | ADAPT | `dict.ar` + `dict.en`, `makeT(locale)`, `formatDate`. Replace the demo keys; keep both dicts in lockstep. |
| `src/lib/pwa.js` | KEEP | SW registration, `STATUS_BAR_COLORS`/`syncStatusBarColor`, push subscribe + self-heal (`ensurePushSubscription`), local notification, A2HS (`canInstall`, `installState`, `promptInstall`, `isIOS`). |
| `src/lib/normalize.js` | KEEP | Browser twin of the server normaliser — keep behaviourally identical. |
| `src/components/AppShell.jsx` | KEEP | Header + drawer/bottom-nav responsive shell, offline chip, install banner. |
| `src/components/ui.jsx` | KEEP | Buttons, inputs, modal/sheet, spinner, empty state, rating stars, image picker, chips, skeletons. Check here before writing new markup. |
| `src/components/InstallGuide.jsx` | KEEP | Step-by-step A2HS instructions branched by platform (iOS vs Chrome). |
| `src/components/MealContent.jsx` | ADAPT | The **single** presentational component for an entity — used by both the owner's page and the public/catalog page (pitfall #6). Rename and reuse. |
| `src/components/ShareSheet.jsx` | OPTIONAL | Share link + WhatsApp/Facebook/Telegram + native share + copy. |
| `src/components/CatalogBrowser.jsx` | OPTIONAL | Browse/search/filter UI for the public catalog. |
| `src/pages/Login.jsx` | KEEP | Tabbed login / register / guest-upgrade, password visibility (`pr-12`+`right-3`), 16px inputs, guest trap avoided. Reuse verbatim. |
| `src/pages/Home.jsx` | ADAPT | The main "do the thing" screen (here: the suggestion spinner). |
| `src/pages/MealsList.jsx` | ADAPT | List + search + filter chips + sort + tabs. |
| `src/pages/MealForm.jsx` | ADAPT | Create/edit form with optional fields, image picker + client-side compression. |
| `src/pages/MealDetails.jsx` | ADAPT | Detail view using `MealContent`, rating, share, edit/delete. |
| `src/pages/Alarms.jsx` | KEEP | Time/day/meal alarm CRUD + notification permission + test push. |
| `src/pages/Stats.jsx` | ADAPT | Totals, category distribution, top-rated, recent activity. |
| `src/pages/Settings.jsx` | KEEP | Name, language, theme, notifications, install, password change, delete account. |
| `src/pages/PublicMeal.jsx` (→ `PublicItem`) | OPTIONAL | Public share page: content + "add to my list" (auto-creates a guest session). |
| `src/pages/CatalogMeal.jsx` (→ `CatalogItem`) | OPTIONAL | Catalog item page reusing the same presentational component. |

## `optional-catalog/` (only with `--with-catalog`)

| File | Notes |
|---|---|
| `catalog.js` → `server/routes/catalog.js` | Browsing API: `q`/`tag`/`category`/`sort`/`limit`, tags with counts, detail with image attribution, random, add-to-my-list with duplicate handling. |
| `catalog-sync.js` → `scripts/catalog-sync.js` | Reads `data/catalog/*.json` and upserts by `slug`; applies `images.json` attribution; soft-deactivates removed entries. `--dry` previews. Idempotent, so it is safe to run repeatedly and in tests. |
| `catalog-images.js` → `scripts/catalog-images.js` | Fetches free-licensed images from Wikimedia Commons, records credit/licence/source. Needs network and time — run it in the background. |
| `data-catalog/*.json` → `data/catalog/*.json` | Sample content pack (55 dishes) showing the schema: `slug`, names, aliases, ingredients, steps, mealTimes, tags, region, prep, emoji, `imageQuery`. Replace the content, keep the shape. |

## Replacing the demo domain — order that avoids dangling references

1. Tables in `server/db.js` → 2. query layer → 3. `server/routes/<entity>.js` → 4. mount in
`server/index.js` → 5. methods in `web/src/lib/api.js` → 6. pages + `App.jsx` routes → 7. nav items
in `AppShell.jsx` → 8. i18n keys (both dicts) → 9. `scripts/smoke-test.js` assertions.

Then remove the demo leftovers (router file, page files, api methods, i18n keys, nav entries,
`--with-catalog` artefacts if unused) so no dead code and no "meals" vocabulary survives.
The scaffold prints a leftover report — treat any hit as a to-do.
