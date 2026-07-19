"""MCP server exposing DropItX document tools for AI agents.

Run with: dropitx mcp  (requires the 'dropitx[mcp]' extra, Python ≥3.10)
Stdio transport only — stdout is reserved for the MCP protocol.
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from .v1_client import (
    MAX_CONTENT_LENGTH,
    DocumentResult,
    V1ClientError,
    create_document as _create_document,
    delete_document as _delete_document,
    get_document as _get_document,
    get_revision as _get_revision,
    list_documents as _list_documents,
    list_revisions as _list_revisions,
    restore_revision as _restore_revision,
    update_document as _update_document,
)

mcp = FastMCP("dropitx")

# Content preview length for list_pages (context-window safe)
_PREVIEW_CHARS = 200


def _result_to_publish_dict(result: DocumentResult) -> dict:
    """Compact dict for publish/update responses — includes url, excludes content."""
    return {
        "url": result.url,
        "slug": result.slug,
        "title": result.title,
        "filename": result.filename,
        "expires_at": result.expires_at,
    }


def _result_to_full_dict(result: DocumentResult) -> dict:
    """Full dict for get_page — includes content."""
    return {
        "url": result.url,
        "slug": result.slug,
        "title": result.title,
        "filename": result.filename,
        "content": result.content,
        "is_private": result.is_private,
        "view_count": result.view_count,
        "created_at": result.created_at,
        "updated_at": result.updated_at,
        "expires_at": result.expires_at,
    }


def _result_to_preview_dict(result: DocumentResult) -> dict:
    """Metadata + truncated content preview for list_pages."""
    preview = result.content[:_PREVIEW_CHARS]
    if len(result.content) > _PREVIEW_CHARS:
        preview += "..."
    return {
        "url": result.url,
        "slug": result.slug,
        "title": result.title,
        "filename": result.filename,
        "content_preview": preview,
        "content_size": len(result.content),
        "view_count": result.view_count,
        "updated_at": result.updated_at,
    }


def _error_dict(exc: V1ClientError) -> dict:
    """Wrap a V1ClientError into a tool-safe error dict."""
    return {"error": exc.message}


@mcp.tool()
def publish_page(
    content: str,
    title: str | None = None,
    filename: str | None = None,
    is_private: bool = False,
    expires_in_seconds: int | None = None,
) -> dict:
    """Publish HTML or Markdown content to DropItX. Returns a stable, shareable URL.

    Content limit: 5,000,000 characters. The filename extension drives how the
    page renders (e.g. .html renders as a webpage, .md as Markdown). If no
    filename is given, the server assigns one. Pages expire after 30 days by
    default unless expires_in_seconds is set.

    Args:
        content: HTML or Markdown content.
        title: Optional human-readable title.
        filename: Optional filename (extension drives rendering: .html, .md).
        is_private: If true, hidden from public search and listings.
        expires_in_seconds: Optional custom expiry in seconds from now.

    Returns:
        Dict with url, slug, title, filename, expires_at.
    """
    try:
        result = _create_document(
            content,
            filename=filename,
            title=title,
            is_private=is_private,
            expires_in=expires_in_seconds,
        )
        return _result_to_publish_dict(result)
    except V1ClientError as exc:
        return _error_dict(exc)


@mcp.tool()
def update_page(
    slug: str,
    content: str,
    title: str | None = None,
    filename: str | None = None,
) -> dict:
    """Redeploy new content to an existing DropItX page at the SAME URL.

    The previous version is automatically saved as a revision (retrievable via
    the v1 revisions API). At least content or title must be provided.

    Args:
        slug: The page slug (from publish_page response).
        content: New HTML or Markdown content (max 5,000,000 chars).
        title: Optional new title.
        filename: Optional new filename (changes rendering mode).

    Returns:
        Dict with url, slug, title, filename, expires_at.
    """
    try:
        result = _update_document(slug, content=content, title=title, filename=filename)
        return _result_to_publish_dict(result)
    except V1ClientError as exc:
        return _error_dict(exc)


@mcp.tool()
def get_page(slug: str) -> dict:
    """Fetch the full content and metadata of a DropItX page by slug.

    Args:
        slug: The page slug.

    Returns:
        Dict with url, slug, title, filename, content (full), metadata.
    """
    try:
        result = _get_document(slug)
        return _result_to_full_dict(result)
    except V1ClientError as exc:
        return _error_dict(exc)


@mcp.tool()
def list_pages(limit: int = 20) -> list[dict]:
    """List your DropItX pages. Returns metadata + content preview only.

    Never returns full content bodies — previews are truncated to 200 characters
    to keep agent context windows manageable.

    Args:
        limit: Maximum pages to return (1–100, default 20).

    Returns:
        List of dicts with url, slug, title, content_preview, content_size.
    """
    try:
        results = _list_documents(page=1, limit=limit)
        return [_result_to_preview_dict(r) for r in results]
    except V1ClientError as exc:
        return [_error_dict(exc)]


@mcp.tool()
def delete_page(slug: str) -> dict:
    """Permanently delete a DropItX page and its storage.

    Args:
        slug: The page slug to delete.

    Returns:
        Dict: {"deleted": true, "slug": ...} or {"error": ...}.
    """
    try:
        _delete_document(slug)
        return {"deleted": True, "slug": slug}
    except V1ClientError as exc:
        return _error_dict(exc)


def run_server() -> None:
    """Start the MCP stdio server."""
    mcp.run()


# ---------------------------------------------------------------------------
# Revision tools
# ---------------------------------------------------------------------------

@mcp.tool()
def list_revisions(slug: str, limit: int = 20) -> dict:
    """List all saved revisions for a DropItX page.

    Revisions are created automatically each time you call update_page. Use this
    to see the version history — revision number, timestamp, filename, and title
    for each saved version. Content previews are truncated to 200 chars.

    Args:
        slug: The page slug.
        limit: Maximum revisions to return (1–100, default 20).

    Returns:
        Dict with 'revisions' (list of metadata) and 'total' count.
    """
    try:
        data = _list_revisions(slug, limit=limit)
        # Truncate content in each revision for context-window safety
        for rev in data.get("revisions", []):
            content = rev.get("content", "")
            rev["content_preview"] = content[:_PREVIEW_CHARS] + ("..." if len(content) > _PREVIEW_CHARS else "")
            rev["content_size"] = len(content)
            del rev["content"]
        return data
    except V1ClientError as exc:
        return _error_dict(exc)


@mcp.tool()
def get_revision(slug: str, revision: int) -> dict:
    """Fetch the full content of a specific revision of a DropItX page.

    Args:
        slug: The page slug.
        revision: The revision number (from list_revisions).

    Returns:
        Dict with revision number, full content, filename, title, created_at.
    """
    try:
        return _get_revision(slug, revision)
    except V1ClientError as exc:
        return _error_dict(exc)


@mcp.tool()
def restore_revision(slug: str, revision: int) -> dict:
    """Restore a DropItX page to a previous revision.

    The current live content is saved as a new revision before the restore
    happens, so nothing is lost. After restore, the page URL serves the
    restored content.

    Args:
        slug: The page slug.
        revision: The revision number to restore.

    Returns:
        Dict with the new revision number and confirmation message.
    """
    try:
        return _restore_revision(slug, revision)
    except V1ClientError as exc:
        return _error_dict(exc)
