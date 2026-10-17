# Pitfalls — the seven bugs that actually cost us days

Every item below happened in the real project this skill came from. Each is written as
*symptom → root cause → fix → how to avoid repeating it*. Read this before you declare anything
finished; six of the seven were invisible until a real device or a real provider was involved.

---

## 1. "البريد أو كلمة المرور غير صحيحة" — every single login attempt

**Symptom.** Registration works, login always fails with `BAD_CREDENTIALS`, for a password the
user is certain about. Server logs show the email arrived clean and the account exists.

**Root cause.** Arabic/RTL keyboards and browser autofill inject invisible characters —
`U+200E`/`U+200F` (LRM/RLM), `U+200B`–`U+200F`, `U+2060`–`U+2064`, `U+FEFF` — and a trailing
space. `String.prototype.trim()` does **not** remove them, so the stored hash never matches.
A second, sneakier variant: the account had been created through the *guest-upgrade* form, so the
stored password was whatever autofill had silently put in the field.

**Fix.**
- `server/normalize.js` + an identical `web/src/lib/normalize.js`: `stripInvisible()`,
  `normalizeEmail()` (invisible + whitespace stripped, lowercased), `normalizePassword()`
  (invisible stripped + trim), `normalizeName()`.
- Normalise on **both** sides: `credentialBody()` in `api.js` before sending, and again server-side.
- Verify tolerantly: `passwordCandidates()` tries the raw value then the normalised one, so
  accounts created before normalisation still log in.
- `findUserByEmail()` falls back to a normalised scan when the exact match misses.
- Ship `scripts/check-password.js` (read-only diagnosis) and `scripts/reset-password.js`.
- Add a smoke-test assertion that logs in with an RLM (`` U+200F``) inside the password.

**Avoid next time.** Any credential field gets normalised on both sides from day one, and
`autoComplete="new-password"` is set on creation forms so autofill can't fill a stale value.
`trim()` alone is never enough for text that comes from an Arabic keyboard.

---

## 2. iPhone notifications never arrive while the API says "تم الإرسال"

**Symptom.** Permission granted, subscription stored, the test button reports success, nothing
shows on the phone. Android works fine.

