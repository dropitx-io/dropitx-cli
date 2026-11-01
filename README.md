# DropItX CLI

![CI](https://github.com/phuongddx/dropitx-cli/actions/workflows/ci.yml/badge.svg)

Developer-friendly file sharing from the command line, plus an MCP server that
lets AI agents publish pages to [dropitx.site](https://dropitx.site).

## Installation

Requires Node.js 20 or newer.

```bash
npm install -g dropitx
```

Or run it without installing:

```bash
npx dropitx upload file.txt
```

QR codes (terminal and PNG) are built in; there are no optional extras.

## Quick Start

### Set up your API key

```bash
dropitx config set-key shk_your_api_key_here
```

Get your API key from the [DropItX Dashboard](https://dropitx.site/dashboard).
Uploads also work without a key.

### Upload a file

```bash
dropitx upload file.txt
```

The share link is printed on its own line, so scripts can grab it:

```bash
dropitx upload file.txt | grep '^URL: ' | cut -d' ' -f2
```

### Upload from stdin (pipe)

```bash
echo "Hello, world!" | dropitx
cat file.txt | dropitx
```

### Upload with options

```bash
# Password protection (prompts, hidden, when no value follows the flag)
dropitx upload file.txt --password
dropitx upload --password s3cret file.txt

# Expiration time
dropitx upload --expires 1h file.txt

# Burn after reading
dropitx upload --burn file.txt

# Custom slug (single file only)
dropitx upload --slug my-file file.txt

# Show a QR code, or save one as PNG
dropitx upload --qr file.txt
dropitx upload --qr-file qr.png file.txt

# Combine options
dropitx upload file.txt --expires 7d --burn --qr --password
```

`-p/--password` takes an optional value: if the next argument is not an
option it is used as the password. Put the flag last (or give it a value) to
be prompted instead.

### Upload multiple files

```bash
dropitx upload file1.txt file2.txt file3.txt
dropitx upload *.txt
```

### Upload text directly

```bash
dropitx text "Hello, world!"
dropitx text --filename note.md "# My Note"
```

### Enable the Claude Code skill

```bash
dropitx skill install
```

Installs `drop-plan` to `~/.claude/skills/drop-plan/` — a Claude Code skill
that shares a plan, phase file, or brainstorm/report doc (markdown or HTML)
as a dropitx link. Once installed, say things like "share this plan with the
team" in Claude Code, or invoke it directly with `/drop-plan`. Re-run with
`--force` after upgrading `dropitx` to pick up the latest copy.

### Use it from an AI agent (MCP)

```bash
claude mcp add dropitx --env DROPITX_API_KEY=shk_... -- npx -y dropitx mcp
```

Any MCP client that launches stdio servers works:

```json
{
  "mcpServers": {
    "dropitx": {
      "command": "npx",
      "args": ["-y", "dropitx", "mcp"],
      "env": { "DROPITX_API_KEY": "shk_..." }
    }
  }
}
```

See [docs/mcp-server-guide.md](docs/mcp-server-guide.md) for the eight tools.

## Commands

### `dropitx upload`

```
Usage: dropitx upload [options] [files...]

Options:
  -p, --password [password]  Password protection (prompts if no value)
  -e, --expires <time>       Expiration time (e.g., 1h, 7d, 1w)
  -b, --burn                 Burn after reading
  -s, --slug <slug>          Custom slug (3-32 chars)
  -q, --qr                   Show QR code
  --qr-file <path>           Save QR code to file
```

With no files, `upload` reads piped stdin. Bare `dropitx` does the same and
accepts the same options before any command name.

### `dropitx text`

```
Usage: dropitx text [options] <content>

Options:
  -f, --filename <name>      Filename for the content
  -p, --password [password]  Password protection
  -e, --expires <time>       Expiration time
  -b, --burn                 Burn after reading
  -s, --slug <slug>          Custom slug
  -q, --qr                   Show QR code
```

### `dropitx config`

```
Usage: dropitx config <action> [value]

Actions:
  set-key <api_key>    Set your API key
  show                 Show current configuration
  set-url <url>        Set custom API URL
```

### `dropitx qr`

```
Usage: dropitx qr [options] <url>

Options:
  -o, --output <path>  Save the QR code image to a file instead of printing it
```

### `dropitx mcp`

Starts the MCP stdio server.

### `dropitx skill install`

```
Usage: dropitx skill install [options]

Options:
  --force  Overwrite an existing installed copy
```

## Expiration Formats

- `1h` — 1 hour
- `6h` — 6 hours
- `24h` or `1d` — 1 day
- `7d` or `1w` — 1 week
- `30d` or `1m` — 30 days

## Environment Variables

- `DROPITX_API_KEY` — API key (overrides config file)
- `DROPITX_API_URL` — API base URL (overrides config file; default `https://api.dropitx.site`)
- `DROPITX_FRONTEND_URL` — base URL used to build share links (default `https://dropitx.site`)
- `NO_COLOR` — disable colored output

For a local backend, run `dropitx config set-url http://localhost:8000` or set `DROPITX_API_URL`.

## Configuration File

Configuration is stored at `~/.dropitx/config.json` (files written by the
earlier Python CLI keep working):

```json
{
  "api_key": "shk_xxxxxxxxxxxxx",
  "api_url": "https://api.dropitx.site"
}
```

## Examples

```bash
# Share a log file with your team
dropitx upload --expires 7d app.log --password

# Share a quick note
echo "Meeting at 3pm" | dropitx --expires 1h

# Share a code snippet
dropitx text --filename script.py "$(cat script.py)"

# Share with burn after reading
dropitx upload --burn secret.txt
```

## API Key

Get your API key from the [DropItX Dashboard](https://dropitx.site/developers).

API keys start with `shk_` (personal) or `sht_` (team). The CLI does not validate the prefix; the server does.

## Development

```bash
git clone https://github.com/phuongddx/dropitx-cli.git
cd dropitx-cli
npm install
npm run typecheck
npm test
npm run build        # compiles src/ to dist/
node dist/cli.js --help
```

## License

MIT License - Copyright (c) 2026 DropItX
