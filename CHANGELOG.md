# Changelog

Notable changes to the skills in this repository. Skills also carry their own
`metadata.version` in `SKILL.md`.

## 1.2.0 — 2026-10-17

### Added

- Installation now leads with Sanad's native path: `sanad skills add AhmedAttia3/agent-skills --skill install-sanad`, including the workspace scope (`--workspace <path-or-name>`), the `list`/`update`/`remove` lifecycle, and what `--skill` means in a repository that holds several skills. Documented in English and Arabic.

### Changed

- The Claude Code marketplace and manual-copy instructions remain documented as alternatives, after the Sanad path.

## 1.1.1 — 2026-10-17

### Fixed

- `pwa-app-builder`: `cloudflared` is now resolved portably — `$CLOUDFLARED`, the project root, `PATH`, and common bin directories — instead of a machine-specific workspace path that existed on one host only.
- `pwa-app-builder`: a public link is now two explicit decisions (does the user even want one, then permission to install `cloudflared`), and `tunnel.sh` prints guidance instead of failing silently.
- `pwa-app-builder`: `check-host.sh` reads memory and swap on macOS (`sysctl`, `vm_stat`) as well as Linux, and reports low resources only on evidence instead of turning unknown values into a warning.
- `pwa-app-builder`: removed a dead reference to a `first-workspace/BROWSER-SETUP-AR.md` file that was never part of the skill.
- `pwa-app-builder`: removed a golden rule that implied approval was needed for the project's own dependencies; the approval requirement is scoped to the optional tunnel.

## 1.1.0 — 2026-10-17

### Added

- `pwa-app-builder` — builds a production-ready, installable PWA from a project idea on a constrained host: fixed Express 4 + `node:sqlite` + React/Vite stack, one-command scaffold of ~68 files, a preference interview gate, RTL-first bilingual UI, Web Push with real provider verification, and a proof-first delivery phase. Ships host diagnostics, a scaffold generator, eight reference guides, and a full working template app.

### Changed

- Personal contact address removed from the bundled push templates; the VAPID subject now defaults to a neutral example and is documented as overridable via `VAPID_SUBJECT`.
- Host-constraint guidance now frames the documented limits as the reference host and defers to `scripts/check-host.sh` on other machines.

## 1.0.0 — 2026-10-17

### Added

- `install-sanad` — guided install, update, and pairing of Sanad (Client plus local or remote Agent) on macOS, Windows, and Linux, with a Google Cloud Free Tier fast route, explicit approval gates, and verification that requires service or Client-to-Agent health evidence instead of trusting an exit code.
- Repository scaffolding: `AGENTS`-free minimal layout, marketplace manifest so the collection installs with one command, zero-dependency specification validator, and CI on every push and pull request.
