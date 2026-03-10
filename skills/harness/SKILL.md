---
name: harness
description: >
  Transform any code project into one optimized for AI agent collaboration through
  harness engineering. Scans the codebase to detect structure, patterns, and tooling,
  extracts implicit engineering knowledge through guided choice-based questions, and
  generates minimal structured context documents plus engineering changes (lint rules,
  structural tests, CI checks). Use this skill when the user wants to make their
  codebase agent-ready, mentions harness engineering, wants to set up AGENTS.md or
  agent context, wants to improve AI coding agent productivity on their project, or
  asks to establish constraints, guardrails, or feedback loops for AI agents. Also
  trigger when users say "prepare my repo for agents", "harness my project",
  "improve agent workflow", or want their project to work better with Claude Code,
  Codex, Cursor, or similar AI coding tools. Even if the user doesn't use the word
  "harness", if they're asking about making a codebase more agent-friendly or
  productive for AI-assisted development, use this skill.
---

# Harness Engineering

Transform any code project so AI agents can work in it reliably and autonomously.

The bottleneck is never the agent's coding ability — it's the environment the agent operates in. This skill builds that environment.

## Core Principles

These govern every decision:

1. **Declarative over procedural** — Define what "correct" looks like (verification criteria), not step-by-step procedures. Agents determine how to verify on their own and generate temporary scripts if needed.

2. **Recognition over recall** — Extract knowledge by showing users detected patterns and asking them to react (choose, confirm, reject). Never ask open-ended "describe your principles" questions.

3. **Minimal context footprint** — Every generated document must be as concise as possible. Agents read actual code for details. Only externalize knowledge that CANNOT be inferred from code: architectural rules, canonical pattern choices, prohibited actions, business domain terms.

4. **Persist invariants, not procedures** — Commit architectural rules, lint configs, structural tests (permanent invariants). Never commit task-specific verification scripts — agents create those on-the-fly per task and discard them after.

5. **Language-agnostic** — Adapt to the project's tech stack. Never assume a specific language, framework, or toolchain.

## Workflow

Four phases. On re-runs (when `docs/harness/.state.json` exists), skip to gap analysis.

---

### Phase 0: Automated Scan

No user interaction. Scan the codebase to build a baseline understanding.

**What to detect:**

| Category | How to detect |
|---|---|
| Language & framework | Glob for config files: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle`, `Makefile`, `CMakeLists.txt`, etc. |
| Directory structure | `ls` top-level, identify `src/`, `lib/`, `app/`, `tests/`, `docs/` etc. |
| Module boundaries | Top-level directories under source root; look for clear separation |
| Import/dependency graph | Grep for import statements. Language-specific patterns — see below |
| Convention files | Glob for `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules` |
| Test infrastructure | Glob for test config: `jest.config.*`, `vitest.config.*`, `pytest.ini`, `pyproject.toml [tool.pytest]`, etc. |
| Lint configuration | Glob for lint config: `.eslintrc.*`, `biome.json`, `.rubocop.yml`, `clippy.toml`, `ruff.toml`, `.golangci.yml`, etc. |
| CI/CD | Glob for `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, etc. |
| Type system | Check for strict mode: `tsconfig.json` strict flag, `mypy.ini`, type annotations density |
| Existing harness | Check for `docs/harness/` and `.state.json` |

**Import pattern detection by language:**

- JavaScript/TypeScript: `import .* from`, `require(`
- Python: `^import `, `^from .* import`
- Go: `import \(` block or single `import "`
- Rust: `^use `, `^mod `
- Java/Kotlin: `^import `

From the import graph, infer the dependency direction between modules (which modules import which).

**Pattern divergence detection:**

This is critical for Phase 2. For each of these common concerns, scan for multiple co-existing patterns:

- Error handling (try/catch styles, Result types, error codes, bare throws)
- Logging (framework logger, console.log, print statements, structured vs unstructured)
- Data fetching (raw HTTP, SDK clients, ORM patterns, repository pattern)
- Configuration access (env vars, config objects, dependency injection)
- Test organization (co-located vs separate directory, naming conventions)

Sample 3-5 files per module. Look for structural differences, not just style.

**Scan output:** Build a mental model. Don't generate any files yet. Prepare:
1. A maturity snapshot (what feedback loops and constraints exist)
2. A list of detected pattern divergences (these become Phase 2 questions)
3. A prioritized list of recommended improvements

---

### Phase 1: Assessment & Scope

Present findings and agree on session scope.

**Show the user:**

1. **Maturity snapshot** — Brief assessment:
   - Static analysis: what's enforced (type checking, linting, formatting)
   - Tests: framework, approximate coverage, structural tests (likely none)
   - Runtime verification: whether there's a way to start the app and test it
   - Constraints: what's mechanically enforced vs. only by convention

2. **Pattern divergences found** — Number of concerns with multiple patterns detected

3. **Recommended improvements** — Prioritized list, categorized:
   - Documentation: which harness files would add value
   - Engineering: which lint rules / structural tests / CI checks would close gaps

**Ask the user:**
- Which improvements to tackle this session (can be a subset)
- Which convention file(s) to write the harness entry into (based on detected files)

---

### Phase 2: Knowledge Extraction

The core of this skill. Extract implicit engineering knowledge through guided questions.

Read `references/question-bank.md` for the full question template library.

