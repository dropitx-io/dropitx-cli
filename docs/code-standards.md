# DropItX CLI - Code Standards

## Conventions Used in This Repository

This document describes the **actual patterns** used in DropItX CLI code, not generic best practices. Follow these when modifying or extending the codebase.

## CLI Patterns (Click)

### Password Prompt Idiom
Repeated across all upload commands (`upload`, `text`, bare `cli`):

```python
@click.option("--password", "-p", is_flag=False, flag_value="", 
              help="Password protection (prompts if no value)")
def upload(password: Optional[str], ...):
    if password == "":  # User passed bare -p flag
        password = click.prompt("Password", hide_input=True, confirmation_prompt=True)
    # Now password is either None, a string value, or prompted input
```

**Why this works:** `is_flag=False, flag_value=""` makes `-p` without a value pass `""`, which we detect and convert to a secure prompt.

### Global Options with Subcommand Delegation
Global options (`--password`, `--expires`, `--burn`, `--slug`, `--qr`, `--qr-file`) are defined on the main `@click.group` but **repeated** on subcommands (`upload`, `text`) because:

1. Click doesn't auto-propagate global options to subcommands
2. Each subcommand needs explicit parameter access
3. Pipe path uses global options; explicit commands use their own

### Pipe Magic Detection
```python
@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx, ...):
    if ctx.invoked_subcommand is None:
        if not sys.stdin.isatty():  # Pipe detected
            upload_stdin(...)
        else:
            click.echo(ctx.get_help())  # TTY, show help
```

### Multi-File Upload Behavior
```python
for file_path in files:
    result = upload_file(..., slug=slug if len(files) == 1 else None)
    # ^-- slug only applied to single-file uploads
```

Multi-file uploads render a **summary Table** instead of the success Panel. Single-file renders Panel with optional QR.

## Error Handling

### Generic Catch-All Pattern
Used throughout CLI for user-facing errors:

```python
try:
    result = upload_file(...)
except Exception as e:
    console.print(f"[red]Error: {e}[/red]")
    sys.exit(1)
```

**Note:** No structured error types. All errors surface as red text and exit.

### File Not Found
```python
try:
    # upload logic
except FileNotFoundError:
    console.print(f"[red]Error: File not found: {file_path}[/red]")
    sys.exit(1)
```

### Optional Dependency Failures
QR module degrades **without raising**:

```python
def generate_qr_image(url, output):
    if not HAS_QRCODE:
        return False  # caller surfaces error message
    # ... generate image
    return True
```

Caller checks return value and prints `pip install 'dropitx[qr]'` message.

## Optional Dependency Handling

### Import Pattern
```python
try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False
```

### Usage Pattern
```python
def generate_qr_ascii(url):
    if not HAS_QRCODE:
        return "[Text fallback - qrcode not installed]"
    return qrcode.make(...).print_ascii(invert=True)

def generate_qr_image(url, output):
    if not HAS_QRCODE:
        return False  # Don't raise
    # ... generate and save
    return True
```

**Key principle:** Never raise for missing optional deps. Return fallback or False and let caller surface helpful message.

## API Response Mapping

### CamelCase → snake_case
Server returns `deleteToken` (camelCase), client converts:

```python
class UploadResult:
    url: str
    slug: str
    delete_token: str  # ^-- mapped from response["deleteToken"]
    filename: str
    # Other fields already snake_case: expires_at, burn_after_reading, password_protected
```

**Other fields** from API are already snake_case: `slug`, `url`, `filename`, `size`, `expires_at`, `burn_after_reading`, `password_protected`.

### API Client Contract
```python
def upload_file(file_path, password=None, expires=None, burn=False, slug=None):
    api_url = get_api_url()
    api_key = get_api_key()
    
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key  # Optional, not required
    
    data = {}
    if password: data["password"] = password
    if expires: data["expires"] = expires
    if burn: data["burn"] = "true"  # Server expects string "true"
    if slug: data["slug"] = slug
    
    files = {"file": file_data}
    response = httpx.post(f"{api_url}/api/cli/upload", files=files, data=data, ...)
```

**Timeouts:** File uploads 300s, text uploads 60s.

## Config Resolution

### Precedence Chain
```python
def get_api_key():
    # 1. Env var (highest priority)
    if key := os.getenv("DROPITX_API_KEY"):
        return key
    # 2. Config file
    config = load_config()
    if "api_key" in config:
        return config["api_key"]
    # 3. None (uploads still work without key)
    return None
```

Same pattern for `get_api_url()` with fallback to `DEFAULT_API_URL = "https://api.dropitx.site"`.

