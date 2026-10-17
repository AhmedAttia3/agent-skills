# Host constraints (verified, not inferred)

These are the facts the stack was chosen around. They were all found the hard way; each one
silently ruins a build if you assume otherwise.

They describe the **reference host** these projects were built on: a small cloud VM with no
build toolchain and no swap. On a different machine, run `scripts/check-host.sh` first and treat
only what it reports as fact — the stack choices stay sound either way; only the mitigations
change.

| Constraint | Reality | Consequence |
|---|---|---|
| `gcc` / `g++` / `make` / `cc` | **absent** | No dependency with native code can install: `better-sqlite3`, `bcrypt`, `argon2`, `sharp`, `canvas`, `node-gyp`, any prebuilt-or-nothing package |
| MongoDB / PostgreSQL | not installed, no `sudo` | SQLite via `node:sqlite` is the only database |
| RAM | ~958MB total, **~300MB available**, **swap 0** | Two npm processes can OOM the box; nothing survives a memory spike |
| CPU | 2 vCPU | A headless browser can saturate the machine |
| Node.js | portable at `~/node-v24.20.0-linux-x64/bin` — **not on `PATH`** | `export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"` at the top of **every** new shell |
| `node:sqlite` | available (Node ≥22.5) | `require('node:sqlite')` — no install needed |
| Port 8090 | occupied by the agent service | App on **3000**, API tests on **3100** |
| `cloudflared` | borrowed from `~/.sanad/workspaces/first-workspace/cloudflared` | `scripts/tunnel.sh` searches for it |
| `crontab` | permission denied | Schedule inside the app (a 30s `setInterval` in `server/scheduler.js`), not via cron |
| Python 3 | present (only for `gen-icons.py`) | Icons are rasterised with stdlib `zlib`/`struct` — no Pillow |

## Long commands get killed

`npm install` and `npm run build` exceed the command timeout on this box. Run them **in the
background, redirect to a log, and poll the log**:

```bash
export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"
(npm install > npm-install.log 2>&1; echo "exit=$?" >> npm-install.log) &
for i in $(seq 1 30); do sleep 10; grep -q 'exit=' npm-install.log && break; done
tail -5 npm-install.log
```

Same for `vite build` (write to `build.log`) and for bulk network jobs such as
`npm run catalog:images` (dozens of image downloads — it will outlive a single command).

## Background processes can vanish

`setsid nohup ... &` survives most things, but a process started right before the launching
command returns can be reaped. **Always verify liveness before reporting success**, and verify
by health check rather than PID (PIDs get reused):

```bash
curl -s http://127.0.0.1:3000/api/health || ./scripts/run.sh start
./scripts/run.sh status
```

## Killing processes without killing yourself

The agent's own shell command line contains the pattern you are about to `pkill`, so
`pkill -f "server/index.js"` matches your own shell and terminates it. Use a bracket:

```bash
pkill -f "server/inde[x].js"          # ✅ matches the server, not your command
pkill -f "serve[r]/index.js"          # ✅ same trick
```

To target a specific listener instead of a pattern, resolve the pid from the port:

```bash
ss -ltnp | grep ':3000'                # users:(("MainThread",pid=1234,fd=24))
kill 1234
```

Note that `ps` shows a relative `node server/index.js` for servers started with a different cwd,
so name-based matching can hit the wrong process — prefer the port.

## Ports

```bash
ss -ltn | grep -E ':(3000|3100|8090)'
```

If 3000 is busy it is usually a previous instance of the same app: `./scripts/run.sh status`
then `./scripts/run.sh restart`. Never reuse 8090.

## Browser policy on this class of host

Verification default: `curl` + `npm run test:api`. A browser is allowed **only with the user's
consent**, and on a low-resource host you must warn about the cost first, because a Chromium
instance here can exhaust memory, get the app's server OOM-killed, and require a restart:

> «تشغيل المتصفح على هذا السيرفر (٢ كور وبدون swap) قد يستهلك الموارد بالكامل ويوقف السيرفر
> فيحتاج إعادة تشغيل. أفحص بـ`curl` واختبارات الـAPI، أم تفضل تشغيل المتصفح؟»

If a browser *is* needed and allowed on such a host, still keep it to one short session, pass
`--no-sandbox` and a dedicated profile dir, and stop it the moment you have the screenshots.

The full headless-Chrome recipe used on this box (flagged as `LD_LIBRARY_PATH` + `FONTCONFIG_FILE`
+ `setsid` on port 9222) lives in `first-workspace/BROWSER-SETUP-AR.md`.
