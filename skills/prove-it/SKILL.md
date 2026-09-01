---
name: prove-it
description: Prove that a proposed idea, design, or paradigm actually works by running a falsifiable, user-verifiable demonstration instead of defending it with narrative. Use when the user challenges feasibility, says "prove it" / "证明给我看", or wants a proposal from a design discussion demonstrated — by building a minimal-but-sufficient new project, retrofitting the idea into an existing project, or attacking the hardest subproblem at representative difficulty.
---

# Prove It

You proposed the idea; from here on, stop defending it. Switch roles from advocate to experimenter: design an experiment that could kill the idea, run it honestly, and report whichever verdict the evidence supports. "Partially viable" and "not viable — it broke here" are successful outputs of this skill. A proof that cannot fail is not a proof.

The audience for every piece of evidence is the user. Narrative is not evidence. Evidence is anything the user can run, read, or measure without trusting you.

The unit of proof is the claim, not the idea. Keep each proof round self-contained in its own directory, `docs/proofs/YYYY-MM-DD-<idea>/`: the record is that directory's `README.md` (created from `references/proof-record-template.md`), and everything the verdicts point to lives in `evidence/` beside it. Successive proofs sit side by side instead of interleaving. Work through the phases in order.

## 1. Extract the Claims

Decompose the idea into explicit claims and classify each:

- **capability** — X can be built or done at all.
- **quality** — X is simpler, faster, safer, or cheaper than the current baseline.
- **derivative** — X stays good as the system grows or changes: maintainable, scalable, extensible. These are claims about a cost curve, not a point.
- **generality** — X works beyond the demonstrated case: other domains, stacks, teams.

Mark the **killer claims**: the ones whose falsity kills the idea. They are usually the derivative and integration claims — the ones the design discussion glossed over. Most ideas have one to three; if every claim looks killer, the decomposition is too coarse.

Present the claim list to the user and confirm the killer set before designing anything. The user knows hostilities you do not.

## 2. Design the Experiment

Choose the apparatus by evidence strength against the killer claims, never by ease of construction:

- **Brownfield retrofit** — implement the idea inside an existing real project. Prefer this whenever the idea claims to apply to existing systems: reality supplies legacy constraints, dirty data, and integration friction for free.
- **Greenfield build** — a new minimal-but-sufficient project. Right for paradigm-level ideas with nothing to retrofit into; hostility must then be manufactured deliberately, or the apparatus slides into a toy.
- **Reference problem** — implement a well-known non-trivial problem in the new approach. Public recognition of the problem's difficulty prevents cherry-picking.
- **Targeted spike or benchmark** — when one subproblem carries all the risk, attacking it directly beats building everything around it.

Then, for each killer claim, work through `references/hostility-catalog.md`:

- List the hostility dimensions the claim depends on (typically two to four; needing all of them means the claims are still too coarse).
- Define each dimension's scaled-down but structurally faithful analog inside the apparatus.
- For every derivative claim, plan a **trajectory, not a snapshot**: the sequence of changes (add interacting features, inject a mid-course requirement change) and the cost measurements to record at each step. A static demo cannot prove a claim about how change behaves.

"Minimal but sufficient" means: cut everything that does not bear on a killer claim, and refuse to cut anything that does.

Fill the pre-registration half of the proof record: claims, apparatus and why it is the strongest evidence available, hostility plan, trajectory plan, pass and kill criteria per killer claim, and the out-of-scope list: what this experiment will *not* prove. Get the user's sign-off before building. Everything afterward is judged against this text.

## 3. Build Honestly

- Never stub, mock, hardcode, or narrow the hard part. If a hostility dimension proves too expensive to realize, stop and renegotiate the pre-registration with the user; do not shrink it silently.
- Hitting a wall is a result, not an obstacle to the result. Record it in the build log and report it.
- Record every deviation from the pre-registration in the proof record as it happens, not retroactively.

## 4. Attack It

Once it works, try to break it:

- Run the planned trajectory for every derivative claim; record the measurements (diff size, blast radius, time, performance numbers) at each step.
- Feed it the hostile inputs from the hostility plan.
- For each kill criterion, note the moment it was genuinely at risk. If a kill criterion was never at risk, the experiment did not test its claim. Extend the attack until it is, or mark the claim untested.

