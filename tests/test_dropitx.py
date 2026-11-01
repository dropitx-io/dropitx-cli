"""Network-free tests for the DropItX CLI package.

Covers: package version, module imports, the Click CLI surface, the
upload-result field mapping (incl. the server's camelCase `deleteToken`),
config/env resolution precedence, and QR generation. Run with: pytest -q
"""

from pathlib import Path

import pytest
from click.testing import CliRunner

import dropitx
from dropitx import cli as cli_mod
from dropitx import config, qr, uploader


# ----------------------------------------------------------------- version / imports

def test_version_is_string():
    assert dropitx.__version__ == "1.1.0"


def test_all_modules_importable():
    assert hasattr(cli_mod, "cli")
    assert hasattr(uploader, "upload_file")
    assert hasattr(uploader, "upload_text")
    assert hasattr(uploader, "upload_stdin")
    assert hasattr(config, "get_api_key")
    assert hasattr(config, "get_api_url")
    assert hasattr(qr, "generate_qr_ascii")


# ----------------------------------------------------------------- CLI surface

def test_cli_help_exits_zero():
    result = CliRunner().invoke(cli_mod.cli, ["--help"])
    assert result.exit_code == 0
    assert "DropItX" in result.output


def test_cli_version_flag():
    result = CliRunner().invoke(cli_mod.cli, ["--version"])
    assert result.exit_code == 0
    assert dropitx.__version__ in result.output


def test_cli_exposes_subcommands():
    result = CliRunner().invoke(cli_mod.cli, ["--help"])
    for cmd in ("upload", "text", "config", "qr"):
        assert cmd in result.output


# ----------------------------------------------------------------- UploadResult mapping

def test_upload_result_parses_all_fields():
    data = {
        "slug": "abc123",
        "url": "https://dropitx.site/s/abc123",
        "filename": "file.txt",
        "deleteToken": "tok_123",
        "size": 1024,
        "expires_at": "2026-12-31T00:00:00Z",
        "burn_after_reading": True,
        "password_protected": True,
    }
    r = uploader.UploadResult(data)
    assert r.slug == "abc123"
    assert r.url.endswith("abc123")
    assert r.filename == "file.txt"
    assert r.delete_token == "tok_123"   # server camelCase -> client snake_case
    assert r.size == 1024
    assert r.expires_at == "2026-12-31T00:00:00Z"
    assert r.burn_after_reading is True
    assert r.password_protected is True
    assert str(r) == r.url


def test_upload_result_defaults_on_empty():
    r = uploader.UploadResult({})
    assert r.slug == ""
    assert r.delete_token == ""           # missing deleteToken -> ""
    assert r.size == 0
    assert r.burn_after_reading is False
    assert r.password_protected is False


# ----------------------------------------------------------------- config / env resolution

def _isolate_config(monkeypatch, tmp_path):
    """Point config module at a tmp dir/file so the real ~/.dropitx is never read."""
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.json")


def test_default_api_url(monkeypatch, tmp_path):
    monkeypatch.delenv("DROPITX_API_URL", raising=False)
    _isolate_config(monkeypatch, tmp_path)
    assert config.get_api_url() == config.DEFAULT_API_URL


def test_default_api_url_is_production():
    assert config.DEFAULT_API_URL == "https://api.dropitx.site"


def test_default_frontend_url_is_production(monkeypatch, tmp_path):
    monkeypatch.delenv("DROPITX_FRONTEND_URL", raising=False)
    _isolate_config(monkeypatch, tmp_path)
    assert config.get_frontend_url() == "https://dropitx.site"


def test_config_file_url_overrides_default(monkeypatch, tmp_path):
    monkeypatch.delenv("DROPITX_API_URL", raising=False)
    _isolate_config(monkeypatch, tmp_path)
    config.save_config({"api_url": "http://localhost:8000/"})
    assert config.get_api_url() == "http://localhost:8000"


def test_api_url_env_overrides(monkeypatch):
    monkeypatch.setenv("DROPITX_API_URL", "https://example.com/")
    assert config.get_api_url() == "https://example.com"   # trailing slash stripped


def test_api_key_env_overrides_config_file(monkeypatch, tmp_path):
    _isolate_config(monkeypatch, tmp_path)
    config.set_api_key("sk_file")
    assert config.get_api_key() == "sk_file"

    monkeypatch.setenv("DROPITX_API_KEY", "sk_env")        # env wins over file
    assert config.get_api_key() == "sk_env"

    monkeypatch.delenv("DROPITX_API_KEY", raising=False)   # back to file value
    assert config.get_api_key() == "sk_file"


# ----------------------------------------------------------------- QR generation

def test_qr_text_box_contains_url():
    out = qr.generate_qr_text("https://example.com/x")
    assert "https://example.com/x" in out
    assert out.startswith("┌") and "└" in out   # top-left / bottom-left border


@pytest.mark.skipif(not qr.HAS_QRCODE, reason="qrcode[pil] not installed")
def test_qr_ascii_when_lib_present():
    assert isinstance(qr.generate_qr_ascii("https://example.com/x"), str)


@pytest.mark.skipif(not qr.HAS_QRCODE, reason="qrcode[pil] not installed")
def test_qr_image_saved_to_file(tmp_path):
    dest = tmp_path / "qr.png"
    assert qr.generate_qr_image("https://example.com/x", str(dest)) is True
    assert dest.exists() and dest.stat().st_size > 0


# ----------------------------------------------------------------- mcp command import failures

def _run_mcp_cmd(monkeypatch, installed_version):
    import sys

    monkeypatch.setitem(sys.modules, "dropitx.mcp_server", None)  # force ImportError
    monkeypatch.setattr(cli_mod, "_installed_mcp_version", lambda: installed_version)
    return CliRunner().invoke(cli_mod.cli, ["mcp"])


def test_mcp_command_reports_missing_extra(monkeypatch):
    result = _run_mcp_cmd(monkeypatch, None)
    assert result.exit_code == 1
    assert "pip install 'dropitx[mcp]'" in result.output
    assert "incompatible" not in result.output


def test_mcp_command_reports_incompatible_version(monkeypatch):
    result = _run_mcp_cmd(monkeypatch, "2.3.0")
    assert result.exit_code == 1
    assert "2.3.0" in result.output
    assert "incompatible" in result.output
    assert "mcp>=1.0,<2" in result.output
    assert "requires the 'dropitx[mcp]' extra" not in result.output


def test_usage_hint_uses_site_domain(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.json")
    result = CliRunner().invoke(cli_mod.cli, ["config", "set-url"])
    assert result.exit_code == 1
    assert "https://api.dropitx.site" in result.output
    assert "dropitx.com" not in result.output


def test_pyproject_pins_mcp_below_2():
    import re

    text = (Path(__file__).parent.parent / "pyproject.toml").read_text()
    assert re.search(r"mcp>=1\.0,<2;\s*python_version>='3\.10'", text)
