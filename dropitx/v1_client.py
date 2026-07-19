"""V1 API client for DropItX documents.

Wraps the FastAPI /api/v1/documents endpoints with Bearer API-key auth.
All calls use a 60-second timeout (Render free-tier cold starts can be slow).
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from .config import get_api_key, get_api_url, get_frontend_url

# Document content hard limit (matches server-side DocumentCreate.max_length)
MAX_CONTENT_LENGTH = 5_000_000

# Request timeout — generous for Render cold starts
_TIMEOUT = 60


class V1ClientError(Exception):
    """Raised when a v1 API call fails."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class DocumentResult:
    """Maps the server's DocumentResponse JSON into a convenient object."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.id: str = data.get("id", "")
        self.slug: str = data.get("slug", "")
        self.filename: Optional[str] = data.get("filename")
        self.title: Optional[str] = data.get("title")
        self.content: str = data.get("content", "")
        self.is_private: bool = data.get("is_private", False)
        self.view_count: int = data.get("view_count", 0)
        self.created_at: str = str(data.get("created_at", ""))
        self.updated_at: str = str(data.get("updated_at", ""))
        self.expires_at: Optional[str] = data.get("expires_at")
        # url is NOT in the API response — client constructs it
        self.url: str = f"{get_frontend_url()}/s/{self.slug}" if self.slug else ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a plain dict (for MCP tool responses)."""
        return {
            "id": self.id,
            "slug": self.slug,
            "url": self.url,
            "filename": self.filename,
            "title": self.title,
            "is_private": self.is_private,
            "view_count": self.view_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_auth_header() -> dict[str, str]:
    """Return Authorization header or raise with an actionable message."""
    key = get_api_key()
    if not key:
        raise V1ClientError(
            401,
            "No API key configured. Set one with `dropitx config set-key <key>` "
            "or the DROPITX_API_KEY environment variable.",
        )
    return {"Authorization": f"Bearer {key}"}


def _request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    """Send an authenticated request, mapping errors to V1ClientError."""
    url = f"{get_api_url()}/api/v1{path}"
    headers = kwargs.pop("headers", {})
    headers.update(_get_auth_header())

    try:
        resp = httpx.request(method, url, headers=headers, timeout=_TIMEOUT, **kwargs)
    except httpx.RequestError as exc:
        raise V1ClientError(0, f"Network error: {exc}") from exc

    if resp.status_code >= 400:
        _raise_for_status(resp)

    return resp


def _raise_for_status(resp: httpx.Response) -> None:
    """Map HTTP error responses to actionable V1ClientError messages."""
    status = resp.status_code

    try:
        detail = resp.json().get("detail", resp.text)
    except Exception:
        detail = resp.text or "Unknown error"

    if status == 401:
        raise V1ClientError(
            status,
            f"Invalid or missing API key ({detail}). "
            "Run `dropitx config set-key <key>` or set DROPITX_API_KEY.",
        )
    if status == 404:
        raise V1ClientError(status, f"Not found: {detail}")
    if status == 410:
        raise V1ClientError(status, f"Document has expired: {detail}")

    raise V1ClientError(status, f"API error ({status}): {detail}")


# ---------------------------------------------------------------------------
# Public CRUD functions
# ---------------------------------------------------------------------------

def create_document(
    content: str,
    *,
    filename: Optional[str] = None,
    title: Optional[str] = None,
    is_private: bool = False,
    expires_in: Optional[int] = None,
) -> DocumentResult:
    """Create a new document via POST /api/v1/documents.

    Args:
        content:  HTML or Markdown content (max 5,000,000 chars).
        filename: Optional filename; extension drives rendering (.html/.md).
        title:    Optional human-readable title.
        is_private: If True, hidden from search/public listings.
        expires_in: Optional expiry in seconds from now.

    Returns:
        DocumentResult with the created document.
    """
    if len(content) > MAX_CONTENT_LENGTH:
        raise V1ClientError(
            400,
            f"Content exceeds {MAX_CONTENT_LENGTH:,} character limit.",
        )

    payload: dict[str, Any] = {"content": content, "is_private": is_private}
    if filename:
        payload["filename"] = filename
    if title:
        payload["title"] = title
    if expires_in is not None:
        payload["expires_in"] = expires_in

    resp = _request("POST", "/documents", json=payload)
    return DocumentResult(resp.json())


def get_document(slug: str) -> DocumentResult:
    """Fetch a single document by slug via GET /api/v1/documents/{slug}."""
    resp = _request("GET", f"/documents/{slug}")
    return DocumentResult(resp.json())


def list_documents(page: int = 1, limit: int = 20) -> list[DocumentResult]:
    """List documents via GET /api/v1/documents.

    Args:
        page:  Page number (1-based, server default).
        limit: Items per page (1–100, server default 20).
    """
    resp = _request("GET", "/documents", params={"page": page, "limit": limit})
    return [DocumentResult(item) for item in resp.json()]


def update_document(
    slug: str,
    *,
    content: Optional[str] = None,
    filename: Optional[str] = None,
    title: Optional[str] = None,
    is_private: Optional[bool] = None,
) -> DocumentResult:
    """Update a document via PATCH /api/v1/documents/{slug}.

    At least one field must be provided (the server returns 400 otherwise).
    When content changes, the server saves a revision first.
    """
    if content is not None and len(content) > MAX_CONTENT_LENGTH:
        raise V1ClientError(
            400,
            f"Content exceeds {MAX_CONTENT_LENGTH:,} character limit.",
        )

    payload: dict[str, Any] = {}
    if content is not None:
        payload["content"] = content
    if filename is not None:
        payload["filename"] = filename
    if title is not None:
        payload["title"] = title
    if is_private is not None:
        payload["is_private"] = is_private

    if not payload:
        raise V1ClientError(400, "No fields to update.")

    resp = _request("PATCH", f"/documents/{slug}", json=payload)
    return DocumentResult(resp.json())


def delete_document(slug: str) -> None:
    """Delete a document via DELETE /api/v1/documents/{slug}."""
    _request("DELETE", f"/documents/{slug}")


# ---------------------------------------------------------------------------
# Revisions
# ---------------------------------------------------------------------------

def list_revisions(slug: str, page: int = 1, limit: int = 20) -> dict:
    """List revisions for a document via GET /api/v1/documents/{slug}/revisions.

    Returns a dict with 'revisions' (list) and 'total' (int).
    """
    resp = _request(
        "GET", f"/documents/{slug}/revisions",
        params={"page": page, "limit": limit},
    )
    return resp.json()


def get_revision(slug: str, revision: int) -> dict:
    """Fetch a specific revision via GET /api/v1/documents/{slug}/revisions/{revision}."""
    resp = _request("GET", f"/documents/{slug}/revisions/{revision}")
    return resp.json()


def restore_revision(slug: str, revision: int) -> dict:
    """Restore a document to a specific revision via POST /api/v1/documents/{slug}/revisions/{revision}/restore.

    This saves the current state as a new revision, then replaces the live
    content with the target revision's content.
    """
    resp = _request("POST", f"/documents/{slug}/revisions/{revision}/restore")
    return resp.json()
