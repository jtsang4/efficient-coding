#!/usr/bin/env python3
"""Score portable skill trigger eval results.

This script does not call any coding agent. Run trigger prompts through the
current agent environment first, save whether the skill triggered, then use
this script to score the results and generate the JSON shape expected by
scripts/generate_report.py.
"""

import argparse
import json
import sys
from pathlib import Path


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except OSError as exc:
        raise SystemExit(f"Could not read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc


def normalize_eval_set(data) -> list[dict]:
    if isinstance(data, dict):
        data = data.get("evals", data.get("queries", data.get("items", [])))
    if not isinstance(data, list):
        raise SystemExit("Eval set must be a list or an object with evals/queries/items.")

    normalized = []
    for item in data:
        if not isinstance(item, dict) or "query" not in item:
            raise SystemExit(f"Invalid eval item: {item!r}")
        normalized.append({
            "query": item["query"],
            "should_trigger": bool(item.get("should_trigger", True)),
            "reason": item.get("reason", ""),
        })
    return normalized


def normalize_results(data) -> list[dict]:
    if isinstance(data, dict):
        if "history" in data:
            return data["history"]
        data = data.get("results", data.get("items", []))
    if not isinstance(data, list):
        raise SystemExit("Results must be a list or an object with results/items/history.")
    return data


def build_history(eval_set: list[dict], results: list[dict], description: str) -> list[dict]:
    # Accept either flat result rows or iteration records.
    if results and isinstance(results[0], dict) and "results" in results[0]:
        iterations = results
    else:
        iterations = [{"iteration": 0, "description": description, "results": results}]

    eval_by_query = {item["query"]: item for item in eval_set}
    history = []

    for idx, iteration in enumerate(iterations):
        rows = iteration.get("results", [])
        if not isinstance(rows, list):
            raise SystemExit(f"Iteration {idx} has invalid results field.")

        result_by_query = {row.get("query"): row for row in rows if isinstance(row, dict)}
        scored = []
        passed = 0

        for item in eval_set:
            row = result_by_query.get(item["query"], {})
            runs = int(row.get("runs", 1) or 1)
            triggers = int(row.get("triggers", 0) or 0)
            if "triggered" in row or "did_trigger" in row:
                triggered = bool(row.get("triggered", row.get("did_trigger", False)))
                if "triggers" not in row:
                    triggers = 1 if triggered else 0
            else:
                triggered = triggers >= max(1, (runs + 1) // 2)
            correct = bool(row.get("correct", triggered == item["should_trigger"]))
            if correct:
                passed += 1
            scored.append({
                "query": item["query"],
                "should_trigger": item["should_trigger"],
                "triggered": triggered,
                "correct": correct,
                "pass": correct,
                "triggers": triggers,
                "runs": runs,
                "reason": row.get("reason", item.get("reason", "")),
                "evidence": row.get("evidence", ""),
            })

        total = len(eval_set)
        history.append({
            "iteration": iteration.get("iteration", idx),
            "description": iteration.get("description", description),
            "passed": passed,
            "total": total,
            "train_passed": passed,
            "train_total": total,
            "results": scored,
            "train_results": scored,
        })

    return history


def main() -> int:
    parser = argparse.ArgumentParser(description="Score trigger eval results")
    parser.add_argument("--eval-set", required=True, type=Path, help="Path to trigger eval JSON")
    parser.add_argument("--results", required=True, type=Path, help="Path to trigger result JSON")
    parser.add_argument("--description", default="", help="Description tested by the results")
    parser.add_argument("--output", "-o", type=Path, help="Output JSON path")
    args = parser.parse_args()

    eval_set = normalize_eval_set(load_json(args.eval_set))
    raw_results = normalize_results(load_json(args.results))
    history = build_history(eval_set, raw_results, args.description)

    best = max(history, key=lambda item: item.get("passed", 0)) if history else {}
    output = {
        "original_description": args.description,
        "best_description": best.get("description", args.description),
        "best_score": best.get("passed", 0) / best.get("total", 1) if best else 0,
        "iterations_run": len(history),
        "train_size": len(eval_set),
        "test_size": 0,
        "history": history,
    }

    text = json.dumps(output, indent=2)
    if args.output:
        args.output.write_text(text + "\n")
        print(f"Generated: {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
