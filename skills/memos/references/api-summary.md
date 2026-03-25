# Memos API Summary

This reference covers only the APIs documented under:

- `attachmentservice`
- `memoservice`
- `activityservice`

## Environment

- `MEMOS_BASE_URL`: instance root or `/api/v1` base
- `MEMOS_ACCESS_TOKEN`: bearer token, ideally a PAT

The CLI reads `.env` from the skill root.

## Which command to use

Use the task-oriented commands when the user asked for a retrieval job:

- `latest`: latest 1 or latest N memos
- `recent`: memos in the last N days
- `search`: text/tag lookup, optionally inside a time window

Use `call` when you need:

- a write operation
- an exact documented endpoint
- a payload shape that the high-level helpers do not cover

## Core conventions

### Path ids vs resource names

Path parameters usually take the terminal id:

- `memo=0195c...`
- `attachment=abc123`
- `reaction=thumbs-up`
- `activity=evt_123`

Bodies often use full resource names:

- `name: "memos/0195c..."`
- `memo: "memos/0195c..."`
- `contentId: "memos/0195c..."`

### Update masks

Patch endpoints need `updateMask` in the query string.

Examples:

- `content,visibility`
- `filename,externalLink`
- `pinned,displayTime`

### Pagination

Single-page list calls usually return:

```json
{
  "memos": [],
  "nextPageToken": "..."
}
```

`call --paginate` wraps the raw pages instead of flattening them:

```json
{
  "operationId": "MemoService_ListMemos",
  "pageCount": 2,
  "pages": [
    { "memos": [], "nextPageToken": "..." },
    { "memos": [] }
  ]
}
```

If you use `--paginate`, flatten `pages[*].memos` yourself before summarizing or filtering.

### Time-range queries

For memo retrieval by time:

- order by `display_time desc`
- prefer local filtering over server-side `filter`
- use `displayTime` first, then `createTime`

Server versions may differ in exact CEL filter support, so do not rely on server-side time filters unless you already know the instance behavior.

## Supported operations

### Attachment Service

| Operation ID | Method | Path | Notes |
| --- | --- | --- | --- |
| `AttachmentService_ListAttachments` | `GET` | `/attachments` | Query: `pageSize`, `pageToken`, `filter`, `orderBy` |
| `AttachmentService_CreateAttachment` | `POST` | `/attachments` | Query: `attachmentId`; body schema `Attachment` |
| `AttachmentService_GetAttachment` | `GET` | `/attachments/{attachment}` | Path: `attachment` |
| `AttachmentService_UpdateAttachment` | `PATCH` | `/attachments/{attachment}` | Path: `attachment`; query: `updateMask`; body schema `Attachment` |
| `AttachmentService_DeleteAttachment` | `DELETE` | `/attachments/{attachment}` | Path: `attachment` |

### Memo Service

| Operation ID | Method | Path | Notes |
| --- | --- | --- | --- |
| `MemoService_ListMemos` | `GET` | `/memos` | Query: `pageSize`, `pageToken`, `state`, `orderBy`, `filter`, `showDeleted` |
| `MemoService_CreateMemo` | `POST` | `/memos` | Query: `memoId`; body schema `Memo` |
| `MemoService_GetMemo` | `GET` | `/memos/{memo}` | Path: `memo` |
| `MemoService_UpdateMemo` | `PATCH` | `/memos/{memo}` | Path: `memo`; query: `updateMask`; body schema `Memo` |
| `MemoService_DeleteMemo` | `DELETE` | `/memos/{memo}` | Path: `memo`; query: `force` |
| `MemoService_ListMemoAttachments` | `GET` | `/memos/{memo}/attachments` | Path: `memo`; query: `pageSize`, `pageToken` |
| `MemoService_SetMemoAttachments` | `PATCH` | `/memos/{memo}/attachments` | Path: `memo`; body schema `SetMemoAttachmentsRequest` |
| `MemoService_ListMemoComments` | `GET` | `/memos/{memo}/comments` | Path: `memo`; query: `pageSize`, `pageToken`, `orderBy` |
| `MemoService_CreateMemoComment` | `POST` | `/memos/{memo}/comments` | Path: `memo`; query: `commentId`; body schema `Memo` |
| `MemoService_ListMemoReactions` | `GET` | `/memos/{memo}/reactions` | Path: `memo`; query: `pageSize`, `pageToken` |
| `MemoService_UpsertMemoReaction` | `POST` | `/memos/{memo}/reactions` | Path: `memo`; body schema `UpsertMemoReactionRequest` |
| `MemoService_DeleteMemoReaction` | `DELETE` | `/memos/{memo}/reactions/{reaction}` | Path: `memo`, `reaction` |
| `MemoService_ListMemoRelations` | `GET` | `/memos/{memo}/relations` | Path: `memo`; query: `pageSize`, `pageToken` |
| `MemoService_SetMemoRelations` | `PATCH` | `/memos/{memo}/relations` | Path: `memo`; body schema `SetMemoRelationsRequest` |

### Activity Service

| Operation ID | Method | Path | Notes |
| --- | --- | --- | --- |
| `ActivityService_ListActivities` | `GET` | `/activities` | The docs page only confirms the endpoint and method |
| `ActivityService_GetActivity` | `GET` | `/activities/{activity}` | Path: `activity` |

## Body hints

### `Attachment`

Required fields:

- `filename`
- `type`

Useful optional fields:

- `content`: base64-encoded file bytes
- `externalLink`
- `memo`: full memo resource name such as `memos/123`

Use the helper instead of building this body by hand:

```bash
bun run scripts/memos.ts attachment-body --file /tmp/demo.txt
```

### `Memo`

Required fields:

- `state`
- `content`
- `visibility`

Common optional fields:

- `displayTime`
- `pinned`
- `attachments`
- `relations`

Minimal create body:

```json
{
  "state": "NORMAL",
  "content": "Hello from Memos",
  "visibility": "PRIVATE"
}
```

### `SetMemoAttachmentsRequest`

Minimal shape:

```json
{
  "name": "memos/123",
  "attachments": [
    { "name": "attachments/abc" }
  ]
}
```

### `SetMemoRelationsRequest`

Minimal shape:

```json
{
  "name": "memos/123",
  "relations": [
    {
      "memo": { "name": "memos/123" },
      "relatedMemo": { "name": "memos/456" },
      "type": "REFERENCE"
    }
  ]
}
```

### `UpsertMemoReactionRequest`

Minimal shape:

```json
{
  "name": "memos/123",
  "reaction": {
    "contentId": "memos/123",
    "reactionType": "👍"
  }
}
```

## Filter examples

### Attachments

Examples supported by this skill:

- `mime_type=="image/png"`
- `filename.contains("invoice")`
- `memo=="memos/123"`

### Memos

This skill treats memo filtering as CEL-style filtering over memo properties and tags. Common safe filters to try:

- `row_status == "NORMAL"`
- `visibility == "PUBLIC"`
- `"project-x" in tags`

Keep the compatibility warning in mind:

- server versions may differ in exact supported fields
- if a filter fails, return the real error instead of pretending the filter worked
- do not treat CEL filters as the default time-window strategy

## Notes on local validation

- Some currently released server images may not expose activity endpoints yet.
- When that happens, memo and attachment calls can still validate the main CLI flow.
