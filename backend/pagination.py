"""Standard pagination helper for consistent API responses."""

from sqlalchemy.orm import Query
from typing import Callable, Optional


def paginate(query: Query, skip: int = 0, limit: int = 100, transform: Optional[Callable] = None):
    """
    Execute a paginated query and return a standardised envelope.

    Args:
        query:     SQLAlchemy query (before .all()).
        skip:      Number of rows to skip.
        limit:     Maximum rows to return (hard cap at 500 to prevent unbounded queries).
        transform: Optional callable to apply to each row.

    Returns:
        dict with {items, total, skip, limit, has_more}
    """
    limit = min(limit, 500)  # Hard cap — prevents unbounded DB scans regardless of caller input
    total = query.count()
    rows = query.offset(skip).limit(limit).all()
    items = [transform(r) for r in rows] if transform else rows
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": (skip + limit) < total,
    }
