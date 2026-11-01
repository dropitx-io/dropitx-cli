import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { qrTerminal, saveQrImage } from "../src/qr.js";
import { useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();

describe("qrTerminal", () => {
  it("renders a square block-character QR code", async () => {
    const out = await qrTerminal("https://dropitx.site/s/abc123");
    const lines = out.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThan(10);
    expect(out).toMatch(/[█▀▄]/);
  });

  it("emits no ANSI escapes when color is off, so piped output stays plain", async () => {
    const out = await qrTerminal("https://dropitx.site/s/abc123", { color: false });
    expect(out).not.toContain("\u001b");
    expect(out).toMatch(/[█▀▄]/);
  });

  it("uses inverted ANSI colors on a color terminal so the code scans on dark themes", async () => {
    expect(await qrTerminal("https://dropitx.site/s/abc123", { color: true })).toContain("\u001b[");
  });

  it("renders different codes for different URLs", async () => {
    expect(await qrTerminal("https://dropitx.site/s/a")).not.toBe(await qrTerminal("https://dropitx.site/s/b"));
  });
});

describe("saveQrImage", () => {
  it("writes a PNG file", async () => {
    const dest = join(env.home(), "qr.png");
    await saveQrImage("https://example.com/x", dest);
    const bytes = readFileSync(dest);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
