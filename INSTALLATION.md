# Installation / Update (for coding agents)

This repository is intended to be used as an “overlay” that you copy into an existing (often older) codebase to bootstrap:

- Codex/Codex CLI configuration (`.codex/`)
- Reusable agent skills/playbooks (`.agents/`)
- Optional Worktrunk hook for cloning the current dirty worktree state (`.config/wt.toml` + `scripts/wt-copy-from-base`)

Your job as an agent is to install or update these files in the *target repository* with minimal disruption.

## What to install

Install these paths into the target repo (create directories as needed):

- `.agents/`
- `.codex/config.toml`
- `.codex/skills/` (symlinks to `../../.agents/skills/*` in this repo; see “Symlinks” below)
- `.config/wt.toml` (optional; only if the repo uses Worktrunk)
- `scripts/wt-copy-from-base` (optional; only if the repo uses Worktrunk; must remain executable)

## Install (fresh)

Run in the target repo root.

1. Fetch the overlay to a temporary directory:

```bash
tmp="$(mktemp -d)"
git clone --depth 1 https://github.com/jtsang4/efficient-coding.git "$tmp/efficient-coding"
```

2. Copy the overlay files into the target repo:

```bash
src="$tmp/efficient-coding"

mkdir -p .agents .codex

# Prefer rsync if available (preserves symlinks + executable bit).
if command -v rsync >/dev/null 2>&1; then
  rsync -a "$src/.agents/" .agents/
  rsync -a "$src/.codex/" .codex/
else
  cp -a "$src/.agents/." .agents/
  cp -a "$src/.codex/." .codex/
fi
```

3. (Optional) Install Worktrunk hook + copy helper (only if the target repo uses Worktrunk):

```bash
src="$tmp/efficient-coding"

mkdir -p .config scripts

if command -v rsync >/dev/null 2>&1; then
  rsync -a "$src/.config/" .config/
  rsync -a "$src/scripts/wt-copy-from-base" scripts/wt-copy-from-base
else
  cp -a "$src/.config/." .config/
  cp -a "$src/scripts/wt-copy-from-base" scripts/wt-copy-from-base
fi

chmod +x scripts/wt-copy-from-base || true
```

4. Resolve conflicts (if any):

- If the target repo already has `.codex/config.toml`, merge MCP server entries instead of blindly overwriting.
- If the target repo already has `.config/wt.toml`, merge hooks carefully.
- If the target repo already has `.agents/` content, keep both; do not delete local-only skills.

5. Optional verification:

- Confirm `.codex/config.toml` exists and is valid TOML.
- Confirm `scripts/wt-copy-from-base` is executable.
- If Worktrunk is used, confirm `.config/wt.toml` is present.

## Update (existing install)

Run in the target repo root.

1. Re-fetch the overlay:

```bash
tmp="$(mktemp -d)"
git clone --depth 1 https://github.com/jtsang4/efficient-coding.git "$tmp/efficient-coding"
```

2. Update files by *merging* rather than replacing when local changes are present:

- For directories like `.agents/`, prefer adding new skills and updating existing ones; do not delete target-repo-specific content.
- For single files (`.codex/config.toml`, `.config/wt.toml`), do a content merge:
  - Keep existing local entries.
  - Add new entries from the overlay.
  - If both define the same key, keep the target repo’s value unless the overlay is explicitly meant to replace it.

3. Ensure the Worktrunk script remains executable:

```bash
chmod +x scripts/wt-copy-from-base || true
```

## Symlinks (`.codex/skills/*`)

In this repo, `.codex/skills/*` are symlinks pointing into `.agents/skills/*` to avoid duplication.

When installing into a target repo:

- If symlinks are supported and preserved by your copy method, keep them as-is.
- If symlinks are not supported (common on Windows), replace them by copying the real directories:
  - Create `.codex/skills/<skill>/...` as real directories containing the same contents as `.agents/skills/<skill>/...`.

## Notes / constraints

- Do not overwrite `.git/` or any worktree metadata.
- Prefer minimal diffs: only touch the paths listed above unless the target repo explicitly asks for more.
- If you change behavior (e.g., Worktrunk hooks), leave a short note in the PR/summary of what changed and how to disable it.
