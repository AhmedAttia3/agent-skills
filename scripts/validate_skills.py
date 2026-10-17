#!/usr/bin/env python3
"""Validate every skill in skills/ against the Agent Skills specification.

Zero dependencies: runs the same way locally and in CI.

    python3 scripts/validate_skills.py

Exit code 0 means every skill is discoverable, well-formed, and listed in the
README and the marketplace manifest. Exit code 1 lists every violation found.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = ROOT / "skills"
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
README = ROOT / "README.md"

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)[^)]*\)")
ABSOLUTE_PATH_RE = re.compile(r"(?<![\w`~.])/(?:Users|home|Volumes|var|opt|etc|tmp|private)/")
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9]{16,}"
    r"|ghp_[A-Za-z0-9]{20,}"
    r"|github_pat_[A-Za-z0-9_]{20,}"
    r"|AKIA[0-9A-Z]{16}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----)"
)
REQUIRED_FIELDS = ("name", "description")
OPTIONAL_FIELDS = ("license", "compatibility", "metadata", "allowed-tools")
MAX_NAME = 64
MAX_DESCRIPTION = 1024
MAX_COMPATIBILITY = 500
BODY_LINES_WARN = 500
BODY_LINES_ERROR = 800

errors: list[str] = []
warnings: list[str] = []


def fail(where: str, message: str) -> None:
    errors.append(f"{where}: {message}")


def warn(where: str, message: str) -> None:
    warnings.append(f"{where}: {message}")


def parse_frontmatter(text: str, where: str) -> tuple[dict[str, object], str, int]:
    """Parse the small YAML subset the specification allows.

    Supports top-level scalars and one level of nested string maps, which is
    all `metadata` needs. Anything more exotic is reported, never guessed.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        fail(where, "SKILL.md must start with a '---' YAML frontmatter block")
        return {}, text, 0

    try:
        end = next(i for i, line in enumerate(lines[1:], start=1) if line.strip() == "---")
    except StopIteration:
        fail(where, "frontmatter block is not closed with '---'")
        return {}, text, 0

    data: dict[str, object] = {}
    current_map: dict[str, str] | None = None
    current_key: str | None = None

    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indented = line[:1] in (" ", "\t")
        stripped = line.strip()
        if ":" not in stripped:
            warn(where, f"unparsed frontmatter line: {stripped!r}")
            continue
        key, _, value = stripped.partition(":")
        key, value = key.strip(), value.strip().strip("\"'")

        if indented:
            if current_map is None:
                warn(where, f"nested value without a parent key: {stripped!r}")
                continue
            current_map[key] = value
            continue

        current_key = key
        if value:
            data[key] = value
            current_map = None
        else:
            current_map = {}
            data[key] = current_map

    if current_key is None:
        fail(where, "frontmatter is empty")

    body = "\n".join(lines[end + 1 :])
    return data, body, len(lines)


def validate_frontmatter(where: str, name: str, meta: dict[str, object]) -> None:
    for field in ("name", "description"):
        if not meta.get(field):
            fail(where, f"missing required frontmatter field '{field}'")

    known = set(REQUIRED_FIELDS) | set(OPTIONAL_FIELDS)
    for field in meta:
        if field not in known:
            warn(where, f"unknown frontmatter field '{field}'")

    declared = meta.get("name")
    if isinstance(declared, str) and declared:
        if declared != name:
            fail(where, f"name '{declared}' does not match directory name '{name}'")
        if len(declared) > MAX_NAME:
            fail(where, f"name is {len(declared)} characters (max {MAX_NAME})")
        if not NAME_RE.match(declared):
            fail(where, "name must be lowercase alphanumerics and single hyphens only")

    description = meta.get("description")
    if isinstance(description, str) and description:
        if len(description) > MAX_DESCRIPTION:
            fail(where, f"description is {len(description)} characters (max {MAX_DESCRIPTION})")
        if len(description) < 40:
            warn(where, "description is very short; say what the skill does and when to use it")
        if " use when" not in description.lower():
            warn(where, "description does not state when to use the skill")

    compatibility = meta.get("compatibility")
    if isinstance(compatibility, str) and len(compatibility) > MAX_COMPATIBILITY:
        fail(where, f"compatibility is {len(compatibility)} characters (max {MAX_COMPATIBILITY})")

    if "license" not in meta:
        warn(where, "no 'license' field; the repository LICENSE is assumed")


