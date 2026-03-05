# S.EE API Detailed Reference

This file contains the complete parameter and response specifications for every S.EE API endpoint. Read the relevant section when you need exact field names, types, constraints, or response shapes.

## Table of Contents

1. [Short URLs](#short-urls)
   - [Create Short URL (POST)](#create-short-url)
   - [Create Short URL Simple Mode (GET)](#create-short-url-simple-mode)
   - [Update Short URL (PUT)](#update-short-url)
   - [Delete Short URL (DELETE)](#delete-short-url)
   - [Get Available Domains (GET)](#get-available-domains-for-short-urls)
   - [Get Link Visit Statistics (GET)](#get-link-visit-statistics)
2. [Text Sharing](#text-sharing)
   - [Create Text (POST)](#create-text-sharing)
   - [Update Text (PUT)](#update-text-sharing)
   - [Delete Text (DELETE)](#delete-text-sharing)
   - [Get Text Domains (GET)](#get-available-domains-for-text-sharing)
3. [File Sharing](#file-sharing)
   - [Upload File (POST)](#upload-file)
   - [Get File History (GET)](#get-file-upload-history)
   - [Get Private File Download URL (GET)](#get-private-file-download-url)
   - [Delete File (GET)](#delete-file)
   - [Get File Domains (GET)](#get-available-domains-for-file-sharing)
4. [General](#general)
   - [Get Tags (GET)](#get-tags)
   - [Get Usage (GET)](#get-usage)

---

## Short URLs

### Create Short URL

**POST** `/api/v1/shorten`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `target_url` | string | Yes | max 2000 chars | The destination URL to shorten |
| `domain` | string | Yes | max 255 chars, default "s.ee" | Domain for the short URL |
| `custom_slug` | string | No | max 255 chars | Preferred custom slug |
| `title` | string | No | max 255 chars | Descriptive title for reference |
| `password` | string | No | 3-32 chars | Password to protect the link |
| `expire_at` | integer | No | unix timestamp | When the link should expire |
| `expiration_redirect_url` | string | No | max 2000 chars | Redirect URL after expiration |
| `tag_ids` | array[int] | No | - | Tag IDs for organization |

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "short_url": "https://s.ee/abc123",
    "slug": "abc123",
    "custom_slug": "my-link"
  }
}
```

---

### Create Short URL Simple Mode

**GET** `/api/v1/shorten`

Uses query parameters instead of JSON body. The API key goes in the `signature` query param.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `signature` | string | Yes | Your API key |
| `url` | string | Yes | Destination URL to shorten |
| `domain` | string | No | Domain for the short URL |
| `custom_slug` | string | No | Preferred custom slug |
| `title` | string | No | Descriptive title |
| `tag_ids` | array[int] | No | Tag IDs |
| `password` | string | No | Password protection |
| `expire_at` | integer | No | Expiration timestamp |
| `json` | boolean | No | Set `true` for JSON response (default: plain text) |

**Response** (with `json=true`): Same as Create Short URL response.

Without `json=true`: Returns the short URL as plain text.

---

### Update Short URL

**PUT** `/api/v1/shorten`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `domain` | string | Yes | max 255 chars | Domain of the short URL |
| `slug` | string | Yes | max 255 chars | Slug of the short URL |
| `target_url` | string | Yes | max 2000 chars | New destination URL |
| `title` | string | Yes | max 255 chars | New title |

**Response** (200):

```json
{
  "code": 200,
  "message": "success"
}
```

---

### Delete Short URL

**DELETE** `/api/v1/shorten`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `domain` | string | Yes | max 255 chars | Domain of the short URL |
| `slug` | string | Yes | max 255 chars | Slug to delete |

**Response** (200):

```json
{
  "code": 200,
  "message": "success"
}
```

---

### Get Available Domains for Short URLs

**GET** `/api/v1/domains`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "domains": ["s.ee", "custom.domain.com"]
  }
}
```

---

### Get Link Visit Statistics

**GET** `/api/v1/link/visit-stat`

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | Yes | Domain of the short URL |
| `slug` | string | Yes | Slug of the short URL |
| `period` | string | No | `daily`, `monthly`, or `totally` (default) |

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "visit_count": 42
  }
}
```

---

## Text Sharing

### Create Text Sharing

**POST** `/api/v1/text`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `title` | string | Yes | max 255 chars | Title for the text share |
| `content` | string | Yes | max 2MB (2,097,152 chars) | The text content |
| `domain` | string | No | max 255 chars, default "fs.to" | Domain for the URL |
| `text_type` | string | No | enum: plain_text, source_code, markdown | Content format |
| `custom_slug` | string | No | max 255 chars | Preferred custom slug |
| `password` | string | No | 3-32 chars | Password protection |
| `expire_at` | integer | No | unix timestamp | Expiration time |
| `tag_ids` | array[int] | No | max 5 tags | Tag IDs for organization |

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "short_url": "https://fs.to/abc123",
    "slug": "abc123",
    "custom_slug": "my-snippet"
  }
}
```

---

### Update Text Sharing

**PUT** `/api/v1/text`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `domain` | string | Yes | max 255 chars | Domain of the text share |
| `slug` | string | Yes | max 255 chars | Slug of the text share |
| `title` | string | Yes | max 255 chars | New title |
| `content` | string | Yes | max 2MB | New content |

**Response** (200):

```json
{
  "code": 200,
  "message": "success"
}
```

---

### Delete Text Sharing

**DELETE** `/api/v1/text`

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request Body (JSON)**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `domain` | string | Yes | max 255 chars | Domain of the text share |
| `slug` | string | Yes | max 255 chars | Slug to delete |

**Response** (200):

```json
{
  "code": 200,
  "message": "success"
}
```

---

### Get Available Domains for Text Sharing

**GET** `/api/v1/text/domains`

**Headers**: `Authorization: Bearer <token>`

**Response**: Same structure as short URL domains.

---

## File Sharing

### Upload File

**POST** `/api/v1/file/upload`

**Headers**: `Authorization: Bearer <token>`

**Content-Type**: `multipart/form-data`

**Form Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | The file to upload (alias: `smfile` for SM.MS compatibility) |
| `domain` | string | No | Domain for the file share URL |
| `custom_slug` | string | No | Preferred custom slug |
| `is_private` | integer | No | 0 = public (default), 1 = private |

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "file_id": 14184137,
    "width": 1024,
    "height": 1024,
    "filename": "image.png",
    "storename": "image.png",
    "size": 202814,
    "path": "/2026/02/11/dm3K/image.png",
    "hash": "delete-hash-here",
    "url": "https://i.see.you/2026/02/11/dm3K/image.png",
    "delete": "https://s.ee/api/v1/file/delete/delete-hash-here",
    "page": "https://sm.ms/abc",
    "upload_status": 1
  }
}
```

Key fields:
- `url`: Direct URL to access/download the file
- `page`: Web page where the file can be viewed
- `hash`: Delete key needed to remove the file
- `delete`: Full URL to delete the file
- `width`/`height`: Only populated for image files
- `upload_status`: 1 = success

---

### Get File Upload History

**GET** `/api/v1/files`

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default 1, min 1) |

Returns 30 files per page, sorted by `created_at` descending.

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "success": true,
  "data": [
    {
      "file_id": 14186122,
      "filename": "screenshot.png",
      "size": 398517,
      "url": "https://i.see.you/...",
      "hash": "delete-hash",
      "created_at": 1770908298
    }
  ]
}
```

---

### Get Private File Download URL

**GET** `/api/v1/file/private/download-url`

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | integer | Yes | The file ID |

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "success": true,
  "data": {
    "file_id": 12345,
    "url": "https://temporary-download-url...",
    "expires_at": 1770911898
  }
}
```

The URL is valid for 1 hour and is cached (repeated requests return the same URL until it expires).

---

### Delete File

**GET** `/api/v1/file/delete/{hash}`

**Headers**: `Authorization: Bearer <token>`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hash` | string | Yes | The delete key (from upload response) |

**Response** (200):

```json
{
  "success": true,
  "code": "success",
  "message": "File deleted"
}
```

Note: The `code` field here is a string, unlike other endpoints.

---

### Get Available Domains for File Sharing

**GET** `/api/v1/file/domains`

**Headers**: `Authorization: Bearer <token>`

**Response**: Same structure as short URL domains.

---

## General

### Get Tags

**GET** `/api/v1/tags`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "tags": [
      { "id": 1, "name": "work" },
      { "id": 2, "name": "personal" }
    ]
  }
}
```

---

### Get Usage

**GET** `/api/v1/usage`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "api_count_day": 15,
    "api_count_day_limit": 1000,
    "api_count_month": 234,
    "api_count_month_limit": 30000,
    "link_count_day": 5,
    "link_count_day_limit": 100,
    "link_count_month": 42,
    "link_count_month_limit": 3000,
    "text_count_day": 2,
    "text_count_day_limit": 50,
    "text_count_month": 10,
    "text_count_month_limit": 1500,
    "upload_count_day": 3,
    "upload_count_day_limit": 50,
    "upload_count_month": 20,
    "upload_count_month_limit": 1500,
    "qrcode_count_day": 0,
    "qrcode_count_day_limit": 50,
    "qrcode_count_month": 0,
    "qrcode_count_month_limit": 1500,
    "file_count": 45,
    "storage_usage_mb": "123.45",
    "storage_usage_limit_mb": "-1"
  }
}
```

Note: `storage_usage_mb` and `storage_usage_limit_mb` are strings (rounded to 2 decimal places). A limit of "-1" means unlimited.

Usage categories tracked:
- **API calls**: Total API requests (daily/monthly)
- **Links**: Short URL creations (daily/monthly)
- **Text shares**: Text sharing creations (daily/monthly)
- **Uploads**: File uploads (daily/monthly)
- **QR codes**: QR code generations (daily/monthly)
- **Storage**: Total file storage used vs. limit
