# Wiring the palette into a project

The picker writes three files:

| File | What it is | Commit it? |
|---|---|---|
| `palette.css` | Scales plus semantic tokens. The light theme is on `:root`; the dark theme on the dark selector **redefines the scales**, because Radix tunes dark scales separately. Optionally a `prefers-color-scheme` block | Yes, this is what the app uses |
| `palette.tokens.json` | The same data in W3C Design Tokens format (for Figma Tokens/Tokens Studio, Style Dictionary) | Yes, if design tools use it |
| `palette.state.json` | Every picker setting and the user's votes, plus a summary and the report | Yes, it's how the palette gets reopened |

Generated names use the default prefix `color-`:

- **Scales:** `--{prefix}{scale}-{1..12}` for `brand`, `accent`, `neutral`, `canvas` (the page background family), `success`, `warning`, `danger` and `info`, plus `--{prefix}neutral-ink` (near-black text for bright fills). A scale that equals another one (for example accent "none" or a neutral canvas) is left out, and tokens point at the scale it copies.
- **Semantic tokens:** `bg`, `bg-subtle`, `surface`, `surface-hover`, `border`, `border-strong`, `text`, `text-muted`, `primary`, `primary-hover`, `on-primary`, `primary-subtle`, `primary-text`, `ring`, `accent`, `on-accent`, `accent-subtle` and `accent-text`. Each status colour adds `{status}`, `-subtle`, `-text` and `-border`.
- **`--gradient-brand`:** primary → accent, for logos, progress bars and hero highlights.

Components should reference semantic tokens only. Scale steps are for the rare one-off where no semantic token fits, and even then think about adding a token instead. Radix step jobs: 1 page, 2 subtle background, 3–5 element backgrounds, 6–8 borders, 9 solid fill, 10 hover, 11–12 text.

The scales come from Radix Colors (MIT). The generated CSS says so in its header comment; keep that comment.

## Plain CSS / any framework

```css
/* global stylesheet */
@import "../design/palette/palette.css";   /* or copy it next to this file */

html { background: var(--color-bg); color: var(--color-text); }
a { color: var(--color-primary-text); }
:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
```

Theme switching: set `data-theme="dark"` or `"light"` on `<html>`, or whatever dark selector was exported. With `export.media` on, the OS setting applies unless the page sets one explicitly. To avoid a flash of the wrong theme, set the attribute in a small inline script in `<head>` before the CSS loads:

```html
<script>
  const t = localStorage.getItem('theme');
  if (t) document.documentElement.dataset.theme = t;
</script>
```

## Tailwind CSS v4

Tailwind v4 builds utilities from `@theme` variables. Keep the palette as the source of truth and map it in with `@theme inline`:

1. Export with an **empty prefix**, so names don't collide with Tailwind's own `--color-*` namespace. Either set `defaults.export.prefix: ""` in the brief, or re-export with `--set export.prefix=`.
2. Use the dark selector the project already uses (`.dark` is common). If it relies on the `dark:` variant with a class, make sure `@custom-variant dark (&:where(.dark, .dark *));` is present.
3. Generate the mapping and add it to the main CSS file after importing the palette:

```bash
node "$SKILL_DIR/scripts/export.mjs" --state design/palette/palette.state.json --tailwind-theme
```

This prints an `@theme inline { --color-primary: var(--primary); … }` block that covers every scale step and semantic token. Utilities like `bg-primary`, `text-text-muted`, `border-border` and `bg-brand-3` then work, and they follow the theme automatically, because the variables change under `.dark` while the utilities stay the same.

## Tailwind CSS v3

Export with an empty prefix, then reference the variables in `tailwind.config.js`:

```js
theme: { extend: { colors: {
  bg: 'var(--bg)', surface: 'var(--surface)', border: 'var(--border)',
  primary: { DEFAULT: 'var(--primary)', hover: 'var(--primary-hover)', fg: 'var(--on-primary)', subtle: 'var(--primary-subtle)' },
  // …the remaining semantic tokens, same pattern
} } },
darkMode: ['class', '.dark'],   // match the exported dark selector
```

Opacity modifiers (`bg-primary/50`) don't work with plain `var()` colours in v3. Avoid them, or use `color-mix()` in CSS.

## shadcn/ui

shadcn components read their own variable names. Keep `palette.css` and alias shadcn's names to the palette in `globals.css`. Export with an empty prefix, and use `.dark` as the dark selector:

```css
:root, .dark {
  --background: var(--bg);              --foreground: var(--text);
  --card: var(--surface);               --card-foreground: var(--text);
  --popover: var(--surface);            --popover-foreground: var(--text);
  --primary: var(--primary);            /* same name: delete shadcn's own --primary line instead */
  --primary-foreground: var(--on-primary);
  --secondary: var(--bg-subtle);        --secondary-foreground: var(--text);
  --muted: var(--bg-subtle);            --muted-foreground: var(--text-muted);
  --accent: var(--bg-subtle);           --accent-foreground: var(--text);   /* shadcn "accent" = hover surface */
  --destructive: var(--danger);
  --border: var(--border);              --input: var(--border-strong);
  --ring: var(--ring);
}
```

Self-referencing lines such as `--primary: var(--primary)` are invalid, so delete shadcn's own definitions of any name the palette already provides. shadcn's `--accent` means a hover background, not the brand accent. Map it to `bg-subtle`, and expose the palette's accent under a different name if components need it.

## Design tools and other platforms

- **Figma / Tokens Studio:** import `palette.tokens.json`. Semantic tokens under `theme.light` and `theme.dark` reference scales by alias per theme (`{color.dark.brand.9}`).
- **Style Dictionary:** use `palette.tokens.json` as a source to generate iOS, Android or JS constants.

## Migrating hard-coded colours (ask first)

Count them before proposing a migration. For example:

```bash
rg -o --no-filename '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)' src app components | sort | uniq -c | sort -rn | head -30
```

Map each frequent value to the nearest semantic role (background, border, text, muted text, brand action, status) rather than to the nearest scale step. Show the user the mapping before applying it, because it changes how the existing UI looks.
