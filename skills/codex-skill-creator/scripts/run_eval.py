#!/usr/bin/env python3
"""Run trigger evaluation for a skill description.

Tests whether a skill's description causes Codex to trigger (consult the skill)
for a set of queries. Outputs results as JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

try:
    from scripts.utils import (
        parse_skill_md,
        replace_description_in_skill_md,
        temporary_codex_home,
    )
except ModuleNotFoundError:
    from utils import (  # type: ignore
        parse_skill_md,
        replace_description_in_skill_md,
        temporary_codex_home,
    )


def find_project_root() -> Path:
    """Find the best workspace root to use for nested Codex runs."""
    current = Path.cwd()
    markers = (".git", ".agents", ".codex", "AGENTS.md")
    for parent in [current, *current.parents]:
        if any((parent / marker).exists() for marker in markers):
            return parent
    return current


def _sanitize_skill_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    return normalized or "skill"


def _stage_eval_skill(
    source_skill_path: Path,
    staged_skill_path: Path,
    description: str,
    trigger_marker: str,
) -> None:
    """Copy the skill to a temp Codex home and inject the eval marker."""
    shutil.copytree(
        source_skill_path,
        staged_skill_path,
        ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"),
    )

    skill_md_path = staged_skill_path / "SKILL.md"
    skill_md = skill_md_path.read_text()
    skill_md = replace_description_in_skill_md(skill_md, description)
    skill_md += (
        "\n\n## Trigger Evaluation Harness\n"
        "If you are reading this skill during an automated trigger evaluation, "
        f'include the exact token "{trigger_marker}" in your final response exactly once. '
        "Do not mention the token otherwise.\n"
    )
    skill_md_path.write_text(skill_md)


def _archive_run_artifacts(
    artifact_root: str | None,
    staged_skill_path: Path,
    output_file: Path,
    session_file: Path | None,
    stderr_excerpt: str,
    metadata: dict,
) -> str:
    """Persist useful debugging artifacts for a failed or inconclusive run."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    artifact_name = f"{staged_skill_path.name}_{timestamp}"

    if artifact_root:
        archive_base = Path(artifact_root)
        archive_base.mkdir(parents=True, exist_ok=True)
        artifact_dir = archive_base / artifact_name
        suffix = 1
        while artifact_dir.exists():
            suffix += 1
            artifact_dir = archive_base / f"{artifact_name}_{suffix}"
        artifact_dir.mkdir(parents=True, exist_ok=False)
    else:
        artifact_dir = Path(tempfile.mkdtemp(prefix=f"{artifact_name}_"))

    shutil.copytree(
        staged_skill_path,
        artifact_dir / "skill",
        ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"),
    )

    if output_file.exists():
        shutil.copy2(output_file, artifact_dir / "last_message.txt")
    if session_file and session_file.exists():
        shutil.copy2(session_file, artifact_dir / "session.jsonl")
    (artifact_dir / "stderr.txt").write_text(stderr_excerpt)
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    return str(artifact_dir)


def run_single_query(
    query: str,
    skill_path: str,
    skill_name: str,
    skill_description: str,
    timeout: int,
    project_root: str,
    model: str | None = None,
    artifact_root: str | None = None,
) -> dict:
    """Run a single query and return whether the skill was triggered."""
    skill_path_obj = Path(skill_path)
    unique_id = uuid.uuid4().hex[:8]
    clean_name = _sanitize_skill_name(skill_name)
    staged_skill_name = f"{clean_name}-trigger-eval-{unique_id}"
    trigger_marker = f"[SKILL_TRIGGERED:{staged_skill_name}]"

    with temporary_codex_home() as codex_home:
        staged_skill_path = codex_home / "skills" / staged_skill_name
        _stage_eval_skill(
            source_skill_path=skill_path_obj,
            staged_skill_path=staged_skill_path,
            description=skill_description,
            trigger_marker=trigger_marker,
        )

        output_dir = codex_home / "tmp"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / f"{staged_skill_name}-last-message.txt"

        cmd = [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "-C",
            project_root,
            "-o",
            str(output_file),
        ]
        if model:
            cmd.extend(["--model", model])
        cmd.append("-")

        env = dict(os.environ)
        env["CODEX_HOME"] = str(codex_home)

        started_at = time.monotonic()
        try:
            result = subprocess.run(
                cmd,
                input=query,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
            )
            returncode = result.returncode
            stdout_text = result.stdout
            stderr_excerpt = result.stderr[-500:]
            timed_out = False
            error_type = None if result.returncode == 0 else "nonzero_exit"
        except subprocess.TimeoutExpired as exc:
            returncode = None
            stdout_text = exc.stdout or ""
            stderr_excerpt = f"Timed out after {timeout} seconds"
            timed_out = True
            error_type = "timeout"
        duration_seconds = round(time.monotonic() - started_at, 3)

        last_message = ""
        if output_file.exists():
            last_message = output_file.read_text()
        elif stdout_text:
            last_message = stdout_text

        if not last_message.strip() and error_type is None:
            error_type = "empty_response"

        triggered = trigger_marker in last_message
        latest_session = None
        latest_session_path = None
        sessions_dir = codex_home / "sessions"
        if sessions_dir.exists():
            session_files = sorted(sessions_dir.rglob("*.jsonl"))
            if session_files:
                latest_session = str(session_files[-1])
                latest_session_path = session_files[-1]

        inconclusive = error_type is not None
        artifact_dir = None
        if inconclusive:
            artifact_dir = _archive_run_artifacts(
                artifact_root=artifact_root,
                staged_skill_path=staged_skill_path,
                output_file=output_file,
                session_file=latest_session_path,
                stderr_excerpt=stderr_excerpt,
                metadata={
                    "query": query,
                    "skill_name": skill_name,
                    "staged_skill_name": staged_skill_name,
                    "timed_out": timed_out,
                    "duration_seconds": duration_seconds,
                    "error_type": error_type,
                    "returncode": returncode,
                    "triggered": triggered,
                    "session_file": latest_session,
                },
            )

        return {
            "triggered": triggered,
            "returncode": returncode,
            "marker": trigger_marker,
            "timed_out": timed_out,
            "duration_seconds": duration_seconds,
            "error_type": error_type,
            "inconclusive": inconclusive,
            "last_message_excerpt": last_message[:500],
            "stderr_excerpt": stderr_excerpt,
            "session_file": latest_session,
            "artifact_dir": artifact_dir,
        }


