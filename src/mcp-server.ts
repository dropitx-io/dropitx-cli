/**
 * MCP stdio server exposing DropItX page tools for AI agents (`dropitx mcp`).
 * stdout belongs to the MCP protocol: nothing else may write to it.
 * Every API failure is returned as a tool result with isError: true carrying
 * the API's message, so agents can tell a failure from a success.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createDocument,
  deleteDocument,
  type DocumentResult,
  getDocument,
  getRevision,
  type JsonObject,
  listDocuments,
  listRevisions,
  restoreRevision,
  updateDocument,
} from "./v1-client.js";
import { VERSION } from "./version.js";

/** Content preview length for list results (keeps agent context windows small). */
const PREVIEW_CHARS = 200;

function preview(content: string): string {
  return content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}...` : content;
}

const publishDict = (r: DocumentResult) => ({
  url: r.url,
  slug: r.slug,
  title: r.title,
  filename: r.filename,
  expires_at: r.expires_at,
});

const fullDict = (r: DocumentResult) => ({
  url: r.url,
  slug: r.slug,
  title: r.title,
  filename: r.filename,
  content: r.content,
  is_private: r.is_private,
  view_count: r.view_count,
  created_at: r.created_at,
  updated_at: r.updated_at,
  expires_at: r.expires_at,
});

const previewDict = (r: DocumentResult) => ({
  url: r.url,
  slug: r.slug,
  title: r.title,
  filename: r.filename,
  content_preview: preview(r.content),
  content_size: r.content.length,
  view_count: r.view_count,
  updated_at: r.updated_at,
});

const textJson = (value: unknown) => ({ type: "text" as const, text: JSON.stringify(value, null, 2) });

/** Runs a tool body, turning any thrown error into an isError result. */
async function run(name: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }] };
  }
}

const json = (name: string, body: () => Promise<unknown>) =>
  run(name, async () => ({ content: [textJson(await body())] }));

const optionalString = () => z.string().nullable().default(null);
const slug = z.string();
const revision = z.number().int();
const limit = z.number().int().default(20);

export function createServer(): McpServer {
  const server = new McpServer({ name: "dropitx", version: VERSION });

  server.registerTool(
    "publish_page",
    {
      description: `Publish HTML or Markdown content to DropItX. Returns a stable, shareable URL.

Content limit: 5,000,000 characters. The filename extension drives how the
page renders (e.g. .html renders as a webpage, .md as Markdown). If no
filename is given, the server assigns one. Pages expire after 30 days by
default unless expires_in_seconds is set.

Args:
    content: HTML or Markdown content.
    title: Optional human-readable title.
    filename: Optional filename (extension drives rendering: .html, .md).
    is_private: If true, hidden from public search and listings.
    expires_in_seconds: Optional custom expiry in seconds from now.

Returns:
    Dict with url, slug, title, filename, expires_at.
`,
      inputSchema: {
        content: z.string(),
        title: optionalString(),
        filename: optionalString(),
        is_private: z.boolean().default(false),
        expires_in_seconds: z.number().int().nullable().default(null),
      },
    },
    (a) =>
      json("publish_page", async () =>
        publishDict(
          await createDocument(a.content, {
            filename: a.filename,
            title: a.title,
            isPrivate: a.is_private,
            expiresIn: a.expires_in_seconds,
          }),
        ),
      ),
  );

  server.registerTool(
    "update_page",
    {
      description: `Redeploy new content to an existing DropItX page at the SAME URL.

The previous version is automatically saved as a revision (retrievable via
the v1 revisions API). At least content or title must be provided.

Args:
    slug: The page slug (from publish_page response).
    content: New HTML or Markdown content (max 5,000,000 chars).
    title: Optional new title.
    filename: Optional new filename (changes rendering mode).

Returns:
    Dict with url, slug, title, filename, expires_at.
`,
      inputSchema: { slug, content: z.string(), title: optionalString(), filename: optionalString() },
    },
    (a) =>
      json("update_page", async () =>
        publishDict(await updateDocument(a.slug, { content: a.content, title: a.title, filename: a.filename })),
      ),
  );

  server.registerTool(
    "get_page",
    {
      description: `Fetch the full content and metadata of a DropItX page by slug.

Args:
    slug: The page slug.

Returns:
    Dict with url, slug, title, filename, content (full), metadata.
`,
      inputSchema: { slug },
    },
    (a) => json("get_page", async () => fullDict(await getDocument(a.slug))),
  );

  server.registerTool(
    "list_pages",
    {
      description: `List your DropItX pages. Returns metadata + content preview only.

Never returns full content bodies — previews are truncated to 200 characters
to keep agent context windows manageable.

Args:
    limit: Maximum pages to return (1–100, default 20).

Returns:
    List of dicts with url, slug, title, content_preview, content_size.
`,
      inputSchema: { limit },
      outputSchema: { result: z.array(z.record(z.string(), z.unknown())) },
    },
    (a) =>
      run("list_pages", async () => {
        const pages = (await listDocuments(1, a.limit)).map(previewDict);
        return { content: pages.map(textJson), structuredContent: { result: pages } };
      }),
  );

  server.registerTool(
    "delete_page",
    {
      description: `Permanently delete a DropItX page and its storage.

Args:
    slug: The page slug to delete.

Returns:
    Dict: {"deleted": true, "slug": ...}.
`,
      inputSchema: { slug },
    },
    (a) =>
      json("delete_page", async () => {
        await deleteDocument(a.slug);
        return { deleted: true, slug: a.slug };
      }),
  );

  server.registerTool(
    "list_revisions",
    {
      description: `List all saved revisions for a DropItX page.

Revisions are created automatically each time you call update_page. Use this
to see the version history — revision number, timestamp, filename, and title
for each saved version. Content previews are truncated to 200 chars.

Args:
    slug: The page slug.
    limit: Maximum revisions to return (1–100, default 20).

Returns:
    Dict with 'revisions' (list of metadata) and 'total' count.
`,
      inputSchema: { slug, limit },
    },
    (a) =>
      json("list_revisions", async () => {
        const data = await listRevisions(a.slug, 1, a.limit);
        const revisions = Array.isArray(data.revisions) ? (data.revisions as JsonObject[]) : [];
        for (const rev of revisions) {
          const content = typeof rev.content === "string" ? rev.content : "";
          delete rev.content;
          rev.content_preview = preview(content);
          rev.content_size = content.length;
        }
        return data;
      }),
  );

  server.registerTool(
    "get_revision",
    {
      description: `Fetch the full content of a specific revision of a DropItX page.

Args:
    slug: The page slug.
    revision: The revision number (from list_revisions).

Returns:
    Dict with revision number, full content, filename, title, created_at.
`,
      inputSchema: { slug, revision },
    },
    (a) => json("get_revision", () => getRevision(a.slug, a.revision)),
  );

  server.registerTool(
    "restore_revision",
    {
      description: `Restore a DropItX page to a previous revision.

The current live content is saved as a new revision before the restore
happens, so nothing is lost. After restore, the page URL serves the
restored content.

Args:
    slug: The page slug.
    revision: The revision number to restore.

Returns:
    Dict with the new revision number and confirmation message.
`,
      inputSchema: { slug, revision },
    },
    (a) => json("restore_revision", () => restoreRevision(a.slug, a.revision)),
  );

  return server;
}

/** Serves the tools over stdio until the client disconnects. */
export async function runServer(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
