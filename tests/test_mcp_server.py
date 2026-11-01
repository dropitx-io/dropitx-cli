"""Network-free tests for the MCP server tools.

Uses pytest.importorskip("mcp") so tests skip cleanly when the extra is
not installed (Python <3.10 or base install). Mocks v1_client at the
module level so no real HTTP is made.

Covers: tool return shapes, content truncation in list_pages, API failures
being raised (and reported as isError over the MCP protocol), delete return
shape, and that no stdout writes occur in tool paths.
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


def test_publish_page_error_raises():
    with patch.object(
        mcp_server, "_create_document",
        side_effect=v1_client.V1ClientError(401, "Invalid API key"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Invalid API key"):
            mcp_server.publish_page(content="hi")


# ---------------------------------------------------------------------------
# update_page
# ---------------------------------------------------------------------------

def test_update_page_returns_url():
    result = _make_result(content="<h1>Updated</h1>")
    with patch.object(mcp_server, "_update_document", return_value=result):
        resp = mcp_server.update_page(slug="abc123", content="<h1>Updated</h1>")
    assert resp["slug"] == "abc123"
    assert resp["url"] == "https://dropitx.test/s/abc123"


def test_update_page_error_raises():
    with patch.object(
        mcp_server, "_update_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Not found"):
            mcp_server.update_page(slug="missing", content="x")


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


def test_get_page_error_raises():
    with patch.object(
        mcp_server, "_get_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Not found"):
            mcp_server.get_page(slug="missing")


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


def test_list_pages_error_raises():
    with patch.object(
        mcp_server, "_list_documents",
        side_effect=v1_client.V1ClientError(401, "Bad key"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Bad key"):
            mcp_server.list_pages()


# ---------------------------------------------------------------------------
# delete_page
# ---------------------------------------------------------------------------

def test_delete_page_returns_deleted_true():
    with patch.object(mcp_server, "_delete_document", return_value=None):
        resp = mcp_server.delete_page(slug="abc123")
    assert resp["deleted"] is True
    assert resp["slug"] == "abc123"


def test_delete_page_error_raises():
    with patch.object(
        mcp_server, "_delete_document",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Not found"):
            mcp_server.delete_page(slug="missing")


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


def test_list_revisions_error_raises():
    with patch.object(
        mcp_server, "_list_revisions",
        side_effect=v1_client.V1ClientError(404, "Not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Not found"):
            mcp_server.list_revisions(slug="missing")


# ---------------------------------------------------------------------------
# get_revision
# ---------------------------------------------------------------------------

def test_get_revision_returns_full_content():
    raw = {"id": "r1", "revision": 2, "content": "<h1>Old version</h1>", "filename": "p.html", "title": "T", "created_at": "2026-01-01T00:00:00Z"}
    with patch.object(mcp_server, "_get_revision", return_value=raw):
        resp = mcp_server.get_revision(slug="abc123", revision=2)
    assert resp["content"] == "<h1>Old version</h1>"
    assert resp["revision"] == 2


def test_get_revision_error_raises():
    with patch.object(
        mcp_server, "_get_revision",
        side_effect=v1_client.V1ClientError(404, "Revision not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Revision not found"):
            mcp_server.get_revision(slug="x", revision=99)


# ---------------------------------------------------------------------------
# restore_revision
# ---------------------------------------------------------------------------

def test_restore_revision_returns_confirmation():
    raw = {"id": "doc-1", "slug": "abc123", "revision": 4, "detail": "Restored to revision 2"}
    with patch.object(mcp_server, "_restore_revision", return_value=raw):
        resp = mcp_server.restore_revision(slug="abc123", revision=2)
    assert resp["detail"] == "Restored to revision 2"
    assert resp["revision"] == 4


def test_restore_revision_error_raises():
    with patch.object(
        mcp_server, "_restore_revision",
        side_effect=v1_client.V1ClientError(404, "Revision not found"),
    ):
        with pytest.raises(v1_client.V1ClientError, match="Revision not found"):
            mcp_server.restore_revision(slug="x", revision=99)


# ---------------------------------------------------------------------------
# Protocol level: a failing tool must surface as isError=true over MCP
# ---------------------------------------------------------------------------

_TOOL_CALLS = {
    "publish_page": ("_create_document", {"content": "x"}),
    "update_page": ("_update_document", {"slug": "a", "content": "x"}),
    "get_page": ("_get_document", {"slug": "a"}),
    "list_pages": ("_list_documents", {}),
    "delete_page": ("_delete_document", {"slug": "a"}),
    "list_revisions": ("_list_revisions", {"slug": "a"}),
    "get_revision": ("_get_revision", {"slug": "a", "revision": 1}),
    "restore_revision": ("_restore_revision", {"slug": "a", "revision": 1}),
}


def test_every_registered_tool_is_covered():
    import asyncio

    tools = asyncio.run(mcp_server.mcp.list_tools())
    assert {t.name for t in tools} == set(_TOOL_CALLS)


@pytest.mark.parametrize("tool_name", sorted(_TOOL_CALLS))
def test_api_failure_is_reported_as_mcp_error(tool_name):
    import asyncio

    from mcp.shared.memory import create_connected_server_and_client_session

    patch_target, args = _TOOL_CALLS[tool_name]

    async def run():
        async with create_connected_server_and_client_session(
            mcp_server.mcp._mcp_server
        ) as client:
            return await client.call_tool(tool_name, args)

    with patch.object(
        mcp_server, patch_target,
        side_effect=v1_client.V1ClientError(500, "API error (500): boom"),
    ):
        result = asyncio.run(run())

    assert result.isError is True
    assert "API error (500): boom" in result.content[0].text
