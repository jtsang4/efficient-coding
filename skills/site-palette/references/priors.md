# Turning a brief into priors and references

The picker samples from a pool of about 10,000 palettes, every one built from curated Radix scales. Priors only change **how often** a kind of palette appears. They never remove anything, because round 1 needs to be varied for the user's reactions to be informative. Your goal is a good first round, not the answer.

## Prior fields

| Field | Keys | Default when missing |
|---|---|---|
| `priors.brand` | Radix families: tomato, red, ruby, crimson, pink, plum, purple, violet, iris, indigo, blue, cyan, teal, jade, green, grass, brown, orange, sky, mint, lime, yellow, amber, gold, bronze | 0.25 |
| `priors.bg` | `neutral` (grey page), `tinted` (brand-tinted page), `deep` (coloured dark-mode page, e.g. deep indigo or plum) | 0.6 |
| `priors.accent` | `none`, `analogous` (hue within ~75° of the brand), `contrast` (further apart) | 0.6 |
| `priors.accentFamily` | Radix families, to favour particular accents | 0.5 per family when given |
| `priors.deepFamily` | families for `deep` backgrounds: indigo, iris, violet, purple, plum, blue, cyan, teal, jade, crimson, ruby, brown, bronze, tomato | 0.5 per family when given |
| `avoid` | families the user rejected outright | none |
| `fixedBrand` | the user's exact brand hex. All candidates keep it at step 9 of the nearest family | null |

Use weights between about 0.3 and 1. A few strong ones (1.0) and a softer surrounding set (0.5–0.8) work better than one family at 1 and everything else at 0.

## Feeling words → families (tendencies, not rules)

| Feeling | Brand families to weight up | Background / accent hints |
|---|---|---|
| Warm, energetic, playful | orange, tomato, amber, crimson, ruby, pink | deep backgrounds and contrasting accents add excitement |
| Calm, trustworthy, precise | blue, indigo, iris, teal, jade | neutral or slightly tinted backgrounds; analogous or no accent |
| Premium, editorial, serious | bronze, gold, plum, crimson, near-neutral (low weights everywhere) | neutral backgrounds, no accent or one restrained accent |
| Fresh, healthy, natural | teal, jade, grass, mint, lime | tinted backgrounds work well |
| Creative, bold, youthful | pink, violet, purple, plum, cyan | contrasting accents, deep backgrounds |
| Techy, futuristic | iris, violet, cyan, sky, indigo | deep backgrounds (indigo, violet), neon-ish contrasting accents |

## Genre notes

- **Gaming and media** (`preview: "gaming"`, `theme: "dark"`): cover art provides most of the colour, so the palette is the frame. Dark-first. Deep backgrounds (indigo, violet, plum, blue) often feel more alive than flat grey. The accent shows up in ratings, progress bars and badges, so give it real weight.
- **SaaS and product** (`preview: "saas"`): mostly neutral, the brand for actions, and status colours that matter (forms, alerts). Neutral or tinted backgrounds; deep backgrounds rarely suit light-first products.
- **Commerce:** keep the brand away from the danger red, because sale prices and errors both use red.

## References

Ask for sites, games, apps, posters or film stills the user loves. For each:

- **A URL:** screenshot it into the temporary directory (headless Chrome: `--headless --screenshot=<file> --window-size=1440,900 <url>`), or use the browser tool you have.
- **An image the user names on disk:** pass its absolute path.
- **A game or film title with no image:** describe its palette in words and set priors to match. Don't invent an image.

Add each one as `{ "path": "...", "label": "short name" }` under `references`. The picker clusters the image's colours, maps the most vivid colour to a brand family, a contrasting vivid colour to an accent, and the dominant dark tone to a background character. It shows the result as a labelled candidate and treats it as liked from round 2 onward.

## When the user rejects everything

After two rounds with no ♥, change strategy rather than adjusting weights: ask for references, or ask which candidate was "least bad" and what bothered them about it (too dark, too saturated, wrong temperature). Then restart from that candidate, or move the priors to the opposite area of the pool.
