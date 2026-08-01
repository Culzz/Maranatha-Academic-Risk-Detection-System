"""
Upload validation utilities — magic-byte checking via the `filetype` library.

Usage:
    from upload_utils import validate_upload

    validate_upload(file_bytes, filename, allowed={"image", "document"})
"""

import filetype
from fastapi import HTTPException

# Allowed MIME groups → concrete MIME types
# SVG is intentionally excluded from "image" — SVG can contain embedded JavaScript
# and is a stored XSS vector when served with image/svg+xml content type.
ALLOWED_TYPES = {
    "image": {
        "image/jpeg", "image/png", "image/gif", "image/webp",
    },
    "document": {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        # .xlsx
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
        "text/plain",
    },
    "spreadsheet": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
    },
}

# Extensions that filetype can't detect via magic bytes (text-based formats)
# SVG removed — must not be served with image/svg+xml (XSS risk)
TEXT_EXTENSIONS = {".csv", ".txt"}


def validate_upload(
    content: bytes,
    filename: str,
    allowed: set[str] | None = None,
    max_size_mb: int = 10,
) -> str | None:
    """
    Validate an uploaded file using magic bytes.

    Args:
        content:   Raw file bytes.
        filename:  Original filename (used as fallback for text formats).
        allowed:   Set of allowed groups from ALLOWED_TYPES (e.g. {"image", "document"}).
                   If None, all groups are allowed.
        max_size_mb: Maximum file size in megabytes.

    Returns:
        Detected MIME type string.

    Raises:
        HTTPException 400 if validation fails.
    """
    # Size check
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum {max_size_mb}MB allowed.")

    if len(content) == 0:
        raise HTTPException(400, "Empty file.")

    # Build allowed MIME set
    if allowed is None:
        allowed_mimes = set()
        for group in ALLOWED_TYPES.values():
            allowed_mimes |= group
    else:
        allowed_mimes = set()
        for group_name in allowed:
            allowed_mimes |= ALLOWED_TYPES.get(group_name, set())

    # Detect via magic bytes
    kind = filetype.guess(content)
    if kind is not None:
        if kind.mime not in allowed_mimes:
            raise HTTPException(400, f"File type '{kind.mime}' is not allowed.")
        return kind.mime

    # Fallback for text-based formats that have no magic bytes
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in TEXT_EXTENSIONS:
        # Map extension to MIME
        ext_mime = {".csv": "text/csv", ".txt": "text/plain"}
        mime = ext_mime.get(ext)
        if mime and mime in allowed_mimes:
            return mime

    raise HTTPException(400, "Unrecognized or disallowed file type.")
