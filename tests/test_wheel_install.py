"""Proves `dropitx skill install` works from a real wheel install, not just
an editable (`pip install -e .`) one -- importlib.resources.files() can
resolve differently between the two (see Phase 2 risk assessment in
plans/0719-1449-drop-plan-skill/phase-02-cli-install-command.md).

Builds a real wheel with --no-build-isolation, then installs it via
`pip install --target` into an isolated directory -- a genuine non-editable
install (real copied files, not the editable-install's path-based linking)
without needing a whole new venv or network access: click/rich/httpx are
reused from whatever environment is already running this suite via
PYTHONPATH, only `dropitx` itself comes from the fresh wheel. Skips (does
not fail) if setuptools/wheel aren't importable here, rather than silently
attempting a network build. Slower than the rest of the suite (builds a
real wheel) -- marked `@pytest.mark.slow`.

Run with: pytest -q
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("setuptools")
pytest.importorskip("wheel")

PACKAGE_ROOT = Path(__file__).parent.parent


def _run(cmd, **kwargs):
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        pytest.fail(
            f"command failed: {' '.join(str(c) for c in cmd)}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


@pytest.mark.slow
def test_skill_install_from_built_wheel(tmp_path):
    wheel_dir = tmp_path / "wheelout"
    _run(
        [
            sys.executable,
            "-m",
            "pip",
            "wheel",
            "--no-deps",
            "--no-build-isolation",
            "-w",
            str(wheel_dir),
            str(PACKAGE_ROOT),
        ]
    )

    wheels = list(wheel_dir.glob("dropitx-*.whl"))
    assert wheels, "no dropitx wheel was built"
    wheel_file = wheels[0]

    install_dir = tmp_path / "installed"
    _run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "--no-deps",
            "--target",
            str(install_dir),
            str(wheel_file),
        ]
    )

    fake_home = tmp_path / "fake-home"
    fake_home.mkdir()

    # dropitx (real, non-editable copy) comes from install_dir via PYTHONPATH;
    # click/rich/httpx come from this test's own already-installed environment.
    env = {**os.environ, "HOME": str(fake_home)}
    env["PYTHONPATH"] = str(install_dir) + os.pathsep + env.get("PYTHONPATH", "")

    _run(
        [sys.executable, "-m", "dropitx.cli", "skill", "install"],
        env=env,
    )

    dest = fake_home / ".claude" / "skills" / "drop-plan"
    assert (dest / "SKILL.md").exists()
    assert (dest / "scripts" / "find_latest_plan.py").exists()
