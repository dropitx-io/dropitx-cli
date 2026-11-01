# DropItX CLI - Code Standards

## Language and Build

- TypeScript, `strict`, ESM (`"type": "module"`, `module: NodeNext`). Relative
  imports carry the `.js` extension.
- Target Node.js 20: use only APIs available there (global `fetch`,
  `FormData`, `AbortSignal.timeout`, `fs.openAsBlob`). No `fs.glob`.
- `tsconfig.json` typechecks `src/` and `tests/`; `tsconfig.build.json`
  compiles `src/` to `dist/`. Do not commit `dist/`.
- The bundled skill script (`skills/drop-plan/scripts/find_latest_plan.mjs`)
  is plain JavaScript using only the Node standard library, so it runs from the
  installed package without a build step.

## Dependencies

Keep runtime dependencies small and maintained: `commander`,
`@modelcontextprotocol/sdk` (pinned to `^1`), `zod`, `qrcode`. Anything that
must run on Node 20 must not pull a dependency whose `engines` excludes it
(for example commander 15 and vitest 5 require Node >= 22.12).

## Structure

- `program.ts` owns the command tree and receives a `CliIO`; it must not read
  `process.stdin`/`process.stdout` directly. Only `cli.ts` touches `process`.
- Actions signal failure by printing to stderr and throwing the internal
  `Exit` error; `run()` turns it into an exit code. Never call
  `process.exit()` from library code.
- HTTP goes through `http.ts` `request()` so timeouts and network-error text
  stay consistent.
- `mcp-server.ts` must not write to stdout outside the transport. Tool bodies
  go through `run()`/`json()` so failures become `isError` results.

## Output

- Every upload result prints `URL: <url>` on its own line; keep it greppable.
- Errors start with `Error: ` and go to stderr. Usage hints follow on stderr.
- Use the `Paint` helpers from `output.ts`; they are no-ops when color is off.

## Naming

- Files: kebab-case (`v1-client.ts`). The skill script keeps its historical
  name `find_latest_plan.mjs` because `SKILL.md` and users reference it.
- Wire formats keep the server's names: v1 document fields stay snake_case;
  CLI-side objects (`UploadResult`) use camelCase.
- MCP tool and parameter names are a public contract: do not rename them.

## Testing

- vitest, files in `tests/*.test.ts`. Write the failing test first.
- Network-free: use `startStub()` (a real local HTTP server) instead of mocking
  `fetch`, and `closedPortUrl()` for connection failures. Never let a test
  resolve to the production URL.
- `useIsolatedHome()` gives each test its own `HOME` and clears `DROPITX_*`.
- Drive the CLI through `run(argv, fakeIO(...))`; drive MCP through
  `InMemoryTransport.createLinkedPair()` and a real SDK `Client`.
- Assert on observable behavior: request method, path, headers and parsed form
  fields; printed lines; exit codes; files written.

## Commits

Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`,
`test:`), no AI references. CI must pass: `npm run typecheck`, `npm test`,
`npm run build`, `npm pack --dry-run`.
