#!/usr/bin/env python3
"""Lightweight regression checks for Codex-based skill evaluation scripts."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

try:
    from scripts import run_eval as run_eval_module
except ModuleNotFoundError:
    import run_eval as run_eval_module  # type: ignore


def _make_skill(base_dir: Path, name: str, description: str, body: str) -> Path:
    skill_dir = base_dir / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n# {name}\n{body}\n"
    )
    return skill_dir


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_live_positive_and_negative() -> None:
    with tempfile.TemporaryDirectory(prefix="codex-skill-creator-regression-") as tmp:
        tmp_path = Path(tmp)
        skill_path = _make_skill(
            tmp_path,
            "test-skill",
            "Use this skill only when the user explicitly mentions test-skill.",
            "Reply briefly.",
        )
        eval_set = [
            {"query": "Please help with a test-skill style task.", "should_trigger": True},
            {"query": "Say exactly OK.", "should_trigger": False},
        ]

        output = run_eval_module.run_eval(
            eval_set=eval_set,
            skill_path=skill_path,
            description="Use this skill only when the user explicitly mentions test-skill.",
            num_workers=1,
            timeout=20,
            project_root=run_eval_module.find_project_root(),
            runs_per_query=1,
            trigger_threshold=0.5,
            model=None,
            artifact_root=tmp_path / "artifacts",
        )

        by_query = {item["query"]: item for item in output["results"]}
        positive = by_query["Please help with a test-skill style task."]
        negative = by_query["Say exactly OK."]

        _assert(positive["pass"], f"positive scenario failed: {json.dumps(positive, indent=2)}")
        _assert(not positive["inconclusive"], "positive scenario should be conclusive")
        _assert(negative["pass"], f"negative scenario failed: {json.dumps(negative, indent=2)}")
        _assert(not negative["inconclusive"], "negative scenario should be conclusive")


def test_timeout_classification() -> None:
    with tempfile.TemporaryDirectory(prefix="codex-skill-creator-regression-") as tmp:
        tmp_path = Path(tmp)
        skill_path = _make_skill(
            tmp_path,
            "timeout-skill",
            "Use for timeout testing only.",
            "Reply briefly.",
        )

        with patch.object(
            run_eval_module.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd=["codex"], timeout=1),
        ):
            result = run_eval_module.run_single_query(
                query="Please help with a timeout-skill task.",
                skill_path=str(skill_path),
                skill_name="timeout-skill",
                skill_description="Use for timeout testing only.",
                timeout=1,
                project_root=str(run_eval_module.find_project_root()),
                model=None,
                artifact_root=str(tmp_path / "artifacts"),
            )

        _assert(result["timed_out"], f"expected timed_out=True: {json.dumps(result, indent=2)}")
        _assert(result["inconclusive"], f"expected inconclusive=True: {json.dumps(result, indent=2)}")
        _assert(result["error_type"] == "timeout", f"expected timeout error type: {json.dumps(result, indent=2)}")
        _assert(result["artifact_dir"], f"expected archived artifacts: {json.dumps(result, indent=2)}")
        _assert(Path(result["artifact_dir"]).exists(), f"artifact dir missing: {result['artifact_dir']}")


def main() -> None:
    test_live_positive_and_negative()
    test_timeout_classification()
    print("regression_smoke: OK")


if __name__ == "__main__":
    main()
