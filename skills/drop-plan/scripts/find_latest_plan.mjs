#!/usr/bin/env node
/**
 * Find the newest plan/report artifact to share via the drop-plan skill.
 *
 * Scans, relative to the current working directory:
 *   - plans/<name>/plan.md
 *   - plans/<name>/phase-*.md
 *   - plans/reports/*.md and *.html
 *   - docs/plans/*.md and *.html
 *
 * Tie-break rules:
 *   - plan.md wins over its own phase-*.md siblings in the same directory,
 *     even if a phase file has a later mtime -- the plan is the entrypoint a
 *     teammate should land on first.
 *   - A .html file wins over a same-stem sibling .md file (HTML is
 *     authoritative when both exist).
 *
 * Prints the winning path to stdout and exits 0. Prints an error to stderr and
 * exits 1 if no plan artifacts are found -- callers should then ask the user
 * for an explicit path rather than guess.
 *
 * Node.js standard library only, so it runs anywhere `dropitx` is installed.
 */
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mtime = (path) => statSync(path).mtimeMs;

function entries(dir, wantDirs) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => (wantDirs ? e.isDirectory() : e.isFile()))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function planCandidates(root) {
  const out = [];
  for (const name of entries(join(root, "plans"), true)) {
    const dir = join(root, "plans", name);
    const planMd = join(dir, "plan.md");
    if (existsSync(planMd)) {
      // Rank by plan.md's own mtime, not the newest phase file -- touching one
      // phase file in an old plan must not outrank a newer plan elsewhere.
      out.push([mtime(planMd), planMd]);
      continue;
    }
    // A plan directory that lost its plan.md but still has phase files.
    for (const f of entries(dir, false)) {
      if (f.startsWith("phase-") && f.endsWith(".md")) out.push([mtime(join(dir, f)), join(dir, f)]);
    }
  }
  return out;
}

function reportCandidates(base) {
  const stems = new Map();
  for (const f of entries(base, false)) {
    const m = /^(.*)\.(md|html)$/.exec(f);
    if (!m) continue;
    const group = stems.get(m[1]) ?? {};
    group[m[2]] = join(base, f);
    stems.set(m[1], group);
  }
  const out = [];
  for (const group of stems.values()) {
    const newest = Math.max(...Object.values(group).map(mtime));
    out.push([newest, group.html ?? group.md]);
  }
  return out;
}

/** Returns the path of the newest plan/report artifact under `root`. */
export function findLatestPlan(root = process.cwd()) {
  const candidates = [
    ...planCandidates(root),
    ...reportCandidates(join(root, "plans", "reports")),
    ...reportCandidates(join(root, "docs", "plans")),
  ];
  if (candidates.length === 0) {
    throw new Error(
      "No plan artifacts found under plans/*/plan.md, plans/*/phase-*.md, " +
        "plans/reports/*.md|.html, or docs/plans/*.md|.html",
    );
  }
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[candidates.length - 1][1];
}

const invokedDirectly =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    console.log(findLatestPlan());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
