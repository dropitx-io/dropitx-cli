import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const ENV_KEYS = ["HOME", "DROPITX_API_KEY", "DROPITX_API_URL", "DROPITX_FRONTEND_URL"] as const;

/** Points HOME at a fresh temp dir and clears DROPITX_* env vars for every test. */
export function useIsolatedHome(): { home: () => string } {
  let home = "";
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    home = realpathSync(mkdtempSync(join(tmpdir(), "dropitx-home-")));
    process.env.HOME = home;
    delete process.env.DROPITX_API_KEY;
    delete process.env.DROPITX_API_URL;
    delete process.env.DROPITX_FRONTEND_URL;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(home, { recursive: true, force: true });
  });
  return { home: () => home };
}

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface StubReply {
  status: number;
  json?: unknown;
  text?: string;
}

export interface Stub {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

/** A real local HTTP server standing in for the DropItX API. */
export async function startStub(reply: (req: RecordedRequest) => StubReply): Promise<Stub> {
  const { createServer } = await import("node:http");
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://stub");
      const rec: RecordedRequest = {
        method: req.method ?? "",
        path: u.pathname,
        search: u.search,
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(rec);
      const r = reply(rec);
      if (r.json !== undefined) {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json));
      } else {
        res.writeHead(r.status, { "content-type": "text/plain" });
        res.end(r.text ?? "");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Parses a recorded multipart or urlencoded body the way a server would. */
export async function parseForm(req: RecordedRequest): Promise<FormData> {
  const headers = new Headers();
  headers.set("content-type", String(req.headers["content-type"]));
  return new Response(new Uint8Array(req.body), { headers }).formData();
}

/** A complete DocumentResponse as the v1 API returns it. */
export const SAMPLE_DOC = {
  id: "doc-1",
  slug: "abc123",
  filename: "page.html",
  title: "My Page",
  content: "<h1>Hello</h1>",
  is_private: false,
  view_count: 42,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  expires_at: null,
};

export interface FakeIO {
  stdin: NodeJS.ReadableStream;
  stdinIsTTY: boolean;
  out: (s: string) => void;
  err: (s: string) => void;
  color: boolean;
  askHidden: (q: string) => Promise<string>;
  stdout: () => string;
  stderr: () => string;
  hiddenQuestions: string[];
}

/** In-memory terminal: `stdin` undefined means an interactive TTY with nothing piped. */
export async function fakeIO(opts: { stdin?: string; hidden?: string[] } = {}): Promise<FakeIO> {
  const { Readable } = await import("node:stream");
  let out = "";
  let err = "";
  const hidden = [...(opts.hidden ?? [])];
  const hiddenQuestions: string[] = [];
  return {
    stdin: Readable.from(opts.stdin === undefined ? [] : [opts.stdin]),
    stdinIsTTY: opts.stdin === undefined,
    out: (s) => (out += s),
    err: (s) => (err += s),
    color: false,
    askHidden: async (q) => {
      hiddenQuestions.push(q);
      const a = hidden.shift();
      if (a === undefined) throw new Error("unexpected prompt: " + q);
      return a;
    },
    stdout: () => out,
    stderr: () => err,
    hiddenQuestions,
  };
}

/** URL of a local port with nothing listening (connection refused). */
export async function closedPortUrl(): Promise<string> {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
