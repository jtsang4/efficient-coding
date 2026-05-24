#!/usr/bin/env python3
"""Generate a prompt for improving a skill description.

This utility avoids calling any specific coding agent. It reads the current
skill description and optional trigger scoring data, then writes a prompt the
current agent can use to propose a better description.
"""

import argparse
import json
import sys
from pathlib import Path

from scripts.utils import parse_skill_md


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except OSError as exc:
        raise SystemExit(f"Could not read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc


def collect_failures(score_data: dict) -> list[str]:
    failures = []
    for item in score_data.get("history", []):
        description = item.get("description", "")
        for result in item.get("train_results", item.get("results", [])):
            if result.get("pass") is False or result.get("correct") is False:
                expected = "trigger" if result.get("should_trigger") else "stay inactive"
                actual = "triggered" if result.get("triggered") else "stayed inactive"
                failures.append(
                    f"- Query: {result.get('query', '')}\n"
                    f"  Expected: {expected}\n"
                    f"  Actual: {actual}\n"
                    f"  Description tested: {description}\n"
                    f"  Evidence: {result.get('evidence', '')}"
                )
    return failures


def build_prompt(skill_name: str, description: str, content: str, score_data: dict | None) -> str:
    failures = collect_failures(score_data or {})
    failure_text = "\n".join(failures) if failures else "- No trigger failures supplied."

    return f"""Improve the trigger description for this portable Agent Skill.

Skill name: {skill_name}

Current description:
{description}

Trigger failures and observations:
{failure_text}

Skill content:
<skill_content>
{content}
</skill_content>

Write one improved description for SKILL.md frontmatter.

Constraints:
- Keep it under 1024 characters.
- Focus on user intent and situations where this workflow helps.
- Include realistic trigger contexts and near-synonyms.
- Keep it portable across coding agents.
- Avoid naming a specific agent runtime or invocation command.
- Avoid a long list of one-off examples.

Return only the improved description text.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a skill description improvement prompt")
    parser.add_argument("--skill-path", required=True, type=Path, help="Path to the skill directory")
    parser.add_argument("--trigger-score", type=Path, help="Optional trigger score JSON")
    parser.add_argument("--output", "-o", type=Path, help="Output prompt path")
    args = parser.parse_args()

    name, description, content = parse_skill_md(args.skill_path)
    score_data = load_json(args.trigger_score) if args.trigger_score else None
    prompt = build_prompt(name, description, content, score_data)

    if args.output:
        args.output.write_text(prompt)
        print(f"Generated: {args.output}")
    else:
        print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main())