def run_eval(
    eval_set: list[dict],
    skill_path: Path,
    description: str,
    num_workers: int,
    timeout: int,
    project_root: Path,
    runs_per_query: int = 1,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    artifact_root: Path | None = None,
) -> dict:
    """Run the full eval set and return results."""
    skill_name, _, _ = parse_skill_md(skill_path)
    results = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        future_to_info = {}
        for item in eval_set:
            for run_idx in range(runs_per_query):
                future = executor.submit(
                    run_single_query,
                    item["query"],
                    str(skill_path),
                    skill_name,
                    description,
                    timeout,
                    str(project_root),
                    model,
                    str(artifact_root) if artifact_root else None,
                )
                future_to_info[future] = (item, run_idx)

        query_runs: dict[str, list[dict]] = {}
        query_items: dict[str, dict] = {}
        for future in as_completed(future_to_info):
            item, _ = future_to_info[future]
            query = item["query"]
            query_items[query] = item
            query_runs.setdefault(query, [])
            try:
                query_runs[query].append(future.result())
            except Exception as e:
                print(f"Warning: query failed: {e}", file=sys.stderr)
                query_runs[query].append({
                    "triggered": False,
                    "returncode": None,
                    "marker": "",
                    "timed_out": False,
                    "duration_seconds": 0.0,
                    "error_type": "worker_exception",
                    "inconclusive": True,
                    "last_message_excerpt": "",
                    "stderr_excerpt": str(e),
                    "session_file": None,
                    "artifact_dir": None,
                })

    for query, runs in query_runs.items():
        item = query_items[query]
        conclusive_runs = [run for run in runs if not run["inconclusive"]]
        inconclusive_runs = [run for run in runs if run["inconclusive"]]
        triggers = [bool(run["triggered"]) for run in conclusive_runs]
        trigger_rate = sum(triggers) / len(triggers) if triggers else 0.0
        should_trigger = item["should_trigger"]
        is_inconclusive = len(conclusive_runs) == 0 or len(inconclusive_runs) > 0

        if is_inconclusive:
            did_pass = False
        else:
            if should_trigger:
                did_pass = trigger_rate >= trigger_threshold
            else:
                did_pass = trigger_rate < trigger_threshold

        sample_run = next(
            (run for run in runs if run["last_message_excerpt"] or run["stderr_excerpt"]),
            runs[0],
        )
        average_duration = sum(run["duration_seconds"] for run in runs) / len(runs)
        results.append({
            "query": query,
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": sum(triggers),
            "runs": len(runs),
            "conclusive_runs": len(conclusive_runs),
            "inconclusive_runs": len(inconclusive_runs),
            "timed_out_runs": sum(1 for run in runs if run["timed_out"]),
            "inconclusive": is_inconclusive,
            "pass": did_pass,
            "average_duration_seconds": round(average_duration, 3),
            "max_duration_seconds": max(run["duration_seconds"] for run in runs),
            "error_types": sorted({run["error_type"] for run in runs if run["error_type"]}),
            "sample_last_message": sample_run["last_message_excerpt"],
            "sample_stderr": sample_run["stderr_excerpt"],
            "sample_session_file": sample_run["session_file"],
            "sample_artifact_dir": sample_run["artifact_dir"],
            "run_details": runs,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run trigger evaluation for a skill description")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--description", default=None, help="Override description to test")
    parser.add_argument("--num-workers", type=int, default=10, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use for codex exec (default: user's configured model)")
    parser.add_argument("--artifact-dir", default=None, help="Directory to store archived failed/inconclusive run artifacts")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, _ = parse_skill_md(skill_path)
    description = args.description or original_description
    project_root = find_project_root()

    if args.verbose:
        print(f"Evaluating {name!r} from {skill_path}", file=sys.stderr)
        print(f"Description: {description}", file=sys.stderr)
        print(f"Project root: {project_root}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_path=skill_path,
        description=description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        project_root=project_root,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
        artifact_root=Path(args.artifact_dir) if args.artifact_dir else None,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"Results: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            if r["inconclusive"]:
                status = "INCONCLUSIVE"
            else:
                status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            print(f"  [{status}] rate={rate_str} expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
