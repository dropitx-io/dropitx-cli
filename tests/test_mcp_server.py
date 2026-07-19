"""Network-free tests for the MCP server tools.

Uses pytest.importorskip("mcp") so tests skip cleanly when the extra is
not installed (Python <3.10 or base install). Mocks v1_client at the
module level so no real HTTP is made.

Covers: tool return shapes, content truncation in list_pages, error
mapping, delete return shape, and that no stdout writes occur in tool paths.
"""

from __future__ import annotations

import importlib
import io
import sys
from unittest.mock import patch

import pytest

# Skip entire module if mcp is not installed
pytest.importorskip("mcp")

# Import after skip guard
from dropitx import mcp_server  # noqa: E402
from dropitx import v1_client  # noqa: E402

SAMPLE_DOC = {
    "id": "doc-1",
    "slug": "abc123",
    "filename": "page.html",
    "title": "My Page",
    "content": "<h1>Hello</h1>",
    "is_private": False,
    "view_count": 42,
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-02T00:00:00Z",
    "expires_at": None,
}


def _make_result(**overrides):
    """Build a DocumentResult with the sample doc."""
    data = {**SAMPLE_DOC, **overrides}
    with patch.object(v1_client, "get_frontend_url", return_value="https://dropitx.test"):
        return v1_client.DocumentResult(data)


# ---------------------------------------------------------------------------
# publish_page
# ---------------------------------------------------------------------------

def test_publish_page_returns_url_and_slug():
    result = _make_result()
    with patch.object(mcp_server, "_create_document", return_value=result):
        resp = mcp_server.publish_page(content="<h1>Hi</h1>", title="My Page")
    assert resp["url"] == "https://dropitx.test/s/abc123"
    assert resp["slug"] == "abc123"
    assert "content" not in resp  # publish response excludes content


def test_publish_page_error_returns_error_dict():
    with patch.object(
        mcp_server, "_create_document",
        side_effect=v1_client.V1ClientError(401, "Invalid API key"),
    ):
        resp = mcp_server.publish_page(content="hi")
    assert "error" in resp
    assert "Invalid API key" in resp["error"]


# ---------------------------------------------------------------------------
# update_page
# ---------------------------------------------------------------------------

def test_update_page_returns_url():
    result = _make_result(content="<h1>Updated</h1>")
    with patch.object(mcp_server, "_update_document", return_value=result):
        resp = mcp_server.update_page(slug="abc123", content="<h1>Updated</h1>")
    assert resp["slug"] == "abc123"
    assert resp["url"] == "https://dropitx.test/s/abc123"


