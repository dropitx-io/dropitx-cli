import { existsSync, openAsBlob, statSync } from "node:fs";
import { basename } from "node:path";
import { getApiKey, getApiUrl } from "./config.js";
import { errorDetail, request } from "./http.js";

export interface UploadOptions {
  password?: string;
  expires?: string;
  burn?: boolean;
  slug?: string;
}

export interface UploadResult {
  slug: string;
  url: string;
  filename: string;
  deleteToken: string;
  size: number;
  expiresAt: string;
  burnAfterReading: boolean;
  passwordProtected: boolean;
}

const FILE_TIMEOUT_MS = 300_000; // large files
const TEXT_TIMEOUT_MS = 60_000;

/** The server returns `deleteToken` in camelCase; every other field is snake_case. */
export function toUploadResult(data: Record<string, unknown>): UploadResult {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    slug: str(data.slug),
    url: str(data.url),
    filename: str(data.filename),
    deleteToken: str(data.deleteToken),
    size: typeof data.size === "number" ? data.size : 0,
    expiresAt: str(data.expires_at),
    burnAfterReading: data.burn_after_reading === true,
    passwordProtected: data.password_protected === true,
  };
}

export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { "X-API-Key": key } : {};
}

function optionFields(opts: UploadOptions): [string, string][] {
  const fields: [string, string][] = [];
  if (opts.password) fields.push(["password", opts.password]);
  if (opts.expires) fields.push(["expires", opts.expires]);
  if (opts.burn) fields.push(["burn", "true"]);
  if (opts.slug) fields.push(["slug", opts.slug]);
  return fields;
}

async function post(path: string, body: FormData | URLSearchParams, timeoutMs: number): Promise<UploadResult> {
  const url = `${getApiUrl()}${path}`;
  const resp = await request(url, { method: "POST", headers: authHeaders(), body }, timeoutMs);
  if (!resp.ok) {
    throw new UploadError(
      resp.status,
      `HTTP ${resp.status} ${resp.statusText} for ${url}: ${await errorDetail(resp)}`,
    );
  }
  return toUploadResult((await resp.json()) as Record<string, unknown>);
}

/** Multipart POST /api/cli/upload. */
export async function uploadFile(filePath: string, opts: UploadOptions = {}): Promise<UploadResult> {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
  const form = new FormData();
  for (const [k, v] of optionFields(opts)) form.append(k, v);
  form.append("file", await openAsBlob(filePath), basename(filePath));
  return post("/api/cli/upload", form, FILE_TIMEOUT_MS);
}

/** Form-urlencoded POST /api/cli/upload/text. */
export async function uploadText(
  content: string,
  opts: UploadOptions & { filename?: string } = {},
): Promise<UploadResult> {
  const form = new URLSearchParams({ content });
  if (opts.filename) form.append("filename", opts.filename);
  for (const [k, v] of optionFields(opts)) form.append(k, v);
  return post("/api/cli/upload/text", form, TEXT_TIMEOUT_MS);
}

/** Reads the whole stream and uploads it as text named stdin.txt. */
export async function uploadStdin(
  input: NodeJS.ReadableStream,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const content = Buffer.concat(chunks).toString("utf8");
  if (!content) throw new Error("No content from stdin");
  return uploadText(content, { ...opts, filename: "stdin.txt" });
}
