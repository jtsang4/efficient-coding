---
name: memos
description: Use this skill whenever the user wants to work with the Memos REST API for memos, attachments, or activities, including creating, reading, querying, updating, deleting memos, managing memo comments/reactions/relations/attachments, listing and inspecting activities, or creating memos with hashtag-based tagging after checking existing tags from a Memos instance.
---

# Memos API Skill

This skill combines two layers:

- low-level API access for exact Memos endpoints
- task-oriented query helpers for common memo retrieval jobs
- tag inventory helpers so the calling agent can inspect existing hashtags before deciding whether to reuse them

Scope is intentionally limited to:

- attachment operations
- memo operations
- activity operations

It does not cover user management, auth setup beyond the local `.env`, shortcuts, identity providers, or instance settings. If the request drifts there, say the skill scope is limited instead of guessing unsupported commands.

## What this skill provides

- A Bun CLI at `scripts/memos.ts`
- Endpoint discovery and direct API calling via `ops`, `describe`, and `call`
- Task-oriented memo helpers via `latest`, `recent`, and `search`
- A `list-tags` helper that aggregates existing tags, counts, recency, and sample memo snippets
- A file-to-attachment helper so agents do not have to hand-roll base64 payloads
- A compact operation catalog at `references/api-summary.md`
- Query recipes and time-window guidance at `references/query-recipes.md`

## Setup

1. Work from the skill directory.
2. Ensure `.env` contains:
   - `MEMOS_BASE_URL`
   - `MEMOS_ACCESS_TOKEN`
3. Verify config:

```bash
bun run scripts/memos.ts config
```

`MEMOS_BASE_URL` may be either the instance root such as `http://localhost:5230` or the API base such as `http://localhost:5230/api/v1`. The CLI normalizes both.

## Choose the right path

Use the high-level commands first when the user asked for a retrieval task, not a specific endpoint.

- Latest memo or latest N memos:

```bash
bun run scripts/memos.ts latest --count 5
```

- Recent memos inside a time window:

```bash
bun run scripts/memos.ts recent --days 7 --window rolling --include-content
```

- Search by text or tag:

```bash
bun run scripts/memos.ts search --text agent --tag Thought --days 30
```

- Inspect existing tags before deciding which hashtags to reuse in a new memo:

```bash
bun run scripts/memos.ts list-tags --limit 100 --sample-size 2
```

Use `call` when the user explicitly needs one documented endpoint or a write operation.

- Inspect the exact endpoint first:

```bash
bun run scripts/memos.ts describe MemoService_UpdateMemo
```

- Then call it directly:

```bash
bun run scripts/memos.ts call MemoService_UpdateMemo \
  --path memo=YOUR_MEMO_ID \
  --query updateMask=content,visibility \
  --body '{"content":"Updated content","visibility":"PROTECTED"}'
```

## Known quirks

- `call --paginate` returns `{ operationId, pageCount, pages: [...] }`, not a top-level `{ memos: [...] }`. Flatten `pages[*].memos` before post-processing.
- Memo time checks should use `displayTime` first, then fall back to `createTime`.
- For time-range queries, prefer `orderBy='display_time desc'` plus local filtering. Do not assume the server-side `filter` field supports stable time semantics across versions.
- The task-oriented commands default `state=NORMAL` so archived or deleted content does not silently leak into user-facing summaries.
- `search --tag` matches the memo `tags` array exactly. It is not a full-text hashtag parser over `content`.
- `Memo.tags` is extracted by the server from hashtags in `content`. Treat it as output-only unless the deployed API docs explicitly say otherwise.

## Recommended workflow

### 1. Retrieval tasks

When the user asks questions like:

- 最近一周有哪些备忘录
- 最新的一条 memo 是什么
- 带 `Thought` tag 的 memo 有哪些
- 搜一下包含某个关键词的 memo

Use:

1. `latest`, `recent`, or `search`
2. Return the important fields from the JSON result
3. Summarize content for the user when they asked for meaning, not raw JSON

Read `references/query-recipes.md` when you need concrete examples or want to choose between `rolling` and `calendar` time windows.

### 2. Tag-aware memo creation

When the user asks to create a memo with tags or hashtags:

1. Run `bun run scripts/memos.ts list-tags ...` first to inspect the existing tag vocabulary.
2. If one or more candidate tags might match, run `search --tag ...` on the likely choices to inspect prior memo context.
3. Let the calling agent decide which existing tags to reuse. Do not hard-code similarity logic in scripts for this decision.
4. Put the final tags directly into the memo `content` as hashtags, usually at the top, for example:

```json
{
  "state": "NORMAL",
  "visibility": "PRIVATE",
  "content": "#memos #openclaw\n\nImplemented tag discovery before creating this memo."
}
```

5. Call `MemoService_CreateMemo` with that content body.

Prefer reusing an existing tag when it clearly expresses the same concept. If the meaning is uncertain, inspect old memo examples first instead of inventing normalization rules.

### 3. Exact API work

When the user asks to create, update, delete, attach files, add reactions, or inspect one exact endpoint:

1. Run `bun run scripts/memos.ts ops`
2. If needed, run `bun run scripts/memos.ts describe <operationId>`
3. Use `bun run scripts/memos.ts call <operationId> ...`

This keeps the agent aligned with the documented API surface instead of inventing raw requests.

### 4. Resource naming rules

Path placeholders usually expect bare ids:

- `--path memo=0195c...`
- `--path attachment=abc123`
- `--path activity=evt_123`

Request bodies often expect full resource names:

- `memos/0195c...`
- `attachments/abc123`

If you accidentally pass a full resource name into a path flag, the CLI strips the leading path and keeps the last segment.

### 5. Update requests

Patch endpoints such as:

- `AttachmentService_UpdateAttachment`
- `MemoService_UpdateMemo`

need `--query updateMask=...`.

Without it, many updates fail or update less than expected.

### 6. Complex bodies and binary uploads

Prefer `@file.json` for larger bodies:

```bash
bun run scripts/memos.ts call MemoService_CreateMemo --body @/tmp/memo.json
```

Use the helper for attachments instead of hand-building base64:

```bash
bun run scripts/memos.ts attachment-body --file /path/to/file --output /tmp/body.json
```

Then create the attachment:

```bash
bun run scripts/memos.ts call AttachmentService_CreateAttachment --body @/tmp/body.json
```

## Read next when needed

- Read `references/query-recipes.md` for recent/latest/search workflows, time-window semantics, and memo post-processing examples.
- Read `references/api-summary.md` for the compact endpoint catalog, body hints, and pagination details.

## Output expectations

When using this skill for execution:

- call the real API instead of only describing it
- prefer `latest`, `recent`, or `search` for retrieval tasks instead of hand-writing pagination logic each time
- return the important response fields to the user
- if you create or update resources, include the resource name or id in your answer
- if the API returns an error, surface the status and body plainly instead of hiding it
