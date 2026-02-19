from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from .config import ALLOWED_CHAT_ID, MINI_APP_BASE_URL
from .keyboards import get_main_keyboard
from .service import call_chat_completion, get_buffer_seconds, get_session_info

logger = logging.getLogger(__name__)
router = Router()

# ── Per-bot state ────────────────────────────────────────────────────────────

@dataclass
class _ChatBuffer:
    messages: list[str] = field(default_factory=list)
    timer_task: Optional[asyncio.Task] = None


@dataclass
class _BotState:
    short_mode: bool = False
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


async def _send_reply(bot: Bot, chat_id: int, text: str, is_short: bool) -> None:
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


async def _process_request(
    chat_id: int,
    combined_text: str,
    bot: Bot,
    bot_key: str,
    assistant_id: int,
) -> None:
    state = _get_state(bot_key)
    stop_event = asyncio.Event()
    typing_task = asyncio.create_task(_typing_loop(bot, chat_id, stop_event))

    try:
        session_id, assistant_name = await get_session_info(assistant_id)
        result_messages = await call_chat_completion(
            session_id, assistant_name, combined_text, short_mode=state.short_mode
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
            await _send_reply(bot, chat_id, content, is_short=state.short_mode)
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
        await _process_request(chat_id, combined, bot, bot_key, assistant_id)


# ── Command handlers ─────────────────────────────────────────────────────────

@router.message(Command("start"))
async def cmd_start(message: Message, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    await message.answer(
        "你好 ❤\n\n/short — 切换到短消息模式\n/long  — 切换到长消息模式",
        reply_markup=get_main_keyboard(),
    )


@router.message(Command("short"))
async def cmd_short(message: Message, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    state = _get_state(bot_key)
    state.short_mode = True
    await message.answer("✓ 已切换到短消息模式（缓冲后发送，[NEXT] 拆分）")


@router.message(Command("long"))
async def cmd_long(message: Message, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    state = _get_state(bot_key)
    state.short_mode = False
    await message.answer("✓ 已切换到长消息模式")


@router.message(Command("app"))
async def cmd_app(message: Message, bot: Bot, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="打开 WHISPER",
            web_app=WebAppInfo(url=MINI_APP_BASE_URL),
        )]
    ])
    await message.answer("点击按钮打开：", reply_markup=keyboard)
    # Also set the menu button programmatically
    try:
        await bot.set_chat_menu_button(
            chat_id=message.chat.id,
            menu_button=MenuButtonWebApp(
                text="🐾",
                web_app=WebAppInfo(url=MINI_APP_BASE_URL),
            ),
        )
    except Exception as exc:
        logger.warning("set_chat_menu_button failed: %s", exc)


@router.message(Command("mode"))
async def cmd_mode(message: Message, bot_key: str, **_kw) -> None:
    if not _is_allowed(message.chat.id):
        return
    state = _get_state(bot_key)
    mode = "短消息" if state.short_mode else "长消息"
    await message.answer(f"当前模式：{mode}")


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

    chat_id = message.chat.id
    state = _get_state(bot_key)

    if state.short_mode:
        delay = await get_buffer_seconds()
        buf = state.buffers.setdefault(chat_id, _ChatBuffer())
        buf.messages.append(text)

        if buf.timer_task and not buf.timer_task.done():
            buf.timer_task.cancel()

        buf.timer_task = asyncio.create_task(
            _buffer_fire(chat_id, bot, delay, bot_key, assistant_id)
        )
    else:
        await _process_request(chat_id, text, bot, bot_key, assistant_id)
