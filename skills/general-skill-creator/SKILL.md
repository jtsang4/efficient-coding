---
name: general-skill-creator
description: Create, modify, evaluate, and package portable Agent Skills for coding agents. Use this skill when users want to create a skill from scratch, turn a workflow into a reusable skill, improve an existing skill, set up evals, compare skill behavior against a baseline, or optimize skill trigger descriptions across agent environments.
---

# General Skill Creator

A skill for creating portable Agent Skills and improving them through realistic test runs.

Agent Skills are reusable instruction packages for coding agents. A portable skill should rely on the shared skill pattern: a `SKILL.md` file with frontmatter, concise instructions, and optional bundled resources such as `scripts/`, `references/`, `assets/`, and `evals/`.

## Core Loop

Work through this loop:

1. Understand the user intent and the target agent environments.
2. Confirm where the skill should be installed or authored.
3. Draft or edit the skill.
4. Create realistic test prompts.
5. Run the prompts with the skill and against a baseline.
6. Help the user review qualitative outputs and quantitative checks.
7. Improve the skill from the feedback.
8. Repeat until the skill is useful, portable, and lean.

Use the current coding agent's native capabilities for execution. If the environment has subagents, use them for independent runs. If the environment has headless execution, use it for repeatable test runs. Headless execution means a non-interactive agent run launched by CLI, SDK, API, or task runner, where the prompt, inputs, workspace, and output path are provided up front.

## Communicating With The User

Match the user's level of technical detail. Explain terms such as "eval", "assertion", "headless", and "baseline" when the user seems new to agent workflows.

Keep the user involved at the decisions that shape portability:

- Which agents or agent families should the skill support?
- Where should the skill live: repository, user-level skills folder, organization-managed folder, or a custom path?
- Should the skill be authored once in a canonical directory and copied or linked into agent-specific locations?
- Should test runs prioritize quality, trigger accuracy, speed, or reproducibility?

## Capture Intent

Start by extracting answers from the current conversation when available. Ask for missing details only when they change the skill design.

Capture these details:

1. What should this skill enable an agent to do?
2. Which user phrases, tasks, files, domains, or contexts should trigger it?
3. What output should the user expect?
4. Which tools, credentials, files, services, or local dependencies does it need?
5. Which coding agents, repositories, or workspaces should be able to use it?
6. Where should the skill be installed or authored?
7. Should you create test cases and run an evaluation loop?

For installation, prefer early confirmation. If the user has no preference, recommend a canonical repository-local skill directory when the workspace already has one. If the workspace has no convention, suggest `skills/<skill-name>/` for source control and let the active coding agent handle any environment-specific installation or discovery path.

## Write The Skill

Create or edit a directory with this shape:

```text
skill-name/
├── SKILL.md
├── scripts/
├── references/
├── assets/
└── evals/
```

Only create optional directories that the skill actually needs.

`SKILL.md` should contain:

- `name`: kebab-case identifier.
- `description`: trigger guidance written for skill discovery.
- `compatibility`: optional note for required tools, runtimes, credentials, or environment assumptions.
- Body instructions: the workflow the agent should follow.
- Resource pointers: when to read files from `references/`, when to run scripts, and how to use assets.

### Description Guidance

The `description` is the main discovery signal. Write it around user intent, task context, and trigger phrases. Include nearby cases where the skill should trigger even when the user omits the exact skill name.

Good descriptions answer:

- What task does the skill help with?
- Which user requests should trigger it?
- Which adjacent requests should also trigger it because the workflow is useful?
- Which dependency or domain constraints matter?

Keep the description specific enough to beat nearby skills in selection and broad enough to catch natural user phrasing.

### Progressive Disclosure

Use progressive disclosure:

1. Metadata stays small and always visible.
2. `SKILL.md` gives the core workflow.
3. Bundled resources hold long references, templates, scripts, schemas, examples, and generated assets.

Keep `SKILL.md` readable. Move long reference material into `references/` and point to it from the relevant section. Put deterministic or repetitive work into `scripts/` so future agent runs can reuse it.

### Portability Rules

Write skills for the current agent and future agents:

- Use generic terms such as "current coding agent", "subagent", "headless run", "workspace", "tool call", and "artifact".
- Describe what the agent must accomplish, then let the runtime decide which native mechanism, tool, API, or UI action to use.
- Put agent-specific invocation examples in a separate reference only when the user explicitly asks for them.
- Keep paths configurable. Ask for install location early and record the chosen path in the work notes or eval metadata.
- Prefer standard filesystem artifacts for generated outputs and review materials.
- Make telemetry optional. Capture tokens, duration, tool counts, and logs when the environment exposes them; leave fields empty when unavailable.

### Safety And Trust

Create skills whose contents match the user's stated intent. Refuse requests for skills that enable unauthorized access, credential theft, malware, covert data extraction, or deception. For sensitive workflows, include explicit user confirmation steps and clear handling of credentials or private data.

## Test Cases

