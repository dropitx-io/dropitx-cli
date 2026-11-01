import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/program.js";
import { fakeIO, useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();
const dest = () => join(env.home(), ".claude", "skills", "drop-plan");

function existingInstall() {
  mkdirSync(dest(), { recursive: true });
  writeFileSync(join(dest(), "SKILL.md"), "local edits, do not clobber");
  writeFileSync(join(dest(), "stale.txt"), "left over");
}

async function install(args: string[], stdin?: string) {
  const io = await fakeIO({ stdin });
  const code = await run(["skill", "install", ...args], io);
  return { code, out: io.stdout() };
}

describe("dropitx skill install", () => {
  it("copies the bundled skill into ~/.claude/skills/drop-plan", async () => {
    const r = await install([]);
    expect(r.code).toBe(0);
    expect(readFileSync(join(dest(), "SKILL.md"), "utf8")).toContain("name: drop-plan");
    expect(existsSync(join(dest(), "scripts", "find_latest_plan.mjs"))).toBe(true);
    expect(r.out).toContain("Installed drop-plan skill");
  });

  it("leaves an existing install alone without --force", async () => {
    existingInstall();
    const r = await install([]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Already installed");
    expect(readFileSync(join(dest(), "SKILL.md"), "utf8")).toBe("local edits, do not clobber");
  });

  it("aborts --force when the user declines", async () => {
    existingInstall();
    const r = await install(["--force"], "n\n");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Aborted");
    expect(readFileSync(join(dest(), "SKILL.md"), "utf8")).toBe("local edits, do not clobber");
  });

  it("aborts --force when there is no answer", async () => {
    existingInstall();
    const r = await install(["--force"], "");
    expect(r.out).toContain("Aborted");
    expect(readFileSync(join(dest(), "SKILL.md"), "utf8")).toBe("local edits, do not clobber");
  });

  it("replaces the install with the bundled copy when confirmed", async () => {
    existingInstall();
    const r = await install(["--force"], "y\n");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Installed drop-plan skill");
    expect(readFileSync(join(dest(), "SKILL.md"), "utf8")).toContain("name: drop-plan");
    expect(readdirSync(dest()).sort()).toEqual(["SKILL.md", "scripts"]);
  });
});
