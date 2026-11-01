/**
 * Client for the /api/v1/documents endpoints (Bearer API-key auth).
 * Every call uses a 60-second timeout to ride out server cold starts.
 */
import { getApiKey, getApiUrl, getFrontendUrl } from "./config.js";
import { errorDetail, NetworkError, request } from "./http.js";

/** Matches the server-side DocumentCreate.max_length. */
export const MAX_CONTENT_LENGTH = 5_000_000;

const TIMEOUT_MS = 60_000;

export class V1ClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "V1ClientError";
  }
}

export interface DocumentResult {
  id: string;
  slug: string;
  filename: string | null;
  title: string | null;
  content: string;
  is_private: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  /** Not part of the API response; built from the frontend URL and slug. */
  url: string;
}

export type JsonObject = Record<string, unknown>;

export function toDocumentResult(data: JsonObject): DocumentResult {
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const optStr = (v: unknown) => (typeof v === "string" ? v : null);
  const slug = str(data.slug);
  return {
    id: str(data.id),
    slug,
    filename: optStr(data.filename),
    title: optStr(data.title),
    content: str(data.content),
    is_private: data.is_private === true,
    view_count: typeof data.view_count === "number" ? data.view_count : 0,
    created_at: str(data.created_at),
    updated_at: str(data.updated_at),
    expires_at: optStr(data.expires_at),
    url: slug ? `${getFrontendUrl()}/s/${slug}` : "",
  };
}

function authHeader(): Record<string, string> {
  const key = getApiKey();
  if (!key) {
    throw new V1ClientError(
      401,
      "No API key configured. Set one with `dropitx config set-key <key>` " +
        "or the DROPITX_API_KEY environment variable.",
    );
  }
  return { Authorization: `Bearer ${key}` };
}

async function errorFor(resp: Response): Promise<V1ClientError> {
  const status = resp.status;
  const detail = await errorDetail(resp);
  if (status === 401) {
    return new V1ClientError(
      status,
      `Invalid or missing API key (${detail}). Run \`dropitx config set-key <key>\` or set DROPITX_API_KEY.`,
    );
  }
  if (status === 404) return new V1ClientError(status, `Not found: ${detail}`);
  if (status === 410) return new V1ClientError(status, `Document has expired: ${detail}`);
  return new V1ClientError(status, `API error (${status}): ${detail}`);
}

async function call(
  method: string,
  path: string,
  opts: { json?: JsonObject; query?: Record<string, number> } = {},
): Promise<unknown> {
  const headers = authHeader();
  let url = `${getApiUrl()}/api/v1${path}`;
  if (opts.query) {
    url += `?${new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)]))}`;
  }
  const init: RequestInit = { method, headers };
  if (opts.json) {
    init.body = JSON.stringify(opts.json);
    headers["Content-Type"] = "application/json";
  }

  let resp: Response;
  try {
    resp = await request(url, init, TIMEOUT_MS);
  } catch (err) {
    if (err instanceof NetworkError) throw new V1ClientError(0, err.message);
    throw err;
  }
  if (resp.status >= 400) throw await errorFor(resp);

  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

const docPath = (slug: string) => `/documents/${encodeURIComponent(slug)}`;

function checkLength(content: string): void {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new V1ClientError(400, `Content exceeds ${MAX_CONTENT_LENGTH.toLocaleString("en-US")} character limit.`);
  }
}

export interface CreateOptions {
  filename?: string | null;
  title?: string | null;
  isPrivate?: boolean;
  /** Seconds from now. */
  expiresIn?: number | null;
}

/** POST /api/v1/documents. */
export async function createDocument(content: string, opts: CreateOptions = {}): Promise<DocumentResult> {
  checkLength(content);
  const payload: JsonObject = { content, is_private: opts.isPrivate ?? false };
  if (opts.filename) payload.filename = opts.filename;
  if (opts.title) payload.title = opts.title;
  if (opts.expiresIn !== undefined && opts.expiresIn !== null) payload.expires_in = opts.expiresIn;
  return toDocumentResult((await call("POST", "/documents", { json: payload })) as JsonObject);
}

/** GET /api/v1/documents/{slug}. */
export async function getDocument(slug: string): Promise<DocumentResult> {
  return toDocumentResult((await call("GET", docPath(slug))) as JsonObject);
}

/** GET /api/v1/documents?page=&limit=. */
export async function listDocuments(page = 1, limit = 20): Promise<DocumentResult[]> {
  const items = (await call("GET", "/documents", { query: { page, limit } })) as JsonObject[];
  return items.map(toDocumentResult);
}

export interface UpdateOptions {
  content?: string | null;
  filename?: string | null;
  title?: string | null;
  isPrivate?: boolean | null;
}

/** PATCH /api/v1/documents/{slug}; the server saves a revision when content changes. */
export async function updateDocument(slug: string, opts: UpdateOptions): Promise<DocumentResult> {
  if (opts.content !== undefined && opts.content !== null) checkLength(opts.content);
  const payload: JsonObject = {};
  if (opts.content !== undefined && opts.content !== null) payload.content = opts.content;
  if (opts.filename !== undefined && opts.filename !== null) payload.filename = opts.filename;
  if (opts.title !== undefined && opts.title !== null) payload.title = opts.title;
  if (opts.isPrivate !== undefined && opts.isPrivate !== null) payload.is_private = opts.isPrivate;
  if (Object.keys(payload).length === 0) throw new V1ClientError(400, "No fields to update.");
  return toDocumentResult((await call("PATCH", docPath(slug), { json: payload })) as JsonObject);
}

/** DELETE /api/v1/documents/{slug}. */
export async function deleteDocument(slug: string): Promise<void> {
  await call("DELETE", docPath(slug));
}

/** GET .../revisions — returns `{ revisions: [...], total }`. */
export async function listRevisions(slug: string, page = 1, limit = 20): Promise<JsonObject> {
  return (await call("GET", `${docPath(slug)}/revisions`, { query: { page, limit } })) as JsonObject;
}

/** GET .../revisions/{revision}. */
export async function getRevision(slug: string, revision: number): Promise<JsonObject> {
  return (await call("GET", `${docPath(slug)}/revisions/${revision}`)) as JsonObject;
}

/** POST .../revisions/{revision}/restore — the live content is saved as a new revision first. */
export async function restoreRevision(slug: string, revision: number): Promise<JsonObject> {
  return (await call("POST", `${docPath(slug)}/revisions/${revision}/restore`)) as JsonObject;
}
