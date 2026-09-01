<!-- This record is the README.md of its self-contained round directory, docs/proofs/YYYY-MM-DD-<idea>/, with the evidence/ directory beside it. Evidence pointers below are relative to this file. -->

# Proof Record: \<idea name\>

- **Status**: pre-registered | building | under attack | audited | closed
- **Opened**: YYYY-MM-DD
- **Version**: v1; or vN, revision of `<prior round directory>` (prior round must be closed)
- **Idea source**: link or one-line pointer to the discussion that produced the idea

## The Idea

Two or three sentences, stated in the proposer's strongest form. Link the design doc or conversation if one exists.

## Claims

| ID | Claim | Type | Killer? |
|----|-------|------|---------|
| C1 | ... | capability / quality / derivative / generality | yes / no |

For each killer claim, one line on what dies if it is false.

## Apparatus

- **Mode**: brownfield retrofit / greenfield build / reference problem / targeted spike
- **What and where**: the concrete project, codebase, or problem, and its location.
- **Why this is the strongest available evidence** for the killer claims, including which cheaper apparatus was rejected and why.

## Hostility Plan

One row per killer-claim × dimension pair (see `hostility-catalog.md`):

| Claim | Dimension | Scaled faithful analog in this apparatus | Toy red flag being avoided |
|-------|-----------|------------------------------------------|----------------------------|

## Trajectory Plan

Required for every derivative claim; delete this section only if no claim is derivative.

| Step | Change to make | Measurements to record |
|------|----------------|------------------------|

If a mid-course requirement change is part of the plan, write it here **sealed** — decided now, injected later — so the build cannot quietly prepare for it.

## Pass / Kill Criteria

| Claim | Passes if | Killed if |
|-------|-----------|-----------|

Criteria must be observable outcomes, not judgments ("diff touches ≤ 2 modules", not "feels maintainable").

## Out of Scope

What this experiment will **not** prove, stated plainly. These limits reappear in Threats to Validity — the verdict may not claim past them.

## User Sign-off

Date and any adjustments the user requested. Everything below is judged against the text above as signed off. Later changes to the text above require a new sign-off, recorded here.

---

*Everything below is filled in during and after the experiment.*

## Build Log

Deviations from the pre-registration (dated, as they happen), walls hit, renegotiations and their sign-offs.

## Attack Log

What was tried and what happened. For each kill criterion: the moment it was genuinely at risk, or the admission that it never was.

## Audit

Auditor findings (fatal / major / minor), the resolution of each, and re-audit outcomes.

## Verdicts

| Claim | Verdict | Evidence — how the user verifies this independently |
|-------|---------|------------------------------------------------------|
| C1 | proven / partially proven / refuted / untested | run X, observe Y / read diff Z / compare measurement A vs B |

## Threats to Validity

What this experiment does not prove, and what it would take to prove it.

## Recommendation

Proceed / revise (state exactly what must change) / abandon — only as far as the evidence supports.

## Revision Hand-off

Fill only when this round's verdict leads to a revision round; otherwise delete this section.

| Change in the next version | Finding that forced it | Evidence that carries over |
|----------------------------|------------------------|----------------------------|

**Concession ledger**, copied forward complete into every later round and never restarted:

| What the idea gave up | Round | Why |
|-----------------------|-------|-----|

The next round's pre-registration must restate the original headline value of v1 and affirm, against this ledger, that the surviving idea still delivers it — that affirmation is part of what the user signs off. If it cannot be affirmed, the stop rule has fired.

For a revision round (vN): claims untouched by the changes keep their verdicts with the carried evidence; everything newly asserted gets fresh killer claims and criteria in the new record. This record stays closed and unedited.
