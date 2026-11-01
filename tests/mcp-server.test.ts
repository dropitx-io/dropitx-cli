import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/mcp-server.js";
import { closedPortUrl, type RecordedRequest, SAMPLE_DOC, startStub, type Stub, type StubReply, useIsolatedHome } from "./helpers.js";

useIsolatedHome();

let stub: Stub;
let reply: (req: RecordedRequest) => StubReply;
let client: Client;

beforeEach(async () => {
  reply = () => ({ status: 200, json: SAMPLE_DOC });
  stub = await startStub((req) => reply(req));
  process.env.DROPITX_API_URL = stub.url;
  process.env.DROPITX_API_KEY = "shk_test";
  process.env.DROPITX_FRONTEND_URL = "https://dropitx.test";
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverT);
  client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
});
afterEach(async () => {
  await client.close();
  await stub.close();
});

type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: unknown };
const callTool = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as ToolResult;
const parsed = (r: ToolResult, i = 0) => JSON.parse(r.content[i].text);
const last = () => stub.requests[stub.requests.length - 1];
const lastJson = () => JSON.parse(last().body.toString("utf8"));

/** Reduce a JSON Schema property to {types, default} so Python's anyOf and zod's output compare. */
function shape(prop: Record<string, unknown>) {
  const types = (prop.anyOf as { type: string }[] | undefined)?.map((p) => p.type) ??
    ([] as string[]).concat(prop.type as string | string[]);
  const out: Record<string, unknown> = { types: types.sort() };
  if ("default" in prop) out.default = prop.default;
  return out;
}

// Hand-copied from the Python FastMCP server's tools/list response.
const PY_SCHEMAS: Record<string, { required: string[]; props: Record<string, unknown> }> = {
  publish_page: {
    required: ["content"],
    props: {
      content: { types: ["string"] },
      title: { types: ["null", "string"], default: null },
      filename: { types: ["null", "string"], default: null },
      is_private: { types: ["boolean"], default: false },
      expires_in_seconds: { types: ["integer", "null"], default: null },
    },
  },
  update_page: {
    required: ["content", "slug"],
    props: {
      slug: { types: ["string"] },
      content: { types: ["string"] },
      title: { types: ["null", "string"], default: null },
      filename: { types: ["null", "string"], default: null },
    },
  },
  get_page: { required: ["slug"], props: { slug: { types: ["string"] } } },
  list_pages: { required: [], props: { limit: { types: ["integer"], default: 20 } } },
  delete_page: { required: ["slug"], props: { slug: { types: ["string"] } } },
  list_revisions: {
    required: ["slug"],
    props: { slug: { types: ["string"] }, limit: { types: ["integer"], default: 20 } },
  },
  get_revision: { required: ["revision", "slug"], props: { slug: { types: ["string"] }, revision: { types: ["integer"] } } },
  restore_revision: {
    required: ["revision", "slug"],
    props: { slug: { types: ["string"] }, revision: { types: ["integer"] } },
  },
};

describe("tool registry", () => {
  it("exposes exactly the 8 tools with the Python server's input schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(PY_SCHEMAS).sort());
    for (const tool of tools) {
      const want = PY_SCHEMAS[tool.name];
      const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
      expect([...(tool.inputSchema.required ?? [])].sort(), tool.name).toEqual(want.required);
      expect(
        Object.fromEntries(Object.entries(props).map(([k, v]) => [k, shape(v)])),
        tool.name,
      ).toEqual(want.props);
    }
  });

  it("keeps the Python docstrings as tool descriptions", async () => {
    const { tools } = await client.listTools();
    const publish = tools.find((t) => t.name === "publish_page")!;
    expect(publish.description).toMatch(/^Publish HTML or Markdown content to DropItX\. Returns a stable, shareable URL\./);
    expect(publish.description).toContain("expires_in_seconds: Optional custom expiry in seconds from now.");
  });
});

describe("publish_page / update_page", () => {
  it("publish_page maps arguments onto the create payload and returns the compact dict", async () => {
    const r = await callTool("publish_page", { content: "<h1>Hi</h1>", title: "My Page", is_private: true, expires_in_seconds: 60 });
    expect(r.isError).toBeFalsy();
    expect(last().method).toBe("POST");
    expect(lastJson()).toEqual({ content: "<h1>Hi</h1>", is_private: true, title: "My Page", expires_in: 60 });
    expect(parsed(r)).toEqual({
      url: "https://dropitx.test/s/abc123",
      slug: "abc123",
      title: "My Page",
      filename: "page.html",
      expires_at: null,
    });
  });

  it("update_page PATCHes the slug and returns the compact dict", async () => {
    const r = await callTool("update_page", { slug: "abc123", content: "new", filename: "p.md" });
    expect(last().method).toBe("PATCH");
    expect(last().path).toBe("/api/v1/documents/abc123");
    expect(lastJson()).toEqual({ content: "new", filename: "p.md" });
    expect(Object.keys(parsed(r))).toEqual(["url", "slug", "title", "filename", "expires_at"]);
  });
});

