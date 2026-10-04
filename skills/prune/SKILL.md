---
name: prune
description: Periodically slim down and restructure a project built largely by AI agents — remove dead code, duplicate implementations, abandoned approaches, unused features and APIs, over-defensive and over-abstracted code, and drifted docs, and fix the architectural causes that keep regrowing them — while preserving behavior, then record the run in a dated ledger. Use when the user invokes prune, asks for a cleanup, slimming, or architecture refactoring pass over a project, or says the codebase has grown bloated or tangled. Not for polishing a single recent diff or for feature work.
---

# Prune

Agents add code more readily than they remove it. Each session solves its task locally: it writes a helper instead of finding the existing one, guards against failures that cannot happen, keeps the old path "just in case", and narrates the change in a comment. When the architecture gives code no obvious home, the same concept gets rebuilt in every corner. Over time, the project accumulates more code, concepts, and dependencies than its behavior needs.

This skill fights that entropy in periodic passes, from removing a dead function up to restructuring modules. The goal is a **net reduction** in what a reader must understand — fewer lines, files, concepts, and dependencies — with behavior unchanged except where the user explicitly agrees to remove a feature. Making code merely prettier is not the goal. A change that adds structure must pay for itself with measurable reduction: concepts merged, duplicates eliminated, dependency rules that stop a smell from recurring.

The skill operates on the current working tree and branch as it finds them. It does not create branches or worktrees; isolation is the caller's responsibility.

## Scope

By default, every run surveys the whole project and considers every class of change. The user does not need to pass anything.

Narrow the run only when the user asks for it in their own words, e.g. "only `src/server`", "just what changed since last time", "only the safe stuff, don't ask me". Map such requests onto the knobs below and state the resulting scope at the start of the run:

- **Paths** — survey only the given paths. Candidates are still checked against the whole repository for duplicates and references.
- **Since last run** — survey only files changed since the most recent run record's end commit. If that commit is not an ancestor of `HEAD`, fall back to the record's date with `git log --since` and note the fallback.
- **Mechanical only** — execute mechanical items without the confirmation stop; record everything else as deferred.

## Ledger

Each run is recorded in the project, and the records are committed:

- `docs/prune/YYYY-MM-DD.md` — one record per run, created from `references/run-record-template.md`. A second run on the same day uses `YYYY-MM-DD-2.md`. Records are append-only history: never edit a past run's record.
- `docs/prune/keep.md` — the current list of **assets**, **external contracts**, and **intentional complexity** that passes must not prune, created from `references/keep-template.md`. This is a state document, not a log: update entries in place and delete entries whose code no longer exists.

`docs/prune/` itself is never surveyed.

## 0. Baseline

1. Read `docs/prune/keep.md` and recent run records, if they exist. Collect deferred items and open architecture proposals; they re-enter this run's triage.
2. Note any uncommitted changes. Never stage, modify, or revert them; skip any candidate that would touch a file that has them.
3. Discover the project's verification commands (test, typecheck, lint, build) from agent instruction files, package manifests, Makefiles, and CI config. Run them and record the result as the baseline:
   - All green: the rule for the run is "stays green".
   - Some tests already fail: record them; the rule becomes "no new failures".
   - Build or typecheck cannot run at all: stop and report. Behavior preservation cannot be verified.
4. Record baseline metrics: tracked lines of code, file count, direct dependency count, and the architecture metrics from `references/smell-catalog.md` section E (dependency cycles, layer violations).

## 1. Survey (read-only)

Work through every smell category in `references/smell-catalog.md`, including the architecture lens. Prefer parallel fresh-context subagents, one per category group, each returning candidates with evidence. Use the catalog's detection tools via ephemeral runners (`bunx`, `npx`, `uvx`, `go run`); never add them to the project's dependencies.

Every candidate must carry evidence: the location, why it is prunable (reference counts, tool output, the duplicate it shadows, the dependency graph), and the estimated reduction. A candidate without evidence is dropped.

Before keeping a candidate, check it against `keep.md`, the asset rules below, and the catalog's false-positive list. Assets that the survey discovers but `keep.md` lacks are reported as proposed `keep.md` entries, never as candidates.

Look for causes, not only symptoms: when several candidates share one root — duplicates that exist because there is no shared module, guards repeated because validation has no boundary, features tangled because two modules own one concept — group them under a single architecture candidate.

## 2. Triage

Classify each surviving candidate:

- **Mechanical** — removal or merge whose behavior preservation is provable by tooling and verification: unreferenced code, unused dependencies, exact duplicates, stale comments, settled flags. Executed unless the user objects.
- **Structural** — local reshaping or removal of behavior: collapsing a single-implementation abstraction, merging near-duplicates with differing details, removing defensive paths, deleting unused features or internal APIs, collapsing a pass-through layer or merging two modules that own the same concept. Executed if the user selects it.
- **Architecture** — introduces or redraws structure: splitting a god module, establishing a boundary or layer, moving a concept to a single owner, inverting a dependency, reorganizing directories, or replacing the framing of a problem whose current solution keeps accumulating special cases. Each needs a design proposal (section 3) and the user's approval.

In default mode, present one triage report:

- A table of mechanical and structural candidates: candidate, class, evidence, estimated reduction, risk, how it will be verified. Order by reduction per unit of risk.
- One design proposal per architecture candidate.
- Proposed `keep.md` additions.

Wait for the user's response once. Architecture proposals may need discussion; revise them until the user approves or declines each one. Then execute: mechanical items not objected to, structural items selected, architecture proposals approved.

