---
name: i-diagram
description: Create professional SVG diagrams of any type — architecture diagrams, flowcharts, sequence diagrams, structural diagrams, mind maps, timelines, illustrative/conceptual diagrams, and more. Supports light (default) and dark themes. Use this skill whenever the user asks for any kind of technical or conceptual diagram, visualization of a system, process flow, data flow, component relationship, network topology, decision tree, org chart, state machine, or any visual representation of structure/logic/process. Also trigger when the user says "画个图" "画一个架构图" "diagram" "flowchart" "sequence diagram" "draw me a ..." or uploads content and asks to visualize it. Output is always a standalone .svg file.
version: 1.118.0
---

# Diagram Generator

Create professional SVG diagrams across multiple diagram types. All output is a single self-contained `.svg` file with embedded styles and fonts.

## Theme Selection

Two themes are supported: **light** (default) and **dark**.

- Use the **light** theme unless the user explicitly asks for dark (e.g. "暗色" "深色主题" "dark mode" "dark theme")
- All colors in this document are defined as **theme tokens** — pick the column matching the selected theme and use those literals consistently throughout the SVG
- Never mix tokens from both themes in one diagram

## Supported Diagram Types

| Type | When to Use | Key Characteristics |
|------|-------------|-------------------|
| **Architecture** | System components & relationships | Grouped boxes, connection arrows, region boundaries |
| **Flowchart** | Decision logic, process steps | Diamond decisions, rounded step boxes, directional flow |
| **Sequence** | Time-ordered interactions between actors | Vertical lifelines, horizontal messages, activation bars |
| **Structural** | Class diagrams, ER diagrams, org charts | Compartmented boxes, typed relationships (inheritance, composition) |
| **Mind Map** | Brainstorming, topic exploration | Central node, radiating branches, organic layout |
| **Timeline** | Chronological events | Horizontal/vertical axis, event markers, period spans |
| **Illustrative** | Conceptual explanations, comparisons | Free-form layout, icons, annotations, visual metaphors |
| **State Machine** | State transitions, lifecycle | Rounded state nodes, labeled transitions, start/end markers |
| **Data Flow** | Data transformation pipelines | Process bubbles, data stores, external entities |

## Design System

All colors below are **theme tokens**. After selecting the theme, substitute every token with its literal value from the matching column. Token placeholders like `{bg}`, `{text}`, `{line}` appear in code snippets throughout this document and the reference files.

### Base Tokens

| Token | Light (default) | Dark | Use For |
|-------|-----------------|------|---------|
| `{bg}` | `#f8fafc` | `#0f172a` | Canvas background, masking rects |
| `{grid}` | `#e2e8f0` | `#1e293b` | Background grid lines |
| `{text}` | `#0f172a` | `white` | Primary labels, component names |
| `{text-sub}` | `#64748b` | `#94a3b8` | Sublabels, descriptions, annotations |
| `{text-msg}` | `#334155` | `#e2e8f0` | Message/arrow labels |
| `{line}` | `#64748b` | `#64748b` | Default arrows, connection lines |
| `{line-soft}` | `#94a3b8` | `#334155` | Lifelines, dividers, subtle lines |

### Color Palette

Semantic colors for component categories:

| Category | Light Fill | Light Stroke | Dark Fill | Dark Stroke | Use For |
|----------|------------|--------------|-----------|-------------|---------|
| Primary | `rgba(207, 250, 254, 0.7)` | `#0891b2` | `rgba(8, 51, 68, 0.4)` | `#22d3ee` | Frontend, user-facing, inputs |
| Secondary | `rgba(209, 250, 229, 0.7)` | `#059669` | `rgba(6, 78, 59, 0.4)` | `#34d399` | Backend, services, processing |
| Tertiary | `rgba(237, 233, 254, 0.7)` | `#7c3aed` | `rgba(76, 29, 149, 0.4)` | `#a78bfa` | Database, storage, persistence |
| Accent | `rgba(254, 243, 199, 0.6)` | `#d97706` | `rgba(120, 53, 15, 0.3)` | `#fbbf24` | Cloud, infrastructure, regions |
| Alert | `rgba(255, 228, 230, 0.7)` | `#e11d48` | `rgba(136, 19, 55, 0.4)` | `#fb7185` | Security, errors, warnings |
| Connector | `rgba(255, 237, 213, 0.6)` | `#ea580c` | `rgba(251, 146, 60, 0.3)` | `#fb923c` | Buses, queues, middleware |
| Neutral | `rgba(241, 245, 249, 0.8)` | `#64748b` | `rgba(30, 41, 59, 0.5)` | `#94a3b8` | External, generic, unknown |
| Highlight | `rgba(219, 234, 254, 0.7)` | `#2563eb` | `rgba(59, 130, 246, 0.3)` | `#60a5fa` | Active state, focus, current step |

