"""
Sentry error tracking integration.

Initialises Sentry SDK if SENTRY_DSN is configured in the environment.
Provides a helper to capture custom events and set user context.
"""

import logging

log = logging.getLogger("maranatha")

_initialized = False


def init_sentry(dsn: str = "", environment: str = "production", release: str = ""):
    """
    Initialise Sentry SDK. No-op if dsn is empty or sentry-sdk is not installed.
    """
    global _initialized
    if not dsn or _initialized:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            send_default_pii=False,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
            ],
        )
        _initialized = True
        log.info("Sentry error tracking initialised (env=%s)", environment)
    except ImportError:
        log.info("sentry-sdk not installed — error tracking disabled")
    except Exception as exc:
        log.warning("Sentry init failed: %s", exc)


def set_user_context(user_id: str, role: str = "", email: str = ""):
    """Set Sentry user context for the current scope."""
    try:
        import sentry_sdk
        sentry_sdk.set_user({"id": user_id, "role": role, "email": email})
    except Exception:
        pass


def capture_message(message: str, level: str = "info"):
    """Send a custom message to Sentry."""
    try:
        import sentry_sdk
        sentry_sdk.capture_message(message, level=level)
    except Exception:
        pass
