# Contributing

This repository favours **few good skills** over many. A skill is accepted when it does one job better than a capable model would do unaided, and that job recurs.

## Adding a skill

1. **Copy the template.**

   ```bash
   cp -R templates/skill skills/<skill-name>
   ```

   The directory name must equal the `name` field, use lowercase alphanumerics and single hyphens, and stay under 64 characters.

2. **Write the frontmatter.** `name` and `description` are required. The description must state *what* the skill does and *when* to use it, using the words a user would actually type.

   ```yaml
   ---
   name: example-skill
   description: Does X by doing Y. Use when the user asks about X, mentions Y, or needs Z.
   license: MIT
   metadata:
     author: Your Name
     version: 1.0.0
   ---
   ```

3. **Write the body as a map.** Steps, decision rules, and the constraints that caused past failures. Push long detail into `references/` and link it with a relative path; put fragile, repeatable steps in `scripts/`.

4. **Add evaluation cases** in `evals/evals.json`: prompts that must trigger the skill, and prompts that must not.

5. **Register it.** Add a row to the `README.md` skills table. The repository root is already a plugin, so `skills/<name>/` is picked up automatically; no manifest change is needed.

6. **Validate.**

   ```bash
   python3 scripts/validate_skills.py
   ```

## Review checklist

- [ ] One job, stated in one sentence.
- [ ] `description` contains the trigger words, not marketing.
- [ ] `SKILL.md` under ~500 lines; detail lives in `references/`.
- [ ] Every relative link resolves; no absolute local paths.
- [ ] Scripts are deterministic, dependency-light, and documented.
- [ ] No secrets, tokens, customer data, or personal machine state.
- [ ] Only official or clearly attributable sources are downloaded.
- [ ] Mutating steps require explicit user approval before they run.
- [ ] `evals/` covers both "should trigger" and "should stay silent".
- [ ] Listed in `README.md`; `CHANGELOG.md` updated.

## Style

- English only, in Markdown, no emoji headers.
- Voice is imperative: "Inspect the machine, then report."
- Prefer prose over nested bullets; prefer a table when comparing options.
- Never restate what a capable agent already knows.

## Versioning

- `metadata.version` follows semver per skill.
- Documentation or wording fixes: patch. New steps or capabilities: minor. Changed contracts or removed capability: major plus a `CHANGELOG.md` note.
- Repository tags (`v1.1.0`, …) mark releases that change what users install.

## Reporting a problem with a skill

Open an issue describing the prompt, the expected behaviour, and what the agent did instead. Do not include credentials, tokens, or private logs.
