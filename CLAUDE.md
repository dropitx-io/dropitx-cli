# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DropItX CLI — a Python command-line client for the DropItX file-sharing service (`dropitx` on PyPI). Built with **Click** (CLI), **httpx** (HTTP), **rich** (terminal output), and an optional **qrcode[pil]** extra.

## Commands

```bash
pip install -e '.[dev]'          # dev install (adds pytest, pytest-cov)
pip install -e '.[qr]'           # add QR image support (qrcode[pil])
pytest                           # run all tests (network-free)
pytest tests/test_dropitx.py     # CLI, config, QR, UploadResult mapping
python -m dropitx.cli            # run without installing the entry point
dropitx --help                   # installed entry point → dropitx.cli:cli
There is no lint/typecheck step configured; `pip install -e .` is the build and `pytest` is the test gate (run on push/PR via `.github/workflows/ci.yml`, Python 3.9 + 3.12 matrix). Python **3.9+** is the practical minimum even though `pyproject.toml` declares `>=3.8` — the source uses PEP 585 generics (`tuple[str, ...]`, `list[UploadResult]`) evaluated at runtime.

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
Precedence for both API key and URL: **environment variable** (`DROPITX_API_KEY` / `DROPITX_API_URL`) **overrides** `~/.dropitx/config.json`, which overrides `DEFAULT_API_URL` (`https://dropitx-api.onrender.com`). URLs are `.rstrip("/")`-ed. `config show` masks the key for display; `config set-url` mutates the file directly.

### Optional QR (`qr.py`)
`qrcode` import is wrapped in try/except and probed once via module-level `HAS_QRCODE`. `generate_qr_ascii` degrades to a plain text box when the extra is missing; `generate_qr_image` returns `False` instead of raising, and callers surface the `pip install 'dropitx[qr]'` hint.

### Output layer
All terminal rendering goes through one shared `console = Console()` and `print_upload_result()`. New upload paths should route results through `print_upload_result` to keep the success panel/QR behavior consistent.


### drop-plan Claude Code skill (`skills/drop-plan/`)
The skill itself — `SKILL.md` plus `scripts/find_latest_plan.py` (a deterministic, stdlib-only newest-plan-artifact finder: `plans/*/plan.md` > its own `phase-*.md` siblings, `.html` > a sibling `.md` twin) — is bundled as package data (`[tool.setuptools.package-data]` in `pyproject.toml`, since `packages.find` alone only ships `.py` files) and installed on demand via `dropitx skill install` in `cli.py`. The install command copies `importlib.resources.files("dropitx") / "skills" / "drop-plan"` to `~/.claude/skills/drop-plan/`, guards against Python <3.9 (needs `importlib.resources.files`), refuses to overwrite an existing install without `--force`, and even then prompts for confirmation before `shutil.rmtree`-ing the destination. `shutil.copytree` explicitly ignores `__pycache__`/`*.pyc` so installer bytecode-compilation artifacts don't leak into the shared skill folder.
