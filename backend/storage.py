"""storage.py — Storage abstraction layer.

Provides a pluggable backend for file storage.
- LocalStorage: saves to the local `uploads/` directory (current default)
- R2Storage: placeholder for Cloudflare R2 in production

Usage:
    from storage import get_storage
    storage = get_storage()
    path = storage.save("materials", filename, file_bytes)
    url = storage.get_url(path)
    storage.delete(path)
"""

import os
import uuid
from abc import ABC, abstractmethod
from typing import Optional


class StorageBackend(ABC):
    """Abstract base class for file storage backends."""

    @abstractmethod
    def save(self, folder: str, filename: str, data: bytes) -> str:
        """Save a file. Returns the storage path/key."""
        ...

    @abstractmethod
    def get(self, path: str) -> Optional[bytes]:
        """Read a file by its storage path. Returns bytes or None."""
        ...

    @abstractmethod
    def delete(self, path: str) -> bool:
        """Delete a file. Returns True if deleted."""
        ...

    @abstractmethod
    def get_url(self, path: str) -> str:
        """Return a URL or local path for serving the file."""
        ...

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if a file exists at the given path."""
        ...


class LocalStorage(StorageBackend):
    """Store files on the local filesystem under `uploads/`."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = base_dir or os.path.join(
            os.path.dirname(__file__), "uploads"
        )

    def save(self, folder: str, filename: str, data: bytes) -> str:
        dir_path = os.path.join(self.base_dir, folder)
        os.makedirs(dir_path, exist_ok=True)
        ext = os.path.splitext(filename)[1].lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        full_path = os.path.join(dir_path, unique_name)
        with open(full_path, "wb") as f:
            f.write(data)
        return full_path

    def get(self, path: str) -> Optional[bytes]:
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return f.read()

    def delete(self, path: str) -> bool:
        if os.path.exists(path):
            try:
                os.remove(path)
                return True
            except OSError:
                return False
        return False

    def get_url(self, path: str) -> str:
        return path

    def exists(self, path: str) -> bool:
        return os.path.exists(path)


class R2Storage(StorageBackend):
    """Placeholder for Cloudflare R2 storage (production).

    Configure via environment variables:
        R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
    """

    def __init__(self):
        self.bucket = os.getenv("R2_BUCKET_NAME", "maranatha-files")
        self.public_url = os.getenv("R2_PUBLIC_URL", "")
        # In production, initialize boto3 S3 client here with R2 endpoint

    def save(self, folder: str, filename: str, data: bytes) -> str:
        ext = os.path.splitext(filename)[1].lower()
        key = f"{folder}/{uuid.uuid4().hex}{ext}"
        # TODO: Upload to R2 via boto3 S3-compatible API
        raise NotImplementedError("R2 storage not yet configured.")

    def get(self, path: str) -> Optional[bytes]:
        raise NotImplementedError("R2 storage not yet configured.")

    def delete(self, path: str) -> bool:
        raise NotImplementedError("R2 storage not yet configured.")

    def get_url(self, path: str) -> str:
        return f"{self.public_url}/{path}" if self.public_url else path

    def exists(self, path: str) -> bool:
        raise NotImplementedError("R2 storage not yet configured.")


# ── Factory ─────────────────────────────────────────────────────────────────

_instance: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Return the configured storage backend (singleton)."""
    global _instance
    if _instance is None:
        backend = os.getenv("STORAGE_BACKEND", "local").lower()
        if backend == "r2":
            _instance = R2Storage()
        else:
            _instance = LocalStorage()
    return _instance
