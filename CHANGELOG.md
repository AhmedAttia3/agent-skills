# Changelog

Notable changes to the skills in this repository. Skills also carry their own
`metadata.version` in `SKILL.md`.

## 1.3.0 — 2026-11-10

### Added

- `install-sanad`: an Oracle Cloud fast route for `Always Free` and paid tenancies — tenancy and home-region decisions, aggregate allowance and capacity handling, resource reuse, a scoped SSH rule, just-in-time pairing, and a supervised-test cleanup path.
- `install-sanad`: a browser desktop route for a remote host, built on KasmVNC with a loopback-only service, a locally generated password, and SSH-tunnel access; no cloud firewall change and no desktop audio or GPU acceleration.
- `install-sanad`: `scripts/sanad-desktop.sh`, a tested helper with `open`/`start`/`stop`/`status` that reuses an existing tunnel and refuses a busy port, configured entirely through arguments and environment overrides.
- `install-sanad`: two eval cases — an ARM host with no published agent artifact, and a request for a browser desktop — covering the guidance added here.
- `install-sanad`: a web-hosting preparation route (`references/web-hosting-prerequisites.md`) that turns one privileged pass into an unprivileged publishing workflow — DNS and its root-only token, records verified through public resolution, certificates without a port, one web server with per-hostname blocks and an HTTP-to-HTTPS redirect, and a single watched drop point the Agent writes to.
- `install-sanad`: a DuckDNS guide (`references/dns-duckdns.md`) and two more eval cases — preparing a host to publish with HTTPS, and refusing to grant an Agent sudo when publishing stalls.
- `install-sanad`: `scripts/web-hosting-setup.sh`, a tested idempotent preparation script that installs the web server, creates the Agent's drop directory, installs the validating watcher, removes the stock default page, and prints what stays privileged — plus `scripts/site.conf.template` so each site starts from a known-good server block.
- `install-sanad`: the skill page is now the install page. The provider, desktop, and publishing routes collapsed into a short `Optional Tracks` block that names each file and the one or two constraints that must not be missed, so the 89 lines of route prose became pointers and the description dropped to 836 characters.
- `install-sanad`: an end-to-end path in `SKILL.md` that orders host decision, server creation, pairing, and publishing preparation, with a checkpoint between phases and a rule against requesting a pairing command or opening a port ahead of the work that needs it; one more eval case covers that ordering.

### Changed

- `install-sanad`: before promising an install, the Oracle route now requires confirming that the current release publishes a public, signed artifact for the host's platform and architecture, and names the alternatives when it does not.
- `install-sanad`: the Oracle route gained a publishing section — identify the VCN from the guest's own subnet metadata, open `80,443` in the cloud security list and in the guest firewall, keep exposure narrow, verify from outside the host, and remove the rule when no site needs it.
- `install-sanad`: the description now triggers on Oracle Cloud, OCI, Always Free, Ampere, browser-desktop phrasing, and publishing requests including subdomains and API tokens — in Arabic too — while leaving plain VPS price comparisons alone.

## 1.2.0 — 2026-10-17

### Added

- Installation now leads with Sanad's native path: `sanad skills add AhmedAttia3/agent-skills --skill install-sanad`, including the workspace scope (`--workspace <path-or-name>`), the `list`/`update`/`remove` lifecycle, and what `--skill` means in a repository that holds several skills. Documented in English and Arabic.
- A ready-to-paste agent prompt per skill, so the agent installs the skill, confirms it, and starts working without the user touching a terminal (English and Arabic).

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
