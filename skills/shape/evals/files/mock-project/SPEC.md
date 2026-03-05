---
status: design-reference
warning: >
  This is a product design document for HUMAN reference only.
  It may be outdated and DOES NOT represent the current state of the codebase.
  DO NOT use this as implementation instructions.
  Always refer to the actual source code for the current behavior.
---

## Core Problem

A lightweight reading highlight manager for people who read a lot online and want to save
and revisit their highlights without the complexity of full-featured tools like Readwise.

## Target Users

Avid online readers who use browser bookmarks and Kindle, want a simple way to collect and
review highlights. Not power users — people who find Notion/Readwise too complex.

## Core Scenarios

### 1. Save a highlight from the web

User highlights text on any webpage, clicks the browser extension button, and the highlight
is saved with source URL and title. No friction — one click.

**Acceptance criteria:**
- Highlight saved in under 1 second
- Source URL and page title auto-captured
- Works on any standard webpage

### 2. Browse and search highlights

User opens the web app and sees all highlights in reverse chronological order.
Can search by text content or filter by source/tag.

**Acceptance criteria:**
- Search results appear as user types
- Can filter by tag
- Can filter by source domain

## Key Design Decisions

- **Framework**: Express.js with EJS templates — because simple server-rendered pages are enough
- **Database**: SQLite — because single-user, no need for a full database server
- **Auth**: Simple email/password — no OAuth complexity needed
- **Browser extension**: Chrome only for MVP

## Tech Stack

- Backend: Express.js
- Frontend: EJS templates + vanilla JS
- Database: SQLite
- Deployment: Single VPS

## Explicitly Out of Scope

- Mobile app
- Social/sharing features
- AI-powered summarization
- PDF annotation

## Pending Decisions

- [ ] Kindle import format — need to research Kindle export formats
- [ ] Backup/export strategy