**Three question types:**

**Type 1 — Pattern Arbitration**: When multiple patterns exist for one concern, present them with occurrence counts and locations, ask user to pick the canonical one. Always offer a "layer-specific" option (pattern A for layer X, pattern B for layer Y) and a "skip" option.

**Type 2 — Inference Confirmation**: Present inferred structural rules (layer model, dependency direction, module boundaries) and ask user to confirm, adjust, or reject. Default to "confirm" to keep things moving.

**Type 3 — Negation Checklist**: Present hypothetical agent behaviors and ask which are unacceptable. This is the most efficient way to extract "principles" — humans are much better at rejecting bad behavior than articulating good behavior from scratch.

**Rules:**
- Every question has a [Skip] option — skipped items go into `.state.json` for next run
- Total questions per session: 8-12 max. Prioritize by impact.
- Batch related questions (all architecture questions together, then conventions, then principles)
- If the project is small or simple, fewer questions. Don't over-engineer.

---

### Phase 3: Generate & Confirm

Generate output based on scan + user answers. Present each piece for confirmation before writing.

#### Documentation Output

Generate files in `docs/harness/`. Read `references/output-templates.md` for templates.

**Golden rule: every file should be as short as possible.** If a file exceeds 40 lines, split it into a brief summary + sub-files for on-demand loading. Agents read code for details — harness docs only contain what code can't tell them.

Only generate files that have actual content from this session. Never create empty placeholders. Never generate extra meta-files like README.md, INDEX.md, navigation guides, or completion reports — the convention file entry serves as the sole navigation point. The only non-harness file allowed is `summary.md` (documenting scan findings and decisions made).

| File | Purpose | Target length |
|---|---|---|
| `architecture.md` | Layer model, dependency rules | 15-30 lines |
| `conventions.md` | Canonical patterns from Phase 2 arbitration | 15-30 lines |
| `principles.md` | Rules from negation checklist | 10-20 lines |
| `exceptions.md` | Intentional deviations that look like bugs | 5-15 lines |
| `protected-zones.md` | Areas needing human approval before agent changes | 5-10 lines |
| `verification-criteria.md` | Declarative "what correct looks like" standards | 15-30 lines |
| `domain-context.md` | Business terms agents need to know | 5-20 lines |
| `workflows/new-feature.md` | Decision framework (NOT checklist) | 15-25 lines |
| `workflows/bug-fix.md` | Decision framework (NOT checklist) | 10-20 lines |

**Convention file entry**: ~10-15 lines added to the chosen convention file. This is the ONLY part always in agent context. It must be a precise, minimal map pointing to `docs/harness/` files. Include detected feedback commands (lint, test, typecheck).

#### Engineering Output

Propose individually, each with explanation. User confirms before applying.

- **Lint rules**: Add architectural constraint rules to the project's existing lint tool. Error messages MUST include a pointer to the relevant `docs/harness/` file — this closes the feedback loop so agents auto-load the right context when they violate a rule.
- **Structural tests**: Tests verifying permanent invariants (dependency direction, naming conventions) in the project's own test framework.
- **CI checks**: Add structural validation step to existing CI pipeline.
- **Pre-commit hooks**: Add constraint checks to existing hook system (if any).

**What NOT to generate:**
- Verification scripts (agents create on-the-fly per task). Note: structural tests that verify permanent architectural invariants (like dependency direction) ARE appropriate to persist — they are not "verification scripts" but "invariant enforcement tests."
- Toolchain docs (agents read project config files directly)
- Module descriptions (agents read the code)
- Anything inferable from existing project files
- Meta/navigation files (README.md, INDEX.md, COMPLETION_REPORT.md, METRICS.md, etc.). The convention file entry IS the navigation. Do not generate any additional summary, index, or report files beyond a single `summary.md` documenting Phase 0-3 decisions for auditability.

---

### Phase 4: Validate (Optional)

Quick sanity check after generation:

- All paths in the convention file entry resolve to real files
- Lint rules are syntactically valid (run the lint tool)
- Structural tests pass
- No conflicting rules between generated files

Fix interactively if anything fails.

---

## Re-run Behavior

When `docs/harness/.state.json` exists:

1. Fresh scan — compare with stored state
2. Show delta: new modules, new patterns, drift between docs and code
3. Re-present previously skipped questions
4. Recommend next-priority improvements
5. Update `.state.json` after session

`.state.json` schema:
```json
{
  "last_run": "ISO-8601 timestamp",
  "tech_stack": {"language": "...", "framework": "..."},
  "questions_answered": {"question_id": "chosen_answer"},
  "questions_skipped": ["question_id"],
  "files_generated": ["docs/harness/architecture.md"],
  "engineering_changes": ["eslint-layer-rules"],
  "confidence": {"architecture.md": "high", "conventions.md": "medium"}
}
```

Low-confidence files get priority review on re-runs.

## Handling Edge Cases

- **Monorepo**: Detect multiple packages/services. Ask user which to harness first, or whether to create a shared harness at root + per-package overrides.
- **Very small project**: Scale down. Maybe only `architecture.md` + `verification-criteria.md` + convention file entry. Don't over-engineer.
- **No tests at all**: Flag this prominently in Phase 1. Recommend adding a basic test setup as highest priority engineering change.
- **Existing convention file has content**: APPEND the harness section. Never overwrite existing content.