def test_update_page_error_returns_error_dict():
    with patch.object(
        mcp_server, "_update_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        resp = mcp_server.update_page(slug="missing", content="x")
    assert "error" in resp


# ---------------------------------------------------------------------------
# get_page
# ---------------------------------------------------------------------------

def test_get_page_returns_full_content():
    result = _make_result()
    with patch.object(mcp_server, "_get_document", return_value=result):
        resp = mcp_server.get_page(slug="abc123")
    assert resp["content"] == "<h1>Hello</h1>"
    assert resp["slug"] == "abc123"
    assert resp["view_count"] == 42


def test_get_page_error_returns_error_dict():
    with patch.object(
        mcp_server, "_get_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        resp = mcp_server.get_page(slug="missing")
    assert "error" in resp


# ---------------------------------------------------------------------------
# list_pages — truncation check
# ---------------------------------------------------------------------------

def test_list_pages_truncates_content_preview():
    long_content = "x" * 500
    result = _make_result(content=long_content)
    with patch.object(mcp_server, "_list_documents", return_value=[result]):
        resp = mcp_server.list_pages(limit=20)
    assert len(resp) == 1
    preview = resp[0]["content_preview"]
    assert len(preview) <= mcp_server._PREVIEW_CHARS + 3  # 200 + "..."
    assert preview.endswith("...")
    assert resp[0]["content_size"] == 500
    assert "content" not in resp[0]  # full content NOT included


def test_list_pages_short_content_no_ellipsis():
    result = _make_result(content="short")
    with patch.object(mcp_server, "_list_documents", return_value=[result]):
        resp = mcp_server.list_pages()
    assert resp[0]["content_preview"] == "short"
    assert "..." not in resp[0]["content_preview"]


def test_list_pages_error_returns_error_in_list():
    with patch.object(
        mcp_server, "_list_documents",
        side_effect=v1_client.V1ClientError(401, "Bad key"),
    ):
        resp = mcp_server.list_pages()
    assert len(resp) == 1
    assert "error" in resp[0]


# ---------------------------------------------------------------------------
# delete_page
# ---------------------------------------------------------------------------

def test_delete_page_returns_deleted_true():
    with patch.object(mcp_server, "_delete_document", return_value=None):
        resp = mcp_server.delete_page(slug="abc123")
    assert resp["deleted"] is True
    assert resp["slug"] == "abc123"


def test_delete_page_error_returns_error_dict():
    with patch.object(
        mcp_server, "_delete_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        resp = mcp_server.delete_page(slug="missing")
    assert "error" in resp


# ---------------------------------------------------------------------------
# No stdout contamination (stdio protocol safety)
# ---------------------------------------------------------------------------

def test_tools_do_not_write_to_stdout(capsys):
    result = _make_result()
    with patch.object(mcp_server, "_create_document", return_value=result):
        mcp_server.publish_page(content="hi")
    captured = capsys.readouterr()
    assert captured.out == ""


# ---------------------------------------------------------------------------
# list_revisions
# ---------------------------------------------------------------------------

def test_list_revisions_truncates_content():
    long_content = "x" * 500
    raw_data = {
        "revisions": [
            {"id": "r1", "revision": 1, "content": long_content, "filename": "p.html", "title": "T", "created_at": "2026-01-01T00:00:00Z"}
        ],
        "total": 1,
    }
    with patch.object(mcp_server, "_list_revisions", return_value=raw_data):
        resp = mcp_server.list_revisions(slug="abc123")
    assert resp["total"] == 1
    rev = resp["revisions"][0]
    assert "content" not in rev  # full content removed
    assert rev["content_size"] == 500
    assert rev["content_preview"].endswith("...")


def test_list_revisions_error():
    with patch.object(
        mcp_server, "_list_revisions",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        resp = mcp_server.list_revisions(slug="missing")
    assert "error" in resp


# ---------------------------------------------------------------------------
# get_revision
# ---------------------------------------------------------------------------

def test_get_revision_returns_full_content():
    raw = {"id": "r1", "revision": 2, "content": "<h1>Old version</h1>", "filename": "p.html", "title": "T", "created_at": "2026-01-01T00:00:00Z"}
    with patch.object(mcp_server, "_get_revision", return_value=raw):
        resp = mcp_server.get_revision(slug="abc123", revision=2)
    assert resp["content"] == "<h1>Old version</h1>"
    assert resp["revision"] == 2


def test_get_revision_error():
    with patch.object(
        mcp_server, "_get_revision",
        side_effect=v1_client.V1ClientError(404, "Revision not found"),
    ):
        resp = mcp_server.get_revision(slug="x", revision=99)
    assert "error" in resp


# ---------------------------------------------------------------------------
# restore_revision
# ---------------------------------------------------------------------------

def test_restore_revision_returns_confirmation():
    raw = {"id": "doc-1", "slug": "abc123", "revision": 4, "detail": "Restored to revision 2"}
    with patch.object(mcp_server, "_restore_revision", return_value=raw):
        resp = mcp_server.restore_revision(slug="abc123", revision=2)
    assert resp["detail"] == "Restored to revision 2"
    assert resp["revision"] == 4


def test_restore_revision_error():
    with patch.object(
        mcp_server, "_restore_revision",
        side_effect=v1_client.V1ClientError(404, "Revision not found"),
    ):
        resp = mcp_server.restore_revision(slug="x", revision=99)
    assert "error" in resp
