# General Skill Creator Schemas

These schemas define portable files used by the General Skill Creator workflow. Fields marked optional depend on the active coding agent runtime.

## evals/evals.json

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "name": "descriptive-case-name",
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": ["evals/files/input.csv"],
      "expectations": [
        "The output contains a valid CSV header",
        "The summary includes the three largest anomalies"
      ]
    }
  ]
}
```

Fields:

- `skill_name`: name matching `SKILL.md` frontmatter.
- `evals[].id`: stable integer identifier.
- `evals[].name`: readable case name used for folders and reports.
- `evals[].prompt`: user-like task prompt.
- `evals[].expected_output`: human-readable success description.
- `evals[].files`: optional input files, relative to the skill root.
- `evals[].expectations`: checkable success statements.

## eval_metadata.json

```json
{
  "eval_id": 1,
  "eval_name": "descriptive-case-name",
  "prompt": "User's task prompt",
  "configuration": "with_skill",
  "skill_reference": "/absolute/path/to/skill",
  "baseline_reference": "none",
  "assertions": [
    {
      "text": "The output contains a valid CSV header",
      "method": "programmatic"
    }
  ]
}
```

Fields:

- `eval_id`: stable eval identifier.
- `eval_name`: readable eval name.
- `prompt`: prompt sent to the executor.
- `configuration`: `with_skill`, `baseline`, `old_skill`, or another named comparison.
- `skill_reference`: optional installed skill name or path.
- `baseline_reference`: optional previous version, snapshot, or baseline description.
- `assertions`: optional structured expectations.

## timing.json

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "tool_calls": 18,
  "executor_start": "2026-01-15T10:30:00Z",
  "executor_end": "2026-01-15T10:32:45Z",
  "notes": "Runtime-specific telemetry can be omitted when unavailable."
}
```

Fields are optional. Use the metrics exposed by the active agent runtime.

## grading.json

```json
{
  "expectations": [
    {
      "text": "The output includes a valid CSV with a header row",
      "passed": true,
      "evidence": "outputs/report.csv has headers: date, amount, category"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 0,
    "total": 1,
    "pass_rate": 1.0
  },
  "notes": [
    "The output is correct, but the transcript shows repeated manual parsing that could become a helper script."
  ]
}
```

Fields:

- `expectations[]`: graded checks with evidence.
- `summary`: aggregate pass/fail totals.
- `notes`: optional reviewer observations.

## benchmark.json

```json
{
  "metadata": {
    "skill_name": "example-skill",
    "skill_path": "/path/to/example-skill",
    "agent_environment": "current coding agent",
    "timestamp": "2026-01-15T10:30:00Z",
    "evals_run": [1, 2, 3]
  },
  "runs": [
    {
      "eval_id": 1,
      "eval_name": "descriptive-case-name",
      "configuration": "with_skill",
      "result": {
        "pass_rate": 1.0,
        "passed": 3,
        "failed": 0,
        "total": 3,
        "time_seconds": 42.5,
        "tokens": 3800,
        "tool_calls": 18,
        "errors": 0
      },
      "expectations": [
        {
          "text": "The output includes a valid CSV with a header row",
          "passed": true,
          "evidence": "outputs/report.csv has headers."
        }
      ],
      "notes": []
    }
  ],
  "summary": {
    "with_skill": {
      "pass_rate": {
        "mean": 0.92
      }
    },
    "baseline": {
      "pass_rate": {
        "mean": 0.58
      }
    }
  }
}
```

Use available result fields. Leave unavailable metrics out of the result object.

## feedback.json

```json
{
  "reviews": [
    {
      "run_id": "descriptive-case-name-with_skill",
      "feedback": "The result is correct, but the final answer should mention the output file path.",
      "timestamp": "2026-01-15T10:30:00Z"
    }
  ],
  "status": "complete"
}
```

Fields:

- `reviews[].run_id`: run identifier.
- `reviews[].feedback`: user feedback. Empty feedback means accepted.
- `reviews[].timestamp`: review time.
- `status`: `draft`, `complete`, or another workflow state used by the active environment.

## trigger-evals.json

```json
[
  {
    "query": "User-like prompt that should trigger the skill",
    "should_trigger": true,
    "reason": "This request needs the skill workflow."
  },
  {
    "query": "Near-miss prompt that should use another workflow",
    "should_trigger": false,
    "reason": "This request is adjacent but belongs elsewhere."
  }
]
```

Use realistic prompts with project context, file names, informal phrasing, and edge cases.