### URL Normalization
```python
config["api_url"] = value.rstrip("/")  # Remove trailing slash
```

## Terminal Output (Rich)

### Single Shared Console
```python
from rich.console import Console
console = Console()  # Module-level global
```

**All functions use this instance** — no per-call Console() creation.

### Success Output
```python
def print_upload_result(result, qr=False, qr_file=None):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Key", style="bold cyan")
    table.add_column("Value")
    table.add_row("URL", result.url)
    table.add_row("Slug", result.slug)
    # ...
    
    console.print(Panel(table, title="[bold green]Upload Successful[/bold green]", 
                       border_style="green"))
```

### Config Table Output
```python
table = Table(title="DropItX Configuration")
table.add_column("Setting", style="cyan")
table.add_column("Value")
table.add_row("API URL", api_url)
table.add_row("API Key", masked_key)  # "shk_abc...xyz"
console.print(table)
```

### Multi-File Summary
```python
table = Table(title="Upload Results")
table.add_column("File", style="cyan")
table.add_column("URL", style="green")
table.add_column("Slug")
for result in results:
    table.add_row(result.filename, result.url, result.slug)
console.print(table)
```

### Error Output
```python
console.print(f"[red]Error: {e}[/red]")
console.print("[dim]Hint: ...[/dim]")
```

### QR Output
```python
console.print("\n[bold]QR Code:[/bold]")
console.print(generate_qr_ascii(result.url))  # ASCII art
```

## Naming Conventions

### Files
- Kebab-case for modules: `cli.py`, `uploader.py`, `config.py`, `qr.py`
- Single flat package, no subpackages

### Functions/Variables
- snake_case: `upload_file()`, `get_api_key()`, `print_upload_result()`
- Descriptive names: `delete_token`, `burn_after_reading`, `password_protected`

### Click Commands
- Use `name=` when name differs from function:
  ```python
  @cli.command(name="config")
  def config_cmd(...):  # Avoids shadowing config module
  ```

## Type Annotations

### Modern Python (3.9+)
```python
from typing import Optional

def upload_file(file_path: str, password: Optional[str] = None, ...) -> UploadResult:
    results: list[UploadResult] = []
    files: tuple[str, ...] = ()
```

**Note:** Despite `pyproject.toml` saying `>= 3.8`, code uses PEP 585 generics (`list[UploadResult]`, `tuple[str, ...]`) → practical minimum is **3.9+**.

## Testing Conventions

### Framework & Structure
- **pytest** is the test runner
- Tests live in `tests/test_dropitx.py` (single file, 13 tests)
- Network-free execution — no real API calls
- Uses `monkeypatch` to isolate config (never touches `~/.dropitx`)

### CLI Testing Pattern
```python
from click.testing import CliRunner

def test_cli_help_exits_zero():
    result = CliRunner().invoke(cli_mod.cli, ["--help"])
    assert result.exit_code == 0
    assert "DropItX" in result.output
```

### Config Isolation Pattern
```python
def _isolate_config(monkeypatch, tmp_path):
    """Point config module at tmp dir so ~/.dropitx is never read."""
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.json")

def test_api_url_env_overrides(monkeypatch):
    monkeypatch.setenv("DROPITX_API_URL", "https://example.com/")
    assert config.get_api_url() == "https://example.com"  # trailing slash stripped
```

### Optional Dependency Testing
```python
@pytest.mark.skipif(not qr.HAS_QRCODE, reason="qrcode[pil] not installed")
def test_qr_ascii_when_lib_present():
    assert isinstance(qr.generate_qr_ascii("https://example.com/x"), str)

def test_qr_text_box_contains_url():
    out = qr.generate_qr_text("https://example.com/x")
    assert "https://example.com/x" in out
```

### Test Coverage Areas
- Package version and module imports
- CLI surface (help, version, subcommands)
- Dataclass field mapping (camelCase → snake_case)
- Config/env resolution precedence
- QR generation (text fallback, ASCII, image)

## CI / Commit Conventions

### GitHub Actions CI
- **File:** `.github/workflows/ci.yml`
- **Matrix:** Python 3.9 + 3.12
- **Steps:** Install `.[dev,qr]` → `pytest -q` → CLI smoke (`--version`, `--help`)
- **Triggers:** Push to `main`, pull requests
- **Status:** All tests pass on both versions

### Commit Format
- Conventional commits preferred (`feat:`, `fix:`, `docs:`, etc.)
- No AI references in commit messages
- Keep commits focused and atomic

---

**Last Updated:** 2026-06-28  
**Python Version:** 3.9+ (practical), 3.8+ (declared but incorrect)  
**Test Runner:** pytest, 13 tests passing on CI
