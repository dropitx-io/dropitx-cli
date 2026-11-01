import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDocument,
  deleteDocument,
  getDocument,
  getRevision,
  listDocuments,
  listRevisions,
  MAX_CONTENT_LENGTH,
  restoreRevision,
  toDocumentResult,
  updateDocument,
  V1ClientError,
} from "../src/v1-client.js";
import { closedPortUrl, type RecordedRequest, SAMPLE_DOC, startStub, type Stub, type StubReply, useIsolatedHome } from "./helpers.js";

useIsolatedHome();


let stub: Stub | undefined;
let reply: (req: RecordedRequest) => StubReply = () => ({ status: 200, json: SAMPLE_DOC });

beforeEach(async () => {
  process.env.DROPITX_API_KEY = "shk_test123";
  process.env.DROPITX_FRONTEND_URL = "https://dropitx.test";
  stub = await startStub((req) => reply(req));
  process.env.DROPITX_API_URL = stub.url;
});
afterEach(async () => {
  await stub?.close();
  reply = () => ({ status: 200, json: SAMPLE_DOC });
});

const last = () => stub!.requests[stub!.requests.length - 1];
const lastJson = () => JSON.parse(last().body.toString("utf8"));

async function v1Error(p: Promise<unknown>): Promise<V1ClientError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(V1ClientError);
  return err as V1ClientError;
}

describe("toDocumentResult", () => {
  it("maps all fields and builds the share url from the frontend url", () => {
    expect(toDocumentResult(SAMPLE_DOC)).toEqual({
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
      url: "https://dropitx.test/s/abc123",
    });
  });

  it("has an empty url and null optionals when the response is empty", () => {
    const r = toDocumentResult({});
    expect(r.url).toBe("");
    expect(r.filename).toBeNull();
    expect(r.title).toBeNull();
    expect(r.content).toBe("");
    expect(r.view_count).toBe(0);
  });
});

describe("auth", () => {
  it("sends the API key as a Bearer token", async () => {
    await getDocument("abc123");
    expect(last().headers.authorization).toBe("Bearer shk_test123");
  });

  it("fails with a set-key hint before any HTTP call when no key is configured", async () => {
    delete process.env.DROPITX_API_KEY;
    const err = await v1Error(createDocument("hello"));
    expect(err.status).toBe(401);
    expect(err.message).toContain("dropitx config set-key");
    expect(stub!.requests).toHaveLength(0);
  });
});

describe("error mapping", () => {
  it("maps 401 to an invalid-key hint", async () => {
    reply = () => ({ status: 401, json: { detail: "Invalid API key prefix" } });
    const err = await v1Error(getDocument("x"));
    expect(err.status).toBe(401);
    expect(err.message).toBe(
      "Invalid or missing API key (Invalid API key prefix). Run `dropitx config set-key <key>` or set DROPITX_API_KEY.",
    );
  });

  it("maps 404 to Not found", async () => {
    reply = () => ({ status: 404, json: { detail: "Document not found" } });
    const err = await v1Error(getDocument("missing"));
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found: Document not found");
  });

  it("maps 410 to expired", async () => {
    reply = () => ({ status: 410, json: { detail: "Document has expired" } });
    expect((await v1Error(getDocument("old"))).message).toBe("Document has expired: Document has expired");
  });

  it("maps other statuses to API error with the raw body when not JSON", async () => {
    reply = () => ({ status: 502, text: "Bad Gateway" });
    const err = await v1Error(getDocument("x"));
    expect(err.status).toBe(502);
    expect(err.message).toBe("API error (502): Bad Gateway");
  });

  it("maps a refused connection to a network error with status 0", async () => {
    process.env.DROPITX_API_URL = await closedPortUrl();
    const err = await v1Error(listDocuments());
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/^Network error: .*ECONNREFUSED/);
  });
});

