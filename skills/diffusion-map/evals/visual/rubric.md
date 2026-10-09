# Visual review rubric

Bar: work that could win an Awwwards Site of the Day, a Webby, or an FWA. Score as a strict jury
would, not as a friendly colleague. A 7 is "good, polished product"; an 8 is "award-shortlist";
9–10 is "jury favourite". Most competent product UIs score 5–7.

Score each dimension 1–10 (Awwwards weights in brackets) and list concrete defects, each tied to a
screenshot and a location ("map-light: pillar label 借用 sits on top of its own branches"), never vague
advice ("could be more polished").

## Design (40%)
- Is there a distinct, coherent art direction, or does it read as a generic dashboard/graph tool?
- Typography: hierarchy, pairing of Latin and CJK, rhythm, measure, numerals.
- Colour: palette harmony in light and dark, contrast, restraint, accent discipline.
- Composition: balance of the canvas and the chrome, whitespace, alignment, edges of the viewport.
- Detail: icons, hairlines, radii, shadows, states (hover, selected, focus, empty, loading).

## Usability (30%)
- Can a first-time visitor tell what they are looking at and what to do next?
- Legibility of node labels at the default zoom; density vs. clarity on the 300-node map.
- Side panel and conversation reader: scannability, how clearly the relevant part of a conversation
  stands out, navigation back and forth.
- Responsive layouts (1024 px, 390 px), keyboard focus visibility, reduced motion.

## Creativity (20%)
- Does the visual metaphor (ink diffusing on paper) carry through the whole experience, including
  motion (growth frames), replay and empty states, or is it only surface decoration?
- Any moment that would make a juror stop and look twice?

## Content (10%)
- Copy tone and clarity (Chinese UI), labels, empty-state messages, metadata.

## Output format

```
scores: design=<n> usability=<n> creativity=<n> content=<n> weighted=<n.n>
defects (most severe first):
1. [screenshot] location — what is wrong — why it costs points — concrete fix
...
strengths worth keeping:
- ...
```
