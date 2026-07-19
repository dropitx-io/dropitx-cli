"""Network-free tests for the drop-plan skill's find_latest_plan.py script.

Loaded directly from its path (it lives outside the dropitx package, as
bundled skill data, not an importable module) via importlib. Run with:
pytest -q
"""

import importlib.util
import sys
import time
from pathlib import Path

import pytest

SCRIPT_PATH = (
    Path(__file__).parent.parent
    / "dropitx"
    / "skills"
    / "drop-plan"
    / "scripts"
    / "find_latest_plan.py"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("find_latest_plan", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


find_latest_plan_mod = _load_module()


def test_plan_md_wins_over_newer_phase_file(tmp_path):
    plan_dir = tmp_path / "plans" / "my-plan"
    plan_dir.mkdir(parents=True)
    plan_md = plan_dir / "plan.md"
    plan_md.write_text("# plan")

    phase_md = plan_dir / "phase-01-foo.md"
    phase_md.write_text("# phase")

    # Force plan.md to have an OLDER mtime than the phase file.
    older = time.time() - 1000
    import os

    os.utime(plan_md, (older, older))

    winner = find_latest_plan_mod.find_latest_plan(root=tmp_path)
    assert winner == plan_md


def test_fresher_plan_md_wins_over_touched_phase_file_in_older_plan(tmp_path):
    """Regression test: an old plan whose phase file was recently touched
    must not outrank a genuinely more-recently-authored plan.md elsewhere --
    ranking must use each plan.md's own mtime, not max() across its
    phase-file siblings.
    """
    import os

    old_plan_dir = tmp_path / "plans" / "old-plan"
    old_plan_dir.mkdir(parents=True)
    old_plan_md = old_plan_dir / "plan.md"
    old_plan_md.write_text("# old plan")
    old_phase = old_plan_dir / "phase-01-foo.md"
    old_phase.write_text("# phase")

    new_plan_dir = tmp_path / "plans" / "new-plan"
    new_plan_dir.mkdir(parents=True)
    new_plan_md = new_plan_dir / "plan.md"
    new_plan_md.write_text("# new plan")

    long_ago = time.time() - 30 * 24 * 3600
    recently = time.time() - 15 * 24 * 3600
    just_now = time.time()

    os.utime(old_plan_md, (long_ago, long_ago))
    os.utime(old_phase, (just_now, just_now))  # touched recently, but plan.md itself is old
    os.utime(new_plan_md, (recently, recently))

    winner = find_latest_plan_mod.find_latest_plan(root=tmp_path)
    assert winner == new_plan_md


def test_html_wins_over_sibling_md(tmp_path):
    reports_dir = tmp_path / "plans" / "reports"
    reports_dir.mkdir(parents=True)
    md = reports_dir / "my-report.md"
    md.write_text("# report md")
    html = reports_dir / "my-report.html"
    html.write_text("<html>report</html>")

    winner = find_latest_plan_mod.find_latest_plan(root=tmp_path)
    assert winner == html


def test_phase_file_used_when_plan_md_missing(tmp_path):
    plan_dir = tmp_path / "plans" / "orphan-plan"
    plan_dir.mkdir(parents=True)
    phase_md = plan_dir / "phase-01-foo.md"
    phase_md.write_text("# phase")

    winner = find_latest_plan_mod.find_latest_plan(root=tmp_path)
    assert winner == phase_md


def test_docs_plans_dir_is_scanned(tmp_path):
    docs_plans = tmp_path / "docs" / "plans"
    docs_plans.mkdir(parents=True)
    doc = docs_plans / "some-plan.md"
    doc.write_text("# doc plan")

    winner = find_latest_plan_mod.find_latest_plan(root=tmp_path)
    assert winner == doc


def test_no_artifacts_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        find_latest_plan_mod.find_latest_plan(root=tmp_path)


def test_main_exits_1_with_stderr_when_nothing_found(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    exit_code = find_latest_plan_mod.main()
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "No plan artifacts found" in captured.err


def test_main_prints_path_and_exits_0(tmp_path, monkeypatch, capsys):
    plan_dir = tmp_path / "plans" / "my-plan"
    plan_dir.mkdir(parents=True)
    plan_md = plan_dir / "plan.md"
    plan_md.write_text("# plan")

    monkeypatch.chdir(tmp_path)
    exit_code = find_latest_plan_mod.main()
    captured = capsys.readouterr()
    assert exit_code == 0
    assert str(plan_md) in captured.out
