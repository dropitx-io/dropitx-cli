import type { UploadResult } from "./uploader.js";

export interface Paint {
  bold: (s: string) => string;
  dim: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
}

const sgr = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;
const plain = (s: string) => s;

export function painter(enabled: boolean): Paint {
  if (!enabled) return { bold: plain, dim: plain, green: plain, red: plain, yellow: plain, cyan: plain };
  return { bold: sgr(1, 22), dim: sgr(2, 22), green: sgr(32, 39), red: sgr(31, 39), yellow: sgr(33, 39), cyan: sgr(36, 39) };
}

/** Success block. The URL always sits on its own `URL: <url>` line so scripts can grep it. */
export function formatUploadResult(r: UploadResult, p: Paint): string {
  const rows: [string, string][] = [
    ["Slug", r.slug],
    ["Filename", r.filename],
    ["Delete Token", r.deleteToken],
  ];
  if (r.expiresAt) rows.push(["Expires", r.expiresAt]);
  if (r.burnAfterReading) rows.push(["Burn", "Yes"]);
  if (r.passwordProtected) rows.push(["Password", "Protected"]);
  return [
    p.bold(p.green("Upload Successful")),
    `URL: ${r.url}`,
    ...rows.map(([k, v]) => `${p.cyan(`${k}:`)} ${v}`),
    "",
  ].join("\n");
}

/** Left-aligned columns separated by two spaces. */
export function formatTable(title: string, header: string[], rows: string[][], p: Paint): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i])))
      .join("  ")
      .trimEnd();
  return [p.bold(title), p.cyan(line(header)), ...rows.map(line), ""].join("\n");
}

export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : "***";
}
