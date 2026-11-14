---
name: site-palette
description: Choose a website's or web app's colour palette the way a professional design team does. Run a short brand interview, then open an interactive local picker. It shows rounds of complete palettes built from hand-tuned Radix colour scales on a realistic preview page (gaming/media or SaaS), learns from the user's likes and skips, and can turn reference images they love into candidates. A fine-tune screen with live WCAG contrast and colour-blindness checks follows. Finish by exporting light and dark CSS variables and W3C design tokens and wiring them into the project. Use it whenever the user wants to pick, create, refresh or rework the colours, colour scheme, theme, palette or brand colours of a site or app. Also use it to set up colour tokens or CSS variables, add dark-mode colours, or fix colour contrast across a site, even if they only ask "what colours should my site use?". Not for chart or data-viz palettes, logo or image generation, or recolouring a single component.
---

# Site palette

Two lessons shape this skill:

1. **Don't generate colours from formulas; curate them.** Every colour comes from Radix Colors: 31 hand-tuned 12-step scales, with light and dark themes tuned separately, plus documented grey pairings (`app/radix-colors.js`, MIT). Algorithms only combine curated parts, check contrast, and map steps to tokens.
2. **Don't guess the user's taste; learn it.** A few directions written by Claude are a poor sample of what someone might like. The picker shows rounds of 8 complete palettes on the right kind of page. The first round is chosen to be as varied as possible. Later rounds move toward what the user liked and away from what they skipped. Reference images the user loves become candidates too.

Your job is to set good starting conditions: a brief, priors and references. After that, let the user's reactions decide, then turn the result into working code.

`SKILL_DIR` means this skill's directory. The scripts need Node 18+ or Bun (use `bun` in place of `node`), with no install step. Run them from the user's working directory.

| Path | Purpose |
|---|---|
| `scripts/serve.mjs` | Serves the picker on 127.0.0.1, waits for **Send to Claude**, writes the files, exits |
| `scripts/export.mjs` | Rebuilds the files from a saved state, with optional edits. Prints the report and a Tailwind v4 mapping |
| `app/` | The picker page, `palette-core.js` (engine: scales → tokens → checks, candidate pool, taste learning) and `radix-colors.js` |
| `references/priors.md` | How to turn a brief into priors and references. Read it before step 3 |
| `references/integration.md` | How to wire the tokens into plain CSS, Tailwind v3/v4, shadcn/ui and design tools. Read it before step 6 |

## 1. Look before asking

In a web project, check the stack (`package.json`, the global stylesheet, the Tailwind config, shadcn/ui), the existing colours (CSS variables, frequent hex values, the logo fill) and the dark-mode convention (`.dark` or `[data-theme="dark"]`). An existing `palette.state.json` (usually in `design/palette/`) means this is a revision. Skip the interview and reopen it (step 4); the picker opens in fine-tune mode with every setting, vote and override restored.

Outside a web project the files go to a temporary directory, and you tell the user where.

## 2. Short brand interview

Ask only what you couldn't infer, in a single message, and keep it to four questions or fewer:

1. What is the site, and who is it for?
2. Three words for how it should feel?
3. Is there a colour that must stay (logo, existing brand) or must be avoided?
4. **Any sites, apps, games or artwork whose colours they love?** Links or images. These are the strongest signal you can get, so ask even if the other answers are clear.

Dark mode is always exported. Ask which theme matters more only if it's unclear; that decides which one the thumbnails show first.

## 3. Priors and references

Read `references/priors.md`. Then:

- **Priors** are soft weights over Radix families, background characters and accent relationships. They make likely candidates appear more often; they don't exclude anything. Keep a baseline for everything else, because the point of the rounds is to let the user surprise you.
- **References:** for links, take screenshots with whatever browser tool is available. Headless Chrome works: `"$CHROME" --headless --screenshot=<tmp>/ref-1.png --window-size=1440,900 <url>`. Save images to the temporary directory. Each reference becomes a labelled candidate in round 1 and pulls later rounds toward it.
- **A fixed brand colour** goes in `fixedBrand`. Every candidate then keeps it exactly at step 9 of the nearest family, and only the accent and background vary.

## 4. Launch the picker

Write the brief to a temporary directory (`mktemp -d`):