describe("get_page / list_pages / delete_page", () => {
  it("get_page returns full content and metadata", async () => {
    expect(parsed(await callTool("get_page", { slug: "abc123" }))).toEqual({
      url: "https://dropitx.test/s/abc123",
      slug: "abc123",
      title: "My Page",
      filename: "page.html",
      content: "<h1>Hello</h1>",
      is_private: false,
      view_count: 42,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      expires_at: null,
    });
  });

  it("list_pages returns one text block per page with truncated previews", async () => {
    reply = () => ({ status: 200, json: [{ ...SAMPLE_DOC, content: "x".repeat(500) }, { ...SAMPLE_DOC, slug: "b", content: "x".repeat(200) }] });
    const r = await callTool("list_pages", { limit: 5 });
    expect(Object.fromEntries(new URLSearchParams(last().search))).toEqual({ page: "1", limit: "5" });
    expect(r.content).toHaveLength(2);
    const first = parsed(r, 0);
    expect(first).toEqual({
      url: "https://dropitx.test/s/abc123",
      slug: "abc123",
      title: "My Page",
      filename: "page.html",
      content_preview: "x".repeat(200) + "...",
      content_size: 500,
      view_count: 42,
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(parsed(r, 1).content_preview).toBe("x".repeat(200));
    expect(r.structuredContent).toEqual({ result: [first, parsed(r, 1)] });
  });

  it("list_pages defaults to limit 20", async () => {
    reply = () => ({ status: 200, json: [] });
    await callTool("list_pages");
    expect(new URLSearchParams(last().search).get("limit")).toBe("20");
  });

  it("delete_page confirms the deletion", async () => {
    reply = () => ({ status: 204 });
    expect(parsed(await callTool("delete_page", { slug: "abc123" }))).toEqual({ deleted: true, slug: "abc123" });
    expect(last().method).toBe("DELETE");
  });
});

describe("revisions", () => {
  it("list_revisions replaces content with a preview and size", async () => {
    reply = () => ({
      status: 200,
      json: { revisions: [{ id: "r1", revision: 1, content: "y".repeat(300), title: "T" }, { id: "r2", revision: 2 }], total: 2 },
    });
    const r = parsed(await callTool("list_revisions", { slug: "abc123", limit: 3 }));
    expect(new URLSearchParams(last().search).get("limit")).toBe("3");
    expect(r).toEqual({
      revisions: [
        { id: "r1", revision: 1, title: "T", content_preview: "y".repeat(200) + "...", content_size: 300 },
        { id: "r2", revision: 2, content_preview: "", content_size: 0 },
      ],
      total: 2,
    });
  });

  it("get_revision and restore_revision pass the API response through", async () => {
    reply = (req) => ({ status: 200, json: { path: req.path, method: req.method } });
    expect(parsed(await callTool("get_revision", { slug: "a", revision: 2 }))).toEqual({
      path: "/api/v1/documents/a/revisions/2",
      method: "GET",
    });
    expect(parsed(await callTool("restore_revision", { slug: "a", revision: 2 }))).toEqual({
      path: "/api/v1/documents/a/revisions/2/restore",
      method: "POST",
    });
  });
});

describe("failures are MCP tool errors", () => {
  const CALLS: Record<string, Record<string, unknown>> = {
    publish_page: { content: "x" },
    update_page: { slug: "a", content: "x" },
    get_page: { slug: "a" },
    list_pages: {},
    delete_page: { slug: "a" },
    list_revisions: { slug: "a" },
    get_revision: { slug: "a", revision: 1 },
    restore_revision: { slug: "a", revision: 1 },
  };

  it.each(Object.keys(CALLS))("%s reports an API failure with isError and the API message", async (name) => {
    reply = () => ({ status: 500, json: { detail: "boom" } });
    const r = await callTool(name, CALLS[name]);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(`Error executing tool ${name}: API error (500): boom`);
  });

  it("reports an unreachable API as a tool error", async () => {
    process.env.DROPITX_API_URL = await closedPortUrl();
    const r = await callTool("list_pages");
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^Error executing tool list_pages: Network error: /);
  });

  it("reports a missing API key as a tool error", async () => {
    delete process.env.DROPITX_API_KEY;
    const r = await callTool("get_page", { slug: "a" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("dropitx config set-key");
  });

  it("reports invalid arguments as a tool error", async () => {
    const r = await callTool("get_page", {});
    expect(r.isError).toBe(true);
    expect(stub.requests).toHaveLength(0);
  });
});

it("never writes to stdout while handling a tool call", async () => {
  const spy = vi.spyOn(process.stdout, "write");
  await callTool("publish_page", { content: "hi" });
  reply = () => ({ status: 500, json: { detail: "boom" } });
  await callTool("get_page", { slug: "a" });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
