"""
Cryptographic utilities for encrypting sensitive data at rest.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) with a key
derived from the application SECRET_KEY via PBKDF2.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

log = logging.getLogger(__name__)

_fernet = None


def _get_fernet():
    """Lazy-init a Fernet instance derived from SECRET_KEY."""
    global _fernet
    if _fernet is None:
        from config import get_settings
        secret = get_settings().secret_key.encode()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"maranatha-mfa-encryption-salt",
            iterations=100_000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(secret))
        _fernet = Fernet(key)
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns a base64-encoded ciphertext."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns the original plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def decrypt_value_safe(ciphertext: str) -> tuple[str, bool]:
    """
    Attempt to decrypt. If it fails (old plaintext data), return the value as-is.

    Returns (value, was_encrypted) — callers can re-encrypt if was_encrypted is False.
    """
    try:
        return decrypt_value(ciphertext), True
    except (InvalidToken, Exception):
        return ciphertext, False
