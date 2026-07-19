"""Network-free tests for `dropitx skill install`.

Monkeypatches Path.home() so tests never touch the real developer's
~/.claude/skills/. Run with: pytest -q
"""

from pathlib import Path

from click.testing import CliRunner

from dropitx import cli as cli_mod


def _run(monkeypatch, fake_home: Path, args, input=None):
    monkeypatch.setattr(Path, "home", lambda: fake_home)
    return CliRunner().invoke(cli_mod.cli, ["skill", "install", *args], input=input)


def test_fresh_install_copies_skill_files(tmp_path, monkeypatch):
    result = _run(monkeypatch, tmp_path, [])
    assert result.exit_code == 0

    dest = tmp_path / ".claude" / "skills" / "drop-plan"
    assert (dest / "SKILL.md").exists()
    assert (dest / "scripts" / "find_latest_plan.py").exists()
    assert "Installed drop-plan skill" in result.output


def test_no_force_does_not_overwrite_existing(tmp_path, monkeypatch):
    dest = tmp_path / ".claude" / "skills" / "drop-plan"
    dest.mkdir(parents=True)
    marker = dest / "SKILL.md"
    marker.write_text("local edits, do not clobber")

    result = _run(monkeypatch, tmp_path, [])
    assert result.exit_code == 0
    assert "Already installed" in result.output
    assert marker.read_text() == "local edits, do not clobber"


def test_force_aborts_on_no(tmp_path, monkeypatch):
    dest = tmp_path / ".claude" / "skills" / "drop-plan"
    dest.mkdir(parents=True)
    marker = dest / "SKILL.md"
    marker.write_text("local edits, do not clobber")

    result = _run(monkeypatch, tmp_path, ["--force"], input="n\n")
    assert result.exit_code == 0
    assert "Aborted" in result.output
    assert marker.read_text() == "local edits, do not clobber"


def test_force_overwrites_on_yes(tmp_path, monkeypatch):
    dest = tmp_path / ".claude" / "skills" / "drop-plan"
    dest.mkdir(parents=True)
    marker = dest / "SKILL.md"
    marker.write_text("local edits, do not clobber")

    result = _run(monkeypatch, tmp_path, ["--force"], input="y\n")
    assert result.exit_code == 0
    assert "Installed drop-plan skill" in result.output
    # Overwritten with the bundled copy, local edit gone.
    assert marker.read_text() != "local edits, do not clobber"
    assert "drop-plan" in marker.read_text()


def test_no_pycache_leaks_into_installed_copy(tmp_path, monkeypatch):
    result = _run(monkeypatch, tmp_path, [])
    assert result.exit_code == 0

    dest = tmp_path / ".claude" / "skills" / "drop-plan"
    pycache_dirs = list(dest.rglob("__pycache__"))
    assert pycache_dirs == []


def test_rejects_python_below_39(tmp_path, monkeypatch):
    monkeypatch.setattr(cli_mod.sys, "version_info", (3, 8, 0))
    result = _run(monkeypatch, tmp_path, [])
    assert result.exit_code == 1
    assert "Python 3.9+" in result.output