def validate_body(where: str, skill_dir: Path, body: str, total_lines: int) -> None:
    if not body.strip():
        fail(where, "SKILL.md has no instruction body after the frontmatter")
        return

    if total_lines > BODY_LINES_ERROR:
        fail(where, f"SKILL.md is {total_lines} lines; move detail into references/ (max {BODY_LINES_ERROR})")
    elif total_lines > BODY_LINES_WARN:
        warn(where, f"SKILL.md is {total_lines} lines; consider references/ (guideline {BODY_LINES_WARN})")

    for line_number, line in enumerate(body.splitlines(), start=1):
        if ABSOLUTE_PATH_RE.search(line):
            fail(where, f"absolute local path found near body line {line_number}")
        if SECRET_RE.search(line):
            fail(where, f"possible secret found near body line {line_number}")

    for target in LINK_RE.findall(body):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        path = (skill_dir / target.split("#")[0]).resolve()
        if not path.exists():
            fail(where, f"broken relative link: {target}")
        elif ROOT not in path.parents:
            fail(where, f"link escapes the repository: {target}")


def validate_evals(where: str, skill_dir: Path) -> None:
    for candidate in sorted(skill_dir.glob("evals/*.json")):
        try:
            json.loads(candidate.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            fail(where, f"{candidate.name} is not valid JSON ({exc})")


def validate_skill(skill_dir: Path) -> None:
    name = skill_dir.name
    where = f"skills/{name}"
    if not NAME_RE.match(name):
        fail(where, "directory name must be lowercase alphanumerics and single hyphens only")
    if len(name) > MAX_NAME:
        fail(where, f"directory name is {len(name)} characters (max {MAX_NAME})")

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        fail(where, "missing SKILL.md")
        return

    text = skill_md.read_text(encoding="utf-8")
    meta, body, total_lines = parse_frontmatter(text, where)
    validate_frontmatter(where, name, meta)
    validate_body(where, skill_dir, body, total_lines)
    validate_evals(where, skill_dir)


def validate_marketplace(skill_names: set[str]) -> None:
    where = ".claude-plugin/marketplace.json"
    if not MARKETPLACE.is_file():
        fail(where, "missing marketplace manifest")
        return
    try:
        manifest = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(where, f"invalid JSON ({exc})")
        return

    if not manifest.get("name"):
        fail(where, "missing 'name'")
    if not manifest.get("owner"):
        fail(where, "missing 'owner'")
    plugins = manifest.get("plugins")
    if not isinstance(plugins, list) or not plugins:
        fail(where, "missing non-empty 'plugins' list")
        return

    covered: set[str] = set()
    for index, plugin in enumerate(plugins):
        entry = f"{where} plugins[{index}]"
        if not isinstance(plugin, dict):
            fail(entry, "entry must be an object")
            continue
        for field in ("name", "source", "description"):
            if not plugin.get(field):
                fail(entry, f"missing '{field}'")
        source = plugin.get("source")
        if not isinstance(source, str) or source.startswith(("http://", "https://", "git", "github")):
            continue
        source_dir = (ROOT / source).resolve()
        if not source_dir.exists():
            fail(entry, f"source '{source}' does not exist")
            continue
        if (source_dir / "SKILL.md").is_file():
            covered.add(source_dir.name)
        nested = source_dir / "skills"
        if nested.is_dir():
            for child in nested.iterdir():
                if child.is_dir() and (child / "SKILL.md").is_file():
                    covered.add(child.name)

    for name in sorted(skill_names - covered):
        fail(where, f"skill '{name}' is not reachable from any plugin source")


def validate_readme(skill_names: set[str]) -> None:
    where = "README.md"
    if not README.is_file():
        fail(where, "missing README.md")
        return
    text = README.read_text(encoding="utf-8")
    for name in sorted(skill_names):
        if f"skills/{name}/" not in text:
            fail(where, f"skill '{name}' is not listed in the skills table")


def main() -> int:
    if not SKILLS_DIR.is_dir():
        fail("skills/", "directory is missing")
        return report()

    skill_dirs = sorted(child for child in SKILLS_DIR.iterdir() if child.is_dir())
    if not skill_dirs:
        fail("skills/", "no skills found")
        return report()

    for skill_dir in skill_dirs:
        validate_skill(skill_dir)

    names = {skill_dir.name for skill_dir in skill_dirs}
    validate_marketplace(names)
    validate_readme(names)
    return report(len(skill_dirs))


def report(count: int = 0) -> int:
    for message in warnings:
        print(f"warning: {message}")
    for message in errors:
        print(f"error: {message}")
    if errors:
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s).")
        return 1
    print(f"ok: {count} skill(s) validated, {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
