# Attia Skills

A small, hand-picked collection of **Agent Skills** — reusable instruction packs that teach AI coding agents (Claude Code, Codex, Gemini CLI, Cursor, Copilot, and any other harness that reads `SKILL.md`) how to perform a specific job correctly.

Curated, not generated. Every skill here is used in real work, scoped to one job, and validated by CI against the [Agent Skills specification](https://agentskills.io/specification).

## Skills

| Skill | What it does | Use it when |
| --- | --- | --- |
| [`install-sanad`](skills/install-sanad/SKILL.md) | Guided, safety-first install and update of Sanad (Client + local/remote Agent) on macOS, Windows, or Linux. | You want an agent to inspect a machine and install, update, or pair Sanad without guessing. |

## Install

### Claude Code (marketplace)

```bash
/plugin marketplace add AhmedAttia3/attia-skills
/plugin install attia-skills@attia-skills
```

### Any agent with a skills directory

Skills are plain folders, so installation is a clone (or download) plus a copy into the directory your agent reads:

| Harness | Skills directory |
| --- | --- |
| Claude Code | `~/.claude/skills/` or `<project>/.claude/skills/` |
| VS Code / Copilot | `<project>/.agents/skills/` |
| Codex / Gemini CLI / Cursor | their configured skills directory |

```bash
git clone https://github.com/AhmedAttia3/attia-skills.git
cp -R attia-skills/skills/install-sanad ~/.claude/skills/
```

Keep the folder name — it must match the `name` field inside `SKILL.md`.

### Use without installing

Point your agent at the raw `SKILL.md` path and ask it to follow it. No runtime, no dependencies.

## Repository layout

```
attia-skills/
├── README.md                      # this index
├── CONTRIBUTING.md                # authoring rules and review checklist
├── CHANGELOG.md
├── LICENSE                        # MIT
├── .claude-plugin/
│   ├── marketplace.json           # makes the repo installable as a plugin marketplace
│   └── plugin.json                # plugin manifest (repo root is the plugin)
├── .github/workflows/validate.yml # CI: spec validation on every push and PR
├── scripts/validate_skills.py     # zero-dependency validator (same check locally and in CI)
├── templates/skill/SKILL.md       # starting point for a new skill
└── skills/
    └── <skill-name>/
        ├── SKILL.md               # required: frontmatter + instructions
        ├── references/            # optional: deep detail, read only when needed
        ├── scripts/               # optional: deterministic helpers
        ├── assets/                # optional: templates and fixtures
        └── evals/                 # optional: trigger/quality cases
```

## Authoring rules (short version)

1. **One skill, one job.** If the description needs "and" three times, split it.
2. **`SKILL.md` is a map, not an encyclopedia.** Keep the body under ~500 lines; push detail into `references/` and load it on demand.
3. **The `description` is the product.** State what the skill does *and* when to use it, using the words a user would actually type.
4. **Assume a capable model.** Document your decisions, your workflow, and your constraints — not what a PDF or a Git branch is.
5. **Prefer a script when the step is fragile.** Deterministic work belongs in `scripts/`; judgment stays in prose.
6. **Never ship secrets, absolute local paths, or unverified downloads.**

Full rules and the review checklist: [CONTRIBUTING.md](CONTRIBUTING.md).

## Validate locally

```bash
python3 scripts/validate_skills.py
```

Exits non-zero on any specification violation. The same script runs in CI.

## Versioning

Each skill carries its own `metadata.version`. Changes are additive where possible; breaking changes get a major bump and a `CHANGELOG.md` entry. The repository itself is tagged (`v1.0.0`, `v1.1.0`, …).

## Security

A skill is executable context: it can instruct an agent to run commands. Treat third-party skills like third-party code.

- Read `SKILL.md` and anything in `scripts/` before installing.
- No skill here asks for credentials, disables OS security controls, or downloads from unofficial sources.
- `install-sanad` only uses official Sanad endpoints and requires explicit approval before it changes anything.
- Found a problem? Open an issue — do not paste tokens, logs with credentials, or personal data.

## Credits

`install-sanad` is maintained by [Ahmed Attia](https://github.com/AhmedAttia3) for the [Sanad](https://sanad.eaststarai.com) project.

## License

MIT — see [LICENSE](LICENSE).

---

<details>
<summary>العربية — نظرة سريعة</summary>

مستودع صغير لمهارات وكلاء الذكاء الاصطناعي (Agent Skills) المنسّقة يدويًا، وليس مهارات مولّدة تلقائيًا. كل مهارة هنا مستخدمة فعليًا في عمل حقيقي، ومحدودة بمهمة واحدة، ويتحقق منها CI وفق معيار `SKILL.md` المفتوح.

**التثبيت في Claude Code:**

```bash
/plugin marketplace add AhmedAttia3/attia-skills
/plugin install attia-skills@attia-skills
```

**أو بالتثبيت اليدوي:** انسخ مجلد المهارة إلى مسار المهارات الذي يقرأه وكيلك، مثل `~/.claude/skills/` أو `.agents/skills/` داخل المشروع، مع الحفاظ على اسم المجلد كما هو لأنه يجب أن يطابق حقل `name`.

**قواعد التأليف باختصار:** مهارة واحدة لكل مهمة؛ `SKILL.md` خريطة موجزة (أقل من 500 سطر) والتفاصيل في `references/`؛ الوصف `description` هو ما يحدد متى تُفعّل المهارة؛ الخطوات الهشّة تُكتب كسكربتات؛ ولا أسرار ولا مسارات مطلقة داخل أي مهارة.

</details>
