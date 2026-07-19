"""DropItX CLI — Main command-line interface."""

import shutil
import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import __version__
from .config import get_api_key, get_api_url, set_api_key
from .qr import generate_qr_ascii, generate_qr_image
from .uploader import UploadResult, upload_file, upload_stdin, upload_text

console = Console()


def print_upload_result(result: UploadResult, qr: bool = False, qr_file: Optional[str] = None) -> None:
    """Print upload result in a nice format."""
    # Create result table
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Key", style="bold cyan")
    table.add_column("Value")
    
    table.add_row("URL", result.url)
    table.add_row("Slug", result.slug)
    table.add_row("Filename", result.filename)
    table.add_row("Delete Token", result.delete_token)
    
    if result.expires_at:
        table.add_row("Expires", result.expires_at)
    if result.burn_after_reading:
        table.add_row("Burn", "Yes")
    if result.password_protected:
        table.add_row("Password", "Protected")
    
    # Print panel
    console.print(Panel(
        table,
        title="[bold green]Upload Successful[/bold green]",
        border_style="green",
    ))
    
    # Print QR code if requested
    if qr:
        console.print("\n[bold]QR Code:[/bold]")
        console.print(generate_qr_ascii(result.url))
    
    # Save QR code image if requested
    if qr_file:
        if generate_qr_image(result.url, qr_file):
            console.print(f"\n[green]QR code saved to: {qr_file}[/green]")
        else:
            console.print("\n[yellow]Install qrcode[pil] for QR code image support: pip install 'dropitx[qr]'[/yellow]")


@click.group(invoke_without_command=True)
@click.version_option(version=__version__, prog_name="dropitx")
@click.option("--password", "-p", is_flag=False, flag_value="", help="Password protection (prompts if no value)")
@click.option("--expires", "-e", help="Expiration time (e.g., 1h, 7d, 1w)")
@click.option("--burn", "-b", is_flag=True, help="Burn after reading")
@click.option("--slug", "-s", help="Custom slug (3-32 chars)")
@click.option("--qr", "-q", is_flag=True, help="Show QR code")
@click.option("--qr-file", type=click.Path(), help="Save QR code to file")
@click.pass_context
def cli(
    ctx: click.Context,
    password: Optional[str],
    expires: Optional[str],
    burn: bool,
    slug: Optional[str],
    qr: bool,
    qr_file: Optional[str],
) -> None:
    """DropItX — Developer-friendly file sharing from the command line.
    
    Upload files, text, and pipes to DropItX with simple commands.
    
    Examples:
    
        dropitx upload file.txt
    
        echo hello | dropitx
    
        dropitx upload --password --expires 1h file.txt
    
        dropitx config set-key sk_xxx
    """
    # If no subcommand invoked, check for piped input
    if ctx.invoked_subcommand is None:
        if not sys.stdin.isatty():
            # Reading from stdin (pipe)
            if password == "":
                password = click.prompt("Password", hide_input=True, confirmation_prompt=True)
            
            try:
                result = upload_stdin(
                    password=password,
                    expires=expires,
                    burn=burn,
                    slug=slug,
                )
                print_upload_result(result, qr=qr, qr_file=qr_file)
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                sys.exit(1)
        else:
            # No subcommand and no piped input - show help
            click.echo(ctx.get_help())