After drafting the skill, create 2-3 realistic test prompts. Use real-world phrasing with enough context to exercise the skill.

Save test cases to `evals/evals.json`:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "name": "descriptive-case-name",
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": [],
      "expectations": []
    }
  ]
}
```

Draft expectations while runs are in progress. Good expectations are objectively checkable and specific to outcomes the user cares about. Subjective skills can use human review as the primary signal.

See `references/schemas.md` when you need the shared JSON shapes for eval metadata, grading, benchmark data, feedback, and telemetry.

## Running And Evaluating Test Cases

Run each test in at least two configurations:

- `with_skill`: the task is executed with the draft skill available and explicitly in scope.
- `baseline`: the same task is executed without the draft skill for new skills, or with the previous skill version for improvements.

Use independent execution when available:

- Use subagents for parallel paired runs.
- Use fresh headless sessions for repeatable isolated runs.
- Use serial manual runs when the environment only supports one active execution context.

Put results in a workspace next to the skill directory:

```text
<skill-name>-workspace/
└── iteration-1/
    └── eval-1-descriptive-case-name/
        ├── eval_metadata.json
        ├── with_skill/
        │   └── run-1/
        │       ├── outputs/
        │       ├── transcript.md
        │       ├── grading.json
        │       └── timing.json
        └── baseline/
            └── run-1/
                ├── outputs/
                ├── transcript.md
                ├── grading.json
                └── timing.json
```

For each run, instruct the executor to:

```text
Execute this task:
- Skill: <path or installed skill name for the with_skill run; "none" for baseline>
- Task: <eval prompt>
- Input files: <files, or "none">
- Save outputs to: <iteration-dir>/<eval-dir>/<configuration>/run-1/outputs/
- Save a brief transcript to: <iteration-dir>/<eval-dir>/<configuration>/run-1/transcript.md
- Save any available telemetry to: <iteration-dir>/<eval-dir>/<configuration>/run-1/timing.json
```

Telemetry is useful for cost and stability analysis. Capture what the runtime exposes:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "tool_calls": 18,
  "notes": "Fields are optional and depend on the active agent runtime."
}
```

## Grading

Grade each run against the expectations in the eval metadata. Use a grader subagent when available; otherwise grade inline. Programmatic checks are preferred for deterministic outputs.

Use `agents/grader.md` as the grading prompt when running a grader subagent or grading inline.

Save `grading.json` in each run directory:

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
  }
}
```

After grading, aggregate results into a benchmark summary with pass rates, qualitative notes, and any available telemetry. Keep `with_skill` and `baseline` side by side so the user can see the skill's actual contribution.

Use the bundled aggregation script when the workspace follows the layout above:

```bash
cd <general-skill-creator-path>
python -m scripts.aggregate_benchmark <skill-workspace>/iteration-1 --skill-name <skill-name>
```

Ask an analyzer subagent to read `agents/analyzer.md` when you want a deeper pass over benchmark patterns, flaky assertions, and resource-usage outliers.

## Human Review

Show the user the outputs before revising the skill. Use whatever presentation mechanism the current environment supports:

- Local HTML viewer.
- Markdown report.
- Filesystem links.
- Inline excerpts with output paths.
- Agent-native artifact preview.

Prefer the bundled review viewer when a local filesystem and Python are available:

```bash
python <general-skill-creator-path>/eval-viewer/generate_review.py \
  <skill-workspace>/iteration-1 \
  --skill-name "<skill-name>" \
  --benchmark <skill-workspace>/iteration-1/benchmark.json
