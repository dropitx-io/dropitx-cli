import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { toUploadResult, uploadFile, uploadStdin, uploadText } from "../src/uploader.js";
import { closedPortUrl, parseForm, startStub, type Stub, useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();
let stub: Stub | undefined;
afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

const OK = {
  slug: "abc123",
  url: "https://dropitx.site/s/abc123",
  filename: "file.txt",
  deleteToken: "tok_123",
  size: 11,
  expires_at: "2026-12-31T00:00:00Z",
  burn_after_reading: true,
  password_protected: true,
};

async function stubApi(status = 200, json: unknown = OK) {
  stub = await startStub(() => ({ status, json }));
  process.env.DROPITX_API_URL = stub.url;
  return stub;
}

describe("toUploadResult", () => {
  it("maps the server's camelCase deleteToken and snake_case fields", () => {
    expect(toUploadResult(OK)).toEqual({
      slug: "abc123",
      url: "https://dropitx.site/s/abc123",
      filename: "file.txt",
      deleteToken: "tok_123",
      size: 11,
      expiresAt: "2026-12-31T00:00:00Z",
      burnAfterReading: true,
      passwordProtected: true,
    });
  });

  it("falls back to empty defaults", () => {
    expect(toUploadResult({})).toEqual({
      slug: "",
      url: "",
      filename: "",
      deleteToken: "",
      size: 0,
      expiresAt: "",
      burnAfterReading: false,
      passwordProtected: false,
    });
  });
});

describe("uploadFile", () => {
  it("POSTs multipart to /api/cli/upload with the file and option fields", async () => {
    const s = await stubApi();
    process.env.DROPITX_API_KEY = "shk_key";
    const file = join(env.home(), "file.txt");
    writeFileSync(file, "hello world");

    const result = await uploadFile(file, { password: "pw", expires: "1h", burn: true, slug: "my-slug" });

    expect(result.url).toBe("https://dropitx.site/s/abc123");
    const req = s.requests[0];
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/cli/upload");
    expect(req.headers["x-api-key"]).toBe("shk_key");
    const form = await parseForm(req);
    const sent = form.get("file") as File;
    expect(sent.name).toBe("file.txt");
    expect(await sent.text()).toBe("hello world");
    expect(form.get("password")).toBe("pw");
    expect(form.get("expires")).toBe("1h");
    expect(form.get("burn")).toBe("true");
    expect(form.get("slug")).toBe("my-slug");
  });

  it("omits the API key header and unset options", async () => {
    const s = await stubApi();
    const file = join(env.home(), "a.txt");
    writeFileSync(file, "x");

    await uploadFile(file);

    const req = s.requests[0];
    expect(req.headers["x-api-key"]).toBeUndefined();
    const form = await parseForm(req);
    expect([...form.keys()]).toEqual(["file"]);
  });

  it("rejects a missing file before any request", async () => {
    const s = await stubApi();
    await expect(uploadFile(join(env.home(), "nope.txt"))).rejects.toThrow(/File not found/);
    expect(s.requests).toHaveLength(0);
  });

  it("rejects with the HTTP status and server detail on failure", async () => {
    await stubApi(413, { detail: "File too large" });
    const file = join(env.home(), "a.txt");
    writeFileSync(file, "x");
    await expect(uploadFile(file)).rejects.toThrow(/413.*File too large/);
  });
});

describe("uploadText", () => {
  it("POSTs urlencoded content to /api/cli/upload/text", async () => {
    const s = await stubApi();
    process.env.DROPITX_API_KEY = "shk_key";

    await uploadText("# Hello", { filename: "note.md", expires: "7d", burn: true });

    const req = s.requests[0];
    expect(req.path).toBe("/api/cli/upload/text");
    expect(String(req.headers["content-type"])).toContain("application/x-www-form-urlencoded");
    expect(req.headers["x-api-key"]).toBe("shk_key");
    const form = await parseForm(req);
    expect(Object.fromEntries(form)).toEqual({
      content: "# Hello",
      filename: "note.md",
      expires: "7d",
      burn: "true",
    });
  });

  it("reports a network failure", async () => {
    process.env.DROPITX_API_URL = await closedPortUrl();
    await expect(uploadText("x")).rejects.toThrow(/Network error/);
  });
});

describe("uploadStdin", () => {
  it("uploads stream content as stdin.txt", async () => {
    const s = await stubApi();
    await uploadStdin(Readable.from(["piped ", "text"]), { slug: "s1" });
    const form = await parseForm(s.requests[0]);
    expect(Object.fromEntries(form)).toEqual({ content: "piped text", filename: "stdin.txt", slug: "s1" });
  });

  it("rejects empty input without a request", async () => {
    const s = await stubApi();
    await expect(uploadStdin(Readable.from([]))).rejects.toThrow("No content from stdin");
    expect(s.requests).toHaveLength(0);
  });
});
