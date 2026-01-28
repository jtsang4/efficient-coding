# Efficient Coding

English | [中文](README_ZH.md)

This repo contains:
- Optional MCP server configuration.
- Reusable agent skills/playbooks you can install via `bunx skills add`.

## MCP Servers

| Server | Purpose | Transport | Command | Source |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | Fetch web page content using a Playwright headless browser. | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |

To use an MCP server, add it to your coding agent’s MCP configuration. A generic example config lives at `.mcp.json`.

## Skills

Skills are reusable capability/workflow/methodology playbooks you can invoke to approach a task (e.g. planning, debugging, TDD).

| Skill | Category | When to use |
| --- | --- | --- |
| [`brainstorming`](skills/brainstorming/SKILL.md) | Workflow | New feature / unclear requirements; produce a design/spec first. |
| [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | Workflow | Bugs, flakes, or “unexpected behavior”; find root cause before fixing. |
| [`writing-plans`](skills/writing-plans/SKILL.md) | Workflow | Approach is decided; turn it into an executable plan with steps + verification. |
| [`executing-plans`](skills/executing-plans/SKILL.md) | Execution | Run a written plan in small batches with review checkpoints. |
| [`subagent-driven-development`](skills/subagent-driven-development/SKILL.md) | Execution | Run a plan in-session: one subagent per task + spec/quality review loops. |
| [`test-driven-development`](skills/test-driven-development/SKILL.md) | Implementation | Any feature/bugfix/refactor: Red → Green → Refactor (no code without a failing test). |
| [`worktree-manager`](skills/worktree-manager/SKILL.md) | Workflow | Worktree management via Worktrunk (`wt`): switch/create/list/merge/remove with safety guardrails. |

### Install

- `bunx skills add http://github.com/jtsang4/efficient-coding --skill brainstorming`
- Template: `bunx skills add http://github.com/jtsang4/efficient-coding --skill <skill>`

### Use

- If you want a specific skill, say so explicitly (named skill wins).
- If multiple skills apply, default to workflow first: `brainstorming`/`systematic-debugging` → `writing-plans` → execute (`executing-plans` | `subagent-driven-development`) → `test-driven-development` inside each task.
- For bugs: `systematic-debugging` → add a failing test → fix with `test-driven-development`.

<details>
<summary>Skill sources (optional)</summary>

This table lists the source repositories for skills installed/updated from external repos. The Notes column summarizes local customizations in this repo (if any).

Install/update template: `bunx skills add <source_repo> --skill <skill>` (example: `bunx skills add http://github.com/jtsang4/efficient-coding --skill brainstorming`)

| Skill | Source repo | Notes |
| --- | --- | --- |
| `brainstorming` | [`obra/superpowers`](https://github.com/obra/superpowers) | Worktree ops are delegated to `worktree-manager` (copy current working state). |
| `systematic-debugging` | [`obra/superpowers`](https://github.com/obra/superpowers) | If you need a dedicated worktree to isolate a repro, use `worktree-manager`. |
| `writing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) | Worktree ops are delegated to `worktree-manager` (copy current working state). |
| `executing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `subagent-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `test-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |

</details>

## Config

Recommended repo configuration:

| Config | Files | What it does | Notes |
| --- | --- | --- | --- |
| Worktrunk “copy from base” hook | `.config/wt.toml`, `scripts/wt-copy-from-base` | When Worktrunk creates a new worktree, it copies the current workspace state from the base worktree into the new one (instead of a completely clean worktree). | Makes it easy to carry along git-ignored files like local dependencies, `.env`, caches, etc. Pairs well with the `worktree-manager` skill. |

## License

MIT. See [`LICENSE`](LICENSE).
