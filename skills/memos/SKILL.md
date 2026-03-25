---
name: memos
description: Use this skill whenever the user wants to work with the Memos REST API for memos, attachments, or activities, including creating, reading, querying, updating, deleting memos, managing memo comments/reactions/relations/attachments, or listing and inspecting activities from a Memos instance.
---

# Memos API Skill

Use this skill for the Memos REST API areas bundled into this skill:

- attachment operations
- memo operations
- activity operations

This skill intentionally does not cover user management, auth, shortcuts, identity providers, or instance settings yet. If the request drifts into those areas, say the current skill scope is limited and avoid inventing unsupported commands.

## What this skill provides

- A Bun CLI at `scripts/memos.ts` for real API calls.
- A compact API summary at `references/api-summary.md`.
- A file-to-attachment helper so agents do not have to hand-roll base64 payloads.

## Setup

1. Work from the skill directory.
2. Copy `.env.example` to `.env` if `.env` does not exist.
3. Fill in:
   - `MEMOS_BASE_URL`
   - `MEMOS_ACCESS_TOKEN`
4. Verify configuration:

```bash
bun run scripts/memos.ts config
```

`MEMOS_BASE_URL` may be either the instance root such as `http://localhost:5230` or the API base such as `http://localhost:5230/api/v1`. The script normalizes both.

## Quick command map

List supported operations:

```bash
bun run scripts/memos.ts ops
```

Inspect one operation:

```bash
bun run scripts/memos.ts describe MemoService_ListMemos
```

Call one documented operation:

```bash
bun run scripts/memos.ts call MemoService_ListMemos \
  --query pageSize=10 \
  --query orderBy='display_time desc'
```

Create a memo:

```bash
bun run scripts/memos.ts call MemoService_CreateMemo \
  --body '{"state":"NORMAL","content":"Hello from the API","visibility":"PRIVATE"}'
```

Update a memo:

```bash
bun run scripts/memos.ts call MemoService_UpdateMemo \
  --path memo=YOUR_MEMO_ID \
  --query updateMask=content,visibility \
  --body '{"content":"Updated content","visibility":"PROTECTED"}'
```

Create an attachment payload from a local file:

```bash
bun run scripts/memos.ts attachment-body \
  --file /tmp/demo.txt \
  --memo memos/YOUR_MEMO_ID \
  --output /tmp/attachment-body.json
```

Then create the attachment:

```bash
bun run scripts/memos.ts call AttachmentService_CreateAttachment \
  --body @/tmp/attachment-body.json
```

List pages until exhaustion:

```bash
bun run scripts/memos.ts call MemoService_ListMemos \
  --query pageSize=50 \
  --paginate
```

## Recommended workflow

### 1. Discover the exact operation first

When the user asks for a Memos task but does not name the endpoint:

1. Run `bun run scripts/memos.ts ops`
2. If needed, run `bun run scripts/memos.ts describe <operationId>`
3. Choose the narrowest documented operation instead of sending a generic raw request

This keeps the agent aligned with the documented API surface instead of drifting into guessed endpoints.

### 2. Follow the resource naming rules carefully

Path placeholders such as `{memo}` or `{attachment}` usually expect the bare ID, not the full resource name.

Examples:

- `--path memo=0195c...`
- `--path attachment=abc123`
- `--path activity=evt_123`

Request bodies often do expect full resource names:

- `memos/0195c...`
- `attachments/abc123`

If you accidentally pass a full resource name into a path flag, the CLI strips the leading path and keeps the last segment.

### 3. Treat `updateMask` as part of the update, not an optional hint

Patch endpoints such as:

- `AttachmentService_UpdateAttachment`
- `MemoService_UpdateMemo`

need `--query updateMask=...`.

Without it, many updates fail or update less than you expect.

### 4. Prefer JSON files for complex bodies

Inline JSON is fine for tiny payloads. For memo relations, attachment sets, or larger memo bodies, prefer a temporary file and pass it with `--body @/path/to/file.json`.

### 5. Use the helper for binary attachment uploads

The attachment API expects `Attachment.content` as base64 bytes in JSON. Do not manually encode files unless there is a compelling reason. Use:

```bash
bun run scripts/memos.ts attachment-body --file /path/to/file
```

## Service-specific guidance

### Attachment Service

Use for:

- create/get/list/update/delete attachments
- filtering attachments by filename, mime type, create time, or memo
- attaching uploaded files to memo flows

Common operations:

- `AttachmentService_ListAttachments`
- `AttachmentService_CreateAttachment`
- `AttachmentService_UpdateAttachment`
- `AttachmentService_DeleteAttachment`

### Memo Service

Use for:

- create/get/list/update/delete memos
- comments
- reactions
- relations
- memo attachment bindings

Common operations:

- `MemoService_ListMemos`
- `MemoService_CreateMemo`
- `MemoService_UpdateMemo`
- `MemoService_CreateMemoComment`
- `MemoService_UpsertMemoReaction`
- `MemoService_SetMemoAttachments`
- `MemoService_SetMemoRelations`

### Activity Service

Use for:

- listing recent activities
- fetching one activity by id

Some self-hosted server versions may expose activity endpoints later than memo and attachment endpoints. If these endpoints return `404`, say the deployed server version likely does not expose the activity API yet.

## Read next when needed

- Read `references/api-summary.md` when you need a compact operation catalog, payload hints, filter examples, or update-mask reminders.

## Output expectations

When using this skill for execution:

- call the real API instead of only describing it
- return the important response fields to the user
- if you create or update resources, include the resource name or id in your answer
- if the API returns an error, surface the status and body plainly instead of hiding it