In snippets, `FILL` / `STROKE` refer to the selected category's fill/stroke in the active theme. When a snippet hardcodes a category color (e.g. a cyan stroke), translate it to the same category's value in the active theme.

For flowcharts and sequence diagrams, assign colors by role (actor, decision, process) rather than by technology.

### Typography

Use embedded SVG `@font-face` or system monospace fallback:

```svg
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&amp;display=swap');
  text { font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace; }
</style>
```

Font sizes by role:
- **Title:** 16px, weight 700, color `{text}`
- **Component name:** 11-12px, weight 600, color `{text}`
- **Sublabel / description:** 9px, weight 400, color `{text-sub}`
- **Annotation / note:** 8px, weight 400
- **Tiny label (on arrows):** 7-8px

### Core Visual Elements

**Background:** `{bg}` with subtle grid:
```svg
<defs>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="{grid}" stroke-width="0.5"/>
  </pattern>
</defs>
<rect width="100%" height="100%" fill="{bg}"/>
<rect width="100%" height="100%" fill="url(#grid)"/>
```

**Arrowhead marker (standard):**
```svg
<marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
  <polygon points="0 0, 10 3.5, 0 7" fill="{line}"/>
</marker>
```

**Arrowhead marker (colored) — create per-color as needed, using the category stroke for the active theme:**
```svg
<marker id="arrow-primary" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
  <polygon points="0 0, 10 3.5, 0 7" fill="STROKE"/>
</marker>
```

**Open arrowhead (for async/return messages):**
```svg
<marker id="arrow-open" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
  <polyline points="0 0, 10 3.5, 0 7" fill="none" stroke="{line}" stroke-width="1.5"/>
</marker>
```

### SVG Structure & Layering

Draw elements in this order to get correct z-ordering (SVG paints back-to-front):

1. Background fill + grid pattern
2. Region/group boundaries (dashed outlines)
3. Connection arrows and lines
4. Opaque masking rects (same position as component boxes, `fill="{bg}"`)
5. Component boxes (semi-transparent fill + stroke)
6. Text labels
7. Legend (bottom-right or bottom area, outside all boundaries)
8. Title block (top-left)

The opaque masking rect trick is essential — semi-transparent component fills will show arrows underneath without it:
```svg
<!-- Mask layer: opaque background to hide arrows -->
<rect x="100" y="100" width="160" height="60" rx="6" fill="{bg}"/>
<!-- Visual layer: styled component -->
<rect x="100" y="100" width="160" height="60" rx="6" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
<text x="180" y="125" fill="{text}" font-size="11" font-weight="600" text-anchor="middle">API Gateway</text>
<text x="180" y="141" fill="{text-sub}" font-size="9" text-anchor="middle">Kong / Nginx</text>
```

### Spacing Rules

These prevent overlapping — follow them strictly:

- **Component box height:** 50-70px (standard), 80-120px (large/complex)
- **Minimum gap between components:** 40px vertical, 30px horizontal
- **Arrow label clearance:** 10px from any box edge
- **Region boundary padding:** 20px inside edges around contained components
- **Legend placement:** At least 20px below the lowest diagram element
- **Title block:** 20px from top-left, outside diagram content area
- **viewBox:** Always extend to fit all content + 30px padding on all sides

### Component Patterns

**Standard box (service/process):**
```svg
<rect x="X" y="Y" width="160" height="60" rx="6" fill="{bg}"/>
<rect x="X" y="Y" width="160" height="60" rx="6" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
<text x="CX" y="Y+24" fill="{text}" font-size="11" font-weight="600" text-anchor="middle">Name</text>
<text x="CX" y="Y+40" fill="{text-sub}" font-size="9" text-anchor="middle">description</text>
```

**Decision diamond (flowchart) — Accent category:**
```svg
<g transform="translate(CX, CY)">
  <polygon points="0,-35 50,0 0,35 -50,0" fill="{bg}"/>
  <polygon points="0,-35 50,0 0,35 -50,0" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
  <text y="4" fill="{text}" font-size="10" font-weight="600" text-anchor="middle">Condition?</text>
</g>
```

**Database cylinder — Tertiary category:**
```svg
<g transform="translate(X, Y)">
  <rect x="0" y="10" width="120" height="50" rx="2" fill="{bg}"/>
  <ellipse cx="60" cy="10" rx="60" ry="12" fill="{bg}"/>
  <ellipse cx="60" cy="60" rx="60" ry="12" fill="{bg}"/>
  <rect x="0" y="10" width="120" height="50" fill="FILL"/>
  <ellipse cx="60" cy="10" rx="60" ry="12" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
  <ellipse cx="60" cy="60" rx="60" ry="12" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
  <line x1="0" y1="10" x2="0" y2="60" stroke="STROKE" stroke-width="1.5"/>
  <line x1="120" y1="10" x2="120" y2="60" stroke="STROKE" stroke-width="1.5"/>
  <text x="60" y="40" fill="{text}" font-size="11" font-weight="600" text-anchor="middle">PostgreSQL</text>
</g>
```

