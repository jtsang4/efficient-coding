---
name: problem-framing
description: Reassess a problem when a solution accumulates branches, special cases, or layers, or discussion repeatedly fails to converge. Use when the user asks to challenge the problem statement, validate the underlying requirement, or reframe a stuck design. Ordinary implementation difficulty alone is insufficient.
---

# Problem framing

Treat rising complexity and repeated non-convergence as diagnostic signals that the problem may be framed incorrectly. They are evidence to investigate, not proof that the requirement is false.

Pause refinement of the disputed design long enough to examine the problem it serves. Use the conversation and available artifacts before asking the user to repeat information.

## Diagnose and reframe

1. Identify the signal concretely: which branches, exceptions, or layers keep appearing, or which point keeps being re-argued without new evidence?
2. Restate the intended outcome independently of the proposed implementation. Identify who needs it and what observable result would count as success.
3. Separate established requirements from assumptions and implementation choices. Check the evidence behind the requirement driving the complexity. Mark unsupported claims as unverified, not false. Preserve confirmed constraints, including compatibility, safety, and business obligations.
4. Name the suspected false problem explicitly. State which assumption may be manufacturing the difficulty and why. Consider whether the actual cause is missing information, conflicting requirements, or unavoidable domain complexity instead.
5. Offer a simpler framing tied to the same intended outcome. Explain exactly which complexity would disappear and which tradeoffs or constraints remain. A proposal that quietly drops a real requirement is not a successful reframing.
6. Identify the smallest check that can distinguish the original framing from the alternative. Use available evidence or a reversible experiment where practical; ask a focused question only when necessary information is missing.

## Communicate the decision

Tell the user plainly, in their language:

- The observed complexity or loop.
- The intended outcome and the assumption being questioned.
- The suspected false problem and proposed reframing.
- The evidence or check needed, followed by a recommended next step.

Keep this proportional to the problem; a short paragraph often suffices. Do not silently pivot or keep elaborating the same design without addressing the diagnosis.

If the evidence supports the new framing, continue within the authorized scope. If it would change the user's intended outcome or a confirmed constraint, present that change for a decision before doing dependent work. If the original requirement survives scrutiny, say so and resume solving it; do not force a reframing or repeat the audit without new evidence.

## Example

A notification service keeps adding exceptions to an “exactly once” delivery mechanism. The intended outcome may be preventing duplicate user-visible notifications. If that is confirmed, durable deduplication at the display boundary could meet the outcome without requiring exactly-once transport. If downstream actions must also occur exactly once, display deduplication alone does not satisfy the requirement.
