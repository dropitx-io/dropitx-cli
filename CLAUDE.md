# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DropItX CLI — a TypeScript command-line client for the DropItX file-sharing service, published to npm as `dropitx` (`npm install -g dropitx`, `npx dropitx`, MCP via `npx -y dropitx mcp`). Dual-mode: direct uploads via a **commander** CLI, and agent-driven page management via an MCP stdio server built on **@modelcontextprotocol/sdk** (1.x) with **zod** schemas. QR codes come from **qrcode**; HTTP is Node's built-in `fetch`. Node **20+** (`engines.node`), ESM only. Version 2.0.0 replaced the earlier Python package (never published to PyPI).

## Commands

```bash
npm install          # dev setup
npm run typecheck    # tsc --noEmit over src/ + tests/
npm test             # vitest, network-free
npm run build        # tsc -p tsconfig.build.json: src/ -> dist/
node dist/cli.js --help
npm pack --dry-run   # check what ships (dist/**/*.js, skills/, package.json, README, LICENSE)
```

CI (`.github/workflows/ci.yml`) runs install, typecheck, test, build and `npm pack --dry-run` on Node 20 and 22 (`ubuntu-24.04`). `publish.yml` publishes on `v*` tags with `npm publish --provenance --access public` using the `NPM_TOKEN` secret. Keep dependencies compatible with Node 20 (commander 15 and vitest 5 are not).

## Architecture

### Entry and command surface
`src/cli.ts` (bin, shebang) builds a `CliIO` from the real process and calls `run()` in `src/program.ts`. `program.ts` never touches `process` directly, so tests drive it with an in-memory `CliIO` and assert on output and exit codes (0 ok, 1 error, 2 usage). Commands: `upload [files...]`, `text <content>`, `config <set-key|show|set-url> [value]`, `qr <url> [-o path]`, `mcp`, `skill install [--force]`.

**Bare invocation:** the root command has the upload options (`-p/-e/-b/-s/-q/--qr-file`) and an action — piped stdin is uploaded as `stdin.txt`, an interactive terminal prints help. `enablePositionalOptions()` keeps root options before the command name.

**Password idiom:** `-p, --password [password]` — a bare flag yields `true`, which triggers a hidden prompt (read from `/dev/tty`, so it works while stdin is piped) asked twice until both entries match. A following non-option argument is taken as the password.

### Upload flow (`uploader.ts`)
- `uploadFile` → multipart POST `{api_url}/api/cli/upload`, field `file` (300 s timeout)
- `uploadText` → urlencoded POST `{api_url}/api/cli/upload/text`, fields `content`, `filename` (60 s)
- `uploadStdin` → reads the stream, delegates to `uploadText` with `filename=stdin.txt`

Option fields: `password`, `expires`, `burn` (string `"true"`), `slug`; unset ones are omitted. Auth is optional: a configured key goes in `X-API-Key`. `upload` drops `--slug` when more than one file is given and prints a table instead of the result block. The server returns camelCase `deleteToken`; `toUploadResult()` maps the response to a camelCase `UploadResult`. Every result prints `URL: <url>` on its own line — keep it greppable.

### Config (`config.ts`)
Env (`DROPITX_API_KEY`, `DROPITX_API_URL`, `DROPITX_FRONTEND_URL`) > `~/.dropitx/config.json` (`api_key`, `api_url`, `frontend_url`) > defaults (`https://api.dropitx.site`, `https://dropitx.site`). The path is resolved from `os.homedir()` on every call, so `HOME` overrides work. URLs are stripped of trailing slashes; writes preserve unknown keys as 2-space JSON; corrupt files read as `{}`. Config files from the Python CLI keep working.

### V1 client (`v1-client.ts`)
`/api/v1/documents*` CRUD + revisions with `Authorization: Bearer <shk_/sht_ key>`, 60 s timeout, 5,000,000-char content guard, empty-update guard. Errors are `V1ClientError(status, message)`: 401 → set-key hint, 404 → `Not found: …`, 410 → `Document has expired: …`, else `API error (<status>): …`, transport failure → status 0 `Network error: …`. A missing key fails before any request. `DocumentResult` keeps the API's snake_case fields and adds `url = {frontend_url}/s/{slug}`.

### MCP server (`mcp-server.ts`)
`McpServer` + `StdioServerTransport`. Tools: publish_page, update_page, get_page, list_pages, delete_page, list_revisions, get_revision, restore_revision. Names, descriptions (the old Python docstrings), parameter names, types, nullability and defaults match the former FastMCP server — they are a public contract. Each tool body runs in `run()`, which turns any thrown error into `{isError: true, text: "Error executing tool <name>: <message>"}`. Results are 2-space JSON text; `list_pages` emits one text block per page plus `structuredContent: {result}`; list results carry a 200-char `content_preview` and `content_size` instead of content. Nothing may write to stdout outside the transport.

### drop-plan skill (`skills/drop-plan/`)
`SKILL.md` plus `scripts/find_latest_plan.mjs` (stdlib-only newest-plan finder: `plans/*/plan.md` > its own `phase-*.md` siblings, `.html` > a sibling `.md` twin, also `plans/reports/` and `docs/plans/`). Shipped via the `files` whitelist and installed by `dropitx skill install`, which copies it from the package (resolved relative to the compiled module) to `~/.claude/skills/drop-plan/`. Without `--force` an existing install is left alone; with `--force` it asks `[y/N]` and only deletes a path ending in `skills/drop-plan`.

### Tests (`tests/`)
vitest. `helpers.ts` gives each test an isolated `HOME` and clears `DROPITX_*`, a real local HTTP stub (`startStub`) instead of fetch mocks, a form-body parser, a closed-port URL for network failures, and `fakeIO()` for the CLI. MCP tests use `InMemoryTransport.createLinkedPair()` with a real SDK client. Never let a test hit the production URL.