**Root cause (two of them, stacked).**
1. APNs rejects the VAPID token with `403 {"reason":"BadJwtToken"}` when the `sub` claim uses an
   unresolvable domain (`mailto:admin@app.local`, `@localhost`). Apple enforces this; Google/FCM
   does not — hence "works on Android only". (web-push#947)
2. The test endpoint returned success based on the **count** of subscriptions without awaiting
   the delivery result, so the UI said "sent" unconditionally.

**Fix.**
- Default the VAPID subject to a real resolvable domain, overridable by `VAPID_SUBJECT`, and
  migrate any stored `*.local`/`localhost`/`example`/`invalid` domain automatically.
- Make `sendToUser()` async and return `{total, sent, failed:[{status, reason}]}`; `/api/push/test`
  returns it; the UI shows the real reason instead of a fake success.
- Prune dead subscriptions (404/410, or 403 `BadJwtToken`) from the database.
- Validate the VAPID key pair at boot; regenerate + warn loudly if the public key doesn't match.
- Self-heal clients: `ensurePushSubscription()` compares the locally recorded server key with the
  current one and re-subscribes when it changed — otherwise a device stays on a subscription the
  provider has already rejected.

**Avoid next time.** Never fabricate a success response for an outbound delivery. Read the
provider's status code, surface it, and make the sending script (`scripts/push-test.js`) the
canonical way to reproduce the problem.

---

## 3. The iOS status bar and the bottom nav fight each other (262 messages of pain)

**Symptom.** In the installed PWA on iOS the bottom navigation bar floats ~62px above the
bottom edge; it snaps down only after the page becomes scrollable. Trying to make the status bar
transparent made it worse.

**Root cause.** `apple-mobile-web-app-status-bar-style = black-translucent` requires
`viewport-fit=cover`, and a **newly installed** standalone PWA with `viewport-fit=cover` lays the
web page out in a viewport shorter than `window.screen.height` by exactly the status-bar height,
leaving a dead strip nothing can paint into — so `position: fixed; bottom: 0` resolves above the
real screen edge. WebKit bugs 237961 / 313800 / 323403; still open. The bug follows the *install
moment*: icons added before the change stay edge-to-edge, new installs get letterboxed, and
re-installing cannot restore the old state.

**Fix (the one we kept).**
- Remove `viewport-fit=cover` from the viewport meta → the page lays out inside the safe area and
  `position: fixed` works; the bottom nav sticks to the phone edge on every page.
- Keep the status-bar colour matching the app instead: sync `theme-color` with the app theme, and
  set it **before first paint** with a tiny inline script in `index.html` that reads the stored
  theme (iOS reads the colour at load time only, and its own `prefers-color-scheme` media query
  picks the *system* theme, not the app's).
- The trade-off is real and worth stating out loud: transparency and correct layout cannot both
  hold on iOS. Layout wins.

**How we found it.** After two failed hypotheses we added a temporary on-screen diagnostic panel
printing `screen.height`, `visualViewport.height`, `document.scrollingElement.scrollHeight`,
`env(safe-area-inset-*)`, and the nav's bounding rect, with a "copy all" button — the numbers were
conclusive in one round-trip (`in 895` vs `scr 956`, `delta=62`, `safe t62px`).

**Avoid next time.** For any iOS PWA layout complaint: measure on the device before changing code,
test on a **separate git branch** (so `main` stays recoverable with one `git checkout`), and
remember that some iOS web-app layout characteristics are fixed at install time — an install/uninstall
cycle is part of the test, and a rollback may need another one.

---

## 4. "You just entered your password on a deceptive site" + a CSP `eval` warning

**Symptom.** Chrome shows a password-safety warning while registering, and the console reports
that the site's CSP blocks `eval`.

**Root cause.** Neither is in the app.
- The warning is domain reputation: Cloudflare **quick tunnels** get a random hostname
  (`adjectives-name-adjective.trycloudflare.com`) whose *pattern* matches what phishing kits use,
  so Safe Browsing flags it. The same happens with ngrok.
- The CSP message comes from the environment that embeds/proxies the page, not from the app —
  `curl -I` showed no `Content-Security-Policy` header at all, `grep` found no CSP directive in the
  project, and the built bundle contains zero `eval(`/`new Function`.

**Fix / answer.** Prove it with evidence (`curl -I <url>`, `grep -rn`), explain it to the user, and
move on — or use a real domain/named tunnel when the project deserves one.

**Avoid next time.** Don't "fix" a warning until you have located its source. Two commands
(`curl -I`, `grep -rn`) are enough to tell your code apart from the environment.

---

## 5. Every deploy wiped the user's saved data

**Symptom.** Meals disappeared after an update while the user was still a guest.

**Root cause.** Schema changes were applied by rewriting table definitions, so existing databases
never received the new columns (or were recreated).

**Fix.**
- Schema evolves by **appending to the migration array** in `server/db.js`; every entry runs inside
  `try/catch` so re-running is a no-op (`ALTER TABLE meals ADD COLUMN tags TEXT NOT NULL DEFAULT ''`).
- Existing `CREATE TABLE` statements are never edited in place; new installs get the column from
  the definition, old installs from the migration.
- Soft-delete for public content (`is_active = 0`, never `DELETE`).
- `npm run db:backup` before any schema work; tests run against `data/test.db`, never the live DB.

**Avoid next time.** Treat the database as append-only. A missing column is not a migration
problem, it is a data-loss problem.

---

## 6. Same data, two different designs

**Symptom.** A shared/public item page rendered full-width with different spacing than the
user's own item page, and "add to my list" produced an item missing its image and details.

**Root cause.** Two page components were built independently over time, and the copy path was
written before the extra fields existed.

**Fix.** One presentational component used by both pages (`MealContent`), and one shared
`toEntity()` mapper so every write path returns the same shape. Extra fields (tags, prep time,
servings, description) are optional on the user's own records too — not catalog-only.

**Avoid next time.** When the same entity can be rendered from two entry points, write the
presentational component **first** and make both pages thin wrappers. Never let a second render
path grow its own layout.

---

## 7. Mobile niceties that iOS punishes

- **Auto-zoom on input focus.** iOS Safari zooms the page when focusing an input whose computed
  `font-size` is below 16px. Fix: force `font-size: 16px !important` on
  `input`/`select`/`textarea` at mobile widths (the `!important` is required because Tailwind
  `text-sm` on the same element otherwise wins).
- **Show-password button sitting over the text in Arabic.** The input was `dir="ltr"` (Latin
  password) inside an RTL container: `pe-12` resolved to *right* on the LTR input while `end-3`
  resolved to *left* on the RTL wrapper. Fix: physical utilities for that one field
  (`pr-12` on the input, `right-3` on the button) — the documented exception to the logical-utility
  rule.
- **Theme flash on launch.** Apply the stored theme from an inline `<head>` script before React
  mounts, not in an effect.
- **Buttons visible during the "spinning" animation.** Hide actions until the final result is
  shown; an in-progress state must not look interactive.

**Avoid next time.** Test every form on a real iPhone once: focus, RTL, and the theme toggle are
where these three hide.
