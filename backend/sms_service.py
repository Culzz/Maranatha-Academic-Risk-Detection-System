"""
SMS delivery via Termii API (optimised for Nigerian numbers).

- DEBUG=True  → OTP printed to console, returned to caller for easy testing.
- DEBUG=False → Real SMS sent via Termii. Falls back to console if no API key.
"""

import httpx
import time
import logging
from config import get_settings

log = logging.getLogger("maranatha")


def _normalise_ng(phone: str) -> str:
    """Normalise Nigerian numbers: +2348xxx / 08xxx → 2348xxx."""
    cleaned = phone.strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = "234" + cleaned[1:]
    return cleaned


def _termii_send(payload: dict, phone: str, max_attempts: int = 3) -> dict:
    """Send via Termii API with exponential backoff retry."""
    settings = get_settings()
    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(f"{settings.termii_base_url}/api/sms/send", json=payload)
                data = resp.json()
                if resp.status_code == 200:
                    log.info("SMS sent to %s — message_id: %s", phone, data.get("message_id", "n/a"))
                    return {"sent": True, "dev_otp": None}
                else:
                    log.warning("SMS attempt %d/%d to %s — %s: %s", attempt, max_attempts, phone, resp.status_code, data)
        except Exception as exc:
            log.warning("SMS attempt %d/%d to %s failed: %s", attempt, max_attempts, phone, exc)
        if attempt < max_attempts:
            time.sleep(2 ** (attempt - 1))
    log.error("SMS delivery failed after %d attempts to %s", max_attempts, phone)
    return {"sent": False, "dev_otp": None, "error": "All retry attempts failed"}


def send_otp(phone: str, otp: str) -> dict:
    """
    Send a 6-digit OTP to the given phone number.

    Returns:
        sent    — True if a real SMS was dispatched.
        dev_otp — The OTP code when in dev mode (None in production).
    """
    settings = get_settings()
    message = f"Your Maranatha University verification code is: {otp}. Valid for 10 minutes."

    if settings.debug:
        log.info("[DEV] OTP for %s: %s", phone, otp)
        return {"sent": False}

    if not settings.termii_api_key:
        log.warning("TERMII_API_KEY not set — OTP for %s: %s", phone, otp)
        return {"sent": False}

    payload = {
        "to": _normalise_ng(phone),
        "from": settings.termii_sender_id,
        "sms": message,
        "type": "plain",
        "channel": "generic",
        "api_key": settings.termii_api_key,
    }
    return _termii_send(payload, phone)


def send_sms_sync(phone: str, message: str) -> dict:
    """General-purpose SMS send (non-OTP). Used for notifications etc."""
    settings = get_settings()

    if settings.debug or not settings.termii_api_key:
        log.info("[SMS FALLBACK] To %s: %s", phone, message)
        return {"fallback": True, "phone": phone}

    payload = {
        "to": _normalise_ng(phone),
        "from": settings.termii_sender_id,
        "sms": message,
        "type": "plain",
        "channel": "generic",
        "api_key": settings.termii_api_key,
    }
    return _termii_send(payload, phone)
