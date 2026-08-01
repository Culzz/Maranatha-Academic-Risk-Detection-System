"""
Simple circuit breaker for external service calls.

States:
- CLOSED: Normal operation, requests pass through.
- OPEN: Failures exceeded threshold, requests fail-fast for recovery_timeout seconds.
- HALF_OPEN: After recovery_timeout, allow one request to test if service has recovered.
"""

import time
import logging
import threading

log = logging.getLogger(__name__)


class CircuitBreaker:
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, name: str = "default", failure_threshold: int = 5,
                 recovery_timeout: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = self.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0.0
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        with self._lock:
            if self._state == self.OPEN:
                if time.time() - self._last_failure_time >= self.recovery_timeout:
                    self._state = self.HALF_OPEN
                    log.info("Circuit breaker '%s' entering HALF_OPEN state", self.name)
            return self._state

    def can_execute(self) -> bool:
        s = self.state
        return s in (self.CLOSED, self.HALF_OPEN)

    def record_success(self):
        with self._lock:
            self._failure_count = 0
            if self._state != self.CLOSED:
                log.info("Circuit breaker '%s' CLOSED (service recovered)", self.name)
            self._state = self.CLOSED

    def record_failure(self):
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            if self._failure_count >= self.failure_threshold:
                if self._state != self.OPEN:
                    log.warning(
                        "Circuit breaker '%s' OPEN after %d failures (cooldown=%ds)",
                        self.name, self._failure_count, self.recovery_timeout,
                    )
                self._state = self.OPEN
