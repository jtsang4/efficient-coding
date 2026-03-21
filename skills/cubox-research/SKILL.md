---
name: cubox-research
description: Search a user's Cubox collection deeply by topic, theme, or question. Use this whenever the user asks to search Cubox, saved articles, archived reads, or collected pages for a subject, wants multiple keyword variations tried, wants full-text search across Cubox, or needs article details exported from Cubox HTML into local Markdown with downloaded images for later analysis.
compatibility: Requires Bun, network access, and a configured `.env` file in this skill directory.
---

# cubox-research

Use this skill when the user's Cubox collection is the source of truth. The goal is not to do one shallow keyword lookup, but to search broadly, vary keywords on purpose, fetch the best-matching article details, and analyze local Markdown instead of raw Cubox HTML.

## Preflight

1. Work from this skill directory.
2. Make sure dependencies are installed once with `bun install`.
3. Check `.env` before any API call. The only required value is `CUBOX_AUTHORIZATION`.
4. Prefer read-only endpoints. Do not call mutation endpoints such as `POST /c/api/norm/card/read` unless the user explicitly asks for that side effect.

## What The Bundled Scripts Do

- `scripts/cubox.ts context`
  Fetches account search context: groups, tags, and the overloaded `keyword/list` payload.
- `scripts/cubox.ts search`
  Runs multiple keywords across `preview`, `quick`, and `full-text` modes, then deduplicates and ranks hits.
- `scripts/cubox.ts research`
  Does the same search workflow and also fetches article details for the strongest matches.
- `scripts/cubox.ts fetch-detail`
  Fetches one Cubox article detail, converts the HTML fragment to Markdown, downloads images locally, and stores the files in the temp collection.
- `scripts/inspect-har.ts`
  Re-summarizes a HAR file into a quick API map when the user provides a fresh capture.

## Core Working Style

Treat Cubox retrieval like library research:

1. Understand the user's actual topic or question.
2. Build a keyword set with deliberate variation.
3. Search in more than one mode.
4. Fetch article details for the best candidates.
5. Analyze the exported Markdown and cite local file paths.

Do not stop after the first hit unless the user explicitly wants a quick lookup.

## Keyword Planning

Before searching, create a keyword set that covers multiple angles:

- The direct topic phrase
- Synonyms or alternate wording
- English and Chinese variants when relevant
- Product names, author names, company names, or framework names tied to the topic
- Abbreviations and shorthand terms
- Narrower subtopics if the topic is broad

Good example for a topic like "agent harness":

- `agent harness`
- `harness engineering`
- `deep agents`
- `agent evals`
- `skills`
- `工具调用`
- `智能体评测`

If the user already gives candidate terms, still add 2-4 meaningful variations unless doing so would obviously introduce noise.

## Retrieval Workflow

### 1. Optional context pass

When tags, collections, or browsing context might help, run:

```bash
bun run ./scripts/cubox.ts context --json
```

Use it to understand available groups and tags before searching.

### 2. Run broad search

Use `research` when you want one command to search and fetch details:

```bash
bun run ./scripts/cubox.ts research \
  --topic "agent harness" \
  --keyword "agent harness" \
  --keyword "harness engineering" \
  --keyword "deep agents" \
  --keyword "智能体评测" \
  --detail-limit 5 \
  --json
```

Use `search` when you want to inspect candidates before downloading details:

```bash
bun run ./scripts/cubox.ts search \
  --topic "台积电营收模型" \
  --keyword "台积电" \
  --keyword "TSMC" \
  --keyword "营收模型" \
  --keyword "equity research" \
  --json
```

Default behavior searches all three modes:

- `preview`: quick prefix discovery and highlighted matches
- `quick`: title and metadata-oriented retrieval
- `full-text`:正文全文搜索

### 3. Fetch the strongest candidates

When you already know the `cardId`, fetch a single article:

```bash
bun run ./scripts/cubox.ts fetch-detail --card-id 7433881606177162362 --json
```

The exported files are stored under:

```text
<system temp>/cubox-collection/<cardId>-<safe-title>/
```

Each article directory contains:

- `article.md`
- `article.html`
- `metadata.json`
- `images/`

This is the preferred format for analysis. Read the Markdown, not the raw HTML.

## Output Expectations

When using this skill for an actual user request:

1. Tell the user which keyword families you tried.
2. Mention which search modes found the strongest hits.
3. Cite the most relevant article titles and why they matter.
4. When you fetched details, cite the exported Markdown paths.
5. Synthesize findings instead of dumping raw search results.
6. If results are thin, say so plainly and explain what keyword expansion or narrowing you tried.

## Reporting Pattern

Use this structure unless the user asks for something else:

```markdown
# Cubox Topic Memo: <topic>

## Search Strategy

- keywords tried
- why those variants were chosen

## Strongest Matches

- title, why it is relevant, and where it was found

## Detailed Takeaways

- key idea with evidence from exported Markdown

## Gaps Or Weak Signals

- what was missing
- what other keywords or filters might help
```

## Rules That Matter

- Prefer read-only endpoints.
- Prefer `--json` whenever you need to inspect script output programmatically.
- Use multiple keywords on purpose; do not rely on a single literal phrase.
- Use both `quick` and `full-text` unless there is a good reason not to.
- Deduplicate by `cardId`, not by title alone.
- Analyze `article.md` after fetching details. The script has already converted the Cubox HTML fragment and downloaded images.
- Remember that article exports are grouped under `tmp/cubox-collection/`, not flat in the temp root.

## Reference Files

- Read [`references/api-map.md`](./references/api-map.md) when you need the observed endpoint behavior from the HAR.
- Run `bun run ./scripts/inspect-har.ts <har-path>` if the user supplies a newer HAR and wants the map refreshed.
