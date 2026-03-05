---
name: see
description: "S.EE (SEE) platform API integration for short URL management, text sharing, and file sharing."
---

# S.EE API Skill

S.EE is a URL shortening and content sharing platform with three core services: **short URL management**, **text sharing** (code snippets, notes, markdown), and **file sharing**. Use the following API specifications to call the S.EE REST API on behalf of the user.

## Authentication

All API requests require an access token in the `Authorization` header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Resolve the API key in this order:
1. Read the `.env` file in this skill's directory (look for `SEE_API_KEY=...`)
2. Check the `$SEE_API_KEY` environment variable
3. If neither exists, ask the user for their API key

**Base URL**: `https://s.ee/api/v1`

## Response Format

All responses follow a standard JSON structure:

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

- `code` 200 = success
- `code` 400 = invalid request parameters
- `code` 401 = missing or expired API key
- `code` 500 = server error

## Quick Reference: All Endpoints

| Category | Operation | Method | Path |
|----------|-----------|--------|------|
| Short URLs | Create | POST | `/shorten` |
| Short URLs | Create (Simple) | GET | `/shorten` |
| Short URLs | Update | PUT | `/shorten` |
| Short URLs | Delete | DELETE | `/shorten` |
| Short URLs | Get Domains | GET | `/domains` |
| Short URLs | Visit Stats | GET | `/link/visit-stat` |
| Text | Create | POST | `/text` |
| Text | Update | PUT | `/text` |
| Text | Delete | DELETE | `/text` |
| Text | Get Domains | GET | `/text/domains` |
| File | Upload | POST | `/file/upload` |
| File | History | GET | `/files` |
| File | Private Download URL | GET | `/file/private/download-url` |
| File | Delete | GET | `/file/delete/{hash}` |
| File | Get Domains | GET | `/file/domains` |
| General | Get Tags | GET | `/tags` |
| General | Get Usage | GET | `/usage` |

For detailed parameter specifications of each endpoint, read `references/api-details.md`.

---

## Short URLs

### Create Short URL

```bash
curl -X POST "https://s.ee/api/v1/shorten" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://example.com/long-url",
    "domain": "s.ee"
  }'
```

**Required fields**: `target_url`, `domain` (default: "s.ee")

**Optional fields**: `custom_slug`, `title`, `password` (3-32 chars), `expire_at` (unix timestamp), `expiration_redirect_url`, `tag_ids` (array of integers)

**Response** returns `short_url`, `slug`, and `custom_slug`.

### Create Short URL (Simple Mode)

A GET-based alternative using query parameters -- good for bookmarklets or quick one-liners:

```bash
curl "https://s.ee/api/v1/shorten?signature=YOUR_API_KEY&url=https://example.com&json=true"
```

Note: In simple mode, the API key goes in the `signature` query parameter (not the Authorization header). Set `json=true` for JSON response; otherwise returns plain text.

### Update Short URL

```bash
curl -X PUT "https://s.ee/api/v1/shorten" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "s.ee",
    "slug": "abc123",
    "target_url": "https://new-destination.com",
    "title": "Updated Title"
  }'
```

All four fields (`domain`, `slug`, `target_url`, `title`) are required.

### Delete Short URL

```bash
curl -X DELETE "https://s.ee/api/v1/shorten" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "s.ee",
    "slug": "abc123"
  }'
```

This is permanent and cannot be undone.

### Get Link Visit Statistics

```bash
curl "https://s.ee/api/v1/link/visit-stat?domain=s.ee&slug=abc123&period=totally" \
  -H "Authorization: Bearer $SEE_API_KEY"
```

`period` options: `daily` (today), `monthly` (this month), `totally` (all-time, default)

Returns `visit_count`.

---

## Text Sharing

Text sharing supports three content formats: `plain_text`, `source_code` (with syntax highlighting), and `markdown`.

### Create Text Sharing

```bash
curl -X POST "https://s.ee/api/v1/text" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Code Snippet",
    "content": "console.log(\"Hello, World!\");",
    "text_type": "source_code",
    "domain": "fs.to"
  }'
```

**Required**: `title`, `content` (up to 2MB)

**Optional**: `domain` (default: "fs.to"), `text_type` (plain_text/source_code/markdown), `custom_slug`, `password` (3-32 chars), `expire_at`, `tag_ids` (max 5 tags)

**Response** returns `short_url`, `slug`, `custom_slug`.

### Update Text Sharing

```bash
curl -X PUT "https://s.ee/api/v1/text" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "fs.to",
    "slug": "abc123",
    "title": "Updated Title",
    "content": "Updated content here"
  }'
```

All four fields are required.

### Delete Text Sharing

```bash
curl -X DELETE "https://s.ee/api/v1/text" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "fs.to",
    "slug": "abc123"
  }'
```

---

## File Sharing

### Upload File

```bash
curl -X POST "https://s.ee/api/v1/file/upload" \
  -H "Authorization: Bearer $SEE_API_KEY" \
  -F "file=@/path/to/file.png" \
  -F "domain=fs.to"
```

**Required**: `file` (the file to upload)

**Optional**: `domain`, `custom_slug`, `is_private` (0=public, 1=private; default 0)

**Response** includes: `file_id`, `url` (direct access URL), `page` (web page URL), `hash` (delete key), `delete` (delete URL), `filename`, `size`, `width`/`height` (for images).

### Get File Upload History

```bash
curl "https://s.ee/api/v1/files?page=1" \
  -H "Authorization: Bearer $SEE_API_KEY"
```

Returns 30 files per page, sorted by creation time descending.

### Get Private File Download URL

```bash
curl "https://s.ee/api/v1/file/private/download-url?file_id=12345" \
  -H "Authorization: Bearer $SEE_API_KEY"
```

Returns a temporary download URL valid for 1 hour.

### Delete File

```bash
curl "https://s.ee/api/v1/file/delete/DELETE_HASH_HERE" \
  -H "Authorization: Bearer $SEE_API_KEY"
```

Note: this uses a GET request with the delete hash in the URL path.

---

## Domains, Tags, and Usage

### Get Available Domains

```bash
# For short URLs
curl "https://s.ee/api/v1/domains" -H "Authorization: Bearer $SEE_API_KEY"

# For text sharing
curl "https://s.ee/api/v1/text/domains" -H "Authorization: Bearer $SEE_API_KEY"

# For file sharing
curl "https://s.ee/api/v1/file/domains" -H "Authorization: Bearer $SEE_API_KEY"
```

Query domains only if the user specifies a non-default domain or wants to see what's available.

### Get Tags

```bash
curl "https://s.ee/api/v1/tags" -H "Authorization: Bearer $SEE_API_KEY"
```

Returns tag `id` and `name`. Use tag IDs when creating short URLs or text shares.

### Get Usage

```bash
curl "https://s.ee/api/v1/usage" -H "Authorization: Bearer $SEE_API_KEY"
```

Shows daily/monthly limits and current usage for: API calls, link creation, text shares, file uploads, QR codes, and storage.

