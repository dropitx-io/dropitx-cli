# DropItX CLI - Deployment Guide

## Overview

`dropitx` is published to npm as a single ESM package with a `dropitx` bin.
Users install it with `npm install -g dropitx` or run it with `npx dropitx`.
Version 2.0.0 replaced the earlier Python package.

- **CI:** `.github/workflows/ci.yml` — on push to `main` and on pull requests,
  Node 20 and 22 on `ubuntu-24.04`: `npm ci`, `npm run typecheck`, `npm test`,
  `npm run build`, `npm pack --dry-run`, then `--version`/`--help` smoke runs.
- **Release:** `.github/workflows/publish.yml` — on a `v*` tag: install,
  typecheck, test, check the tag equals `v` + `package.json` version, then
  `npm publish --provenance --access public` (the `prepack` script builds).
  It authenticates with the `NPM_TOKEN` repository secret and needs
  `id-token: write` for provenance. Until an operator adds `NPM_TOKEN`, the
  publish step fails and nothing is released.

## Repository

- **Public repo:** https://github.com/dropitx-io/dropitx-cli
- **License:** MIT (Copyright 2026 DropItX)

## Local Development

```bash
npm install          # dev dependencies: typescript, vitest, @types/*
npm run typecheck    # tsc --noEmit over src/ and tests/
npm test             # vitest; network-free (local HTTP stubs only)
npm run build        # tsc -p tsconfig.build.json: src/*.ts -> dist/*.js
node dist/cli.js --help
```

Point the CLI at a local backend with `DROPITX_API_URL=http://localhost:8000`
or `dropitx config set-url http://localhost:8000`. Use a throwaway `HOME` to
keep your real `~/.dropitx/config.json` untouched:

```bash
HOME="$(mktemp -d)" node dist/cli.js config show
```

## What Ships

The `files` whitelist in `package.json` publishes only:

- `dist/**/*.js` — the compiled CLI and MCP server
- `skills/` — the bundled `drop-plan` Claude Code skill (`SKILL.md`,
  `scripts/find_latest_plan.mjs`)
- `package.json`, `README.md`, `LICENSE` (always included by npm)

`package.json` is read at runtime for `--version`, and `skills/` is resolved
relative to the compiled files for `dropitx skill install`.

Check the tarball before releasing:

```bash
npm pack --dry-run
```

## Testing the Packed Tarball

```bash
tmp="$(mktemp -d)"
npm pack --pack-destination "$tmp"
npm install -g --prefix "$tmp/prefix" "$tmp"/dropitx-*.tgz
export HOME="$tmp/home"
"$tmp/prefix/bin/dropitx" --version
"$tmp/prefix/bin/dropitx" config show
"$tmp/prefix/bin/dropitx" skill install
```

To exercise the MCP server, start `"$tmp/prefix/bin/dropitx" mcp` and send
newline-delimited JSON-RPC `initialize`, `notifications/initialized`,
`tools/list` and `tools/call` messages on stdin. Use an unreachable
`DROPITX_API_URL` (or a local stub) — never production.

## Releasing

1. Bump the version: `npm version <patch|minor|major> --no-git-tag-version`
   (updates `package.json` and `package-lock.json`; the CLI reads its version
   from `package.json`, so there is no second place to edit).
2. Commit: `git commit -am "chore: release vX.Y.Z"`.
3. Tag and push: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
4. The publish workflow builds and publishes with provenance.
5. Verify: `npm view dropitx version` and `npx -y dropitx@X.Y.Z --version`.

## Rollback

npm versions are immutable. Within 72 hours an owner can `npm unpublish
dropitx@X.Y.Z`; otherwise run `npm deprecate dropitx@X.Y.Z "<reason>"` and
publish a fixed patch release. Move the `latest` dist-tag back if needed:
`npm dist-tag add dropitx@<good-version> latest`.

## Environment Variables (Runtime)

```bash
export DROPITX_API_KEY=shk_xxxxxxxxxxxxx   # or sht_ for team keys
export DROPITX_API_URL=https://api.dropitx.site
export DROPITX_FRONTEND_URL=https://dropitx.site
```

## Security

- Never commit npm tokens; `NPM_TOKEN` lives in GitHub repository secrets.
- Provenance (`--provenance`) links each published version to the workflow
  run that built it.
- Prefer an npm granular access token scoped to the `dropitx` package with
  publish rights only.

## Provenance

`npm publish --provenance` only succeeds when `repository.url` in
`package.json` points at the GitHub repository the workflow runs in
(`dropitx-io/dropitx-cli`). Update that field if the repository moves.