describe("guards", () => {
  it("rejects an update with no fields without calling the API", async () => {
    const err = await v1Error(updateDocument("abc", {}));
    expect(err.status).toBe(400);
    expect(stub!.requests).toHaveLength(0);
  });

  it("rejects content over the limit without calling the API", async () => {
    const huge = "x".repeat(MAX_CONTENT_LENGTH + 1);
    expect((await v1Error(createDocument(huge))).message).toContain("limit");
    expect((await v1Error(updateDocument("a", { content: huge }))).message).toContain("limit");
    expect(stub!.requests).toHaveLength(0);
  });

  it("accepts content exactly at the limit", async () => {
    await createDocument("x".repeat(MAX_CONTENT_LENGTH));
    expect(stub!.requests).toHaveLength(1);
  });
});

describe("documents", () => {
  it("creates with POST /api/v1/documents and only the given optional fields", async () => {
    const r = await createDocument("<h1>Hi</h1>", { filename: "page.html", title: "My Page", expiresIn: 0 });
    expect(last().method).toBe("POST");
    expect(last().path).toBe("/api/v1/documents");
    expect(lastJson()).toEqual({ content: "<h1>Hi</h1>", is_private: false, filename: "page.html", title: "My Page", expires_in: 0 });
    expect(r.url).toBe("https://dropitx.test/s/abc123");
  });

  it("creates with just content and is_private by default", async () => {
    await createDocument("c", { isPrivate: true });
    expect(lastJson()).toEqual({ content: "c", is_private: true });
  });

  it("lists with page and limit query params", async () => {
    reply = () => ({ status: 200, json: [SAMPLE_DOC, { ...SAMPLE_DOC, slug: "def456" }] });
    const results = await listDocuments(1, 10);
    expect(results.map((r) => r.slug)).toEqual(["abc123", "def456"]);
    expect(last().method).toBe("GET");
    expect(last().path).toBe("/api/v1/documents");
    expect(Object.fromEntries(new URLSearchParams(last().search))).toEqual({ page: "1", limit: "10" });
  });

  it("updates with PATCH and only the provided fields", async () => {
    reply = () => ({ status: 200, json: { ...SAMPLE_DOC, content: "<h1>Updated</h1>" } });
    const r = await updateDocument("abc123", { content: "<h1>Updated</h1>", isPrivate: false });
    expect(last().method).toBe("PATCH");
    expect(last().path).toBe("/api/v1/documents/abc123");
    expect(lastJson()).toEqual({ content: "<h1>Updated</h1>", is_private: false });
    expect(r.content).toBe("<h1>Updated</h1>");
  });

  it("deletes with DELETE and tolerates an empty 204 body", async () => {
    reply = () => ({ status: 204 });
    await expect(deleteDocument("abc123")).resolves.toBeUndefined();
    expect(last().method).toBe("DELETE");
    expect(last().path).toBe("/api/v1/documents/abc123");
  });

  it("encodes slugs into the path", async () => {
    await getDocument("a/b");
    expect(last().path).toBe("/api/v1/documents/a%2Fb");
  });
});

describe("revisions", () => {
  it("lists revisions with page and limit", async () => {
    reply = () => ({ status: 200, json: { revisions: [], total: 0 } });
    expect(await listRevisions("abc123", 1, 5)).toEqual({ revisions: [], total: 0 });
    expect(last().path).toBe("/api/v1/documents/abc123/revisions");
    expect(Object.fromEntries(new URLSearchParams(last().search))).toEqual({ page: "1", limit: "5" });
  });

  it("gets a revision by number", async () => {
    reply = () => ({ status: 200, json: { id: "rev-1", revision: 2, content: "old" } });
    expect((await getRevision("abc123", 2)).revision).toBe(2);
    expect(last().path).toBe("/api/v1/documents/abc123/revisions/2");
  });

  it("restores a revision with POST .../restore", async () => {
    reply = () => ({ status: 200, json: { revision: 3, detail: "Restored" } });
    expect((await restoreRevision("abc123", 2)).detail).toBe("Restored");
    expect(last().method).toBe("POST");
    expect(last().path).toBe("/api/v1/documents/abc123/revisions/2/restore");
  });
});
