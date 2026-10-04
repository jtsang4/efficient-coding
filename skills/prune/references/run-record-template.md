# Run Record Template

Save as `docs/prune/YYYY-MM-DD.md` (or `YYYY-MM-DD-2.md` for a second run that day). Never edit a past run's record.

```markdown
# Prune Run — YYYY-MM-DD

## Scope

- Scope: whole project | narrowed: <paths / since last run / mechanical only, as the user asked>
- Start commit: <HEAD at baseline>
- End commit: <sha of the last code commit in this run>
- Fallbacks: <e.g. previous end commit not an ancestor, used --since date; or "none">
- Skipped due to uncommitted changes: <files, or "none">

## Baseline and Result

| | Before | After |
| --- | --- | --- |
| Verification | <green / known failures: …> | <green / same known failures> |
| Lines of code | | |
| Files | | |
| Direct dependencies | | |
| Dependency cycles | | |
| Layer-rule violations | | |

Verification commands: `<commands>`

## Executed

| Candidate | Class | Commit | Reduction | Evidence |
| --- | --- | --- | --- | --- |

Net-growth justifications: <changes that added net code and why, or "none">

## Architecture

### <Proposal title>

- Outcome: landed | declined | deferred | reverted
- Problem: <evidence>
- Target rule: <rule> — check: `<command>`, before: <result>, after: <result>
- Commits: <first..last, or "none">
- Payoff, expected vs. actual: <metrics>
- Enforcement added: <linter or checker rule, or "none">
- Notes: <what was learned; for deferred or reverted, what the next attempt needs>

## Failed

| Candidate | Reverted commit(s) | Reason |
| --- | --- | --- |

## Deferred

| Candidate | Class | Why deferred |
| --- | --- | --- |

## Review

- Judgment: clean | clean with risks | has regressions
- Findings and resolutions: <…>

## Feedback

- Recurring smells: <smell, where, how often, previous runs it appeared in>
- Proposed instruction rule: <draft text and target file, or "none"> — status: approved and applied | declined | pending
- Architecture proposals opened for the next run: <titles, or "none">
```
