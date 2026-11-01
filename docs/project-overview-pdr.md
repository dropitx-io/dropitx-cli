# DropItX CLI - Project Overview & Product Development Requirements

## What It Is

DropItX CLI (`dropitx`) is a Node.js command-line client for the DropItX file-sharing service, distributed on npm. It provides a terminal-native interface for uploading files, text content, and stdin pipes to DropItX with optional password protection, expiration, burn-after-reading, and QR code generation, plus an MCP stdio server that lets AI agents publish and manage pages.

**Stack:** TypeScript on Node.js >= 20, commander (CLI), built-in fetch (HTTP), qrcode, @modelcontextprotocol/sdk + zod (MCP)  
**Install:** `npm install -g dropitx` or `npx dropitx`  
**License:** MIT (Copyright 2026 DropItX)  
**Repository:** https://github.com/phuongddx/dropitx-cli (public)  
**Homepage:** https://dropitx.site  
**Version:** 2.0.0 (2026-11-01; replaces the never-published Python 1.x package)  
**Tests:** vitest, network-free, CI on Node 20 and 22

## Target Users

- Developers sharing logs, config snippets, or code via terminal
- DevOps/SRE teams sharing artifacts in CI/CD pipelines
- Power users preferring keyboard workflows over web interfaces
- Users needing temporary file sharing with expiration/burn features

## Core Features

### Upload Methods
- **File upload:** `dropitx upload file.txt` (supports glob patterns, multiple files)
- **Text upload:** `dropitx text "content"` with optional filename
- **Stdin upload:** `echo "hello" | dropitx` (pipe magic)

### Upload Options
- **Password protection:** `--password` prompts securely if no value provided
- **Expiration:** `--expires 1h|7d|1w|30d` (server-side formats, not validated client-side)
- **Burn after reading:** `--burn` flag
- **Custom slug:** `--slug` (single-file only; docs say 3-32 chars, not enforced client-side)

### Output & QR
- **Terminal output:** result block with the share URL on its own `URL: <url>` line, plus slug, delete token, expiry, burn and password flags
- **Terminal QR codes:** built in
- **Image QR codes:** PNG via `--qr-file` / `qr -o`, built in

### Agent Integration
- **MCP server:** `npx -y dropitx mcp` exposes publish_page, update_page, get_page, list_pages, delete_page, list_revisions, get_revision, restore_revision
- **Claude Code skill:** `dropitx skill install` installs `drop-plan`

### Configuration
- **API key:** Optional (uploads work without it)
- **Config precedence:** Env vars (`DROPITX_API_KEY`, `DROPITX_API_URL`) → `~/.dropitx/config.json` → defaults
- **Config commands:** `dropitx config set-key|show|set-url`

## Non-Goals (Current Scope)

- GUI or web interface (CLI-only)
- Resume/chunked uploads for large files
- Client-side slug/expires validation (server validates)
- Upload progress indication during 300s timeout window
- Account management or user operations (upload-only client)
- Download or file retrieval (only uploads)

## Product Development Requirements

### Functional Requirements

**FR1:** Upload single file via multipart POST to `{api_url}/api/cli/upload`  
**FR2:** Upload text content via form POST to `{api_url}/api/cli/upload/text`  
**FR3:** Upload stdin pipe by reading stdin and delegating to text upload  
**FR4:** Support password protection with secure prompt if flag value omitted  
**FR5:** Support expiration, burn-after-reading, and custom slug options  
**FR6:** Display upload results with the URL on its own line and the delete token  
**FR7:** Generate ASCII QR codes for uploaded URLs  
**FR8:** Generate PNG QR codes  
**FR9:** Store/retrieve API key and URL from config file with env override  
**FR10:** Mask API key in `config show` display

### Non-Functional Requirements

**NFR1:** Node.js 20+ runtime  
**NFR2:** 300s timeout for file uploads, 60s for text  
**NFR3:** MCP tool failures surface as `isError: true` results with the API message  
**NFR4:** Clear error messages on stderr with exit code 1 on failures  
**NFR5:** MIT license, minimal deps (commander, qrcode, MCP SDK, zod)

### Success Criteria

- **Adoption:** `npm install -g dropitx` / `npx dropitx --help` work
- **Reliability:** Uploads succeed with valid inputs; errors surface clearly
- **UX:** Pipe flow works (`echo hi | dropitx`)
- **QR:** terminal and PNG QR codes work out of the box
- **Config:** Precedence respected (env > file > default)
- **Tests:** network-free suites cover the CLI surface, config resolution, HTTP contracts, MCP tools, skill install
- **CI:** typecheck, tests, build and pack pass on Node 20 and 22

## Known Issues & Gaps

### Release Secret
- `publish.yml` publishes on `v*` tags but needs the `NPM_TOKEN` repository secret before the first release.

### Missing Features (Proposed)
- No progress indication for large file uploads
- No chunked/resumable upload support
- No client-side validation of slug length/expires format
- No upload retry logic on network failure

## API Key Prefix Note

Keys start with `shk_` (personal) or `sht_` (team). **The client never validates prefixes** — any string is accepted; the server validates.

---

**Last Updated:** 2026-11-01  
**Status:** v2.0.0 npm package, MIT-licensed, public on GitHub
