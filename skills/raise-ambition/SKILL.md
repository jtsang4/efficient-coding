---
name: raise-ambition
description: Make a task more ambitious: higher, deeper, or broader. Explicit invocation only.
disable-model-invocation: true
---

# Raise ambition

A request usually encodes the user's best guess at how to get what they want, sized to what they believed was possible. Find the more ambitious version of the task along three axes, let the user choose how far to go where that choice changes what is delivered, then carry it out and check the result against something other than your own judgment.

- **Altitude:** move from the requested deliverable toward the outcome it serves.
- **Depth:** do the task the way the field's best practitioners would, down to their raw material, instruments, and standards of proof.
- **Range:** bring in fields the task does not obviously need, for the techniques they contribute.

Doing the same work faster is not this skill's concern. Ambition means a higher or deeper version of the task, not a bigger one: more pages, more features, or more words do not count.

## Establish the task and the goal beyond it

Start from the active request and anything already produced. If the user invoked this skill on finished work, treat that work as the starting rung. If the conversation contains no task, ask for one.

State briefly:

- the literal request and its deliverable;
- who uses the deliverable and what should happen after it is delivered: the goal beyond the goal;
- what a result would look like that the user would be surprised was possible.

Infer these from context. Ask a focused question only when the goal beyond the goal cannot be inferred and the answer would change which rungs you propose.

Inventory what you can actually reach: raw data and sources, tools you can install or run, environments where results can be reproduced, connectors and permissions. Ambition is bounded by access. Note what is missing; acquiring it may become the first piece of work.

## Choose the axes with the most headroom

Pick one or two axes; stacking all three dilutes the work. Say in a sentence why the others were set aside.

- **Altitude fits** when there is an ultimate outcome beyond the deliverable, when people will meet or decide based on it, or when the task is one of a recurring stream that a standing responsibility could replace. It fits poorly when the artifact itself is the point, as in most creative work.
- **Depth fits** when the user wants this particular thing done exceptionally well, an expert practice exists for it, and raw material or professional tools are within reach.
- **Range fits** when what the deliverable has to do (persuade, explain, decide, delight) spans more disciplines than its surface suggests, or when depth alone has stopped producing gains.

If the task is genuinely small or the user wants it exactly as stated, say that more ambition would add little and do the task.

## Build a ladder for each chosen axis

For each axis, write two or three rungs above the starting point. Each rung is a concrete task statement you could execute or hand to another agent, and each must differ in kind from the one below it. A rung that only does more of the same thing is not a rung.

### Altitude

Climb by repeatedly asking what the user wants to happen next. A typical ladder runs from the deliverable, to the decisions or actions it is meant to produce, to a mechanism that produces the outcome continuously and makes the deliverable unnecessary. "Fix this crash" becomes "find and fix this class of crash", which becomes "keep the app crash-free".

- Phrase higher rungs as responsibilities with an observable outcome, not as bigger artifacts.
- A rung that replaces an existing process must earn it: show from the subject's own history that the new mechanism would have done better, and propose running it beside the current one before replacing it.
- A standing responsibility needs infrastructure that lets you work without a person feeding you tasks: access to the signals that reveal problems, a way to trace them to their causes, and environments to reproduce and verify fixes. Name that infrastructure; building it is often the first step of the rung.
- Stop climbing where the outcome can no longer be observed, or where you can no longer act on it and verify the result. "Make the company money" is not yet a usable rung.

### Depth

Work through four questions before writing depth rungs:

1. What would a top practitioner in this field do here that was not asked for?
2. What is the rawest material they would start from, instead of what has already been summarized or digested?
3. Which specific methods and instruments would they use?
4. What, other than you or the user, would show the result is right?

Then strengthen the rungs with these moves:

- **Use the instruments, not the vocabulary.** Sounding like an expert while working like a generalist is the common failure. If the analysis lives in a markdown table, the expert version likely uses a database and a statistical model; if performance is judged by feel, the expert version uses a profiler and a benchmark.
- **Set a stretch target.** Choose a measurable goal far beyond the obvious one: if the page loads in 10 seconds and 5 would satisfy the request, aim for 200 milliseconds. Treat it as solvable, and report the measured result against it.
- **Challenge what is believed.** List the beliefs the task rests on and try to reproduce each from raw material. "Churn is an onboarding problem" is a hypothesis to test against the data, not a premise.
- **Produce new knowledge.** Once deep in the material, look for what nobody knows yet: an earlier signal, a hidden segment, a cause no one has named. Claim a finding only after it holds on data it was not derived from.

