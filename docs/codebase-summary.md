# DropItX CLI - Codebase Summary

## Package Structure

```
dropitx-cli/
├── src/
│   ├── cli.ts            bin entry (shebang): wires real stdin/stdout/TTY into run()
│   ├── program.ts        commander program: every command and option, exit codes
│   ├── config.ts         ~/.dropitx/config.json + DROPITX_* env resolution
│   ├── http.ts           fetch with timeout, "Network error: ..." mapping, FastAPI detail extraction
│   ├── uploader.ts       /api/cli/upload (multipart) and /api/cli/upload/text (urlencoded)
│   ├── v1-client.ts      /api/v1/documents* CRUD + revisions, Bearer auth, error mapping
│   ├── mcp-server.ts     8 MCP tools over stdio (@modelcontextprotocol/sdk)
│   ├── output.ts         upload result block, column tables, key masking, ANSI colors
│   ├── prompt.ts         hidden password prompt (/dev/tty), confirmation loop, y/N line prompt
│   ├── qr.ts             terminal QR and PNG QR (qrcode)
│   ├── skill-install.ts  copies the bundled skill to ~/.claude/skills/drop-plan
│   └── version.ts        reads the version from package.json
├── skills/drop-plan/     bundled Claude Code skill (SKILL.md, scripts/find_latest_plan.mjs)
├── tests/                vitest suites (*.test.ts) + helpers.ts
├── .github/workflows/    ci.yml (Node 20/22), publish.yml (npm on v* tags)
├── package.json          name dropitx, bin dropitx -> dist/cli.js, engines node >= 20
├── tsconfig.json         typecheck config (src + tests)
└── tsconfig.build.json   build config (src -> dist)
```

**Runtime dependencies:** `commander` (CLI), `@modelcontextprotocol/sdk` + `zod`
(MCP server and tool schemas), `qrcode` (QR). HTTP uses Node's built-in
`fetch`, `FormData` and `fs.openAsBlob`.

## How the Pieces Connect

```
dropitx (dist/cli.js) -> program.run(argv, io)
  ├── upload / text / bare-with-pipe -> uploader -> http -> POST /api/cli/upload[/text]
  ├── config                         -> config (read/write ~/.dropitx/config.json)
  ├── qr                             -> qr
  ├── skill install                  -> skill-install (copies skills/drop-plan)
  └── mcp                            -> mcp-server -> v1-client -> http -> /api/v1/documents*
```

`program.ts` never touches `process` directly: `cli.ts` passes a `CliIO`
(stdin, TTY flag, stdout/stderr writers, color flag, hidden prompt). Tests pass
an in-memory `CliIO` and assert on exit codes and output.

## Key Patterns

- **Optional password value.** `-p, --password [password]`: a bare flag
  yields `true`, which triggers a hidden prompt asked twice until both entries
  match. A following non-option argument is taken as the password.
- **Bare invocation.** The root command has the upload options and an action:
  piped stdin is uploaded as `stdin.txt`, an interactive terminal prints help.
  `enablePositionalOptions()` keeps root options before the command name.
- **Single-file slug.** `upload` drops `--slug` when more than one file is given.
- **Field mapping.** The upload response uses camelCase `deleteToken`; other
  fields are snake_case. `toUploadResult()` maps them to one camelCase object.
  `toDocumentResult()` keeps the v1 snake_case fields and adds `url`
  (`{frontend_url}/s/{slug}`).
- **Config read at call time.** `configPath()` uses `os.homedir()` on every
  call, so `HOME` overrides (tests, isolated runs) take effect.
- **MCP errors.** Each tool body runs inside `run()`, which converts any thrown
  error into `{ isError: true, content: [{ text: "Error executing tool <name>: <message>" }] }`.

## Tests

`npm test` runs vitest over `tests/*.test.ts`; all suites are network-free.
`helpers.ts` provides an isolated temp `HOME` per test, a real local HTTP stub
(`startStub`) that records requests, a multipart/urlencoded body parser, a
closed-port URL for network-failure cases, and an in-memory `CliIO`.

| Suite | Covers |
|-------|--------|
| config | env > file > default precedence, trailing-slash stripping, Python-written config files, corrupt files |
| uploader | multipart and urlencoded field names, `X-API-Key`, option omission, HTTP/network errors, stdin |
| v1-client | Bearer auth, missing-key guard, 401/404/410/other mapping, content-length and empty-update guards, paths and query params |
| mcp-server | 8 tool names, Python-equivalent input schemas, result shapes, list truncation, isError for every tool, no stdout writes |
| cli | help/version, bare pipe upload, password prompt, multi-file table, missing paths, config actions, qr |
| skill-install | fresh install, no-overwrite, `--force` confirm/abort |
| find-latest-plan | plan.md vs phase files, html vs md twins, docs/plans, script exit codes |
| prompt, qr | confirmation loop, line prompt, QR output |
