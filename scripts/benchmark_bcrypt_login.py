"""
Benchmark bcrypt login latency (verify time) across cost factors.

Measures average/p95 bcrypt.checkpw latency for:
- cost 10
- cost 12
- current library default cost

Usage:
    python scripts/benchmark_bcrypt_login.py

Optional env vars:
    BCRYPT_BENCH_ITERS=30
"""

from __future__ import annotations

import os
import re
import statistics
import time
from typing import Iterable

import bcrypt


def _extract_rounds(bcrypt_hash: bytes) -> int:
    """Extract bcrypt cost from hash string like $2b$12$..."""
    match = re.match(rb"^\$2[abxy]\$(\d\d)\$", bcrypt_hash)
    if not match:
        raise ValueError("Unable to parse bcrypt cost from hash.")
    return int(match.group(1))


def _measure_verify_ms(password: bytes, bcrypt_hash: bytes, iters: int) -> list[float]:
    samples: list[float] = []
    for _ in range(iters):
        t0 = time.perf_counter()
        ok = bcrypt.checkpw(password, bcrypt_hash)
        t1 = time.perf_counter()
        if not ok:
            raise RuntimeError("bcrypt.checkpw returned False for a known-good password.")
        samples.append((t1 - t0) * 1000.0)
    return samples


def _p95(samples: Iterable[float]) -> float:
    arr = sorted(samples)
    if not arr:
        return 0.0
    if len(arr) == 1:
        return arr[0]
    idx = max(0, int(round(0.95 * (len(arr) - 1))))
    return arr[idx]


def run() -> None:
    password = b"BenchmarkPassword!2026"
    iters = int(os.getenv("BCRYPT_BENCH_ITERS", "30"))

    default_hash = bcrypt.hashpw(password, bcrypt.gensalt())
    default_rounds = _extract_rounds(default_hash)

    configs = [
        (10, bcrypt.hashpw(password, bcrypt.gensalt(rounds=10))),
        (12, bcrypt.hashpw(password, bcrypt.gensalt(rounds=12))),
        (default_rounds, default_hash),
    ]

    seen = set()
    rows = []
    for rounds, bcrypt_hash in configs:
        if rounds in seen:
            continue
        seen.add(rounds)
        samples = _measure_verify_ms(password, bcrypt_hash, iters)
        rows.append({
            "rounds": rounds,
            "avg_ms": statistics.fmean(samples),
            "p95_ms": _p95(samples),
            "min_ms": min(samples),
            "max_ms": max(samples),
        })

    rows.sort(key=lambda r: r["rounds"])

    print("bcrypt login-latency benchmark (checkpw)")
    print(f"iterations per config: {iters}")
    print(f"library default cost: {default_rounds}")
    print()
    print(f"{'cost':<6} {'avg_ms':>10} {'p95_ms':>10} {'min_ms':>10} {'max_ms':>10}")
    print("-" * 52)
    for row in rows:
        print(
            f"{row['rounds']:<6} "
            f"{row['avg_ms']:>10.2f} "
            f"{row['p95_ms']:>10.2f} "
            f"{row['min_ms']:>10.2f} "
            f"{row['max_ms']:>10.2f}"
        )


if __name__ == "__main__":
    run()