**Region boundary — Accent stroke:**
```svg
<rect x="X" y="Y" width="W" height="H" rx="12" fill="none" stroke="STROKE" stroke-width="1" stroke-dasharray="8,4"/>
<text x="X+12" y="Y+16" fill="STROKE" font-size="9" font-weight="600">AWS us-east-1</text>
```

**Security group — Alert stroke:**
```svg
<rect x="X" y="Y" width="W" height="H" rx="8" fill="none" stroke="STROKE" stroke-width="1" stroke-dasharray="4,4"/>
<text x="X+10" y="Y+14" fill="STROKE" font-size="8" font-weight="500">VPC / Security Group</text>
```

## Type-Specific Layout Guidance

Determine this SKILL.md file's directory path as `{baseDir}`. Read the reference file for the specific diagram type before starting layout. Reference files are located at `{baseDir}/references/` and contain detailed layout algorithms and examples. Snippets in reference files use the same `{token}` / `FILL` / `STROKE` placeholders — resolve them against the active theme.

### Architecture Diagrams
→ Read `{baseDir}/references/architecture.md`

Key points: left-to-right or top-to-bottom data flow. Group related services in region boundaries. Use buses/connectors between layers. Place databases at the bottom or right.

### Flowcharts
→ Read `{baseDir}/references/flowchart.md`

Key points: top-to-bottom primary flow. Diamonds for decisions with Yes/No labels on exit arrows. Rounded rectangles for start/end. Use the Highlight color for the happy path.

### Sequence Diagrams
→ Read `{baseDir}/references/sequence.md`

Key points: actors as boxes at top, vertical dashed lifelines, horizontal arrows for messages (solid=sync, dashed=return). Time flows downward. Activation bars show processing. Number messages if complex.

### Structural Diagrams
→ Read `{baseDir}/references/structural.md`

Key points: compartmented boxes (name / attributes / methods for class diagrams). Relationship lines: solid with filled diamond=composition, solid with empty diamond=aggregation, dashed arrow=dependency, solid triangle=inheritance.

### Mind Maps
Free-form radiating layout from a central concept. Use organic curves (`<path>` with cubic beziers) for branches. Vary branch colors using the palette. Larger font for central node, decreasing as you go outward.

### Timelines
Horizontal or vertical axis line. Event markers as circles or diamonds on the axis. Description text offset to alternating sides to avoid overlap. Use color to categorize event types.

### State Machines
Rounded-rect states with double-border for composite states. Filled circle for initial state, bullseye for final state. Curved arrows for self-transitions. Label all transitions with `event [guard] / action` format.

## Output Rules

1. Output a **single `.svg` file** — no external dependencies except the Google Fonts import
2. Set `viewBox` to fit all content with 30px padding; do NOT set fixed `width`/`height` attributes (let the SVG scale responsively)
3. Include `xmlns="http://www.w3.org/2000/svg"` on the root `<svg>` element
4. Put all `<style>`, `<defs>`, markers, and patterns at the top of the SVG
5. Use `text-anchor="middle"` for centered labels; ensure text doesn't overflow boxes
6. **Chinese text support:** When labels contain Chinese characters, use `font-family: 'JetBrains Mono', 'Noto Sans SC', 'PingFang SC', sans-serif'` and increase box widths — CJK characters are wider
7. **Save location:** If the input is a file, save to `{inputFileDir}/diagram/`. Otherwise save to `{projectDir}/diagram/{topic-slug}/`. Create the directory if it doesn't exist

## Script

Determine this SKILL.md file's directory path as `{baseDir}`. Script path: `{baseDir}/scripts/main.ts`.

Resolve `${BUN_X}` runtime: if `bun` installed → `bun`; if `npx` available → `npx -y bun`; else suggest installing bun.

### SVG → @2x PNG

After saving the SVG, convert it to a @2x PNG:

```bash
${BUN_X} {baseDir}/scripts/main.ts <svg-path> [options]
```

Options:
- `-s, --scale <n>` — Scale factor (default: 2)
- `-o, --output <path>` — Custom output path (default: `<input>@2x.png`)
- `--json` — JSON output

## Process

1. Identify the diagram type from the user's request
2. Determine the theme: light by default; dark only if the user asked for it
3. Read the relevant reference file if one exists for that type
4. Plan the layout: list all components, determine grouping and flow direction, calculate positions
5. Write the SVG following the layering order above, resolving all theme tokens to the selected theme's literal values
6. Verify spacing rules — no overlaps, legends outside boundaries, viewBox large enough
7. Save the SVG file
8. Run `${BUN_X} {baseDir}/scripts/main.ts <svg-path>` to generate @2x PNG
9. Present both files to the user
