# Ops, verification and delivery

Every command here exists in the planted `scripts/` directory — you are not inventing tooling, you
are running it. Node is not on `PATH` on these hosts:

```bash
export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"
```

## Commands

| Goal | Command |
|---|---|
| Host recon | `scripts/check-host.sh` |
| App identity + skeleton | `node <skill>/scripts/scaffold.mjs --dir . --name "..." --name-en "..." --slug x --prefix xx --palette teal` |
| Server, managed (PID + log) | `./scripts/run.sh start\|stop\|restart\|status\|logs` |
| Server + public tunnel | `./scripts/start-all.sh` |
| Public URL (Cloudflare quick tunnel) | `./scripts/tunnel.sh start\|url\|stop` |
| API tests — port 3100, isolated `data/test.db` | `npm run test:api` |
| Smoke test against a running server | `node scripts/smoke-test.js` (`BASE_URL` overrides the target) |
| Build the UI → `server/public` | `npm run build` |
| UI dev (HMR + API proxy) | `npm run dev:web` (5173) + `npm run dev:api` (3000) |
| Back up DB + uploads + catalog | `npm run db:backup` |
| Pre-generate VAPID + session keys | `npm run setup:keys` |
| Regenerate app icons (python3) | `npm run icons` |
| Real push + provider responses | `npm run push:test` (`--keys`, `--image=/path`) |
| Reset / test a user's password | `npm run user:reset-password` (`--list`) · `npm run user:check-password` |
| Catalog sync / images (optional module) | `npm run catalog:sync` (`--dry`) · `npm run catalog:images` (`--force`, `--only=<slug>`) |
| Health check | `curl -s http://127.0.0.1:3000/api/health` |

## Verification sequence (run it, don't assume it)

```bash
export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"
npm install                                     # background + log on a low-RAM host
npm run build                                   # must exit 0; output lands in server/public
./scripts/run.sh restart
curl -s http://127.0.0.1:3000/api/health         # {"ok":true,...}
curl -s http://127.0.0.1:3000/ | head -3         # the built SPA is served
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/manifest.webmanifest
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/sw.js
npm run test:api                                 # final gate; exits non-zero on failure
```

Then exercise the real user path so your report contains real output rather than "should work":

```bash
curl -s -c jar.txt -X POST http://127.0.0.1:3000/api/auth/guest
curl -s -b jar.txt -H 'Content-Type: application/json' -d '{"name":"اختبار","category":"lunch"}' http://127.0.0.1:3000/api/items
curl -s -b jar.txt http://127.0.0.1:3000/api/items
curl -s -b jar.txt -X PATCH -H 'Content-Type: application/json' -d '{"name":"محدّث"}' http://127.0.0.1:3000/api/items/1
curl -s -b jar.txt -X DELETE http://127.0.0.1:3000/api/items/1 -o /dev/null -w '%{http_code}\n'
```

**Never claim success without evidence.** Quote the commands and their actual output, including
failures. If a step is skipped, say which one and why.

## Baseline expectations

| Check | Expected |
|---|---|
| Fresh scaffold, `npm run test:api` | `110 ناجح، 2 فاشل` — the 2 are catalog assertions that need real image files fetched by `npm run catalog:images` (network + time). After fetching: all green. |
| `npm run build` | exits 0; `server/public/index.html` + `assets/index-*.{js,css}` regenerated |
| `curl /api/health` | `{"ok":true,"app":"<APP_NAME>","time":"..."}` |
| Installed-PWA checks | manifest + sw served 200; icons present after `npm run icons` |

## Testing rules

- `npm run test:api` boots its **own** server on port 3100 against `data/test.db`, syncs the catalog
  into it, and deletes the DB afterwards. The live `data/app.db` is never touched — keep it that way.
- New route ⇒ add a `check(name, condition, extra)` assertion to `scripts/smoke-test.js`. A route
  with no assertion is a route you have not verified.
- Cover the failure paths, not just the happy path: validation errors, unauthenticated access,
  ownership isolation (user A must not read/update user B's row), duplicate handling, and the
  tolerant-credential case from pitfall #1.

## Backups

```bash
npm run db:backup     # → data/backups/<YYYYMMDD-HHMMSS>/{app.db,app.db-wal,app.db-shm,uploads,catalog-images,catalog}
```

Run it **before** any schema or migration work. Copy the `-wal`/`-shm` siblings too or the backup can
lose the most recent writes. Restoring = stop the server, copy back the three DB files, start.

## Working with git

- Single branch `main`; `git init -b main` + an early commit gives a recoverable known-good state.
- Run anything risky (iOS install behaviour, viewport experiments, dependency swaps) on a branch
  named after the hypothesis, and keep the escape hatch explicit: `git checkout main && npm run build`.
- Conventional Commits with an **Arabic** subject: `feat(items): إضافة فلتر الفئات`,
  `fix(auth): تطبيع البريد عند الدخول`, `docs(agents): تحديث الدليل`.
- Never `push` unless asked. Never commit `data/` (except `data/catalog/`), `server/public/`,
  `node_modules/`, `*.log`, screenshots, or `.sanad/`.

## The public link

```bash
./scripts/tunnel.sh start      # prints the https URL when it appears in tunnel.log
./scripts/tunnel.sh url        # current URL
./scripts/tunnel.sh stop
```

Ask before starting a tunnel. Two things to tell the user up front: the quick-tunnel hostname is
random and **changes on every restart** (so it is a preview link, not a deployment), and Chrome may
show a "check your passwords" nag on it because the shared domain pattern has bad reputation —
that is the domain, not the app (see `references/pitfalls.md` #4). For a stable link, use a named
tunnel or Cloudflare Pages with a real domain.

## Documentation to leave behind

| File | Content | When |
|---|---|---|
| `docs/API.md` | Every route in a table + at least one copy-pasteable `curl` per group, response shapes, error codes | With each new route |
| `README.md` | What it does (Arabic-first), the feature table, how to run/test/deploy, the stack table | Early, update at the end |
| `docs/TECH-STACK.md` | Why these choices, and the host constraints that force them | Once |
| `docs/<TOPIC>-TROUBLESHOOTING.md` | Any hard-won platform diagnosis (e.g. push on iOS) — symptoms, evidence, fix, platform limits | When you spend real time on a bug |
| `AGENTS.md` | The contract for future sessions: commands, architecture map, conventions, golden DB rule, verification steps, boundaries, git workflow | Once the app is stable (write it from the final code) |

`AGENTS.md` is the highest-leverage file in the repo: the next session (you, later) starts with the
whole map instead of rediscovering it. Write it in English for token efficiency, and keep the exact
command list and the "never touch the live DB" rule in it.

## Housekeeping before reporting done

- Delete temporary debug files from the repo root (`tmp-*.js`), scratch scripts, and the temporary
  on-device diagnostic panel if you added one.
- Confirm no `.log` files or `data/` content got added to git: `git status --short`.
- Confirm the server you report as running is actually alive: `./scripts/run.sh status`.
- Leave the app running only if the user needs the link; otherwise stop it with
  `./scripts/run.sh stop` and say so.