@cli.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True))
@click.option("--password", "-p", is_flag=False, flag_value="", help="Password protection (prompts if no value)")
@click.option("--expires", "-e", help="Expiration time (e.g., 1h, 7d, 1w)")
@click.option("--burn", "-b", is_flag=True, help="Burn after reading")
@click.option("--slug", "-s", help="Custom slug (3-32 chars)")
@click.option("--qr", "-q", is_flag=True, help="Show QR code")
@click.option("--qr-file", type=click.Path(), help="Save QR code to file")
def upload(
    files: tuple[str, ...],
    password: Optional[str],
    expires: Optional[str],
    burn: bool,
    slug: Optional[str],
    qr: bool,
    qr_file: Optional[str],
) -> None:
    """Upload files to DropItX.
    
    Upload one or more files. If no files specified, reads from stdin.
    
    Examples:
    
        dropitx upload file.txt
    
        dropitx upload file1.txt file2.txt
    
        cat file.txt | dropitx upload
    
        dropitx upload --password --expires 1h file.txt
    """
    # If password flag is set but no value provided, prompt for it
    if password == "":
        password = click.prompt("Password", hide_input=True, confirmation_prompt=True)
    
    # If no files specified, try reading from stdin
    if not files:
        if not sys.stdin.isatty():
            # Reading from stdin (pipe)
            try:
                result = upload_stdin(
                    password=password,
                    expires=expires,
                    burn=burn,
                    slug=slug,
                )
                print_upload_result(result, qr=qr, qr_file=qr_file)
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                sys.exit(1)
        else:
            console.print("[red]Error: No files specified and no input from stdin[/red]")
            console.print("Usage: dropitx upload <file> or echo hello | dropitx")
            sys.exit(1)
        return
    
    # Upload each file
    results: list[UploadResult] = []
    for file_path in files:
        try:
            console.print(f"[dim]Uploading {file_path}...[/dim]")
            result = upload_file(
                file_path=file_path,
                password=password,
                expires=expires,
                burn=burn,
                slug=slug if len(files) == 1 else None,  # Only use slug for single file
            )
            results.append(result)
        except FileNotFoundError:
            console.print(f"[red]Error: File not found: {file_path}[/red]")
            sys.exit(1)
        except Exception as e:
            console.print(f"[red]Error uploading {file_path}: {e}[/red]")
            sys.exit(1)
    
    # Print results
    if len(results) == 1:
        print_upload_result(results[0], qr=qr, qr_file=qr_file)
    else:
        # Multiple files - print summary table
        table = Table(title="Upload Results")
        table.add_column("File", style="cyan")
        table.add_column("URL", style="green")
        table.add_column("Slug")
        
        for result in results:
            table.add_row(result.filename, result.url, result.slug)
        
        console.print(table)
        
        # Print QR for first file if requested
        if qr and results:
            console.print("\n[bold]QR Code (first file):[/bold]")
            console.print(generate_qr_ascii(results[0].url))


@cli.command(name="config")
@click.argument("action", type=click.Choice(["set-key", "show", "set-url"]))
@click.argument("value", required=False)
def config_cmd(action: str, value: Optional[str]) -> None:
    """Manage DropItX CLI configuration.
    
    Actions:
    
        set-key <api_key>    Set your API key
        
        show                 Show current configuration
        
        set-url <url>        Set custom API URL
    """
    if action == "set-key":
        if not value:
            console.print("[red]Error: API key required[/red]")
            console.print("Usage: dropitx config set-key <your-api-key>")
            sys.exit(1)
        
        set_api_key(value)
        console.print("[green]API key saved successfully[/green]")
        console.print(f"[dim]Config file: ~/.dropitx/config.json[/dim]")
    
    elif action == "show":
        api_key = get_api_key()
        api_url = get_api_url()
        
        table = Table(title="DropItX Configuration")
        table.add_column("Setting", style="cyan")
        table.add_column("Value")
        
        table.add_row("API URL", api_url)
        if api_key:
            # Mask the key for display
            masked = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
            table.add_row("API Key", masked)
        else:
            table.add_row("API Key", "[dim]Not set[/dim]")
        
        console.print(table)
    
    elif action == "set-url":
        if not value:
            console.print("[red]Error: URL required[/red]")
            console.print("Usage: dropitx config set-url https://api.dropitx.com")
            sys.exit(1)
        
        from .config import load_config, save_config
        config = load_config()
        config["api_url"] = value.rstrip("/")
        save_config(config)
        console.print(f"[green]API URL set to: {value}[/green]")