```json
{
  "project": "LootShelf",
  "summary": "Game-collection site for players: warm, interesting, energetic",
  "preview": "gaming",
  "theme": "dark",
  "priors": {
    "brand": { "orange": 1, "tomato": 1, "amber": 0.9, "crimson": 0.8, "ruby": 0.8, "pink": 0.8 },
    "bg": { "neutral": 0.6, "tinted": 0.8, "deep": 1 },
    "accent": { "none": 0.3, "analogous": 0.8, "contrast": 1 }
  },
  "references": [{ "path": "/tmp/x/ref-1.png", "label": "Hades key art" }],
  "fixedBrand": null,
  "avoid": [],
  "defaults": { "export": { "darkSelector": ".dark", "prefix": "color-" } },
  "state": null
}
```

`preview` is `gaming` (media and collection sites, dark-first, cover art) or `saas` (product and marketing pages, forms, alerts); the user can switch it in the picker. `defaults` is any partial state, such as export options or `rules.target: "AAA"`. `state` is the full content of a previous `palette.state.json`, used for revisions.

Pick the output directory (`design/palette/` in a web project, otherwise the temporary directory), then start the server **in the background**, so you'll be notified when it exits:

```bash
node "$SKILL_DIR/scripts/serve.mjs" --brief "$TMP/brief.json" --out "<project>/design/palette"
```

It opens the browser and prints the URL. Tell the user, briefly, how it works:

1. **Explore:** mark candidates ♥ or ✕ and press **Next round**. Two or three rounds are usually enough. They can also drop in screenshots or artwork at any time.
2. **Fine-tune →** on the closest candidate: adjust the brand, accent and background families, an exact brand colour, status colours and contrast rules. They can switch between the gaming and SaaS preview pages.
3. **Send to Claude.**

The process exits with code 0 after printing `SUBMITTED` and the paths of the files it wrote. Exit code 2 means a timeout (2 hours) or a cancel. The user may keep chatting while the picker is open, but you can't see their votes until they send.

- If there's no local display, add `--no-open --port 4321` and suggest `ssh -L 4321:127.0.0.1:4321`.
- If the server can't be reached, they can open `SKILL_DIR/app/picker.html` directly and press **Download files**.

**If the user dislikes everything** after a couple of rounds, don't patch the priors and repeat. Ask for references (sites, games, posters, film stills) and add them. Taste is much easier to show than to describe.

## 5. Review what came back

Read `palette.state.json`. `summary.families` names the Radix family behind each scale, `summary.light` and `summary.dark` list every resolved token, `report` lists failures, automatic adjustments, warnings and notes, and `state.taste` holds their votes. Tell the user, briefly:

- What they chose: brand, accent and background character, and their exact brand colour if one was given.
- Each automatic adjustment, in plain words. For example: "In light mode the warning icon uses amber-11, because amber-9 is too pale on white."
- The button-text convention. "Bold labels, 3:1" is the Radix style and meets WCAG only for bold or large text; "strict" gives 4.5:1 everywhere.
- Any failures (only after manual overrides), warnings and notes, each with one concrete fix you can apply.

## 6. Wire it into the project

Read `references/integration.md` and follow the section for the user's stack. Making the tokens available is safe to do straight away: add `palette.css`, import it, map framework names, and set the page background and text from tokens. Replacing existing colour definitions, or sweeping hard-coded colours out of components, changes existing UI. Report how many you found and where, and ask before migrating. Commit `palette.state.json` together with the CSS.

## 7. Iterate

- **Small, specific changes** ("one step darker buttons in light mode", "AAA", "deep plum background instead"): use `export.mjs` instead of the picker. Steps are 1–12 or `"white"`.
  ```bash
  node "$SKILL_DIR/scripts/export.mjs" --state design/palette/palette.state.json \
    --set background.mode=deep --set background.family=plum --set overrides.light.primary=10 --out design/palette
  ```
  Run it without `--out` first to see the report.
- **Taste changes:** relaunch the picker with `state` set to the previous file. The votes carry over, so the new rounds continue from what the user already said.

## Principles behind the defaults

- **Curated scales, fixed step jobs.** 1 page background, 2 subtle background, 3–5 element backgrounds, 6–8 borders, 9 solid fill, 10 hover, 11–12 text. Tokens map to steps, and dark mode swaps the scales rather than the mapping.
- **A deep background is a dark-theme character.** In light theme the page stays on the neutral greys, and a brand tint colours only the page backgrounds. Borders and muted text always come from the greys.
- **The user decides taste; the engine reports, it doesn't silently override.** Auto-fixed tokens are labelled, manual overrides always win but are still checked, and contrast results are reported exactly.
- **Mostly neutral, brand for action, accent for about 10%:** badges, ratings, highlights and gradients.
