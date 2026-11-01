import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** skills/ ships at the package root, next to both src/ and the compiled output. */
export const BUNDLED_SKILL_DIR = fileURLToPath(new URL("../skills/drop-plan", import.meta.url));

export function skillDestination(): string {
  return join(homedir(), ".claude", "skills", "drop-plan");
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

/** Replaces `dest` with the bundled skill. Refuses to delete anything but a .../skills/drop-plan dir. */
export function installSkill(dest: string): void {
  if (existsSync(dest)) {
    if (basename(dest) !== "drop-plan" || basename(dirname(dest)) !== "skills") {
      throw new Error(`refusing to delete unexpected path: ${dest}`);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  copyDir(BUNDLED_SKILL_DIR, dest);
}
