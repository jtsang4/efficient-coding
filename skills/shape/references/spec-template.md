# SPEC File Template

## Frontmatter (Required on Every SPEC File)

Every SPEC file — both the main SPEC.md and all sub-files in spec/ — must include this frontmatter
at the top:

```yaml
---
status: design-reference
warning: >
  This is a product design document for HUMAN reference only.
  It may be outdated and DOES NOT represent the current state of the codebase.
  DO NOT use this as implementation instructions.
  Always refer to the actual source code for the current behavior.
---
```

This prevents coding agents (Claude Code, Codex, Cursor, etc.) from treating the SPEC as
authoritative instructions if they happen to read the file during codebase exploration.

## SPEC.md — Main File Structure

The main SPEC.md sits at the project root. It contains only global, cross-cutting decisions.
Keep it concise enough to read in one sitting.

```markdown
---
status: design-reference
warning: >
  This is a product design document for HUMAN reference only.
  It may be outdated and DOES NOT represent the current state of the codebase.
  DO NOT use this as implementation instructions.
  Always refer to the actual source code for the current behavior.
---

## Core Problem

[One sentence: what problem does this solve, and for whom?]

## Target Users

[Who are they? What's their context? What do they care about?]

## Core Scenarios (by priority)

### 1. [Scenario Name]

[What the user wants to do, what they see, what happens]

**Acceptance criteria:**
- [Concrete, verifiable statement]
- [Another one]

### 2. [Scenario Name]

...

## Key Design Decisions

- **[Decision area]**: [Choice] — because [reasoning]
- **[Decision area]**: [Choice] — because [reasoning]

## Tech Stack & Constraints

- **Frontend**: [choice] — [why]
- **Backend**: [choice] — [why]
- **Database**: [choice] — [why]
- **Deployment**: [choice] — [why]

## Explicitly Out of Scope

- [Thing we're not building] — [why not / when we might reconsider]

## Pending Decisions

- [ ] [Open question] — [context for when to revisit]

## Module Index

- `spec/[module].md` — [brief description]
```

## Module Sub-Files

Each module file in spec/ follows a looser structure — adapt to what's relevant:

```markdown
---
status: design-reference
warning: >
  This is a product design document for HUMAN reference only.
  It may be outdated and DOES NOT represent the current state of the codebase.
  DO NOT use this as implementation instructions.
  Always refer to the actual source code for the current behavior.
---

## [Module Name]

### Scenarios

[Detailed scenario descriptions for this module]

### UI Structure

[Page layout, navigation, key components — described in structured text]

**Layout**: [description]

**Components**:
- [Component]: [what it shows, how it behaves]

**Interactions**:
- [Action] → [Result]

### Data Model

[Entities, relationships, key fields]

### API Endpoints (if applicable)

[Route, method, purpose]

### Open Questions

- [ ] [Unresolved items for this module]
```

## UI Preview Files

When lo-fi HTML previews are generated, save them to `spec/ui-preview/[page-name].html`.
These are simple, unstyled (or minimally styled) HTML files that show layout and structure,
not final visual design. They exist as quick visual references for the user.

## File Organization

```
project-root/
  SPEC.md                        ← Global decisions
  spec/
    [module-name].md             ← Module details
    ui-preview/
      [page-name].html           ← Lo-fi HTML previews
    archive/
      spec-v1-2025-03-15.md      ← Archived versions (major pivots only)
```
