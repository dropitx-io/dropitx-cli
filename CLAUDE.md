# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DropItX CLI — a Python command-line client for the DropItX file-sharing service (`dropitx` on PyPI). Dual-mode: direct uploads via Click CLI, and agent-driven page management via MCP stdio server. Built with **Click** (CLI), **httpx** (HTTP), **rich** (terminal output), optional **qrcode[pil]** extra, and optional **mcp** server (FastMCP).

## Commands

```bash
pip install -e .                 # minimal install (Click, httpx, rich)
pip install -e '.[qr]'           # add QR image support (qrcode[pil])
pip install -e '.[mcp]'          # add MCP server support (mcp, requires Python 3.10+)
pip install -e '.[all]'          # all extras (qr + mcp)
pytest                           # run all tests (network-free except slow wheel test)
pytest -m 'not slow'             # skip slow wheel test
python -m dropitx.cli            # run without installing the entry point
dropitx --help                   # installed entry point → dropitx.cli:cli
```

There is no lint/typecheck step configured; `pip install -e .` is the build and `pytest` is the test gate (run on push/PR via `.github/workflows/ci.yml`, Python 3.9 + 3.12 matrix). Python **3.9+** is the practical minimum even though `pyproject.toml` declares `>=3.8` — the source uses PEP 585 generics (`tuple[str, ...]`, `list[UploadResult]`) evaluated at runtime. MCP server requires Python **3.10+** (FastMCP SDK requirement).

## Architecture

### Command surface and the bare-invocation trick
`cli.py` defines a Click **group with `invoke_without_command=True`** plus global options (`--password/-p`, `--expires/-e`, `--burn/-b`, `--slug/-s`, `--qr/-q`, `--qr-file`). Running bare `dropitx`:
- **stdin piped** → uploads stdin via `upload_stdin`
- **no stdin** → prints help

This lets `echo hi | dropitx` work with no subcommand. Subcommands: `upload`, `text`, `config` (registered as `config_cmd`, `name="config"`), `qr`.

**Password option idiom** (repeats across commands): `is_flag=False, flag_value=""` makes `-p` without a value pass `""`, which the command detects and turns into an interactive `click.prompt(..., hide_input=True, confirmation_prompt=True)`.

### Upload flow — three entrypoints converge in `uploader.py`
- `upload_file` → multipart POST `{api_url}/api/cli/upload` (300s timeout for large files)
- `upload_text` → form POST `{api_url}/api/cli/upload/text` (60s timeout)
- `upload_stdin` → reads `sys.stdin`, delegates to `upload_text` with `filename="stdin.txt"`

In `cli.py upload`, **multiple files** loop through `upload_file`; the `--slug` option is intentionally applied only when a single file is uploaded (slug omitted for multi-file). Multi-file results render as a summary table instead of the success panel.

### API contract (client ↔ server)
Auth is **optional** — if an API key exists it is sent as the `X-API-Key` header; uploads succeed without one. Request form fields: `password`, `expires` (e.g. `1h`/`7d`/`1w`), `burn` (string `"true"`), `slug`, plus `file` or `content`/`filename`.

`UploadResult` wraps the JSON response. **Note the naming mismatch**: the server returns `deleteToken` (camelCase) which maps to `delete_token`; other fields (`slug`, `url`, `filename`, `size`, `expires_at`, `burn_after_reading`, `password_protected`) are already snake_case. Preserve this mapping when touching `uploader.py`.

### Config resolution (`config.py`)
Precedence for both API key and URL: **environment variable** (`DROPITX_API_KEY` / `DROPITX_API_URL`) **overrides** `~/.dropitx/config.json`, which overrides `DEFAULT_API_URL` (`https://api.dropitx.site`; use `config set-url` or `DROPITX_API_URL` for a local backend). Share links use `DEFAULT_FRONTEND_URL` (`https://dropitx.site`). URLs are `.rstrip("/")`-ed. `config show` masks the key for display; `config set-url` mutates the file directly.

### Optional QR (`qr.py`)
`qrcode` import is wrapped in try/except and probed once via module-level `HAS_QRCODE`. `generate_qr_ascii` degrades to a plain text box when the extra is missing; `generate_qr_image` returns `False` instead of raising, and callers surface the `pip install 'dropitx[qr]'` hint.

### Output layer
All terminal rendering goes through one shared `console = Console()` and `print_upload_result()`. New upload paths should route results through `print_upload_result` to keep the success panel/QR behavior consistent.


### V1 API Client (`v1_client.py`)
Wraps FastAPI `/api/v1/documents` endpoints. Single responsibility: HTTP CRUD for documents and revisions.
- **Classes:** `DocumentResult` (response wrapper), `V1ClientError` (exception with status + message)
- **CRUD:** create/get/list/update/delete document (map directly to HTTP endpoints)
- **Revisions:** list/get/restore revision (version history management)
- **Auth:** Bearer token from `config.get_api_key()`, precedence env > file > None
- **Timeout:** 60s (generous for Render free-tier cold starts)
- **Content limit:** 5M chars (matches server-side `DocumentCreate.max_length`)
- **Key pattern:** All functions raise `V1ClientError` on failure; the MCP server lets them propagate so FastMCP reports `isError: true`

### MCP Stdio Server (`mcp_server.py`)
Wraps v1_client functions and exposes them as MCP tools for agents. Wired to the CLI via the `dropitx mcp` command in `cli.py` (lazy-imports `mcp_server` so the base install stays free of the `mcp` dependency; prints an install hint and exits 1 if the `mcp` extra isn't installed).
- **Framework:** FastMCP (`mcp.server.fastmcp`, `mcp>=1.0,<2` — mcp 2.x renamed it to `MCPServer` and removed this module)
- **Entry:** `run_server()` starts stdio transport
- **Tools:** 8 published via `@mcp.tool()` decorator:
  - publish_page, update_page, get_page, list_pages, delete_page
  - list_revisions, get_revision, restore_revision
- **Error handling:** Tools do not catch `V1ClientError`; FastMCP turns the raised exception into an `isError: true` result carrying the API's message. `dropitx mcp` distinguishes a missing extra from an installed-but-incompatible `mcp` version via `importlib.metadata`
- **Content safety:** list_pages/list_revisions truncate content to 200 chars for context-window safety
- **Response dicts:** Compact for publish/update (no content), full for get_page, preview for list

### drop-plan Claude Code skill (`skills/drop-plan/`)
The skill itself — `SKILL.md` plus `scripts/find_latest_plan.py` (a deterministic, stdlib-only newest-plan-artifact finder: `plans/*/plan.md` > its own `phase-*.md` siblings, `.html` > a sibling `.md` twin) — is bundled as package data (`[tool.setuptools.package-data]` in `pyproject.toml`, since `packages.find` alone only ships `.py` files) and installed on demand via `dropitx skill install` in `cli.py`. The install command copies `importlib.resources.files("dropitx") / "skills" / "drop-plan"` to `~/.claude/skills/drop-plan/`, guards against Python <3.9 (needs `importlib.resources.files`), refuses to overwrite an existing install without `--force`, and even then prompts for confirmation before `shutil.rmtree`-ing the destination. `shutil.copytree` explicitly ignores `__pycache__`/`*.pyc` so installer bytecode-compilation artifacts don't leak into the shared skill folder.
