---
name: assess-source-project-fit
description: Assess whether external material such as a paper, article, repository, design, talk, internal document, or benchmark offers meaningful improvements for an existing project. Use when the user asks to read material, relate it to a project, identify applicable ideas, compare it with current implementation, or recommend changes while avoiding forced associations and duplicate work.
---

# Assess Source Project Fit

Evaluate the material against the project's real current state. Produce evidence-backed judgments and allow a valid result of zero useful changes.

## Interpret the Request

Extract these inputs from the user's natural-language request:

- **Source material**: URLs, files, attachments, repositories, document tokens, or named works to inspect.
- **Target project**: repository paths, project documents, knowledge-base notes, links, or the current workspace.
- **Decision focus**: the question the user needs answered, such as architecture value, evaluation improvements, workflow changes, or immediate applicability.
- **Boundaries**: requested depth, write permissions, excluded areas, and desired output format.

Accept ordinary requests such as:

> Read this paper and assess what it can genuinely improve in `/path/to/project`. The project documents are linked here. Keep the task read-only.

Treat source material and target project as required concepts rather than form fields. Infer them from the request and current workspace. Ask one concise question only when the target project cannot be identified safely.

Default to read-only analysis. Create or edit files only when the user explicitly requests it.

## Gather Evidence

1. Read each source with the appropriate available skill, connector, CLI, or browser.
2. Inspect the source deeply enough to recover its mechanisms, prerequisites, evidence, limitations, and claimed outcomes.
3. Inspect the target project's current implementation and durable project documents before proposing changes.
4. Prefer current code, traces, experiment results, configuration, and project-state documents over project names or abstract descriptions.
5. Preserve internal links, identifiers, versions, and evidence references exactly.

For large sources or projects, select evidence according to the decision focus. Record any uninspected area that could materially change the result.

## Build the Fit Map

Map each material claim or mechanism to the project using one category:

- **covered**: the project already implements the useful mechanism.
- **partially-covered**: the project has the core idea with a specific remaining gap.
- **meaningful-gap**: the material supplies a missing mechanism that addresses a real project problem.
- **premise-mismatch**: the material relies on conditions that do not hold for the project.
- **evidence-gap**: available evidence cannot support a reliable judgment.

Group equivalent claims by mechanism. Avoid inflating the result with multiple wordings of the same idea.

## Apply the Value Gate

Recommend an idea only when the evidence supports all of these conditions:

1. The project lacks a complete equivalent.
2. The idea addresses a present problem or a near-term committed need.
3. Its mechanism, integration point, and expected benefit are concrete.
4. Its effect can be verified through code, traces, experiments, or metrics.
5. Its expected value justifies the added complexity and maintenance cost.

Rank surviving ideas by expected project value. Keep speculative ideas under `evidence-gap` until the missing evidence is available.

## Run an Adversarial Check

Challenge every candidate recommendation:

- Search for an existing project mechanism that already solves the problem.
- Check whether the proposal changes only terminology or organization.
- Confirm that the current bottleneck actually lies at the proposed integration point.
- Identify prerequisites, counterexamples, regressions, and displaced complexity.
- Distinguish source evidence, project evidence, and inference.
- Define the smallest experiment that could falsify the recommendation.

Mark a route blocked when it depends on unavailable evidence or an unresolved assumption. State the exact gap and stop extending conclusions from that route.

## Produce the Review

Lead with one of these judgments in natural language:

- clear project value;
- limited local value;
- already covered;
- low value at the current stage;
- insufficient evidence.

Then include only the sections that carry useful information:

1. **Relationship**: how the material and project actually intersect.
2. **Existing coverage**: relevant capabilities already present in the project.
3. **Meaningful gaps**: ranked recommendations that passed the value gate.
4. **Application**: mechanism, integration point, expected benefit, cost, and verification method for each recommendation.
5. **Deferred ideas**: source ideas whose timing or premises do not fit the current project.
6. **Evidence gaps**: precise unknowns and the smallest action needed to resolve each one.

Keep the review proportional to the findings. Return a short conclusion when the material adds no meaningful value. Cite source material and concrete project evidence close to each claim.
