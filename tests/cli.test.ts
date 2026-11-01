import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/program.js";
import { fakeIO, parseForm, type RecordedRequest, startStub, type Stub, useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();
let stub: Stub;

const uploaded = (req: RecordedRequest) => ({
  slug: "abc123",
  url: `https://dropitx.site/s/${req.path.endsWith("/text") ? "txt" : "abc123"}`,
  filename: "file.txt",
  deleteToken: "tok_123",
  size: 5,
  expires_at: "2026-12-31T00:00:00Z",
  burn_after_reading: true,
  password_protected: true,
});

beforeEach(async () => {
  stub = await startStub((req) => ({ status: 200, json: uploaded(req) }));
  process.env.DROPITX_API_URL = stub.url;
});
afterEach(() => stub.close());

function writeFile(name: string, content = "hello") {
  const p = join(env.home(), name);
  writeFileSync(p, content);
  return p;
}

describe("help and version", () => {
  it("--help lists every command", async () => {
    const io = await fakeIO();
    expect(await run(["--help"], io)).toBe(0);
    expect(io.stdout()).toContain("DropItX");
    for (const cmd of ["upload", "text", "config", "qr", "mcp", "skill"]) expect(io.stdout()).toMatch(new RegExp(`\\n\\s+${cmd}\\b`));
  });

  it("--version prints the package version", async () => {
    const io = await fakeIO();
    expect(await run(["--version"], io)).toBe(0);
    expect(io.stdout().trim()).toBe("2.0.0");
  });

  it("bare invocation on a terminal prints help without uploading", async () => {
    const io = await fakeIO();
    expect(await run([], io)).toBe(0);
    expect(io.stdout()).toContain("Usage: dropitx");
    expect(stub.requests).toHaveLength(0);
  });

  it("rejects an unknown command", async () => {
    const io = await fakeIO();
    expect(await run(["frobnicate"], io)).not.toBe(0);
    expect(stub.requests).toHaveLength(0);
  });
});

describe("bare dropitx with piped stdin", () => {
  it("uploads stdin as stdin.txt with the global options and prints the URL on its own line", async () => {
    const io = await fakeIO({ stdin: "hi there" });
    expect(await run(["-e", "1h", "-b", "-s", "my-slug"], io)).toBe(0);
    expect(stub.requests[0].path).toBe("/api/cli/upload/text");
    expect(Object.fromEntries(await parseForm(stub.requests[0]))).toEqual({
      content: "hi there",
      filename: "stdin.txt",
      expires: "1h",
      burn: "true",
      slug: "my-slug",
    });
    expect(io.stdout().split("\n")).toContain("URL: https://dropitx.site/s/txt");
  });

  it("prompts for a password when -p has no value", async () => {
    const io = await fakeIO({ stdin: "secret note", hidden: ["pw1", "pw1"] });
    expect(await run(["-p"], io)).toBe(0);
    expect((await parseForm(stub.requests[0])).get("password")).toBe("pw1");
  });

  it("fails with exit 1 on empty stdin", async () => {
    const io = await fakeIO({ stdin: "" });
    expect(await run([], io)).toBe(1);
    expect(io.stderr()).toContain("Error: No content from stdin");
    expect(stub.requests).toHaveLength(0);
  });
});

describe("upload", () => {
  it("uploads one file and prints every result field", async () => {
    const io = await fakeIO();
    const f = writeFile("file.txt");
    expect(await run(["upload", f, "-p", "pw", "-e", "7d", "-b", "-s", "my-slug"], io)).toBe(0);
    const form = await parseForm(stub.requests[0]);
    expect(stub.requests[0].path).toBe("/api/cli/upload");
    expect(form.get("password")).toBe("pw");
    expect(form.get("expires")).toBe("7d");
    expect(form.get("burn")).toBe("true");
    expect(form.get("slug")).toBe("my-slug");
    const lines = io.stdout().split("\n");
    expect(lines).toContain("URL: https://dropitx.site/s/abc123");
    expect(io.stdout()).toMatch(/Slug:\s+abc123/);
    expect(io.stdout()).toMatch(/Filename:\s+file\.txt/);
    expect(io.stdout()).toMatch(/Delete Token:\s+tok_123/);
    expect(io.stdout()).toMatch(/Expires:\s+2026-12-31T00:00:00Z/);
    expect(io.stdout()).toMatch(/Burn:\s+Yes/);
    expect(io.stdout()).toMatch(/Password:\s+Protected/);
  });

  it("prompts for the password when -p is last and has no value", async () => {
    const io = await fakeIO({ hidden: ["pw2", "pw2"] });
    expect(await run(["upload", writeFile("a.txt"), "--password"], io)).toBe(0);
    expect((await parseForm(stub.requests[0])).get("password")).toBe("pw2");
  });

  it("uploads several files, drops the slug, and prints a table", async () => {
    const io = await fakeIO();
    const a = writeFile("a.txt");
    const b = writeFile("b.txt");
    expect(await run(["upload", a, b, "-s", "ignored"], io)).toBe(0);
    expect(stub.requests).toHaveLength(2);
    for (const req of stub.requests) expect((await parseForm(req)).get("slug")).toBeNull();
    expect(io.stdout()).toContain("Upload Results");
    expect(io.stdout().match(/https:\/\/dropitx\.site\/s\/abc123/g)).toHaveLength(2);
  });

  it("refuses a missing path before uploading anything", async () => {
    const io = await fakeIO();
    expect(await run(["upload", writeFile("a.txt"), join(env.home(), "missing.txt")], io)).toBe(2);
    expect(io.stderr()).toContain("missing.txt");
    expect(stub.requests).toHaveLength(0);
  });

  it("exits 1 with no files and no piped input", async () => {
    const io = await fakeIO();
    expect(await run(["upload"], io)).toBe(1);
    expect(io.stderr()).toContain("No files specified and no input from stdin");
  });

  it("uploads piped stdin when no files are given", async () => {
    const io = await fakeIO({ stdin: "from pipe" });
    expect(await run(["upload"], io)).toBe(0);
    expect((await parseForm(stub.requests[0])).get("content")).toBe("from pipe");
  });

  it("exits 1 and names the file when the API rejects it", async () => {
    await stub.close();
    stub = await startStub(() => ({ status: 413, json: { detail: "File too large" } }));
    process.env.DROPITX_API_URL = stub.url;
    const io = await fakeIO();
    expect(await run(["upload", writeFile("big.txt")], io)).toBe(1);
    expect(io.stderr()).toMatch(/Error uploading .*big\.txt: .*File too large/);
  });

  it("prints a QR code with --qr and saves one with --qr-file", async () => {
    const io = await fakeIO();
    const png = join(env.home(), "qr.png");
    expect(await run(["upload", writeFile("a.txt"), "--qr", "--qr-file", png], io)).toBe(0);
    expect(io.stdout()).toContain("QR Code:");
    expect(io.stdout()).toMatch(/[█▀▄]/);
    expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
    expect(io.stdout()).toContain(`QR code saved to: ${png}`);
  });
});

describe("text", () => {
  it("uploads the argument as text with a filename", async () => {
    const io = await fakeIO();
    expect(await run(["text", "# Hello", "-f", "note.md", "-e", "1h"], io)).toBe(0);
    expect(Object.fromEntries(await parseForm(stub.requests[0]))).toEqual({ content: "# Hello", filename: "note.md", expires: "1h" });
    expect(io.stdout().split("\n")).toContain("URL: https://dropitx.site/s/txt");
  });
});

describe("config", () => {
  const configFile = () => join(env.home(), ".dropitx", "config.json");

  it("set-key stores the key in ~/.dropitx/config.json", async () => {
    const io = await fakeIO();
    expect(await run(["config", "set-key", "shk_abcdefghijkl"], io)).toBe(0);
    expect(JSON.parse(readFileSync(configFile(), "utf8"))).toEqual({ api_key: "shk_abcdefghijkl" });
    expect(io.stdout()).toContain("API key saved");
  });

  it("set-key without a value exits 1 with usage", async () => {
    const io = await fakeIO();
    expect(await run(["config", "set-key"], io)).toBe(1);
    expect(io.stderr()).toContain("dropitx config set-key <your-api-key>");
    expect(existsSync(configFile())).toBe(false);
  });

  it("show prints the API URL and a masked key", async () => {
    await run(["config", "set-key", "shk_abcdefghijkl"], await fakeIO());
    const io = await fakeIO();
    expect(await run(["config", "show"], io)).toBe(0);
    expect(io.stdout()).toMatch(new RegExp(`API URL\\s+${stub.url}`));
    expect(io.stdout()).toMatch(/API Key\s+shk_abcd\.\.\.ijkl/);
    expect(io.stdout()).not.toContain("efgh");
  });

  it("show masks short keys completely and reports a missing key", async () => {
    process.env.DROPITX_API_KEY = "shk_short";
    const io = await fakeIO();
    await run(["config", "show"], io);
    expect(io.stdout()).toMatch(/API Key\s+\*\*\*/);
    delete process.env.DROPITX_API_KEY;
    const io2 = await fakeIO();
    await run(["config", "show"], io2);
    expect(io2.stdout()).toMatch(/API Key\s+Not set/);
  });

  it("show defaults to the production API URL", async () => {
    delete process.env.DROPITX_API_URL;
    const io = await fakeIO();
    await run(["config", "show"], io);
    expect(io.stdout()).toMatch(/API URL\s+https:\/\/api\.dropitx\.site/);
  });

  it("set-url stores the URL without a trailing slash", async () => {
    const io = await fakeIO();
    expect(await run(["config", "set-url", "http://example.invalid/"], io)).toBe(0);
    expect(JSON.parse(readFileSync(configFile(), "utf8"))).toEqual({ api_url: "http://example.invalid" });
    expect(io.stdout()).toContain("API URL set to: http://example.invalid");
  });

  it("set-url without a value exits 1 with a dropitx.site usage hint", async () => {
    const io = await fakeIO();
    expect(await run(["config", "set-url"], io)).toBe(1);
    expect(io.stderr()).toContain("https://api.dropitx.site");
    expect(io.stderr()).not.toContain("dropitx.com");
  });

  it("rejects an unknown action", async () => {
    const io = await fakeIO();
    expect(await run(["config", "delete"], io)).not.toBe(0);
    expect(existsSync(configFile())).toBe(false);
  });
});

describe("qr", () => {
  it("prints a QR code for the URL", async () => {
    const io = await fakeIO();
    expect(await run(["qr", "https://dropitx.site/s/abc"], io)).toBe(0);
    expect(io.stdout()).toMatch(/[█▀▄]/);
  });

  it("saves a PNG with -o", async () => {
    const io = await fakeIO();
    const png = join(env.home(), "out.png");
    expect(await run(["qr", "-o", png, "https://dropitx.site/s/abc"], io)).toBe(0);
    expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
    expect(io.stdout()).toContain(`QR code saved to: ${png}`);
  });
});

describe("help layout", () => {
  it("keeps the command list to one summary line per command", async () => {
    const io = await fakeIO();
    await run(["--help"], io);
    const commands = io.stdout().split("Commands:")[1];
    expect(commands).toContain("mcp ");
    expect(commands).not.toContain("claude mcp add");
  });

  it("mcp --help shows the MCP client setup", async () => {
    const io = await fakeIO();
    expect(await run(["mcp", "--help"], io)).toBe(0);
    expect(io.stdout()).toContain("npx -y dropitx mcp");
  });
});
