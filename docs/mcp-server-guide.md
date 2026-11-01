# DropItX MCP Server Guide

## Overview

The `dropitx mcp` command starts a stdio MCP server that exposes 8 tools for AI agents to publish, update, fetch, list, delete, and manage page revisions on DropItX. It wraps the FastAPI v1 documents API with Bearer API-key auth.

**Key benefits:**
- Agents can create and update pages at stable URLs
- Full version history via automatic revision tracking
- Context-window-safe previews (content truncated in lists)
- API failures surface as MCP errors (`isError: true`) carrying the API's message

## Requirements

- Node.js **20+**
- Nothing else to install: `npx -y dropitx mcp` fetches and runs the package. The server is built on the official `@modelcontextprotocol/sdk` (1.x, stdio transport).

## Setup

### 1. Configure your API key

```bash
dropitx config set-key shk_your_api_key_here
```

Or set the environment variable: `DROPITX_API_KEY=shk_...`

API keys start with `shk_` (personal) or `sht_` (team). Generate them from the DropItX dashboard.

### 2. Configure your MCP client

#### Claude Code

```bash
claude mcp add dropitx --env DROPITX_API_KEY=shk_... -- npx -y dropitx mcp
```

#### Generic MCP JSON (Cursor, etc.)

```json
{
  "mcpServers": {
    "dropitx": {
      "command": "npx",
      "args": ["-y", "dropitx", "mcp"],
      "env": {
        "DROPITX_API_KEY": "shk_..."
      }
    }
  }
}
```

#### Globally installed (no npx)

If you installed with `npm install -g dropitx`:

```json
{
  "mcpServers": {
    "dropitx": {
      "command": "dropitx",
      "args": ["mcp"],
      "env": {
        "DROPITX_API_KEY": "shk_..."
      }
    }
  }
}
```

## Tools

### Publish & Update

**`publish_page`** - Publish new content to DropItX
- **Parameters:**
  - `content` (required): HTML or Markdown content (max 5M chars)
  - `title` (optional): Human-readable title
  - `filename` (optional): Filename with extension (`.html` renders as webpage, `.md` as Markdown)
  - `is_private` (optional, default false): Hide from public search/listings
  - `expires_in_seconds` (optional): Custom expiry duration in seconds (default 30 days server-side)
- **Returns:** `{url, slug, title, filename, expires_at}`
- **Use case:** Create a new shareable artifact with a stable URL

**`update_page`** - Redeploy content to existing page URL
- **Parameters:**
  - `slug` (required): Page slug from `publish_page` response
  - `content` (required): New HTML or Markdown content (max 5M chars)
  - `title` (optional): New title
  - `filename` (optional): New filename (changes rendering mode)
- **Returns:** `{url, slug, title, filename, expires_at}`
- **Use case:** Iterate on a page while keeping the same share URL; previous versions saved as revisions
- **Note:** Previous content automatically saved as a revision before update

### Fetch & List

**`get_page`** - Fetch full page content and metadata
- **Parameters:**
  - `slug` (required): Page slug
- **Returns:** `{url, slug, title, filename, content (full), is_private, view_count, created_at, updated_at, expires_at}`
- **Use case:** Retrieve full content of a page (not truncated)

**`list_pages`** - List your pages with previews
- **Parameters:**
  - `limit` (optional, default 20, max 100): Number of pages to return
- **Returns:** List of `{url, slug, title, filename, content_preview (200 chars + "..."), content_size, view_count, updated_at}` — one JSON text block per page, plus `structuredContent: {result: [...]}`
- **Use case:** Browse existing pages, find what to update
- **Context-safe:** Content truncated to 200 chars to conserve agent context window

### Delete & Revisions

**`delete_page`** - Permanently delete a page
- **Parameters:**
  - `slug` (required): Page slug to delete
- **Returns:** `{deleted: true, slug}` (API failures are raised as MCP errors)
- **Use case:** Remove a page and all its revisions

**`list_revisions`** - List version history for a page
- **Parameters:**
  - `slug` (required): Page slug
  - `limit` (optional, default 20, max 100): Revision count
- **Returns:** `{revisions: [...], total: int}` with each revision showing `{revision, content_preview (200 chars), content_size, filename, title, created_at}`
- **Use case:** See what changed in a page, decide what to restore
- **Context-safe:** Content truncated to 200 chars per revision

**`get_revision`** - Fetch full content of a specific revision
- **Parameters:**
  - `slug` (required): Page slug
  - `revision` (required, int): Revision number from `list_revisions`
- **Returns:** `{revision, content (full), filename, title, created_at, ...}`
- **Use case:** Review old versions in detail before restoring

**`restore_revision`** - Restore a page to a previous revision
- **Parameters:**
  - `slug` (required): Page slug
  - `revision` (required, int): Revision number to restore to
- **Returns:** the new revision number and a confirmation message (API failures are raised as MCP errors)
- **Use case:** Undo recent changes to a page
- **Safe:** Current live content is saved as a new revision before restoring, so nothing is lost

## Limits

- **Content size**: 5,000,000 characters per page
- **Supported formats**: HTML (`.html`), Markdown (`.md`)
- **Default expiry**: 30 days server-side (configurable via `expires_in_seconds`)
- **List size**: 1–100 pages per call (default 20)

## Troubleshooting

### Cold start latency

The first request after the API has been idle may take a while to wake the server; requests time out after 60 seconds.

### 401: Invalid API key

Ensure your key starts with `shk_` or `sht_` and hasn't been revoked. Check with `dropitx config show`.

### Node.js <20

The package declares `engines.node >= 20`. Check with `node --version`.

### Errors

Every API or network failure comes back as a tool result with `isError: true` and text `Error executing tool <name>: <API message>`, for example `Error executing tool get_page: Not found: Document not found`. Invalid arguments (a missing `slug`, a non-integer `revision`) are rejected with `isError: true` before any request is made.

### Key scopes

- `shk_` keys: personal documents only
- `sht_` keys: team documents (key must map to an active team membership)
