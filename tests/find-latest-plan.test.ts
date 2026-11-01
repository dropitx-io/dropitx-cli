import { spawnSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findLatestPlan } from "../skills/drop-plan/scripts/find_latest_plan.mjs";
import { useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();
const SCRIPT = fileURLToPath(new URL("../skills/drop-plan/scripts/find_latest_plan.mjs", import.meta.url));
const DAY = 24 * 3600;

/** Creates a file under the temp root, optionally with an mtime `ageSeconds` in the past. */
function file(rel: string, ageSeconds?: number): string {
  const p = join(env.home(), rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, rel);
  if (ageSeconds !== undefined) {
    const t = Date.now() / 1000 - ageSeconds;
    utimesSync(p, t, t);
  }
  return p;
}

describe("findLatestPlan", () => {
  it("prefers plan.md over a newer phase file in the same plan", () => {
    const plan = file("plans/my-plan/plan.md", 1000);
    file("plans/my-plan/phase-01-foo.md", 0);
    expect(findLatestPlan(env.home())).toBe(plan);
  });

  it("ranks plans by plan.md's own mtime, not a touched phase file", () => {
    file("plans/old-plan/plan.md", 30 * DAY);
    file("plans/old-plan/phase-01-foo.md", 0);
    const fresh = file("plans/new-plan/plan.md", 15 * DAY);
    expect(findLatestPlan(env.home())).toBe(fresh);
  });

  it("prefers .html over a sibling .md report", () => {
    file("plans/reports/my-report.md", 0);
    const html = file("plans/reports/my-report.html", 100);
    expect(findLatestPlan(env.home())).toBe(html);
  });

  it("uses a phase file when its plan has no plan.md", () => {
    const phase = file("plans/orphan-plan/phase-01-foo.md");
    expect(findLatestPlan(env.home())).toBe(phase);
  });

  it("scans docs/plans", () => {
    const doc = file("docs/plans/some-plan.md");
    expect(findLatestPlan(env.home())).toBe(doc);
  });

  it("picks the newest artifact across plans, reports and docs/plans", () => {
    file("plans/a/plan.md", 300);
    const report = file("plans/reports/r.md", 10);
    file("docs/plans/d.md", 200);
    expect(findLatestPlan(env.home())).toBe(report);
  });

  it("ignores files that are not plan artifacts", () => {
    file("plans/a/notes.md");
    file("plans/reports/data.json");
    expect(() => findLatestPlan(env.home())).toThrow(/No plan artifacts found/);
  });
});

describe("find_latest_plan.mjs as a script", () => {
  it("prints the winning path and exits 0", () => {
    const plan = file("plans/my-plan/plan.md");
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: env.home(), encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(plan);
  });

  it("exits 1 with a message on stderr when nothing is found", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: env.home(), encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("No plan artifacts found");
  });
});
