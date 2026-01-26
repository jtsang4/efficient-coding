# Efficient Coding

English | [中文](README_ZH.md)

## Installation

Prerequisites:
- [Worktrunk (`wt`)](https://worktrunk.dev/): Worktree manager; can be used with `.config/wt.toml`.

Paste this to Codex (or any coding agent) in your target repo and ask it to run it:

```
Install (or update) the "efficient-coding" overlay in this repository by following https://github.com/jtsang4/efficient-coding/blob/main/INSTALLATION.md . Make minimal, safe changes; merge (don’t overwrite) if local `.codex/config.toml` or `.config/wt.toml` already exist.
```

## Worktree

Using [Worktrunk](https://worktrunk.dev/) to manage Worktrees enables parallel feature development and copying a “dirty state” that includes dependencies and uncommitted changes. The relevant config file is located at [.config/wt.toml].

Goal:
- When creating a new worktree, directly copy the current uncommitted state to make it easy to compare multiple approaches.

Details:
- The `post-create` hook in `.config/wt.toml` runs after `wt switch --create` creates a new worktree.
- When `base_worktree_path` is available, the hook runs `scripts/wt-copy-from-base` to copy the base worktree's working directory into the new worktree (excluding `.git`). Prefers copy-on-write methods when available and falls back to `rsync`.
- Recommend using `--base=@` so the base is the current worktree, which reliably triggers the copy.
- If the branch specified by `--base` has no corresponding worktree, nothing is copied.

Usage:
- Create a new worktree from the current state: `wt switch --create idea-a --base=@`
- Create multiple comparison worktrees from the same state: `wt switch --create idea-b --base=@`
- Get a clean working tree (skip copy): `wt switch --create clean --base=@ --no-verify`

Notes:
- `--no-verify` skips all hooks.
- Requires at least one of: macOS `cp`/`ditto`, GNU `cp` with reflink support (some Linux filesystems), or `rsync`.
- If you don't want to copy dependencies, set `WT_COPY_EXCLUDES` in `.config/wt.toml` (e.g. `WT_COPY_EXCLUDES="node_modules .cache" ...`).

## MCP Servers

| Server | Purpose | Transport | Config | Source |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | Fetch web page content using a Playwright headless browser. | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |

## Skills

Skills are reusable capability/workflow/methodology playbooks you can invoke to approach a task (e.g. planning, debugging, TDD).

| Skill | Category | When to use |
| --- | --- | --- |
| [`brainstorming`](.codex/skills/brainstorming/SKILL.md) | Workflow | New feature / unclear requirements; produce a design/spec first. |
| [`systematic-debugging`](.codex/skills/systematic-debugging/SKILL.md) | Workflow | Bugs, flakes, or “unexpected behavior”; find root cause before fixing. |
| [`writing-plans`](.codex/skills/writing-plans/SKILL.md) | Workflow | Approach is decided; turn it into an executable plan with steps + verification. |
| [`executing-plans`](.codex/skills/executing-plans/SKILL.md) | Execution | Run a written plan in small batches with review checkpoints. |
| [`subagent-driven-development`](.codex/skills/subagent-driven-development/SKILL.md) | Execution | Run a plan in-session: one subagent per task + spec/quality review loops. |
| [`test-driven-development`](.codex/skills/test-driven-development/SKILL.md) | Implementation | Any feature/bugfix/refactor: Red → Green → Refactor (no code without a failing test). |

### How to use

- If you want a specific skill, say so explicitly (named skill wins).
- Capability/tool skills: use them directly where needed; if unsure, start with a workflow skill to clarify scope and acceptance criteria.
- If multiple skills apply, default to workflow first: `brainstorming`/`systematic-debugging` → `writing-plans` → execute (`executing-plans` | `subagent-driven-development`) → `test-driven-development` inside each task.
- Pipelines: unclear feature → `brainstorming` → `writing-plans`; big/coordination-heavy → `executing-plans`; many independent tasks → `subagent-driven-development`.
- If you catch yourself thinking “too simple for process”, treat that as the trigger to use the workflow skill anyway.
- For bugs: `systematic-debugging` → add a failing test → fix with `test-driven-development`.
