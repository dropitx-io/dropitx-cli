# DropItX CLI - System Architecture

## Big Picture

`dropitx` is a Node.js (>= 20) client for the DropItX backend
(`https://api.dropitx.site`). It has two faces:

1. **CLI** for people and scripts: upload files, text and pipes; manage config;
   print QR codes; install the `drop-plan` Claude Code skill.
2. **MCP stdio server** (`dropitx mcp`) for AI agents: publish and manage pages
   through the v1 documents API.

Both read the same configuration and talk to the same backend over HTTPS with
Node's built-in `fetch`.

## Components

| Module | Responsibility |
|--------|----------------|
| `cli.ts` | Process entry. Builds the real `CliIO` and sets `process.exitCode`. |
| `program.ts` | Command tree (commander), option parsing, output, exit codes. |
| `config.ts` | Config file and env resolution. |
| `http.ts` | `request()` with timeout; network failures -> `Network error: <reason>`; `errorDetail()` extracts FastAPI `detail`. |
| `uploader.ts` | Anonymous-or-keyed uploads (`X-API-Key`). |
| `v1-client.ts` | Document CRUD and revisions (`Authorization: Bearer`). |
| `mcp-server.ts` | MCP tool registry and stdio transport. |
| `output.ts`, `qr.ts`, `prompt.ts` | Terminal rendering, QR codes, prompts. |
| `skill-install.ts` | Copies `skills/drop-plan` into `~/.claude/skills/drop-plan`. |

## Upload Pipeline

| Entry | Request | Timeout |
|-------|---------|---------|
| `dropitx upload FILE...` | `POST {api}/api/cli/upload`, multipart: `file` (+ `password`, `expires`, `burn="true"`, `slug`) | 300 s |
| `dropitx text CONTENT`   | `POST {api}/api/cli/upload/text`, urlencoded: `content`, `filename` (+ options) | 60 s |
| `... \| dropitx` / `... \| dropitx upload` | same as text, `filename=stdin.txt` | 60 s |

Unset options are not sent. The API key, when configured, goes in `X-API-Key`;
uploads work without one. A non-2xx response becomes
`HTTP <status> <text> for <url>: <detail>`.

Response mapping (server -> client): `slug`, `url`, `filename`, `size`,
`expires_at`, `burn_after_reading`, `password_protected`, and camelCase
`deleteToken`.

## V1 Documents API (MCP backend)

All calls send `Authorization: Bearer <shk_/sht_ key>` and time out after 60 s.
Without a key the client fails before any request with a `dropitx config
set-key` hint.

| Function | Request |
|----------|---------|
| `createDocument` | `POST /api/v1/documents` `{content, is_private, filename?, title?, expires_in?}` |
| `getDocument` | `GET /api/v1/documents/{slug}` |
| `listDocuments` | `GET /api/v1/documents?page=&limit=` |
| `updateDocument` | `PATCH /api/v1/documents/{slug}` (only provided fields; empty -> 400 locally) |
| `deleteDocument` | `DELETE /api/v1/documents/{slug}` |
| `listRevisions` | `GET /api/v1/documents/{slug}/revisions?page=&limit=` |
| `getRevision` | `GET /api/v1/documents/{slug}/revisions/{n}` |
| `restoreRevision` | `POST /api/v1/documents/{slug}/revisions/{n}/restore` |

Errors map to `V1ClientError(status, message)`: 401 -> `Invalid or missing API
key (...)`, 404 -> `Not found: ...`, 410 -> `Document has expired: ...`, other
-> `API error (<status>): ...`, transport failure -> status 0 `Network error: ...`.
Content over 5,000,000 characters is rejected locally.

## MCP Server

- SDK: `@modelcontextprotocol/sdk` 1.x `McpServer` + `StdioServerTransport`;
  input schemas are zod shapes.
- Tools: `publish_page`, `update_page`, `get_page`, `list_pages`,
  `delete_page`, `list_revisions`, `get_revision`, `restore_revision`. Names,
  descriptions, parameter names, types, nullability and defaults match the
  earlier Python (FastMCP) server.
- Results: one text block with 2-space JSON; `list_pages` returns one block per
  page plus `structuredContent: {result: [...]}`. List results carry 200-char
  `content_preview` and `content_size` instead of full content.
- Errors: every failure is a result with `isError: true` and text
  `Error executing tool <name>: <message>`; invalid arguments are rejected by
  schema validation, also as `isError: true`.
- stdout is reserved for the protocol; nothing else writes to it.

## Config Resolution

For the API key and both URLs: environment variable > `~/.dropitx/config.json`
> default. Trailing slashes are stripped from URLs.

| Setting | Env | File key | Default |
|---------|-----|----------|---------|
| API key | `DROPITX_API_KEY` | `api_key` | none |
| API URL | `DROPITX_API_URL` | `api_url` | `https://api.dropitx.site` |
| Share-link base | `DROPITX_FRONTEND_URL` | `frontend_url` | `https://dropitx.site` |

The file is 2-space JSON; unknown keys are preserved on write and a corrupt
file reads as empty.

## Terminal UX

- The upload result always contains a `URL: <url>` line. Progress
  (`Uploading ...`) and errors go to stderr.
- Colors only when stdout is a TTY and `NO_COLOR` is unset.
- Passwords are read from `/dev/tty` with echo off, so a prompt works while
  stdin is a pipe; the value is asked twice and must match.
- `config show` masks keys longer than 12 characters as `first8...last4`,
  shorter ones as `***`.
- Exit codes: 0 success, 1 runtime/API error, 2 usage error (missing upload path).

## CI / Release

- `ci.yml`: Node 20 and 22 on `ubuntu-24.04` — install, typecheck, test,
  build, `npm pack --dry-run`, smoke run.
- `publish.yml`: on `v*` tags, `npm publish --provenance --access public`
  with `NPM_TOKEN`. See `deployment-guide.md`.
