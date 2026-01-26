# Efficient Coding

English | [中文](README_ZH.md)

## Worktree

Using [Worktrunk](https://worktrunk.dev/) to manage Worktrees enables parallel feature development and copying a “dirty state” that includes dependencies and uncommitted changes. The relevant config file is located at [.config/wt.toml].

Goal:
- When creating a new worktree, directly copy the current uncommitted state to make it easy to compare multiple approaches.

Details:
- The `post-create` hook in `.config/wt.toml` runs after `wt switch --create` creates a new worktree.
- When `base_worktree_path` is available, the hook runs `scripts/wt-copy-from-base` to copy the base worktree's working directory into the new worktree (excluding `.git`). It prefers fast copy-on-write methods when available (macOS/APFS: `ditto --clones`; Linux: `cp --reflink=auto`) and falls back to `rsync`.
- Recommend using `--base=@` so the base is the current worktree, which reliably triggers the copy.
- If the branch specified by `--base` has no corresponding worktree, nothing is copied.

Usage:
- Create a new worktree from the current state: `wt switch --create idea-a --base=@`
- Create multiple comparison worktrees from the same state: `wt switch --create idea-b --base=@`
- Get a clean working tree (skip copy): `wt switch --create clean --base=@ --no-verify`

Notes:
- `--no-verify` skips all hooks.
- Requires at least one of: `ditto` (macOS), `cp` with reflink support (some Linux filesystems), or `rsync`.
- If you don't want to copy dependencies, set `WT_COPY_EXCLUDES` in `.config/wt.toml` (e.g. `WT_COPY_EXCLUDES="node_modules .cache" ...`).

## MCP Servers

| Server | Purpose | Transport | Config | Source |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | Fetch web page content using a Playwright headless browser. | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |
