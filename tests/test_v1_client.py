"""Network-free tests for the v1_client module.

Mocks httpx at the module level so no real HTTP is made.
Covers: DocumentResult mapping + url construction, bearer header, missing-key
error, 401/404/410 error mapping, empty-update guard, content-length guard.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from dropitx import config
from dropitx import v1_client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolate_config(monkeypatch, tmp_path):
    """Point config at tmp files so ~/.dropitx is never touched."""
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.json")
    monkeypatch.setattr(v1_client, "get_api_key", lambda: "shk_test123")
    monkeypatch.setattr(v1_client, "get_api_url", lambda: "https://api.test")
    monkeypatch.setattr(v1_client, "get_frontend_url", lambda: "https://dropitx.test")


def _mock_response(status_code: int = 200, json_data=None):
    """Build a fake httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.text = ""
    return resp


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


# ---------------------------------------------------------------------------
# DocumentResult mapping
# ---------------------------------------------------------------------------

def test_document_result_maps_all_fields():
    r = v1_client.DocumentResult(SAMPLE_DOC)
    assert r.id == "doc-1"
    assert r.slug == "abc123"
    assert r.filename == "page.html"
    assert r.title == "My Page"
    assert r.content == "<h1>Hello</h1>"
    assert r.is_private is False
    assert r.view_count == 42
    assert r.created_at == "2026-01-01T00:00:00Z"
    assert r.expires_at is None


def test_document_result_url_construction():
    r = v1_client.DocumentResult(SAMPLE_DOC)
    assert r.url == "https://dropitx.test/s/abc123"


def test_document_result_empty_url_for_missing_slug():
    r = v1_client.DocumentResult({})
    assert r.url == ""


def test_document_result_to_dict():
    r = v1_client.DocumentResult(SAMPLE_DOC)
    d = r.to_dict()
    assert d["slug"] == "abc123"
    assert d["url"] == "https://dropitx.test/s/abc123"
    assert "content" not in d  # to_dict excludes content


# ---------------------------------------------------------------------------
# Bearer auth header
# ---------------------------------------------------------------------------

@patch("dropitx.v1_client.httpx.request")
def test_create_sends_bearer_header(mock_req):
    mock_req.return_value = _mock_response(201, SAMPLE_DOC)
    v1_client.create_document("hello")
    call_kwargs = mock_req.call_args
    headers = call_kwargs.kwargs.get("headers", {})
    assert headers["Authorization"] == "Bearer shk_test123"


@patch("dropitx.v1_client.httpx.request")
def test_get_sends_bearer_header(mock_req):
    mock_req.return_value = _mock_response(200, SAMPLE_DOC)
    v1_client.get_document("abc123")
    call_kwargs = mock_req.call_args
    assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer shk_test123"


# ---------------------------------------------------------------------------
# Missing API key
# ---------------------------------------------------------------------------

def test_missing_api_key_raises_before_http():
    with patch.object(v1_client, "get_api_key", return_value=None):
        with pytest.raises(v1_client.V1ClientError) as exc_info:
            v1_client.create_document("hello")
    assert "set-key" in exc_info.value.message.lower() or "api_key" in exc_info.value.message.lower()


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

@patch("dropitx.v1_client.httpx.request")
def test_401_maps_to_key_hint(mock_req):
    resp = _mock_response(401)
    resp.json.return_value = {"detail": "Invalid API key prefix"}
    resp.text = '{"detail": "Invalid API key prefix"}'
    mock_req.return_value = resp
    with pytest.raises(v1_client.V1ClientError) as exc_info:
        v1_client.get_document("x")
    assert exc_info.value.status_code == 401
    assert "set-key" in exc_info.value.message


@patch("dropitx.v1_client.httpx.request")
def test_404_maps_to_not_found(mock_req):
    resp = _mock_response(404)
    resp.json.return_value = {"detail": "Document not found"}
    resp.text = "Document not found"
    mock_req.return_value = resp
    with pytest.raises(v1_client.V1ClientError) as exc_info:
        v1_client.get_document("missing")
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.message.lower()


@patch("dropitx.v1_client.httpx.request")
def test_410_maps_to_expired(mock_req):
    resp = _mock_response(410)
    resp.json.return_value = {"detail": "Document has expired"}
    resp.text = "Document has expired"
    mock_req.return_value = resp
    with pytest.raises(v1_client.V1ClientError) as exc_info:
        v1_client.get_document("old")
    assert exc_info.value.status_code == 410
    assert "expired" in exc_info.value.message.lower()


# ---------------------------------------------------------------------------
# Empty update guard
# ---------------------------------------------------------------------------

def test_update_with_no_fields_raises():
    with pytest.raises(v1_client.V1ClientError) as exc_info:
        v1_client.update_document("abc")
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# Content length guard
# ---------------------------------------------------------------------------

def test_create_content_too_long_raises():
    huge = "x" * (v1_client.MAX_CONTENT_LENGTH + 1)
    with pytest.raises(v1_client.V1ClientError) as exc_info:
        v1_client.create_document(huge)
    assert "limit" in exc_info.value.message.lower()


# ---------------------------------------------------------------------------
# create / list / update / delete happy paths
# ---------------------------------------------------------------------------

@patch("dropitx.v1_client.httpx.request")
def test_create_returns_document_result(mock_req):
    mock_req.return_value = _mock_response(201, SAMPLE_DOC)
    result = v1_client.create_document("<h1>Hi</h1>", filename="page.html", title="My Page")
    assert isinstance(result, v1_client.DocumentResult)
    assert result.slug == "abc123"
    assert result.url == "https://dropitx.test/s/abc123"


@patch("dropitx.v1_client.httpx.request")
def test_list_returns_multiple_results(mock_req):
    mock_req.return_value = _mock_response(200, [SAMPLE_DOC, {**SAMPLE_DOC, "slug": "def456"}])
    results = v1_client.list_documents(page=1, limit=10)
    assert len(results) == 2
    assert results[0].slug == "abc123"
    assert results[1].slug == "def456"
    # Verify query params
    call_kwargs = mock_req.call_args
    assert call_kwargs.kwargs["params"] == {"page": 1, "limit": 10}


@patch("dropitx.v1_client.httpx.request")
def test_update_returns_document_result(mock_req):
    updated = {**SAMPLE_DOC, "content": "<h1>Updated</h1>", "updated_at": "2026-01-03T00:00:00Z"}
    mock_req.return_value = _mock_response(200, updated)
    result = v1_client.update_document("abc123", content="<h1>Updated</h1>")
    assert result.content == "<h1>Updated</h1>"


@patch("dropitx.v1_client.httpx.request")
def test_delete_returns_none_on_success(mock_req):
    mock_req.return_value = _mock_response(204)
    result = v1_client.delete_document("abc123")
    assert result is None


# ---------------------------------------------------------------------------
# Revisions
# ---------------------------------------------------------------------------

@patch("dropitx.v1_client.httpx.request")
def test_list_revisions_returns_dict(mock_req):
    mock_req.return_value = _mock_response(200, {"revisions": [], "total": 0})
    result = v1_client.list_revisions("abc123", limit=5)
    assert result == {"revisions": [], "total": 0}
    call_kwargs = mock_req.call_args
    assert call_kwargs.kwargs["params"] == {"limit": 5, "page": 1}


@patch("dropitx.v1_client.httpx.request")
def test_get_revision_returns_dict(mock_req):
    mock_req.return_value = _mock_response(200, {"id": "rev-1", "revision": 2, "content": "old"})
    result = v1_client.get_revision("abc123", 2)
    assert result["revision"] == 2


@patch("dropitx.v1_client.httpx.request")
def test_restore_revision_returns_dict(mock_req):
    mock_req.return_value = _mock_response(200, {"id": "doc-1", "slug": "abc123", "revision": 3, "detail": "Restored"})
    result = v1_client.restore_revision("abc123", 2)
    assert result["detail"] == "Restored"