```

For headless environments, use the viewer's `--static <output_path>` option and share the generated HTML file through the environment's normal artifact mechanism.

Give the user a simple review structure:

- Prompt that was tested.
- Output produced with the skill.
- Baseline or previous-version output.
- Formal expectation results.
- Place for comments.

Save feedback as `feedback.json` when possible:

```json
{
  "reviews": [
    {
      "run_id": "invoice-summary-with_skill",
      "feedback": "The totals are correct, but the summary should mention overdue invoices.",
      "timestamp": "2026-01-15T10:30:00Z"
    }
  ],
  "status": "complete"
}
```

Empty feedback means the output was acceptable.

## Improving The Skill

Use feedback to improve general behavior across future tasks:

1. Read user feedback, graded failures, transcripts, and repeated patterns.
2. Separate prompt wording issues from missing resources or missing scripts.
3. Add bundled scripts when multiple runs recreate the same helper logic.
4. Move long examples or domain references out of `SKILL.md`.
5. Tighten the description when the skill fails to trigger for relevant prompts.
6. Narrow the description when the skill triggers for nearby tasks better served by another skill.
7. Rerun the evals into a new iteration directory.

Favor durable workflow guidance over overfitting to a single eval prompt. Explain why each important instruction matters so future agents can adapt when details vary.

## Description Optimization

Optimize the description after the skill works well on task quality.

Create a trigger eval set with 16-20 realistic queries:

```json
[
  {
    "query": "the user prompt",
    "should_trigger": true,
    "reason": "Why this request needs the skill"
  },
  {
    "query": "near-miss prompt",
    "should_trigger": false,
    "reason": "Why another workflow fits better"
  }
]
```

Use a mix of:

- Direct requests naming the skill or domain.
- Casual requests that imply the workflow.
- Messy real prompts with file paths, project context, abbreviations, and partial information.
- Near misses that share vocabulary with the skill.
- Requests where a general agent can solve the task without this skill.

Run trigger evaluation with the current agent's native skill discovery behavior when available. A strong trigger test installs or exposes the skill the same way real users will use it, sends realistic prompts, and records whether the agent consulted the skill.

If the runtime exposes no trigger trace, use a proxy signal:

- The transcript mentions reading or following the skill.
- Outputs reflect skill-specific required steps.
- The agent was explicitly asked to explain which skill it selected.
- A separate reviewer judges whether the behavior indicates skill use.

Apply the best description after reviewing train and held-out results. Show the user the before/after description and the trigger accuracy.

Use `assets/eval_review.html` to let the user review and edit trigger queries. Replace these placeholders:

- `__EVAL_DATA_PLACEHOLDER__`: JSON array of trigger eval items.
- `__SKILL_NAME_PLACEHOLDER__`: the skill name.
- `__SKILL_DESCRIPTION_PLACEHOLDER__`: the current description.

When trigger runs are complete, save a result file with rows like:

```json
[
  {
    "query": "User-like prompt",
    "triggered": true,
    "evidence": "Transcript shows the agent loaded SKILL.md"
  }
]
```

Then score the results:

```bash
cd <general-skill-creator-path>
python -m scripts.score_trigger_results \
  --eval-set <trigger-evals.json> \
  --results <trigger-results.json> \
  --description "<description being tested>" \
  --output <trigger-score.json>

python -m scripts.generate_report <trigger-score.json> --skill-name <skill-name> -o <trigger-report.html>
```

The scoring script evaluates trigger decisions only. The active coding agent remains responsible for running prompts through its native skill discovery path.

Generate a description-improvement prompt when trigger failures show clear patterns:

```bash
cd <general-skill-creator-path>
python -m scripts.improve_description \
  --skill-path <path/to/skill-folder> \
  --trigger-score <trigger-score.json> \
  --output <description-improvement-prompt.md>
```

## Packaging And Installation

Confirm installation target before packaging or copying files:

- Repository-local source directory.
- User-level skill directory.
- Team or organization-managed skill directory.
- Custom path supplied by the user.
- Multiple targets from the same canonical source.

When packaging, use a portable archive or the agent's standard skill package format if one exists. Include `SKILL.md` and needed bundled resources. Exclude eval workspaces, temporary files, generated benchmarks, local credentials, caches, and dependency folders.

Use `scripts/package_skill.py` for a portable `.skill` archive:

```bash
cd <general-skill-creator-path>
python -m scripts.package_skill <path/to/skill-folder> <output-directory>
```

After installation, run a small smoke test in the target environment to verify the skill is discoverable and usable.

## Updating Existing Skills

When improving an existing skill:

1. Preserve the original skill name unless the user explicitly requests a rename.
2. Snapshot the original version before editing.
3. Keep user-created files and local changes intact.
4. Compare the new version against the snapshot or previous best version.
5. Package or install only after the user accepts the improved version.

## Bundled Resources

Use these bundled resources:

- `agents/grader.md`: grade expectations against transcripts and outputs.
- `agents/comparator.md`: compare two outputs blindly.
- `agents/analyzer.md`: analyze benchmark patterns or explain why one version beat another.
- `assets/eval_review.html`: review and edit trigger eval queries with the user.
- `eval-viewer/generate_review.py`: generate or serve a human review UI for eval outputs.
- `scripts/aggregate_benchmark.py`: aggregate `grading.json` files into `benchmark.json` and `benchmark.md`.
- `scripts/generate_report.py`: render description trigger optimization reports.
- `scripts/score_trigger_results.py`: score trigger eval results collected from any coding agent.
- `scripts/run_eval.py`: compatibility wrapper around generic trigger result scoring.
- `scripts/improve_description.py`: generate a portable prompt for improving a trigger description.
- `scripts/quick_validate.py`: validate `SKILL.md` frontmatter and basic skill shape.
- `scripts/package_skill.py`: package a skill directory into a portable archive.
- `references/schemas.md`: JSON structures for evals, grading, benchmarks, feedback, trigger evals, and telemetry.

## Final Checklist

Before handing the skill back:

- `SKILL.md` has valid frontmatter and a clear description.
- Instructions are portable across coding agents.
- Installation target is recorded.
- Optional resources are referenced from the body.
- Evals cover realistic use cases and near misses.
- The skill beats or meaningfully improves on the baseline.
- Any unavailable telemetry is clearly marked as unavailable.
- Packaging excludes local credentials, eval workspaces, caches, and build output.
