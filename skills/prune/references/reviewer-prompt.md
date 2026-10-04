# Reviewer Prompt

Dispatch a fresh-context subagent with the following prompt, substituting `{BASE_COMMIT}`, `{APPROVED_CHANGES}`, and `{KEEP_PATH}`. `{APPROVED_CHANGES}` lists the selected structural items and the approved architecture proposals, each with its target rule. The subagent must not have performed the pruning and must not receive the pruner's reasoning beyond the commit messages, the approved changes, and the diff.

---

You are reviewing a cleanup and restructuring, not improving it. A pruner claims the commits since `{BASE_COMMIT}` reduce the codebase without changing behavior, except for these explicitly approved changes:

{APPROVED_CHANGES}

Assume every commit may hide a behavior change until the diff shows otherwise. Inspect `git log {BASE_COMMIT}..HEAD` and the diff commit by commit. Read `{KEEP_PATH}` if it exists. Do not fix anything.

Run these checks:

1. **Behavior drift.** For every removed, moved, or rewritten path, determine whether any reachable input now behaves differently: return values, error types and messages, side effects, logging that something depends on, ordering, timing, resource cleanup, initialization order. Approved removals are exempt only for exactly the scope approved.
2. **Hidden reachability.** For every deleted or moved symbol, file, or dependency, search for dynamic references: string-keyed lookups, reflection, framework conventions, config files, CI and deployment scripts, docs that instruct users to call it.
3. **Removed safety.** For every deleted guard, try/catch, or fallback, find the evidence that the guarded condition cannot occur. "Looks unnecessary" is not evidence.
4. **Assets and contracts.** Flag any change inside vendored or generated code, any deleted member of an inventory asset, and any removed or reshaped external contract (published export, endpoint, CLI flag, config key, migration) not among the approved changes. Check `{KEEP_PATH}` entries were respected.
5. **Migration completeness.** For every approved architecture change, verify its target rule now holds (run the stated check), and that no remnant of the old structure survives: old modules, re-export shims, callers still using the old path, docs describing the old layout. Old and new structure coexisting is a regression.
6. **Commit hygiene.** Flag commits mixing unrelated candidates, carrying behavior changes under a cleanup message, or adding net code without a stated justification.
7. **Incomplete removal.** Flag leftovers of removed code: orphaned imports, tests, config entries, docs mentions, or dependencies.

Report findings in this format:

- **Findings**: a numbered list; each entry has a severity — `regression` (behavior changed outside the approved scope, an asset or contract was violated, or a migration is incomplete), `risk` (unproven safety), `nit` — plus the commit and file location supporting it. No finding without a pointer.
- **Overall judgment**: exactly one of `clean` / `clean with risks` (list them) / `has regressions` (list the commits).

Return only findings and judgment. An empty findings list with `clean` is an acceptable outcome, but only after every check above has actually been run.
