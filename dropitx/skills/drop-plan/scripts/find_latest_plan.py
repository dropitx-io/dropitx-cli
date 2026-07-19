#!/usr/bin/env python3
"""Find the newest plan/report artifact to share via the drop-plan skill.

Scans, relative to the current working directory:
  - plans/*/plan.md
  - plans/*/phase-*.md
  - plans/reports/*.md
  - plans/reports/*.html
  - docs/plans/*.md

Tie-break rules:
  - plan.md wins over its own phase-*.md siblings in the same directory,
    even if a phase file has a later individual mtime -- the plan is the
    entrypoint a teammate should land on first.
  - A .html file wins over a same-stem sibling .md file (mirrors ck:plan's
    "HTML is authoritative when both exist" rule).

Prints the winning path to stdout and exits 0. Prints an error to stderr
and exits 1 if no plan artifacts are found -- callers should fall back to
asking the user for an explicit path rather than guessing.
"""
import sys
from pathlib import Path
from typing import Iterator, Tuple


def _plan_dir_groups(root: Path) -> Iterator[Tuple[float, Path]]:
    for plan_md in root.glob("plans/*/plan.md"):
        # Rank by plan.md's own mtime, not a max() across its phase-file
        # siblings -- otherwise touching one phase file in an old, mostly-
        # untouched plan would outrank a genuinely newer plan.md elsewhere.
        yield plan_md.stat().st_mtime, plan_md

    # Plan directories that lost their plan.md but still have phase files.
    for phase_file in root.glob("plans/*/phase-*.md"):
        plan_dir = phase_file.parent
        if (plan_dir / "plan.md").exists():
            continue  # already covered above
        yield phase_file.stat().st_mtime, phase_file


def _report_groups(base: Path) -> Iterator[Tuple[float, Path]]:
    if not base.is_dir():
        return

    stems: dict = {}
    for f in base.glob("*.md"):
        stems.setdefault(f.stem, {})["md"] = f
    for f in base.glob("*.html"):
        stems.setdefault(f.stem, {})["html"] = f

    for files in stems.values():
        winner = files.get("html") or files["md"]
        mtimes = [f.stat().st_mtime for f in files.values()]
        yield max(mtimes), winner


def find_latest_plan(root: Path = None) -> Path:
    """Return the path of the newest plan/report artifact under `root`."""
    root = root or Path.cwd()

    candidates = list(_plan_dir_groups(root))
    candidates.extend(_report_groups(root / "plans" / "reports"))
    candidates.extend(_report_groups(root / "docs" / "plans"))

    if not candidates:
        raise FileNotFoundError(
            "No plan artifacts found under plans/*/plan.md, plans/*/phase-*.md, "
            "plans/reports/*.md|.html, or docs/plans/*.md"
        )

    candidates.sort(key=lambda c: c[0])
    return candidates[-1][1]


def main() -> int:
    try:
        winner = find_latest_plan()
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(winner)
    return 0


if __name__ == "__main__":
    sys.exit(main())