@cli.command()
@click.argument("content")
@click.option("--filename", "-f", help="Filename for the content")
@click.option("--password", "-p", is_flag=False, flag_value="", help="Password protection")
@click.option("--expires", "-e", help="Expiration time")
@click.option("--burn", "-b", is_flag=True, help="Burn after reading")
@click.option("--slug", "-s", help="Custom slug")
@click.option("--qr", "-q", is_flag=True, help="Show QR code")
def text(
    content: str,
    filename: Optional[str],
    password: Optional[str],
    expires: Optional[str],
    burn: bool,
    slug: Optional[str],
    qr: bool,
) -> None:
    """Upload text content directly.
    
    Examples:
    
        dropitx text "Hello, world!"
    
        dropitx text --filename note.md "# Hello"
    """
    # If password flag is set but no value provided, prompt for it
    if password == "":
        password = click.prompt("Password", hide_input=True, confirmation_prompt=True)
    
    try:
        result = upload_text(
            content=content,
            filename=filename,
            password=password,
            expires=expires,
            burn=burn,
            slug=slug,
        )
        print_upload_result(result, qr=qr)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.argument("url")
@click.option("--output", "-o", type=click.Path(), help="Output file for QR code image")
def qr(url: str, output: Optional[str]) -> None:
    """Generate QR code for a DropItX URL.
    
    Examples:
    
        dropitx qr https://dropitx.com/s/abc123
    
        dropitx qr -o qr.png https://dropitx.com/s/abc123
    """
    if output:
        if generate_qr_image(url, output):
            console.print(f"[green]QR code saved to: {output}[/green]")
        else:
            console.print("[red]Error: qrcode[pil] not installed[/red]")
            console.print("Install with: pip install 'dropitx[qr]'")
            sys.exit(1)
    else:
        console.print(generate_qr_ascii(url))


@cli.command()
def mcp() -> None:
    """Start the MCP stdio server for AI agents (requires Python 3.10+).

    Exposes 5 tools: publish_page, update_page, get_page, list_pages, delete_page.

    Install the extra first: pip install 'dropitx[mcp]'

    Then configure in Claude Code:
        claude mcp add dropitx --env DROPITX_API_KEY=shk_... -- uvx --from 'dropitx[mcp]' dropitx mcp
    """
    try:
        from .mcp_server import run_server
    except ImportError:
        click.echo(
            "MCP server requires the 'dropitx[mcp]' extra (Python 3.10+).\n"
            "Install it with: pip install 'dropitx[mcp]'",
            err=True,
        )
        sys.exit(1)

    run_server()


@cli.group(name="skill")
def skill_group() -> None:
    """Manage the drop-plan Claude Code skill."""


@skill_group.command(name="install")
@click.option("--force", is_flag=True, help="Overwrite an existing installed copy")
def skill_install(force: bool) -> None:
    """Install the drop-plan Claude Code skill to ~/.claude/skills/drop-plan.

    Lets Claude Code share plan/report docs as dropitx links. Re-run with
    --force to pick up an upgraded copy after updating dropitx-cli.
    """
    if sys.version_info < (3, 9):
        console.print(
            "[red]Error: drop-plan requires Python 3.9+ (importlib.resources.files)[/red]"
        )
        sys.exit(1)

    import importlib.resources

    src = importlib.resources.files("dropitx") / "skills" / "drop-plan"
    if not src.is_dir():
        console.print("[red]Error: bundled skill content not found in this install[/red]")
        sys.exit(1)

    dest = Path.home() / ".claude" / "skills" / "drop-plan"

    if dest.exists():
        if not force:
            console.print(f"[yellow]Already installed at {dest}[/yellow]")
            console.print("Use --force to overwrite with the bundled copy.")
            return

        # Safety guard: never rmtree anything but the exact skill destination.
        # An `if`/`raise` (not `assert`) so this can't be stripped by -O/PYTHONOPTIMIZE.
        if dest.parts[-2:] != ("skills", "drop-plan"):
            raise RuntimeError(f"refusing to delete unexpected path: {dest}")
        if not click.confirm(f"Overwrite {dest}?"):
            console.print("[dim]Aborted, no changes made[/dim]")
            return
        shutil.rmtree(dest)

    dest.parent.mkdir(parents=True, exist_ok=True)
    with importlib.resources.as_file(src) as src_path:
        shutil.copytree(
            src_path,
            dest,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )

    console.print(f"[green]Installed drop-plan skill to: {dest}[/green]")
    console.print('[dim]Try: /drop-plan, or just say "share this plan"[/dim]')


def main() -> None:
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