## 5. Audit

Dispatch a fresh-context subagent with `references/auditor-prompt.md`, the proof record path, and the artifact location. Its job is to determine whether the experiment actually tested the killer claims or dodged them. It reports findings; it fixes nothing.

Resolve every fatal and major finding: strengthen the experiment, downgrade the affected verdict, or return to phase 2 with the user. Re-run the audit after material changes.

## 6. Deliver the Verdict

Complete the verdict half of the proof record:

- Per claim: **proven / partially proven / refuted / untested**, each with a verification pointer the user can execute without trusting you: "run X, observe Y", "read this diff", "compare these two measurements".
- Persist everything the pointers need — trial outputs, fixtures, measurements, each with a provenance note — into the round's `evidence/` directory. A pointer into ephemeral session state (transcripts, scratch directories) dies with the session.
- Threats to validity: what this experiment does not prove, and what it would take to prove it.
- A recommendation the evidence actually supports: proceed, revise (state what must change; pursuing it opens a revision round, phase 7), or abandon.

Report refutations with the same prominence as confirmations. Discovering that the idea fails is the skill working, not the skill failing.

## 7. Revise and Re-prove

A refuted or wounded claim often points at a better version of the idea. Revising the idea is legitimate — smuggling the revision into the current round is not. The loop:

- **Within a round, the idea and the criteria are frozen.** Audit findings may strengthen the experiment or downgrade verdicts; they never mutate the idea to keep a verdict alive.
- **Close before revising.** Deliver the current round's verdict for the idea as pre-registered. That verdict is permanent; no later round edits it.
- **Open a revision round only on findings.** Idea v2 states, change by change, which recorded finding forced it. A revision no finding asked for is a new idea — start a new proof.
- **Re-prove the delta.** Claims untouched by the revision keep their verdicts with carried-over evidence; everything v2 newly asserts gets fresh killer claims, fresh kill criteria, a new pre-registration in a new round directory (`docs/proofs/YYYY-MM-DD-<idea>-v2/`), and a new user sign-off. Phases 2–6 run again, scoped to the delta.
- **Stop rules — detect non-convergence, don't count rounds.** Rounds are unbounded while they converge, and every round already requires its own user sign-off. But recommend abandon, and say why, when any of these fires:
  - the same killer claim is refuted twice anywhere in the lineage: a targeted fix already failed once, and the family still cannot hold that claim;
  - whack-a-mole: a revision's fix kills a claim a previous round had proven, and it happens a second time anywhere in the lineage — the claims are structurally coupled against the idea;
  - the concession ledger (see template) shows the surviving idea no longer beats the cheaper competitor, or no longer serves the goal that motivated v1.
  The user may overrule a stop recommendation; record the overrule in the new round's sign-off.
- **Non-killer failures don't open rounds.** A failed non-killer claim lands in the verdict as a limitation for the user to accept or reject; it is not fuel for another proof round. It justifies a revision round only when the failure reveals the claim was killer all along (reclassify it explicitly in the new pre-registration) or when the user asks for one.
- **Report the lineage.** The final deliverable reads like "v1: refuted at X; v2: proven within scope Y" — never a later version's evidence under an earlier version's headline.

## Anti-patterns

Treat any of these as a stop-and-fix signal at any phase:

- A snapshot offered as evidence for a derivative claim.
- Passing only on fixture-shaped clean data.
- The hard part stubbed, mocked, or quietly descoped: hollow exactly where it matters.
- Apparatus chosen because it is easy to build, not because it is probative.
- "In spirit", "in principle", "a full version would" anywhere in a verdict.
- Success declared although no kill criterion was ever at risk.
- Pass or kill criteria reinterpreted after building, without user sign-off.
- A verdict that generalizes beyond the pre-registered scope.
- The idea quietly revised mid-round so the current criteria still "pass", instead of closing the round and opening a revision round.
- A later version's evidence presented under an earlier version's claim.

## Boundaries

Lighter-weight neighbors: a verbal stress-test skill (e.g. `grilling`) challenges an idea in conversation; a disposable-prototype skill (e.g. `prototype`) answers a design question quickly without adversarial framing. prove-it is the empirical escalation of both: use it when talk is no longer acceptable evidence and a real experiment is worth its cost.