There is no fixed budget, but take only what can be completed and verified in this run. Everything else goes to the record's deferred list.

## 3. Architecture Proposals

A proposal answers, concisely:

- **Problem** — what is tangled, with evidence: dependency graph excerpts, cycle and violation counts, the duplicates or guards this structure keeps producing, how often the smell recurred across past runs.
- **Target** — the structure after the change, and the rule it establishes (e.g. "`domain/` imports nothing from `ui/`", "all HTTP calls go through `api/client`").
- **Options** — when real alternatives exist, two or three with trade-offs, and a recommendation. Doing nothing is always an option; say what it costs.
- **Migration** — ordered steps, each leaving the project building and green.
- **Payoff** — expected reduction in lines, concepts, duplicates, cycles, and violations, and which recurring smells it should stop.
- **Verification** — the tests, plus a mechanical check of the target rule (a dependency-graph query or a lint rule) that fails before and passes after.
- **Risk** — what could break that the tests do not cover, and the external contracts and assets involved.

## 4. Execute

Order: mechanical, then structural, then architecture. Cleaning first makes the structure easier to see and move.

For every item:

- Follow the project's commit message convention. Stage only the files the item touches.
- After each commit, run the verification commands.
- Never mix in feature work, behavior changes the user did not approve, or formatting churn.
- When removing code, remove its whole trail: imports, tests that only exercised it, config entries, docs mentions, and now-unused dependencies.

For mechanical and structural items:

- One candidate per commit. If anything regresses, revert that commit, mark the candidate failed with the reason, and move on. Do not patch forward.
- If a change grows the net line count, justify it in the record or drop it.

For architecture items:

- One commit per migration step. A failing step may be fixed within its own scope; if it cannot be, revert the whole migration.
- **Land it fully or not at all.** Never leave the old and new structure coexisting: two ways of doing one thing is the very entropy this skill removes. If the migration cannot finish in this run, revert it and record the proposal as deferred with what was learned.
- After the last step, run the target rule's mechanical check and record before/after metrics. If the payoff did not materialize, say so in the record; do not claim it.
- When the target rule can be enforced with tooling the project already uses (an existing linter, an existing dependency checker config), add the rule there so the structure holds. Introducing a new tool for it is a proposal for the user, not an automatic step.

## 5. Independent Review

Dispatch a fresh-context subagent with `references/reviewer-prompt.md`, the baseline commit, the selected structural items, and the approved architecture proposals. It reviews the whole diff for unintended behavior changes, asset violations, and incomplete migrations. It reports; it fixes nothing.

Resolve every finding marked `regression`: revert the offending change or confirm with the user that it was intended. Re-run the review after material changes.

## 6. Record and Feed Back

1. Write the run record from `references/run-record-template.md`: scope with start and end commits, baseline and final verification results, metrics before and after, executed items with commits, failed and deferred items, architecture proposals with their outcome.
2. Update `keep.md`: add newly confirmed assets, contracts, and intentional complexity; remove entries whose code is gone.
3. Look for recurrence: a smell that appears again across runs, or many times in one run, points to a gap in how agents work on this project. Address it at the right level:
   - A missing convention: draft a concrete rule for the project's agent instruction file (`AGENTS.md`, `CLAUDE.md`, or equivalent), e.g. "Search `src/shared/` before adding a utility." Edit the file only with the user's approval, because it shapes every future session.
   - A missing structure: raise an architecture proposal; if it was not handled in this run, it is open for the next one.
4. Commit the ledger changes as the run's final commit, and report a short summary: net reduction, what was removed or restructured, what was deferred, open proposals and proposed rules.

## Assets and External Contracts

Deleting unused features and internal APIs is in scope. "Unused" judged by in-repository references, however, is only meaningful when the code is meant to be consumed in full by this repository. Two kinds of code fail that test and must not be pruned:

- **Inventory assets** — code whose value is its completeness, kept as stock for future use: vendored or copied component libraries and design-system primitives on any platform (e.g. shadcn/ui, Bits UI, and their equivalents for mobile, desktop, and backend), generated code (API and RPC clients, ORM models, protocol bindings), vendored third-party sources, icon and asset sets. Do not delete their unused members, and do not refactor their internals: local edits break their upgrade or regeneration path. For generated code, the generator's input is the place to change things. Application code that *reimplements* something an asset already provides is a valid candidate: replace it with the asset.
- **External contracts** — code whose consumers live outside the repository: exports of published packages, HTTP and RPC endpoints called by other services or clients, CLI flags and config keys users set, webhooks, remotely controlled flags, and database migrations (they are history, not code). Zero references in the repository proves nothing. Removing or reshaping one is a structural or architecture item at most, and only with evidence of no external use (the user's confirmation, access logs, a deprecation already shipped).

Architecture changes may move assets as whole units but never reshape their contents.

When unsure whether something is an asset, ask the user, then record the answer in `keep.md` so the question is not asked again.

## Anti-patterns

Treat any of these as a stop-and-fix signal:

- A "simplification" that adds net code without removing a concept.
- A new abstraction introduced to deduplicate two call sites.
- An architecture change justified by taste or a pattern's name instead of measured payoff.
- A half-finished migration left in place, with old and new structure coexisting.
- A refactor of a vendored component library or generated code.
- Removing an external contract because nothing in the repo calls it.
- Patching forward after a regression in a mechanical or structural item instead of reverting.
- Behavior changes bundled into a commit labeled as cleanup.
- A candidate kept on intuition, without evidence.
- Re-proposing something `keep.md` already protects.
- Touching the user's uncommitted changes.
