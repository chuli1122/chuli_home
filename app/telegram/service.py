from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.database import SessionLocal
from app.models.models import Assistant, ChatSession, Settings

logger = logging.getLogger(__name__)


# ── Settings helpers ──────────────────────────────────────────────────────────

def _get_setting_sync(key: str, default: str = "") -> str:
    db = SessionLocal()
    try:
        row = db.query(Settings).filter(Settings.key == key).first()
        return row.value if row else default
    finally:
        db.close()


async def get_setting(key: str, default: str = "") -> str:
    return await asyncio.to_thread(_get_setting_sync, key, default)


# ── Session / Assistant lookup ────────────────────────────────────────────────

def _get_session_info_sync(assistant_id: int) -> tuple[int, str]:
    """
    Returns (session_id, assistant_name) for the given assistant.
    Finds the most recently updated session belonging to that assistant.
    """
    db = SessionLocal()
    try:
        # Look up assistant name
        assistant = db.get(Assistant, assistant_id)
        name = assistant.name if assistant else "unknown"

        # Find most recent session for this assistant
        session = (
            db.query(ChatSession)
            .filter(ChatSession.assistant_id == assistant_id)
            .order_by(ChatSession.updated_at.desc())
            .first()
        )
        if session:
            return session.id, name

        # No session exists — fall back to any recent session
        session = (
            db.query(ChatSession)
            .order_by(ChatSession.updated_at.desc())
            .first()
        )
        if session:
            logger.warning(
                "No session for assistant_id=%d, falling back to session %d",
                assistant_id, session.id,
            )
            return session.id, name

        logger.warning("No chat session found; defaulting to session_id=1")
        return 1, name
    finally:
        db.close()


async def get_session_info(assistant_id: int) -> tuple[int, str]:
    return await asyncio.to_thread(_get_session_info_sync, assistant_id)


# ── Chat completion ───────────────────────────────────────────────────────────

def _chat_completion_sync(
    session_id: int,
    assistant_name: str,
    message: str,
    short_mode: bool,
) -> list[dict[str, Any]]:
    """
    Synchronous wrapper: loads history, appends user message, calls ChatService.
    Returns list of assistant message dicts [{role, content}, ...].
    """
    from app.routers.chat import _load_session_messages
    from app.services.chat_service import ChatService

    db = SessionLocal()
    try:
        chat_service = ChatService(db, assistant_name)
        messages = _load_session_messages(db, session_id)
        messages.append({"role": "user", "content": message})
        result = chat_service.chat_completion(
            session_id,
            messages,
            tool_calls=[],
            background_tasks=None,
            short_mode=short_mode,
        )
        # Only return NEW assistant messages (history msgs have 'id' from DB)
        return [m for m in result if m.get("role") == "assistant" and "id" not in m]
    finally:
        db.close()


async def call_chat_completion(
    session_id: int,
    assistant_name: str,
    message: str,
    short_mode: bool,
) -> list[dict[str, Any]]:
    return await asyncio.to_thread(
        _chat_completion_sync,
        session_id,
        assistant_name,
        message,
        short_mode,
    )


# ── Buffer delay ──────────────────────────────────────────────────────────────

async def get_buffer_seconds() -> float:
    raw = await get_setting("telegram_buffer_seconds", "15")
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 15.0


async def get_chat_mode() -> str:
    raw = await get_setting("chat_mode", "long")
    return raw if raw in ("short", "long", "theater") else "long"
