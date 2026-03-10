# Output Templates

Templates for Phase 3 generation. Every file must be as concise as possible — agents read actual code for details. Harness docs only contain what code CANNOT tell agents: rules, choices, invariants, domain knowledge.

---

## Convention File Entry

Add this to the user's chosen convention file (AGENTS.md, CLAUDE.md, etc.). APPEND to existing content — never overwrite.

```markdown
## Harness

Project context for AI agents: `docs/harness/`. Load relevant files before making changes.

- Architecture & dependency rules: `docs/harness/architecture.md`
- Coding conventions: `docs/harness/conventions.md`
- Core principles: `docs/harness/principles.md`
- Protected zones (need human approval): `docs/harness/protected-zones.md`
- Verification criteria: `docs/harness/verification-criteria.md`

{Only list files that actually exist. Remove lines for files not generated.}

Feedback commands: `{detected_lint_cmd}`, `{detected_test_cmd}`, `{detected_typecheck_cmd}`
```

Keep to ~10-15 lines. This is the ONLY part always in agent context.

---

## architecture.md

```markdown
# Architecture

## Layer Model

{layer_1} -> {layer_2} -> ... -> {layer_N}

Each layer imports only from layers to its left.

## Dependency Rules

- {rule_1, e.g., "Services never import from UI"}
- {rule_2}
- Cross-cutting concerns ({list}): access via {pattern, e.g., "Provider interface"}

## Enforcement

{If lint rules were generated: "Enforced by {lint_tool} — see {config_path}"}
{If structural tests were generated: "Structural tests in {test_path}"}
```

Target: 15-30 lines. State rules only. Don't describe what modules do — agents read the code.

---

## conventions.md

```markdown
# Conventions

## {Concern 1, e.g., Error Handling}

Canonical pattern: {brief description}
Reference implementation: `{file_path}`

## {Concern 2, e.g., Logging}

Canonical pattern: {brief description}
Reference implementation: `{file_path}`

## {Concern N}

...
```

Target: 15-30 lines. For each convention, state the canonical pattern and point to ONE reference file as example. Don't explain alternatives or rationale — just the chosen standard.

---

## principles.md

```markdown
# Principles

## Prohibited Actions

- {action_1, e.g., "Do not introduce new dependencies without human approval"}
- {action_2}
- {action_N}

## Required Practices

- {practice_1, e.g., "Every new feature must include tests"}
- {practice_2}
```

Target: 10-20 lines. Derived from Phase 2 Type 3 negation checklist. Direct, imperative statements. No explanations.

---

## exceptions.md

```markdown
# Known Exceptions

Patterns that look wrong but are intentional. Do not "fix" these.

- `{file_or_pattern}`: {brief explanation why it's intentional}
- `{file_or_pattern}`: {brief explanation}
```

Target: 5-15 lines. Only include if users report specific exceptions during Phase 2.

---

## protected-zones.md

```markdown
# Protected Zones

These areas require human approval before modification. Do not change autonomously.

- `{path_or_module}`: {reason}
- `{path_or_module}`: {reason}
```

Target: 5-10 lines. Derived from Phase 2 negation checklist items about sensitive areas.

---

## verification-criteria.md

This is DECLARATIVE — it states what "correct" means, not how to check it. Agents determine verification methods per task.

```markdown
# Verification Criteria

## Always (every change)

- All static analysis passes with zero new warnings
- All existing tests pass
- Application starts without errors

## Feature Work

- New functionality has test coverage
- {UI projects: affected pages render without console errors}
- {API projects: endpoints return expected status codes and response shapes}

## Bug Fixes

- Original bug is no longer reproducible
- Regression test covers the fixed scenario

## Project-Specific

- {criteria from user input, e.g., "No API response exceeds 200ms"}
- {criteria}
```

Target: 15-30 lines. State success criteria. Never include commands or scripts.

---

## domain-context.md

```markdown
# Domain Context

## Key Terms

- **{term}**: {one-line definition}
- **{term}**: {one-line definition}

## Domain Rules

- {rule, e.g., "An order cannot be modified after status is 'shipped'"}
```

Target: 5-20 lines. Only generate if user provides domain terms in Phase 2.

---

## workflows/new-feature.md

Decision framework, NOT a checklist. Agents navigate decisions, not follow steps.

```markdown
# New Feature Workflow

## Before Starting

- Read `architecture.md` — identify which layers this feature touches
- Read `conventions.md` — check canonical patterns for relevant concerns

## Key Decisions

- **New module needed?** Follow layer model in `architecture.md`
- **New dependency needed?** {policy from principles.md, e.g., "Requires human approval"}
- **Touches protected zone?** See `protected-zones.md` — escalate to human

## Completion

Satisfy all criteria in `verification-criteria.md` ("Always" + "Feature Work" sections).
```

Target: 15-25 lines.

---

## workflows/bug-fix.md

```markdown
# Bug Fix Workflow

## Before Starting

- Reproduce the bug first — understand the failure before changing code
- Identify root cause location — check which module/layer is involved

## Key Decisions

- **Root cause in protected zone?** See `protected-zones.md` — escalate to human
- **Fix requires architectural change?** Read `architecture.md`, consider scope

## Completion

Satisfy all criteria in `verification-criteria.md` ("Always" + "Bug Fixes" sections).
```

Target: 10-20 lines.

---

## .state.json

```json
{
  "last_run": "2026-03-10T12:00:00Z",
  "tech_stack": {
    "language": "typescript",
    "framework": "next.js",
    "test_runner": "vitest",
    "lint_tool": "eslint",
    "ci_platform": "github-actions"
  },
  "questions_answered": {
    "error_handling": "try-catch-custom-error",
    "layer_model": "confirmed",
    "logging": "structured-logger"
  },
  "questions_skipped": ["domain_context", "state_management"],
  "files_generated": [
    "docs/harness/architecture.md",
    "docs/harness/conventions.md",
    "docs/harness/principles.md",
    "docs/harness/verification-criteria.md"
  ],
  "engineering_changes": [
    "eslint-import-restrictions",
    "structural-test-layer-deps"
  ],
  "confidence": {
    "architecture.md": "high",
    "conventions.md": "medium"
  }
}
```

---

## Structural Test Examples

These verify permanent invariants. Write in the project's own test framework.

### Concept (language-agnostic)

```
Test: "Layer dependency direction"
  For each source file in {higher_layer}:
    Collect all import paths
    Assert: none of the imports resolve to files in {lower_layer_that_should_not_be_imported}
```

### TypeScript (Jest/Vitest) example

```typescript
import { glob } from 'glob';
import { readFileSync } from 'fs';

describe('Architecture: Layer Dependencies', () => {
  it('services should not import from ui layer', () => {
    const serviceFiles = glob.sync('src/services/**/*.ts');
    for (const file of serviceFiles) {
      const content = readFileSync(file, 'utf-8');
      const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
      const uiImports = imports.filter(i => i.includes('/ui/'));
      expect(uiImports).toEqual([]);
    }
  });
});
```

### Python (pytest) example

```python
import ast
from pathlib import Path

def test_services_do_not_import_ui():
    for f in Path("src/services").rglob("*.py"):
        tree = ast.parse(f.read_text())
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                module = node.module or ""
                assert "ui" not in module, f"{f}: imports from ui layer"
```

### Lint Rule Error Messages

When generating lint rules, always include a remediation pointer:

```json
{
  "message": "Services layer cannot import from UI layer. See docs/harness/architecture.md for dependency rules."
}
```

This closes the feedback loop — when an agent violates a rule, the error message tells it where to find the context to understand why and how to fix it.
