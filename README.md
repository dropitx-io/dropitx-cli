# DropItX CLI

![CI](https://github.com/phuongddx/dropitx-cli/actions/workflows/ci.yml/badge.svg)

Developer-friendly file sharing from the command line.

## Installation

```bash
pip install dropitx
```

For QR code image support:

```bash
pip install 'dropitx[qr]'
```


## Quick Start

### Enable the Claude Code skill

```bash
dropitx skill install
```

Installs `drop-plan` to `~/.claude/skills/drop-plan/` — a Claude Code skill
that shares a plan, phase file, or brainstorm/report doc (markdown or HTML)
as a dropitx link. Once installed, say things like "share this plan with the
team" in Claude Code, or invoke it directly with `/drop-plan`. Re-run with
`--force` after upgrading `dropitx-cli` to pick up the latest copy.

### Set up your API key

```bash
dropitx config set-key shk_your_api_key_here
```

Get your API key from [DropItX Dashboard](https://dropitx.site/dashboard).

### Upload a file

```bash
dropitx upload file.txt
```

### Upload from stdin (pipe)

```bash
echo "Hello, world!" | dropitx
cat file.txt | dropitx
```

### Upload with options

```bash
# Password protection
dropitx upload --password file.txt

# Expiration time
dropitx upload --expires 1h file.txt

# Burn after reading
dropitx upload --burn file.txt

# Custom slug
dropitx upload --slug my-file file.txt

# Show QR code
dropitx upload --qr file.txt

# Combine options
dropitx upload --password --expires 7d --burn --qr file.txt
```

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

## Commands

### `dropitx upload`

Upload files to DropItX.

```
Usage: dropitx upload [OPTIONS] [FILES]...

Options:
  -p, --password      Password protection (prompts if no value)
  -e, --expires TEXT  Expiration time (e.g., 1h, 7d, 1w)
  -b, --burn          Burn after reading
  -s, --slug TEXT     Custom slug (3-32 chars)
  -q, --qr            Show QR code
  --qr-file PATH      Save QR code to file
  --help              Show this message and exit
```

### `dropitx text`

Upload text content directly.

```
Usage: dropitx text [OPTIONS] CONTENT

Options:
  -f, --filename TEXT  Filename for the content
  -p, --password       Password protection
  -e, --expires TEXT   Expiration time
  -b, --burn           Burn after reading
  -s, --slug TEXT      Custom slug
  -q, --qr             Show QR code
  --help               Show this message and exit
```

### `dropitx config`

Manage CLI configuration.

```
Usage: dropitx config [OPTIONS] ACTION [VALUE]

Actions:
  set-key <api_key>    Set your API key
  show                 Show current configuration
  set-url <url>        Set custom API URL
```

### `dropitx qr`

Generate QR code for a URL.

```
Usage: dropitx qr [OPTIONS] URL

Options:
  -o, --output PATH  Output file for QR code image
  --help             Show this message and exit
```

### `dropitx skill install`

Install the `drop-plan` Claude Code skill.

```
Usage: dropitx skill install [OPTIONS]

Options:
  --force  Overwrite an existing installed copy
  --help   Show this message and exit
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

For a local backend, run `dropitx config set-url http://localhost:8000` or set `DROPITX_API_URL`.

## Configuration File

Configuration is stored at `~/.dropitx/config.json`:

```json
{
  "api_key": "shk_xxxxxxxxxxxxx",
  "api_url": "https://api.dropitx.site"
}
```

## Examples

### Share a log file with your team

```bash
dropitx upload --expires 7d --password app.log
```

### Share a quick note

```bash
echo "Meeting at 3pm" | dropitx --expires 1h
```

### Share code snippet

```bash
cat script.py | dropitx text --filename script.py
```

### Share with burn after reading

```bash
dropitx upload --burn secret.txt
```

## API Key

Get your API key from the [DropItX Dashboard](https://dropitx.site/developers).

API keys start with `shk_` (personal) or `sht_` (team). The CLI does not validate the prefix; the server does.

## Development

```bash
# Clone the repository
git clone https://github.com/phuongddx/dropitx-cli.git
cd dropitx-cli

# Install in development mode
pip install -e .

# Run tests
pytest
```

## License

MIT License - Copyright (c) 2026 DropItX
