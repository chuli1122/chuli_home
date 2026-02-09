from __future__ import annotations

from datetime import datetime, timedelta, timezone

TZ_EAST8 = timezone(timedelta(hours=8))


def format_datetime(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ_EAST8).isoformat()
