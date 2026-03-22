"""Shared utilities for codex-skill-creator scripts."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path



def parse_skill_md(skill_path: Path) -> tuple[str, str, str]:
    """Parse a SKILL.md file, returning (name, description, full_content)."""
    content = (skill_path / "SKILL.md").read_text()
    lines = content.split("\n")

    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError("SKILL.md missing frontmatter (no closing ---)")

    name = ""
    description = ""
    frontmatter_lines = lines[1:end_idx]
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        if line.startswith("name:"):
            name = line[len("name:"):].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            value = line[len("description:"):].strip()
            # Handle YAML multiline indicators (>, |, >-, |-)
            if value in (">", "|", ">-", "|-"):
                continuation_lines: list[str] = []
                i += 1
                while i < len(frontmatter_lines) and (frontmatter_lines[i].startswith("  ") or frontmatter_lines[i].startswith("\t")):
                    continuation_lines.append(frontmatter_lines[i].strip())
                    i += 1
                description = " ".join(continuation_lines)
                continue
            else:
                description = value.strip('"').strip("'")
        i += 1

    return name, description, content


def replace_description_in_skill_md(content: str, new_description: str) -> str:
    """Return SKILL.md content with frontmatter description replaced."""
    lines = content.split("\n")
    if not lines or lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError("SKILL.md missing frontmatter (no closing ---)")

    frontmatter_lines = lines[1:end_idx]
    updated: list[str] = []
    replaced = False
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        if line.startswith("description:"):
            updated.append(f"description: {json.dumps(new_description, ensure_ascii=True)}")
            replaced = True

            value = line[len("description:"):].strip()
            if value in (">", "|", ">-", "|-"):
                i += 1
                while i < len(frontmatter_lines):
                    continuation = frontmatter_lines[i]
                    if continuation.startswith("  ") or continuation.startswith("\t"):
                        i += 1
                        continue
                    break
                continue

            i += 1
            continue

        updated.append(line)
        i += 1

    if not replaced:
        updated.append(f"description: {json.dumps(new_description, ensure_ascii=True)}")

    return "\n".join([lines[0], *updated, lines[end_idx], *lines[end_idx + 1:]])


def get_codex_home() -> Path:
    """Return the active Codex home directory."""
    env_value = os.environ.get("CODEX_HOME")
    if env_value:
        return Path(env_value).expanduser()
    return Path.home() / ".codex"


def bootstrap_temp_codex_home(base_codex_home: Path, target_codex_home: Path) -> None:
    """Create a minimal temporary Codex home for isolated subprocess runs."""
    target_codex_home.mkdir(parents=True, exist_ok=True)
    (target_codex_home / "skills").mkdir(parents=True, exist_ok=True)

    for filename in ("auth.json", "config.toml", "AGENTS.md"):
        src = base_codex_home / filename
        dst = target_codex_home / filename
        if not src.exists() or dst.exists():
            continue
        try:
            dst.symlink_to(src)
        except OSError:
            shutil.copy2(src, dst)

    system_skills_src = base_codex_home / "skills" / ".system"
    system_skills_dst = target_codex_home / "skills" / ".system"
    if system_skills_src.exists() and not system_skills_dst.exists():
        try:
            system_skills_dst.symlink_to(system_skills_src, target_is_directory=True)
        except OSError:
            shutil.copytree(system_skills_src, system_skills_dst)


@contextmanager
def temporary_codex_home(base_codex_home: Path | None = None):
    """Yield a throwaway Codex home seeded with auth/config/system skills."""
    base = (base_codex_home or get_codex_home()).expanduser()
    tmp_dir = Path(tempfile.mkdtemp(prefix="codex-skill-creator-codex-home-"))
    try:
        bootstrap_temp_codex_home(base, tmp_dir)
        yield tmp_dir
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
