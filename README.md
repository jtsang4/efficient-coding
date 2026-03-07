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
| [`dev-browser`](skills/dev-browser/SKILL.md) | Automation | Browser/web automation: navigate pages, click/fill forms, take screenshots, scrape data, or test authenticated flows. |
| [`exa-web-search`](skills/exa-web-search/SKILL.md) | Research | Free AI web/code/company search via Exa MCP (no API key) when you need current information or code examples. |
| [`see`](skills/see/SKILL.md) | Integration | Integrate with S.EE APIs for short URLs, text sharing, and file sharing. |
| [`shape`](skills/shape/SKILL.md) | Product | Shape fuzzy ideas into clear product decisions and SPEC docs before coding. |
| [`ui-ux-pro-max-skill` (external bookmark)](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Reference (External) | UI/UX prompts/workflows reference; bookmark only (not included locally in this repo). |
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
- For browser interaction tasks (navigate/click/fill/screenshot/scrape), use `dev-browser`.
- For web/code/company research tasks, use `exa-web-search`.

<details>
<summary>Skill sources (optional)</summary>

This table lists the source repositories for skills installed/updated from external repos. The Notes column summarizes local customizations in this repo (if any).

| Skill | Source repo | Notes |
| --- | --- | --- |
| `brainstorming` | [`obra/superpowers`](https://github.com/obra/superpowers) | Worktree ops are delegated to `worktree-manager` (copy current working state). |
| `systematic-debugging` | [`obra/superpowers`](https://github.com/obra/superpowers) | If you need a dedicated worktree to isolate a repro, use `worktree-manager`. |
| `writing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) | Worktree ops are delegated to `worktree-manager` (copy current working state). |
| `executing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `subagent-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `test-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |

</details>

## Standards

These are the default engineering conventions recommended in this repo. The table stays flat on purpose so future specs can be added as new rows without changing the structure.

| Category | Applies to | Recommendation | Quick note | Reference |
| --- | --- | --- | --- | --- |
| Project layout | Go services/apps | [`golang-standards/project-layout`](https://github.com/golang-standards/project-layout) | Good default for larger Go codebases; common directories include `cmd`, `internal`, and `pkg`. Keep small projects simpler when the extra structure is unnecessary. | <https://github.com/golang-standards/project-layout> |
| Project layout | Frontend applications | [Feature-Sliced Design (FSD)](https://fsd.how/docs/get-started/overview/) | Organize by layers and business slices (for example `app`, `pages`, `features`, `entities`, `shared`) so frontend code stays easier to scale and evolve. | <https://fsd.how/docs/get-started/overview/> |
| Lint | Frontend / JS / TS | [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) | High-performance linter for large repos and CI; start with correctness-focused defaults, then enable stricter rules incrementally. | <https://oxc.rs/docs/guide/usage/linter.html> |
| i18n | React / frontend | [`react-i18next`](https://github.com/i18next/react-i18next) | Standard choice for React apps in the `i18next` ecosystem; supports hooks/components, namespaces, interpolation, and pluralization. | <https://github.com/i18next/react-i18next> |
| i18n | Go services/apps | [`go-i18n`](https://github.com/nicksnyder/go-i18n) | Use bundles plus locale files to manage translations in Go; supports plural forms, template variables, and CLI-based extract/merge workflows. | <https://github.com/nicksnyder/go-i18n> |

## Scripts

| Script | Purpose | Usage |
| --- | --- | --- |
| [`install-autojump-rs.sh`](scripts/install-autojump-rs.sh) | One-click installer for `autojump-rs` on macOS/Linux with `bash`/`zsh`/`fish` integration and an uninstall mode. | `bash scripts/install-autojump-rs.sh` or `bash scripts/install-autojump-rs.sh --uninstall` |

## Config

Recommended repo configuration:

| Config | Files | What it does | Notes |
| --- | --- | --- | --- |
| Worktrunk “copy from base” hook | `.config/wt.toml`, `scripts/wt-copy-from-base` | When Worktrunk creates a new worktree, it copies the current workspace state from the base worktree into the new one (instead of a completely clean worktree). | Makes it easy to carry along git-ignored files like local dependencies, `.env`, caches, etc. Pairs well with the `worktree-manager` skill. |

## License

MIT. See [`LICENSE`](LICENSE).
