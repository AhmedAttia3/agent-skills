# Changelog

Notable changes to the skills in this repository. Skills also carry their own
`metadata.version` in `SKILL.md`.

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
