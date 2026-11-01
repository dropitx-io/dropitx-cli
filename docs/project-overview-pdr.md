# DropItX CLI - Project Overview & Product Development Requirements

## What It Is

DropItX CLI (`dropitx`) is a Python command-line client for the DropItX file-sharing service. It provides a terminal-native interface for uploading files, text content, and stdin pipes to DropItX with optional password protection, expiration, burn-after-reading, and QR code generation.

**Stack:** Click (CLI), httpx (HTTP), rich (terminal output), optional qrcode[pil]  
**License:** MIT (Copyright 2026 DropItX)  
**Repository:** https://github.com/phuongddx/dropitx-cli (public)  
**Homepage:** https://dropitx.site  
**Version:** 1.0.0 (2026-06-28)  
**Tests:** 13 tests, all passing on CI (Python 3.9 + 3.12)

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
- **Rich terminal output:** Green Panel with Table of results (url, slug, delete_token, etc.)
- **ASCII QR codes:** Built-in, no extra deps
- **Image QR codes:** Requires `pip install 'dropitx[qr]'`

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
**FR3:** Upload stdin pipe by reading sys.stdin and delegating to text upload  
**FR4:** Support password protection with secure prompt if flag value omitted  
**FR5:** Support expiration, burn-after-reading, and custom slug options  
**FR6:** Display upload results in formatted rich output with delete token  
**FR7:** Generate ASCII QR codes for uploaded URLs  
**FR8:** Generate image QR codes when optional deps installed  
**FR9:** Store/retrieve API key and URL from config file with env override  
**FR10:** Mask API key in `config show` display

### Non-Functional Requirements

**NFR1:** Python 3.9+ runtime (see version mismatch note below)  
**NFR2:** 300s timeout for file uploads, 60s for text  
**NFR3:** Graceful degradation when qrcode not installed  
**NFR4:** Clear error messages with sys.exit(1) on failures  
**NFR5:** MIT license, minimal deps (httpx, click, rich)

### Success Criteria

- **Adoption:** pip install succeeds; `dropitx --help` displays correctly
- **Reliability:** Uploads succeed with valid inputs; errors surface clearly
- **UX:** Pipe flow works (`echo hi | dropitx`)
- **QR:** ASCII QR always works; image QR degrades gracefully
- **Config:** Precedence respected (env > file > default)
- **Tests:** 13 network-free tests cover CLI surface, config resolution, field mapping, QR
- **CI:** All tests passing on Python 3.9 and 3.12

## Known Issues & Gaps

### Version Mismatch
- **Issue:** `pyproject.toml` declares `>= 3.8` but code uses PEP 585 generics (`list[UploadResult]`, `tuple[str, ...]`) → practical minimum is **3.9+**
- **Fix:** One-line change to `requires-python = ">=3.9"`

### No PyPI Release Automation
- CI exists (tests run on push/PR), but no PyPI publish workflow
- Publishing is manual via `twine upload dist/*`
- Opportunity: Add `.github/workflows/release.yml` triggered on tags

### Missing Features (Proposed)
- No progress indication for large file uploads
- No chunked/resumable upload support
- No client-side validation of slug length/expires format
- No upload retry logic on network failure

## API Key Prefix Note

Keys start with `shk_` (personal) or `sht_` (team). **The client never validates prefixes** — any string is accepted; the server validates.

---

**Last Updated:** 2026-06-28  
**Status:** v1.0.0 production release, MIT-licensed, tested (13 tests, CI-green), public on GitHub
