# Smell Catalog

Entropy patterns typical of agent-built projects, with how to find them. Group them across survey subagents roughly as: (A) dead code and dependencies, (B) duplication and abandoned paths, (C) defensive and abstraction bloat, (D) tests, docs, and comments, (E) architecture.

## A. Dead Code and Dependencies

- **Unreferenced code** — functions, types, components, files, routes, and exports nothing reaches.
- **Unused dependencies** — declared but never imported; also dependencies used once for something the standard library or an existing dependency already does.
- **Unused config and env vars** — keys read nowhere, env vars documented but never consumed, scripts nothing invokes.
- **Unused features** — whole user-facing features or internal APIs with no entry point, no callers, or no traffic. Structural class; confirm with the user.

## B. Duplication and Abandoned Paths

- **Parallel implementations** — the same concept written two or three times because each session wrote its own: date formatting, fetch wrappers, validation, retry logic, types mirroring each other.
- **Asset reimplementation** — application code rebuilding something an inventory asset already provides (a hand-rolled button beside the component library's).
- **Abandoned approaches** — `*_v2`, `*_new`, `*_old`, `legacy*`, `*.bak` files; the old path kept after a migration; compatibility shims nothing needs anymore.
- **Settled flags** — feature flags and config switches that are always on or always off, with the dead branch still present.

## C. Defensive and Abstraction Bloat

- **Over-defensive code** — try/catch that only rethrows or logs and continues; null checks on values the type system or a prior check already guarantees; fallbacks for states that cannot occur; validation repeated at every layer instead of at the boundary.
- **Single-implementation abstraction** — interfaces, factories, strategies, or plugin systems with exactly one implementation and no concrete second one planned.
- **Pass-through layers** — wrappers, services, or hooks that only forward to one other call.
- **Premature configurability** — options, parameters, and generics that every caller passes identically.

## D. Tests, Docs, and Comments

- **Tests of mocks** — tests whose assertions only check what the mock was told to return.
- **Redundant tests** — multiple tests covering the same path with trivially different inputs; snapshot sprawl nobody reviews.
- **Narrative comments** — comments that tell the history of a change ("now uses X instead of Y", "fixed the bug where…") rather than explaining non-obvious code.
- **Drifted docs** — READMEs, agent instruction files, and design docs describing behavior, files, or commands that no longer exist.
- **Agent leftovers** — scratch scripts, debug logging, temporary files, and plan documents for long-finished work.

## E. Architecture

Look at the shape of the dependency graph and at where concepts live. Each smell here is usually the cause of several smells in A–D; tie them together in the evidence.

- **Dependency cycles** — modules or packages that import each other, directly or transitively.
- **Layer violations** — lower layers importing higher ones (domain importing UI, shared importing features), or a feature reaching into another feature's internals.
- **Scattered ownership** — one concept (auth, money, a domain entity, HTTP access) implemented or mutated in several modules with no single owner. Usually the cause of B's parallel implementations.
- **Overlapping modules** — two modules or directories whose responsibilities overlap so much that callers pick one arbitrarily.
- **God modules** — files or packages with many unrelated responsibilities, high fan-in and fan-out, and most of the churn in `git log`.
- **Misplaced code** — code living far from its only users, or shared code buried inside one feature.
- **Missing boundary** — validation, error mapping, or I/O spread across every layer because there is no edge where it belongs. Usually the cause of C's repeated guards.
- **Framing debt** — a solution whose special cases, flags, and branches keep growing run after run because the underlying problem was framed wrongly; the fix is a simpler model of the problem, not more cleanup.

Metrics to record before and after: number of dependency cycles, number of layer-rule violations, number of modules per concept for the concepts involved, and fan-in/fan-out of the modules touched.

## Detection Tools

Run through ephemeral runners. Treat output as leads, not verdicts: confirm each hit against the false-positive list.

| Ecosystem | Dead code / unused exports | Unused dependencies | Dependency graph and layer rules |
| --- | --- | --- | --- |
| JS / TS | `knip` | `knip`, `depcheck` | `madge` (cycles), `dependency-cruiser` (rules) |
| Python | `vulture`, `ruff` (F401, F841) | `deptry` | `import-linter`, `pydeps` |
| Go | `deadcode` (golang.org/x/tools), `staticcheck` (U1000) | `go mod tidy` diff | `go list -deps`, `go list -json` |
| Rust | compiler `dead_code` warnings | `cargo-machete`, `cargo-udeps` | `cargo modules` |
| Swift | `periphery` | | |
| Kotlin / Android | `detekt`, Android lint (`UnusedResources`) | | Gradle module graph |
| Dart / Flutter | `dart analyze` | | |
| Any | `rg` reference counts, `git log` on suspected files | | `rg` on import statements |

Duplication in any language: `jscpd`. Churn hotspots: `git log --format= --name-only | sort | uniq -c | sort -rn`.

When no tool fits, use `rg` for reference counts and `git log --follow` to learn when and why a file stopped being touched.

## False Positives

Code that looks unreferenced but is reached:

- Framework conventions: file-based routes, pages, layouts, middleware, migrations, management commands, lifecycle hooks discovered by name.
- Dynamic dispatch: reflection, dependency-injection containers, string-keyed registries, plugin loaders, serialization by field name.
- Entry points outside the source tree: CI workflows, Dockerfiles, package scripts, cron and deployment config, editor or tool configs.
- Public surface: anything listed under Assets and External Contracts in `SKILL.md`.
- Platform requirements: manifest-declared components (Android activities, iOS app extensions), required protocol methods, exported symbols for FFI.

## Asset Signals

Signs that a directory is an inventory asset, to be confirmed with the user and recorded in `keep.md`:

- Component library configs or conventional paths: `components.json`, `components/ui/`, `lib/components/ui/`, design-system packages in a monorepo.
- Generated-code markers: "DO NOT EDIT" or "generated by" headers, codegen config (`openapi`, `buf`, `protoc`, `graphql-codegen`, ORM generators), output directories referenced by them.
- Vendored sources: `vendor/`, `third_party/`, `external/`, copied upstream licenses.
- Published packages: `exports` or a non-private manifest, `publishConfig`, crates or modules with release tooling.
