# Hostility Catalog

Reality is hostile in recurring, nameable ways. A demonstration proves nothing about a claim unless the hostilities that claim depends on are structurally present in the apparatus — scaled down is fine, absent is not. This catalog exists for phase 2 (Design the Experiment).

**Selection rule**: pick only the dimensions the killer claims actually depend on — typically two to four in total. Checking every box is its own failure: the experiment becomes unbuildable and unfocused, which pressures you into toy shortcuts later.

**Typical mapping from claim type to dimensions**:

- capability → dirty input, failure & recovery, scale (whichever the "can" depends on)
- quality → performance envelope, human factors; always against a baseline
- derivative → feature interaction, requirement drift, legacy constraint (trajectory mandatory)
- generality → second instance

Each entry gives three things: what breaks in reality, the scaled-but-faithful analog, and the toy red flag that fakes it.

## Scale

- **Reality**: behavior past the knee of the curve: memory pressure, index misses, O(n²) blowups, pagination, timeouts.
- **Faithful analog**: choose N beyond the claimed knee, with realistic value distributions; measure at three sizes to expose the curve, not one point.
- **Toy red flag**: N chosen where everything is fast; uniform synthetic data.

## Feature interaction

- **Reality**: features share state and cut across each other; the cost of feature N is coupling, not lines of code.
- **Faithful analog**: at least three features chosen to overlap in state or concerns, including one that cross-cuts the others.
- **Toy red flag**: one vertical slice; "three features" that touch disjoint state (CRUD × 3).

## Requirement drift

- **Reality**: requirements change mid-build and invalidate an assumption the design leaned on.
- **Faithful analog**: pre-plan a mid-course change the design did not anticipate. Write it sealed into the pre-registration, inject it halfway through the build, measure the blast radius.
- **Toy red flag**: all requirements known upfront and stable for the whole build.

## Dirty input

- **Reality**: malformed records, inconsistent encodings, nulls, duplicates, out-of-order events, adversarial values.
- **Faithful analog**: sample real data, or generate data with realistic error rates and distributions.
- **Toy red flag**: hand-written fixtures shaped exactly like the schema.

## Legacy constraint / integration friction

- **Reality**: existing conventions, entrenched dependencies, backward compatibility, half-migrated coexistence states.
- **Faithful analog**: retrofit into a real codebase; demonstrate incremental adoption, meaning the system runs with the idea applied to only part of it.
- **Toy red flag**: greenfield apparatus for an idea that claims to fit existing systems; a migration adapter left as TODO.

## Failure & recovery

- **Reality**: partial failure, timeouts, crashes mid-operation, retries, idempotency violations.
- **Faithful analog**: kill the process mid-run; inject faults at component boundaries; replay duplicate events.
- **Toy red flag**: happy path only; error paths that merely log.

## Concurrency & contention

- **Reality**: interleavings, races, lock contention, starvation.
- **Faithful analog**: real parallel load with forced interleavings or stress schedules.
- **Toy red flag**: a single-threaded demo of a claim about concurrent behavior.

## Performance envelope

- **Reality**: latency, throughput, and memory budgets that the incumbent already meets.
- **Faithful analog**: measure against the incumbent baseline on the same workload; report distributions, not averages.
- **Toy red flag**: no baseline; "fast enough on my sample".

## Human factors

- **Reality**: someone who did not build the artifact must understand, debug, and extend it. Applies to claims like "easier to understand" or "faster to onboard".
- **Faithful analog**: hand the artifact to a fresh-context agent (or the user) with a task and only the artifact's own affordances; record success and friction.
- **Toy red flag**: the author judging their own artifact readable.

## Instrument hygiene

Not a hostility dimension — a rule for whenever the apparatus uses fresh-context agents as instruments (a baseline arm, a human-factors run, an audit):

- Isolate physically, not by instruction. Give the instrument a clean copy of the environment with the treatment absent, instead of telling it which paths not to read: bulk operations (`for f in */...`, recursive greps, directory dumps) leak excluded paths into context even when the agent honors the instruction elsewhere.
- After the run, verify isolation from the transcript's tool calls (what was actually read), not from the agent's narration.
- A contaminated run is void. Do not grade it, do not "adjust for" the contamination — re-run it clean.

## Second instance

- **Reality**: an idea tuned to its birth domain quietly fails one domain over. Applies to generality claims.
- **Faithful analog**: run the idea on a second case chosen to differ structurally — different data shape, domain, or stack.
- **Toy red flag**: a second case that is a cosmetic variant of the first.
