# DropItX CLI - Project Roadmap

## Current State (v2.0.0 - 2026-11-01)

**Working Features:**
- File, text, and stdin uploads to the DropItX API
- Password protection (hidden prompt), expiration, burn-after-reading, custom slug
- Terminal QR codes and PNG QR files (built in, no extras)
- Config management (API key, URL) with env override
- MCP stdio server with 8 page tools for AI agents (`npx -y dropitx mcp`)
- `drop-plan` Claude Code skill, installed with `dropitx skill install`
- **Runtime:** Node.js >= 20, published to npm as `dropitx` (replaces the never-published Python package)
- **Tests:** vitest, network-free (local HTTP stubs), run in CI on Node 20 and 22
- **Release automation:** `publish.yml` publishes with provenance on `v*` tags once `NPM_TOKEN` is configured

**Known Gaps:**
- No progress indication for large file uploads
- No client-side validation for slug length/expires format
- No chunked/resumable upload support
- No retry logic on network failures

## Completed

- **2026-06-28** — Test suite and CI for the Python package.
- **2026-11-01** — Ported the CLI and MCP server to TypeScript and npm (v2.0.0);
  Node 20/22 CI; npm publish workflow; Python package removed.

## Proposed Roadmap

### Phase 2: Enhanced UX (Proposed)

**Priority: MEDIUM**

**2.1 Upload Progress Indication**
- Add progress bar for large file uploads (300s timeout)
- Show progress while the multipart upload streams
- **Effort:** 1 day
- **Why:** Users have no feedback during long uploads

**2.2 Client-Side Validation**
- Validate slug length (3-32 chars) before sending
- Validate expires format (regex: `^\d+[hdwm]$`)
- Surface clear errors before upload attempt
- **Effort:** 0.5 day
- **Why:** Fail fast, reduce API roundtrips

**2.3 Retry Logic**
- Add retry on network errors (timeout, connection refused)
- Exponential backoff, max 3 retries
- Configurable via `--retry` flag or env var
- **Effort:** 1 day
- **Why:** Improve reliability on unstable networks

### Phase 3: Advanced Features (Proposed)

**Priority: LOW**

**3.1 Chunked/Resumable Uploads**
- Support large files (>100MB) with chunked upload
- Server-side support required (API enhancement)
- Resume interrupted uploads via upload ID
- **Effort:** 3-5 days (requires API changes)
- **Why:** Enable sharing large datasets, logs, VM images

**3.2 Batch Operations**
- `dropitx upload --batch manifest.json` for bulk uploads
- Parallel uploads with concurrency limit
- Aggregate result summary
- **Effort:** 2 days
- **Why:** Power users sharing many files at once

**3.3 Download Command**
- `dropitx download <url|slug>` to retrieve files
- Auth via API key if password-protected
- **Effort:** 1-2 days (requires API endpoint)
- **Why:** Complete the share lifecycle

**3.4 History/Cache**
- Local cache of recent uploads (sqlite or JSON)
- `dropitx history` to show past uploads
- `dropitx delete <slug>` to remove files
- **Effort:** 2 days
- **Why:** Users lose share URLs constantly

### Phase 4: Polish (Proposed)

**Priority: LOW**

**4.2 Shell Completions**
- Generate shell completion scripts (bash, zsh, fish)
- commander has no built-in generator; write scripts or add a small helper
- **Effort:** 0.5 day
- **Why:** Better DX, autocomplete flags/files

**4.3 Man Pages**
- Generate a man page from the commander help text
- Include in package, install to `man/man1/`
- **Effort:** 0.5 day
- **Why:** Standard CLI tool convention

**4.4 Config Validation**
- Validate config file on load (URL format, key prefix)
- Clear errors on malformed config
- **Effort:** 0.5 day
- **Why:** Users may corrupt JSON manually

## Dependencies & Blockers

### External Dependencies
- **Chunked upload:** Requires DropItX API support
- **Download command:** Requires API endpoint
- **History/cache:** Local-only, no API changes needed

### Internal Dependencies
- **Progress indication (2.1)** benefits from **retry logic (2.3)**

## Non-Goals (Explicitly Out of Scope)

- GUI or web interface (CLI-only project)
- Account management/registration (use web dashboard)
- Multi-account/profile switching (not requested)
- Custom API endpoints beyond base URL (use env override)
- Plugin system (keep it simple)

## Success Metrics

**Foundation (done in v2.0.0 except the secret):**
- All checks pass on Node 20 and 22
- Publishing is a tag push once `NPM_TOKEN` is set

**Phase 2 (Enhanced UX):**
- Users see progress during uploads
- Validation errors surface before API calls
- Intermittent network failures handled gracefully

**Phase 3+ (Advanced):**
- Large file sharing enabled (>100MB)
- Power users can batch upload
- Complete share lifecycle (upload + download + delete)

## Risks & Considerations

**API Compatibility:**
- Chunked upload/resume requires server-side changes
- Download command requires new endpoint
- Coordinate with DropItX API team before implementing

**Backward Compatibility:**
- New validation (slug length, expires format) must not break existing workflows
- Feature flags (retry, progress) should be opt-in initially

**Dependency Bloat:**
- Avoid adding heavy deps for marginal gains
- Prefer the Node standard library or existing dependencies (commander, qrcode, MCP SDK)

---

**Last Updated:** 2026-11-01  
**Roadmap Status:** v2.0.0 npm port complete; Phases 2-4 proposed
