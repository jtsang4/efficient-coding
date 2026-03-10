# Question Bank

Templates for Phase 2 knowledge extraction. Pick 8-12 most relevant questions per session based on Phase 0 scan results.

## Type 1: Pattern Arbitration

Use when the scan detects multiple patterns for the same concern. Present with concrete data (file paths, occurrence counts).

### Error Handling

```
I found {N} error handling patterns in your codebase:

  A) {pattern_A_description} ({location_A}, {count_A} occurrences)
  B) {pattern_B_description} ({location_B}, {count_B} occurrences)
  C) {pattern_C_description} ({location_C}, {count_C} occurrences)

Which should be canonical going forward?
  [1] A everywhere
  [2] B everywhere
  [3] Layer-specific: {suggest split based on where patterns cluster}
  [4] Skip
```

### Logging

```
I found these logging approaches:

  A) {structured_logger} ({location}, {count})
  B) {console/print} ({location}, {count})
  C) {other} ({location}, {count})

Which is canonical?
  [1] A — all logging through structured logger
  [2] A for production code, B acceptable in tests/scripts
  [3] Skip
```

### Data Access

```
Data access patterns found:

  A) {repository_pattern} ({location}, {count})
  B) {direct_query} ({location}, {count})
  C) {ORM_calls} ({location}, {count})

Which is canonical?
  [1]-[N] {list options based on findings}
  [N+1] Skip
```

### State Management (frontend)

```
State management approaches:

  A) {approach_A} ({location}, {count})
  B) {approach_B} ({location}, {count})

Which is canonical?
  [1]-[N] {options}
  [N+1] Skip
```

### Configuration Access

```
Configuration is accessed via:

  A) {env_vars_direct} ({count})
  B) {config_object} ({count})
  C) {DI_injection} ({count})

Which is canonical?
  [1]-[N] {options}
  [N+1] Skip
```

**General rules for all Pattern Arbitration questions:**
- Always include actual file paths and occurrence counts from the scan
- Always offer a "layer-specific" option when patterns cluster by module/layer
- If only one pattern exists (no divergence), skip the question — that pattern is canonical by default
- Present maximum 4 options plus Skip

---

## Type 2: Inference Confirmation

Use when the scan infers structural rules. Present the inference and ask for confirmation.

### Layer Model

```
Based on import analysis, I infer this dependency structure:

  {layer_1} → {layer_2} → {layer_3} → ... → {layer_N}

  (Each layer imports only from layers to its left)

Is this your design intent?
  [1] Yes, enforce strictly
  [2] Mostly correct, with exceptions: ___
  [3] Not accurate — let me describe the actual layering
  [4] No strict layering exists / Skip
```

### Module Boundaries

```
I identified these module boundaries:

  {module_1}: {brief_purpose_inferred}
  {module_2}: {brief_purpose_inferred}
  ...

Are these boundaries intentional?
  [1] Yes, these are distinct modules with clear responsibilities
  [2] Mostly — some should be merged or split: ___
  [3] Skip
```

### Cross-cutting Concerns

```
I see {concern} (e.g., auth, logging, metrics) accessed in multiple ways:

  - Direct import from {source} ({count} places)
  - Via dependency injection ({count} places)
  - Via middleware/decorator ({count} places)

Which is the intended access pattern?
  [1] Direct import is fine
  [2] Should always use DI / provider pattern
  [3] Should always use middleware/decorator
  [4] Skip
```

### Test Organization

```
Tests are organized as:

  - {pattern_A}: {description} ({count} files)
  - {pattern_B}: {description} ({count} files)

Which is canonical?
  [1] {pattern_A}
  [2] {pattern_B}
  [3] Skip
```

**General rules for Inference Confirmation:**
- Default should always be "confirm" (option [1]) to reduce friction
- Keep the inference concise — one-line descriptions
- If the inference has low confidence (few data points), say so

---

## Type 3: Negation Checklist

Present hypothetical agent behaviors. Ask user to flag unacceptable ones. This efficiently extracts principles — humans are better at saying "no" than articulating ideals.

### Agent Behavior Boundaries

```
Which of these agent behaviors would be unacceptable in your project?
(Select all that apply)

  [ ] Introduce new third-party dependencies without discussion
  [ ] Modify authentication or authorization logic
  [ ] Create new utility functions instead of reusing existing ones
  [ ] Modify database schemas or migration files
  [ ] Change public API contracts or interfaces
  [ ] Add code without corresponding tests
  [ ] Modify CI/CD pipeline configuration
  [ ] Change environment variable definitions
  [ ] Refactor code outside the scope of the current task
  [ ] Delete or rename existing public functions/methods
```

Adapt this list based on what the scan reveals about the project. For example:
- If the project has a payments module, add "Modify payment processing logic"
- If there's an API gateway, add "Change API routing rules"
- If there's a shared component library, add "Modify shared components without checking consumers"

### Dependency Rules

```
How should agents handle dependencies?

  [1] Free to add any dependency
  [2] Can add dependencies, but must justify in PR description
  [3] Cannot add dependencies — must use existing ones or ask a human
  [4] Skip
```

### Test Requirements

```
What's the minimum test expectation for agent-written code?

  [1] Every change must include tests
  [2] New features need tests; bug fixes need regression tests; refactors are test-optional
  [3] Tests encouraged but not required
  [4] Skip
```

---

## Supplementary Questions (use sparingly)

These are for information that can't be detected from code. Keep brief.

### Business Domain Terms

```
Are there business domain terms agents need to understand?
For example: "A 'workspace' contains multiple 'projects', each with 'environments'"

Enter terms (or skip if none):
> ___
```

This is the ONE place where open-ended input is acceptable, because domain terms genuinely can't be inferred from code. But keep it brief — ask for a one-line glossary, not an essay.

### Agent Task Scope

```
What will agents primarily do in this codebase?

  [ ] New feature implementation
  [ ] Bug fixes
  [ ] Refactoring
  [ ] Test writing
  [ ] All of the above
```

This shapes which workflow files to generate and how to weight verification criteria.

---

## Question Selection Strategy

After Phase 0 scan, select questions by priority:

1. **Always ask**: Layer model confirmation (if dependency structure detected), Agent behavior boundaries
2. **Ask if divergences found**: Pattern arbitration for each divergent concern
3. **Ask if relevant**: Cross-cutting concerns, dependency rules, test requirements
4. **Ask if project has domain complexity**: Business domain terms
5. **Skip for small/simple projects**: Test organization, configuration access, module boundaries (usually obvious)

Target: 8-12 questions total. Batch by type (all Type 2 together, then Type 1, then Type 3).