### Range

- **Replace nouns with verbs.** Rewrite the deliverable as what it has to accomplish. A quarterly review is not "a deck"; it is "getting busy people to believe a story about cause and effect, and to decide under uncertainty, in thirty minutes". Each verb points to fields that know how to do it.
- **Assemble the crew.** Imagine the result had to be extraordinary and anyone could be recruited. List the fields you would bring in, and for each the specific work it would do and the technique or tool it brings. Include at least one adversarial field whose job is to break the result: a short seller or forensic accountant for a financial story, a security researcher for a system, opposing counsel for an argument.
- **Recruit work, not personas.** Do not write in the voice of a short seller; do what a short seller does to research a position. Role-play makes the transcript stranger without improving the result. If parallel agents are available, each crew member's work can become its own workstream.

## Give every rung prerequisites and an outside judge

Under each rung, note:

- **Prerequisites:** access, data, tools, or environments it needs that you do not yet have, and whether you can set them up yourself.
- **Outside judge:** the check that will show the result is right without relying on your own assessment: tests, benchmarks, measurements, held-out data, a backtest against history, independent reproduction, an adversarial review run as a separate pass, or an observable real-world signal. Prefer a judge you can run yourself, repeatedly. Fall back to human review only when nothing else can judge the result, and say so.
- **Cost:** roughly what the rung takes, so the user can weigh it.

A rung without a judge is a wish. Either find a judge or present the rung as exploratory.

## Choose a rung, confirming when scope changes

Present the ladder compactly and recommend a rung, with the reason.

- Rungs that change what is delivered, usually altitude rungs, need the user's choice before you execute them.
- Depth and range rungs that still deliver what was asked can be adopted by default when the request already authorizes doing the work. State the upgrade in a sentence and proceed.
- If the user asked only for a better prompt or plan, deliver the rewritten task statements and stop.

## Execute without shrinking the goal

- **Hold the target.** When an approach stalls, look for another route before lowering the goal. Look for precedent: someone having done something comparable makes a hard target concrete and often reveals the route.
- **Allow partial success and report it honestly.** Falling short of a stretch target is an acceptable outcome; disguising it is not. Never lower the bar silently, fabricate a result, or declare the target met without the outside judge confirming it.
- **Set a stopping rule.** State a budget, or the point of diminishing returns as measured by the judge. Stop when pushing further no longer moves the judge, and say where the next gain would have to come from.
- **Validate before declaring done.** Run the outside judge and report what it showed, including failures.

## Report

Respond in the user's language and scale the detail to the task.

Before execution, make these easy to find: the goal beyond the goal; the chosen axes and why; the ladder, with each rung's task statement, prerequisites, judge, and cost; and the recommendation.

After execution: what was delivered; the measured result against the target and what the judge showed; assumptions that did not survive; new findings and the evidence behind them; the remaining gap and the next rung worth climbing.

## Examples

For a quarterly business review at a company struggling with churn, the starting rung is "fill in the template". Altitude climbs to "explain what changed this quarter, why, and what to do about it", then to "identify the three most urgent decisions and develop options with arguments for and against", then to "design a better way than a quarterly deck for leadership to catch problems early and move money and people, show from our history that it would have caught things sooner, and run it beside the current review for a quarter". Depth replaces the summary tables with raw event logs, a database, and a statistical model; tests the belief that churn is an onboarding problem against that data; and builds a simulation that reproduces the last year to find an earlier churn signal, which counts only if it predicts on held-out months. Range turns the deck into its verbs, brings in an analyst, a journalist, and an editor to build the story, and a short seller and a forensic accountant to attack it.

For a personal website, where the artifact itself is the point, altitude adds little. Depth asks what the best designers and front-end engineers would do: real typographic and performance standards, measured on real devices. Range might bring in 3D modeling or game design to build a rendered environment that no template would have suggested. The judges are load-time and accessibility audits, plus watching unfamiliar visitors actually navigate the site.
