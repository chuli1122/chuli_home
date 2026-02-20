from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.database import SessionLocal
from app.models.models import Assistant, ChatSession, Message, Settings

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

        logger.warning("No chat session found; creating one for assistant_id=%d", assistant_id)
        new_session = ChatSession(
            assistant_id=assistant_id,
            title="Telegram",
            type="chat",
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        return new_session.id, name
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
    telegram_message_id: list[int] | None = None,
) -> list[dict[str, Any]]:
    """
    Synchronous wrapper: pre-stores user message (with telegram_message_id),
    loads history, calls ChatService, returns assistant messages with db_id.
    """
    from app.routers.chat import _load_session_messages
    from app.services.chat_service import ChatService

    db = SessionLocal()
    try:
        # 1. Pre-store user message with telegram_message_id
        user_msg = Message(
            session_id=session_id,
            role="user",
            content=message,
            meta_info={},
            telegram_message_id=telegram_message_id,
        )
        db.add(user_msg)
        db.commit()
        db.refresh(user_msg)
        max_id_before = user_msg.id

        # 2. Load history (includes the message we just stored, all have 'id')
        chat_service = ChatService(db, assistant_name)
        messages = _load_session_messages(db, session_id)

        # 3. Call chat_completion — it skips persisting user msgs that have 'id'
        result = chat_service.chat_completion(
            session_id,
            messages,
            tool_calls=[],
            background_tasks=None,
            short_mode=short_mode,
        )

        # 4. Find NEW assistant messages created during this call
        new_assistant_msgs = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.id > max_id_before,
                Message.role == "assistant",
                Message.content != "",
            )
            .order_by(Message.id)
            .all()
        )

        # 5. Build result with db_ids
        new_results = [m for m in result if m.get("role") == "assistant" and "id" not in m]
        # Match results to DB messages (best effort, by order)
        for i, msg in enumerate(new_results):
            if i < len(new_assistant_msgs):
                msg["db_id"] = new_assistant_msgs[i].id

        return new_results
    finally:
        db.close()


async def call_chat_completion(
    session_id: int,
    assistant_name: str,
    message: str,
    short_mode: bool,
    telegram_message_id: list[int] | None = None,
) -> list[dict[str, Any]]:
    return await asyncio.to_thread(
        _chat_completion_sync,
        session_id,
        assistant_name,
        message,
        short_mode,
        telegram_message_id,
    )


# ── Telegram message ID helpers ──────────────────────────────────────────────

def _update_telegram_msg_id_sync(message_db_id: int, telegram_msg_id: int) -> None:
    db = SessionLocal()
    try:
        msg = db.get(Message, message_db_id)
        if msg:
            msg.telegram_message_id = [telegram_msg_id]
            db.commit()
    finally:
        db.close()


async def update_telegram_message_id(message_db_id: int, telegram_msg_id: int) -> None:
    return await asyncio.to_thread(_update_telegram_msg_id_sync, message_db_id, telegram_msg_id)


def _lookup_by_telegram_id_sync(telegram_msg_id: int) -> dict[str, Any] | None:
    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import JSONB as JSONB_TYPE

    db = SessionLocal()
    try:
        msg = (
            db.query(Message)
            .filter(Message.telegram_message_id.op("@>")(cast([telegram_msg_id], JSONB_TYPE)))
            .first()
        )
        if msg:
            return {"id": msg.id, "content": msg.content, "role": msg.role}
        return None
    finally:
        db.close()


async def lookup_by_telegram_message_id(telegram_msg_id: int) -> dict[str, Any] | None:
    return await asyncio.to_thread(_lookup_by_telegram_id_sync, telegram_msg_id)


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


# ── Undo (delete last round) ────────────────────────────────────────────────

def _undo_last_round_sync(assistant_id: int) -> int:
    """Delete the most recent user message and all assistant/system messages after it.
    Returns the number of deleted messages."""
    db = SessionLocal()
    try:
        session_id, _ = _get_session_info_sync(assistant_id)

        # Find the latest user message
        last_user = (
            db.query(Message)
            .filter(Message.session_id == session_id, Message.role == "user")
            .order_by(Message.id.desc())
            .first()
        )
        if not last_user:
            return 0

        # Delete that user message + all messages after it (assistant replies, system, etc.)
        deleted = (
            db.query(Message)
            .filter(Message.session_id == session_id, Message.id >= last_user.id)
            .delete(synchronize_session=False)
        )
        db.commit()
        return deleted
    finally:
        db.close()


async def undo_last_round(assistant_id: int) -> int:
    return await asyncio.to_thread(_undo_last_round_sync, assistant_id)
