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
from .service import call_chat_completion, get_buffer_seconds, get_session_info

logger = logging.getLogger(__name__)
router = Router()

# ── State ─────────────────────────────────────────────────────────────────────

# Short mode flag (in-memory for now, persisted via /short /long commands)
_short_mode: bool = False

# Per-chat short-message buffers
@dataclass
class _ChatBuffer:
    messages: list[str] = field(default_factory=list)
    timer_task: Optional[asyncio.Task] = None

_buffers: dict[int, _ChatBuffer] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_allowed(chat_id: int) -> bool:
    """Return True if this chat_id is allowed to interact with the bot."""
    if ALLOWED_CHAT_ID == 0:
        return True  # dev mode: allow everyone
    return chat_id == ALLOWED_CHAT_ID


async def _typing_loop(bot: Bot, chat_id: int, stop_event: asyncio.Event) -> None:
    """Send 'typing' action every ~4 s until stop_event fires."""
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


async def _send_reply(bot: Bot, chat_id: int, text: str, is_short: bool) -> None:
    """
    Send assistant reply to user.
    In short mode, split by [NEXT] and add small inter-message delays.
    """
    if not text.strip():
        return

    if is_short:
        parts = [p.strip() for p in text.split("[NEXT]") if p.strip()]
        for i, part in enumerate(parts):
            if i > 0:
                await asyncio.sleep(1.5)
            await bot.send_message(chat_id=chat_id, text=part)
    else:
        await bot.send_message(chat_id=chat_id, text=text)


async def _process_request(chat_id: int, combined_text: str, bot: Bot) -> None:
    """
    Core pipeline: show typing → call backend → send replies.
    """
    stop_event = asyncio.Event()
    typing_task = asyncio.create_task(_typing_loop(bot, chat_id, stop_event))

    try:
        session_id, assistant_name = await get_session_info()
        result_messages = await call_chat_completion(
            session_id, assistant_name, combined_text, short_mode=_short_mode
        )

        stop_event.set()
        typing_task.cancel()

        # Send each assistant message (may be multiple if tool calls happened)
        sent_count = 0
        for msg in result_messages:
            content = (msg.get("content") or "").strip()
            if not content:
                continue
            if sent_count > 0:
                await asyncio.sleep(1.0)
            await _send_reply(bot, chat_id, content, is_short=_short_mode)
            sent_count += 1

    except Exception as exc:
        stop_event.set()
        typing_task.cancel()
        logger.error("Error processing request for chat %s: %s", chat_id, exc, exc_info=True)
        try:
            await bot.send_message(chat_id=chat_id, text="❌ 出错了，请稍后再试")
        except Exception:
            pass


async def _buffer_fire(chat_id: int, bot: Bot, delay: float) -> None:
    """Wait `delay` seconds, then flush the buffer and process."""
    await asyncio.sleep(delay)
    buf = _buffers.pop(chat_id, None)
    if buf and buf.messages:
        combined = "\n".join(buf.messages)
        await _process_request(chat_id, combined, bot)


# ── Command handlers ──────────────────────────────────────────────────────────

@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    if not _is_allowed(message.chat.id):
        return
    await message.answer(
        "你好 ❤\n\n/short — 切换到短消息模式\n/long  — 切换到长消息模式",
        reply_markup=get_main_keyboard(),
    )


@router.message(Command("short"))
async def cmd_short(message: Message) -> None:
    if not _is_allowed(message.chat.id):
        return
    global _short_mode
    _short_mode = True
    await message.answer("✓ 已切换到短消息模式（缓冲后发送，[NEXT] 拆分）")


@router.message(Command("long"))
async def cmd_long(message: Message) -> None:
    if not _is_allowed(message.chat.id):
        return
    global _short_mode
    _short_mode = False
    await message.answer("✓ 已切换到长消息模式")


@router.message(Command("mode"))
async def cmd_mode(message: Message) -> None:
    if not _is_allowed(message.chat.id):
        return
    mode = "短消息" if _short_mode else "长消息"
    await message.answer(f"当前模式：{mode}")


# ── Main message handler ──────────────────────────────────────────────────────

@router.message()
async def handle_message(message: Message, bot: Bot) -> None:
    if not _is_allowed(message.chat.id):
        return

    # Ignore location shares (from the ずっと一緒 button)
    if message.location is not None:
        return

    text = (message.text or message.caption or "").strip()
    if not text:
        return

    chat_id = message.chat.id

    if _short_mode:
        # Buffer mode: collect messages, fire after inactivity
        delay = await get_buffer_seconds()
        buf = _buffers.setdefault(chat_id, _ChatBuffer())
        buf.messages.append(text)

        # Cancel existing pending timer
        if buf.timer_task and not buf.timer_task.done():
            buf.timer_task.cancel()

        # Schedule new timer
        buf.timer_task = asyncio.create_task(
            _buffer_fire(chat_id, bot, delay)
        )
    else:
        # Long mode: process immediately
        await _process_request(chat_id, text, bot)
