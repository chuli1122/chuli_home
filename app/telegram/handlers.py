from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message

from .config import ALLOWED_CHAT_ID
from .keyboards import get_main_keyboard
from .service import (
    call_chat_completion,
    get_buffer_seconds,
    get_chat_mode,
    get_session_info,
    lookup_by_telegram_message_id,
    undo_last_round,
    update_telegram_message_id,
)

logger = logging.getLogger(__name__)
router = Router()

# ── Per-bot state ────────────────────────────────────────────────────────────

@dataclass
class _ChatBuffer:
    messages: list[str] = field(default_factory=list)
    message_ids: list[int] = field(default_factory=list)
    timer_task: Optional[asyncio.Task] = None


@dataclass
class _BotState:
    buffers: dict[int, _ChatBuffer] = field(default_factory=dict)


_bot_states: dict[str, _BotState] = {}


def _get_state(bot_key: str) -> _BotState:
    if bot_key not in _bot_states:
        _bot_states[bot_key] = _BotState()
    return _bot_states[bot_key]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_allowed(chat_id: int) -> bool:
    if ALLOWED_CHAT_ID == 0:
        return True
    return chat_id == ALLOWED_CHAT_ID


async def _typing_loop(bot: Bot, chat_id: int, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await bot.send_chat_action(chat_id=chat_id, action="typing")
        except Exception as exc:
            logger.debug("typing_loop error: %s", exc)
        try:
            await asyncio.wait_for(
                asyncio.shield(stop_event.wait()), timeout=4.0
            )
        except asyncio.TimeoutError:
            pass


async def _send_reply(bot: Bot, chat_id: int, text: str, is_short: bool) -> list[int]:
    """Send reply and return list of telegram message IDs."""
    tg_ids: list[int] = []
    if not text.strip():
        return tg_ids
    if is_short:
        parts = [p.strip() for p in text.split("[NEXT]") if p.strip()]
        for i, part in enumerate(parts):
            if i > 0:
                await asyncio.sleep(1.5)
            sent = await bot.send_message(chat_id=chat_id, text=part)
            tg_ids.append(sent.message_id)
    else:
        sent = await bot.send_message(chat_id=chat_id, text=text)
        tg_ids.append(sent.message_id)
    return tg_ids


async def _process_request(
    chat_id: int,
    combined_text: str,
    bot: Bot,
    bot_key: str,
    assistant_id: int,
    is_short: bool = False,
    telegram_message_id: list[int] | None = None,
) -> None:
    stop_event = asyncio.Event()
    typing_task = asyncio.create_task(_typing_loop(bot, chat_id, stop_event))

    try:
        session_id, assistant_name = await get_session_info(assistant_id)
        result_messages = await call_chat_completion(
            session_id, assistant_name, combined_text,
            short_mode=is_short,
            telegram_message_id=telegram_message_id,
        )

        stop_event.set()
        typing_task.cancel()

        sent_count = 0
        for msg in result_messages:
            content = (msg.get("content") or "").strip()
            if not content:
                continue
            if sent_count > 0:
                await asyncio.sleep(1.0)
            tg_ids = await _send_reply(bot, chat_id, content, is_short=is_short)
            # Write back telegram message ID to the assistant message in DB
            if tg_ids and msg.get("db_id"):
                await update_telegram_message_id(msg["db_id"], tg_ids[-1])
            sent_count += 1

    except Exception as exc:
        stop_event.set()
        typing_task.cancel()
        logger.error("Error processing request for chat %s (bot=%s): %s", chat_id, bot_key, exc, exc_info=True)
        try:
            await bot.send_message(chat_id=chat_id, text="❌ 出错了，请稍后再试")
        except Exception:
            pass


async def _buffer_fire(chat_id: int, bot: Bot, delay: float, bot_key: str, assistant_id: int) -> None:
    await asyncio.sleep(delay)
    state = _get_state(bot_key)
    buf = state.buffers.pop(chat_id, None)
    if buf and buf.messages:
        combined = "\n".join(buf.messages)
        tg_ids = buf.message_ids if buf.message_ids else None
        mode = await get_chat_mode()
        await _process_request(
            chat_id, combined, bot, bot_key, assistant_id,
            is_short=(mode == "short"),
            telegram_message_id=tg_ids,
        )


# ── Command handlers ─────────────────────────────────────────────────────────

@router.message(Command("start"))
async def cmd_start(message: Message, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    await message.answer(
        "你好 ❤",
        reply_markup=get_main_keyboard(),
    )


@router.message(Command("undo"))
async def cmd_undo(message: Message, assistant_id: int, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    deleted = await undo_last_round(assistant_id)
    if deleted:
        await message.answer(f"已撤回 {deleted} 条消息")
    else:
        await message.answer("没有可撤回的消息")


# ── Main message handler ─────────────────────────────────────────────────────

@router.message()
async def handle_message(message: Message, bot: Bot, bot_key: str, assistant_id: int, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return

    if message.location is not None:
        return

    text = (message.text or message.caption or "").strip()
    if not text:
        return

    # Handle reply/quote — look up the quoted message by telegram_message_id
    if message.reply_to_message:
        quoted_tg_id = message.reply_to_message.message_id
        quoted = await lookup_by_telegram_message_id(quoted_tg_id)
        if quoted:
            quote_prefix = f"[引用消息 id={quoted['id']}] {quoted['content']}"
            text = f"{quote_prefix}\n{text}"

    chat_id = message.chat.id
    state = _get_state(bot_key)
    mode = await get_chat_mode()

    if mode == "short":
        delay = await get_buffer_seconds()
        buf = state.buffers.setdefault(chat_id, _ChatBuffer())
        buf.messages.append(text)
        buf.message_ids.append(message.message_id)

        if buf.timer_task and not buf.timer_task.done():
            buf.timer_task.cancel()

        buf.timer_task = asyncio.create_task(
            _buffer_fire(chat_id, bot, delay, bot_key, assistant_id)
        )
    else:
        await _process_request(
            chat_id, text, bot, bot_key, assistant_id,
            is_short=False,
            telegram_message_id=[message.message_id],
        )
