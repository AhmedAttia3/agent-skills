# Frontend patterns

React 18 + Vite, JSX, ESM, Tailwind 3, Arabic-first RTL with a working English toggle, dark mode
by class on `documentElement`. The UI kit and the shell are already written — spend your effort on
the domain, not on re-inventing buttons.

## Rules that keep the app coherent

1. **No `fetch` outside `src/lib/api.js`.** Add a method there first; pages import `api`. This is
   what makes error handling, credential normalisation and `credentials: 'same-origin'` consistent.
2. **Every user-facing string exists in both `dict.ar` and `dict.en`** in `src/lib/i18n.js`, read
   through `t('key')`. Interpolation is `{name}`: `t('list.count', { n: 12 })`.
3. **RTL by default, using logical utilities**: `start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`,
   `text-start`, `border-s`. Verify by flipping the language toggle, not by reading the code.
   The documented exception is password fields (`dir="ltr"` → `pr-12` / `right-3`).
4. **Reuse before writing**: `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-soft`,
   `.btn-danger`, `.input`, `.label`, `.chip` from `src/styles.css`, and the primitives in
   `src/components/ui.jsx` (`Button`, `Field`, `Select`, `Modal`/`Sheet`, `Spinner`, `EmptyState`,
   `Stars`, `ImagePicker`, `Chips`, `Skeleton`). Scattered one-off Tailwind is how these apps drift.
5. **One presentational component per entity** (see `MealContent.jsx`), shared by every page that
   renders it — the owner's page, the public share page and the catalog copy page. Two render paths
   = two designs within a month.
6. **Dark mode everywhere from the start**: every colour comes as a pair (`bg-white dark:bg-ink-800`,
   `text-ink-900 dark:text-ink-50`). Retrofitting dark mode is far more expensive.

## api.js — the only network layer

```js
export class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal,
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.message || 'حدث خطأ غير متوقع', data?.error || 'HTTP_ERROR', res.status);
  return data;
}
```

The thrown `ApiError.message` is already display-ready Arabic from the server's `{error, message}`
contract — show it directly in a toast instead of inventing a generic failure message. Handle
`err.code === 'NO_ITEMS'` (or equivalent emptiness code) as a normal state, not an error.

Credentials go through `credentialBody()` (email normalised, password normalised, name omitted when
empty) for register/login/upgrade — this is the client half of pitfall #1.

`compressImage(file)` returns a JPEG data URL via Canvas; it is the only image pipeline, chosen
because `sharp` cannot exist on these hosts.

## providers.jsx — three contexts

- `SettingsProvider`: `theme`, `locale`, `dir`, `t`, `toggleTheme`, `setTheme`, `setLocale`. Persists
  to `localStorage` (`<prefix>_theme`, `<prefix>_locale`), applies the class to `documentElement`,
  sets `lang`/`dir`, and calls `syncStatusBarColor(theme)`.
- `AuthProvider`: `user`, `loading`, `refresh`, `isGuest`, `login`, `register`, `guest`, `upgrade`,
  `logout`, `setUser`. After login it syncs locale/theme to the account, so the preference follows
  the user across devices.
- `ToastProvider`: `toast(message, type)` with `success | error | info`, auto-dismiss.

`AppProviders` nests all three; `main.jsx` wraps `<App />` with it inside `BrowserRouter`.

## Theming without a flash

`localStorage` is the source of truth, and an inline script in `index.html` applies it **before
first paint**:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('<prefix>_theme');
      if (t !== 'light' && t !== 'dark') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.documentElement.classList.toggle('light', t !== 'dark');
      var color = t === 'dark' ? '<ink-900>' : '<brand-50>';
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', color); });
    } catch (e) {}
  })();
</script>
```

Both halves matter: no white flash on launch, and iOS gets the right status-bar colour (it reads
`theme-color` at load time only).

## AppShell — responsive navigation

- Mobile: sticky translucent header + `fixed` bottom nav with safe-area padding
  (`pb-[var(--safe-bottom)]`); desktop (`md:`) turns the same nav into a side rail.
- Include: offline indicator (toast on `offline`), install banner when the app is installable,
  guest banner with an upgrade action, and the language/theme toggles reachable from Settings.
- **Do not add `viewport-fit=cover`** to the viewport meta and do not reintroduce
  `apple-mobile-web-app-status-bar-style: black-translucent` — see `references/pitfalls.md` #3.

## Forms

- Use `<label class="label">` + `.input`; give every field `inputMode`/`type` hints
  (`type="email"`, `inputMode="numeric"`) for mobile keyboards.
- Inputs must compute to **16px** at mobile widths (enforced in `styles.css` with `!important`) or
  iOS Safari zooms the page on focus.
- Password fields: `dir="ltr"` + `pr-12` + the toggle at `right-3`.
- Creation forms use `autoComplete="new-password"`; login uses `current-password` with `email`.
- Validate required fields client-side for speed, but always re-validate server-side — the client is
  not a trust boundary.
- Show inline errors and a toast; disable the submit button while the request is in flight.

## Lists, search, empty states

- Search/filter/sort state lives in the URL (`useSearchParams`) when the user might share or reload
  the page; otherwise local state is fine.
- Filter chips are horizontally scrollable with `.no-scrollbar`; the active chip is visually
  unmistakable in both themes.
- Every list needs an empty state that tells the user what to do next, and a skeleton while
  loading (`.skeleton`).
- Randomise the default order when the source is a browsable content set, otherwise the same first
  page appears on every visit (a real complaint we received once).

## Animations

Keep them short and meaningful: `animate-fade-up` for lists, `animate-pop` for results, and a
slot-machine flip (`.slot-flip`, ~110ms steps) for "picking one for me". Hide the action buttons
while a result is still changing — an in-progress state must never look actionable.

## Adding a page — checklist

1. `web/src/pages/<Name>.jsx`.
2. Route it in `App.jsx` — wrap in `Protected` if it needs a session.
3. Nav entry in `AppShell.jsx` (respect the mobile/desktop structure).
4. Any new API call goes into `lib/api.js` first.
5. i18n keys in **both** dicts.
6. `min-h-full` on the outer element so the shell scrolls correctly, and mobile bottom padding so
   the fixed nav never covers the last row.
