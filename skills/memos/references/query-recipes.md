# Query Recipes

Use this reference when the user asked for a retrieval task rather than a raw endpoint.

## Latest memos

Latest one memo:

```bash
bun run scripts/memos.ts latest --count 1 --include-content
```

Latest five memos:

```bash
bun run scripts/memos.ts latest --count 5
```

Default behavior:

- sorts by `display_time desc`
- defaults `state=NORMAL`
- returns summarized memo objects that are easier to present to users than raw API payloads

## Recent memos

Recent memos in the last 7 rolling days:

```bash
bun run scripts/memos.ts recent --days 7 --window rolling --include-content
```

Recent memos by calendar window in a specific timezone:

```bash
bun run scripts/memos.ts recent --days 7 --window calendar --tz Asia/Shanghai
```

Recommended interpretation:

- Use `rolling` when the user says "最近 7 天" and did not specify calendar semantics.
- Use `calendar` when the user clearly means natural-day windows.

The CLI returns:

- `windowStart`
- `windowEnd`
- `timezone`
- `memos`

That makes it easy to explain the exact time window back to the user.

## List existing tags before creating a tagged memo

Inspect the current tag vocabulary:

```bash
bun run scripts/memos.ts list-tags --limit 100 --sample-size 2
```

Inspect only recent tags in the last 30 days:

```bash
bun run scripts/memos.ts list-tags --days 30 --window rolling --limit 100 --sample-size 2
```

Recommended interpretation:

- Use `list-tags` before creating a tagged memo.
- Let the calling agent decide whether to reuse an existing tag after looking at counts and sample snippets.
- If a candidate is still ambiguous, follow up with `search --tag <candidate>` to inspect full memo context.
- Write the final chosen tags into memo `content` as hashtags. Do not assume the API accepts a writable `tags` field.

Example tagged create body:

```json
{
  "state": "NORMAL",
  "visibility": "PRIVATE",
  "content": "#memos #project-x\n\nSummarized today's implementation notes."
}
```

## Search by text or tag

Search by text:

```bash
bun run scripts/memos.ts search --text agent --days 30 --include-content
```

Search by tag:

```bash
bun run scripts/memos.ts search --tag Thought --days 30
```

Combine text and tag:

```bash
bun run scripts/memos.ts search --text agent --text workflow --tag Thought --limit 20
```

Matching rules:

- repeated `--text` flags are ORed
- repeated `--tag` flags are ORed
- text group and tag group are ANDed
- text matching is case-insensitive substring matching on `content`
- tag matching is exact matching against the memo `tags` array

## Export a time range

If the user wants memo content for a time range, prefer:

1. `recent` to get the right window
2. `--include-content` to keep full text
3. post-process the JSON into the final format the user asked for

Example:

```bash
bun run scripts/memos.ts recent --days 30 --include-content --output /tmp/recent-memos.json
```

## Minimal fields for user-facing summaries

The high-level commands already return a smaller memo shape:

- `name`
- `state`
- `createTime`
- `updateTime`
- `displayTime`
- `displayTimeLocal`
- `visibility`
- `tags`
- `pinned`
- `snippet`

If you need only a tighter summary, these are usually enough:

- `displayTimeLocal`
- `tags`
- `snippet`

Add `content` only when the user asked for full memo text or analysis.

## Time semantics

### `rolling`

`rolling` means:

- window start = current time minus `N * 24h`
- window end = now

Use this as the default interpretation for "最近 N 天".

### `calendar`

`calendar` means:

- determine "today" in the requested timezone
- take local midnight for today
- move back `N` days
- use that local midnight as the window start

This is better for natural-day reporting.

## Recommended strategy

For retrieval by time, tag, or text:

1. fetch pages with `orderBy='display_time desc'`
2. filter locally
3. stop pagination early once the remaining pages cannot match

Only depend on server-side `filter` when you already know the deployed Memos version supports the exact expression you want.
