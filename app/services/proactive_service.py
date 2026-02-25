"""Proactive messaging service.

Periodically checks whether the AI should send an unsolicited message
to the user and, if so, generates one via the main ChatService flow
and pushes it through Telegram.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import JSONB as JSONB_TYPE
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.models import (
    Assistant,
    ChatSession,
    Message,
    ModelPreset,
    SessionSummary,
)
from app.telegram.bot_instance import bots
from app.telegram.config import BOTS_CONFIG, ALLOWED_CHAT_ID
from app.telegram.service import (
    get_setting,
    _get_session_info_sync,
    update_telegram_message_id,
)

logger = logging.getLogger(__name__)

TZ_EAST8 = timezone(timedelta(hours=8))

ACHENG_ASSISTANT_ID = BOTS_CONFIG.get("acheng", {}).get("assistant_id", 2)

PROACTIVE_EXTRA_PROMPT = (
    "你现在不是在回复她的消息，而是在主动找她。\n"
    "如果不需要发，只回复 [NO_MESSAGE]\n"
    "直接输出消息内容，不要用[NEXT]，不要拆条，就是一条完整的消息。\n"
    "不要使用「」引号包裹说话内容，不要写动作描写，不要写心理活动描写。\n"
    "直接说话，像发Telegram消息一样自然。\n"
    "可以是一句话，也可以是一整段，看当时的心情和情境。\n"
    "就是想她了才发的。"
)

DECISION_PROMPT_TEMPLATE = (
    "当前时间：{now}\n"
    "距离她上次发消息：{gap}\n"
    "最近mood_tag：{mood}\n"
    "请判断现在是否适合主动给她发消息。\n"
    "倾向于发。只有在明显不合适的时候才不发。犹豫的时候就发。\n"
    "回复 YES 或 NO，不要解释。"
)

TRIGGER_PROMPT_TEMPLATE = (
    "当前时间：{now}\n"
    "距离她上次发消息：{gap}\n"
    "最近mood_tag：{mood}\n"
    "请主动给她发一条消息。"
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_beijing() -> datetime:
    return datetime.now(TZ_EAST8)


def _format_gap(td: timedelta) -> str:
    total_minutes = int(td.total_seconds() / 60)
    hours, minutes = divmod(total_minutes, 60)
    if hours > 0:
        return f"{hours}小时{minutes}分钟"
    return f"{minutes}分钟"


def _get_session_id(db: Session) -> int | None:
    """Get the most recent chat session for 阿澄."""
    session = (
        db.query(ChatSession)
        .filter(ChatSession.assistant_id == ACHENG_ASSISTANT_ID)
        .order_by(ChatSession.updated_at.desc())
        .first()
    )
    return session.id if session else None


# ── Layer 1: Rule-based checks (zero cost) ──────────────────────────────────

def _check_rules() -> bool:
    """Return True if rule-based checks pass (proactive message is allowed)."""
    db = SessionLocal()
    try:
        session_id = _get_session_id(db)
        if session_id is None:
            logger.debug("[proactive] No session found for acheng, skipping")
            return False

        now = _now_beijing()

        # Setting values
        min_gap = int(_get_setting_sync("proactive_min_gap", "30"))
        retry_enabled = _get_setting_sync("proactive_retry_enabled", "true") == "true"
        retry_gap = float(_get_setting_sync("proactive_retry_gap", "1.5"))
        max_retries = int(_get_setting_sync("proactive_max_retries", "8"))

        # Last user message
        last_user_msg = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.role == "user",
            )
            .order_by(Message.id.desc())
            .first()
        )
        if last_user_msg and last_user_msg.created_at:
            user_time = last_user_msg.created_at
            if user_time.tzinfo is None:
                user_time = user_time.replace(tzinfo=TZ_EAST8)
            gap = now - user_time
            if gap < timedelta(minutes=min_gap):
                logger.debug("[proactive] Last user msg too recent (%s < %dm), skipping", gap, min_gap)
                return False

        # Last proactive message
        last_proactive = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.role == "assistant",
                Message.meta_info.op("@>")(cast({"mode": "proactive"}, JSONB_TYPE)),
            )
            .order_by(Message.id.desc())
            .first()
        )

        if last_proactive:
            # Check if user replied after the last proactive message
            user_after_proactive = (
                db.query(Message)
                .filter(
                    Message.session_id == session_id,
                    Message.role == "user",
                    Message.id > last_proactive.id,
                )
                .first()
            )
            if user_after_proactive is None:
                # User hasn't replied — check retry rules
                if not retry_enabled:
                    logger.debug("[proactive] Retry disabled and user hasn't replied, skipping")
                    return False

                proactive_time = last_proactive.created_at
                if proactive_time.tzinfo is None:
                    proactive_time = proactive_time.replace(tzinfo=TZ_EAST8)
                if now - proactive_time < timedelta(hours=retry_gap):
                    logger.debug("[proactive] Retry gap not reached, skipping")
                    return False

                # Count consecutive unreplied proactive messages
                last_user_id = last_user_msg.id if last_user_msg else 0
                consecutive = (
                    db.query(Message)
                    .filter(
                        Message.session_id == session_id,
                        Message.role == "assistant",
                        Message.id > last_user_id,
                        Message.meta_info.op("@>")(cast({"mode": "proactive"}, JSONB_TYPE)),
                    )
                    .count()
                )
                if consecutive >= max_retries:
                    logger.debug("[proactive] Max retries reached (%d >= %d), skipping", consecutive, max_retries)
                    return False

        logger.debug("[proactive] Layer 1 passed")
        return True
    finally:
        db.close()


def _get_setting_sync(key: str, default: str = "") -> str:
    """Inline setting reader — avoids circular import with telegram.service."""
    from app.models.models import Settings
    db = SessionLocal()
    try:
        row = db.query(Settings).filter(Settings.key == key).first()
        return row.value if row else default
    finally:
        db.close()


# ── Layer 2: Lightweight model decision ──────────────────────────────────────

def _check_with_fallback_model_sync() -> bool:
    """Call the summary fallback model to decide yes/no."""
    from app.services.summary_service import _call_model_raw

    db = SessionLocal()
    try:
        assistant = db.get(Assistant, ACHENG_ASSISTANT_ID)
        if not assistant:
            logger.warning("[proactive] Assistant not found, skipping layer 2")
            return False

        # Resolve fallback preset
        preset = None
        if assistant.summary_fallback_preset_id:
            preset = db.get(ModelPreset, assistant.summary_fallback_preset_id)
        if not preset and assistant.summary_model_preset_id:
            preset = db.get(ModelPreset, assistant.summary_model_preset_id)
        if not preset:
            preset = db.get(ModelPreset, assistant.model_preset_id)
        if not preset:
            logger.warning("[proactive] No model preset available, skipping layer 2")
            return False

        session_id = _get_session_id(db)
        if session_id is None:
            return False

        # Latest summary
        latest_summary = (
            db.query(SessionSummary)
            .filter(SessionSummary.session_id == session_id)
            .order_by(SessionSummary.id.desc())
            .first()
        )
        summary_text = ""
        if latest_summary and latest_summary.summary_content:
            summary_text = f"[最近对话摘要]\n{latest_summary.summary_content[:500]}\n"

        # Recent 3 rounds of messages (user/assistant back and forth, including system/tool)
        recent_msgs = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.role.in_(["user", "assistant", "system", "tool"]),
                Message.content.isnot(None),
                Message.content != "",
            )
            .order_by(Message.id.desc())
            .limit(20)  # grab extra then trim to 3 rounds
            .all()
        )
        recent_msgs.reverse()

        # Trim to 3 rounds (a round = user msg + following non-user msgs)
        rounds = 0
        trimmed: list[Message] = []
        for msg in reversed(recent_msgs):
            trimmed.insert(0, msg)
            if msg.role == "user":
                rounds += 1
                if rounds >= 3:
                    break

        context_lines = []
        for msg in trimmed:
            role_label = {"user": "用户", "assistant": "AI", "system": "系统", "tool": "工具"}.get(msg.role, msg.role)
            content_preview = (msg.content or "")[:200]
            context_lines.append(f"{role_label}: {content_preview}")
        context_text = "\n".join(context_lines)

        # Latest mood
        mood_summary = (
            db.query(SessionSummary)
            .filter(SessionSummary.mood_tag.isnot(None))
            .order_by(SessionSummary.created_at.desc(), SessionSummary.id.desc())
            .first()
        )
        mood_tag = mood_summary.mood_tag if mood_summary else "unknown"

        # Time since last user message
        now = _now_beijing()
        last_user = (
            db.query(Message)
            .filter(Message.session_id == session_id, Message.role == "user")
            .order_by(Message.id.desc())
            .first()
        )
        if last_user and last_user.created_at:
            user_time = last_user.created_at
            if user_time.tzinfo is None:
                user_time = user_time.replace(tzinfo=TZ_EAST8)
            gap_str = _format_gap(now - user_time)
        else:
            gap_str = "未知"

        system_prompt = summary_text + "\n[最近对话]\n" + context_text
        user_text = DECISION_PROMPT_TEMPLATE.format(
            now=now.strftime("%Y-%m-%d %H:%M"),
            gap=gap_str,
            mood=mood_tag,
        )

        response = _call_model_raw(db, preset, system_prompt, user_text)
        logger.info("[proactive] Layer 2 response: %s", response.strip()[:50])
        return "YES" in response.upper()
    except Exception as e:
        logger.exception("[proactive] Layer 2 error: %s", e)
        return False
    finally:
        db.close()


async def _check_with_fallback_model() -> bool:
    return await asyncio.to_thread(_check_with_fallback_model_sync)


# ── Layer 3: Generate and send ───────────────────────────────────────────────

def _generate_sync() -> tuple[str | None, int | None]:
    """Generate a proactive message. Returns (content, db_message_id) or (None, None)."""
    from app.routers.chat import _load_session_messages
    from app.services.chat_service import ChatService

    db = SessionLocal()
    try:
        session_id, assistant_name = _get_session_info_sync(ACHENG_ASSISTANT_ID)

        chat_service = ChatService(db, assistant_name)
        chat_service.proactive_extra_prompt = PROACTIVE_EXTRA_PROMPT

        messages = _load_session_messages(db, session_id)

        # Compute trigger prompt values
        now = _now_beijing()
        last_user = (
            db.query(Message)
            .filter(Message.session_id == session_id, Message.role == "user")
            .order_by(Message.id.desc())
            .first()
        )
        if last_user and last_user.created_at:
            user_time = last_user.created_at
            if user_time.tzinfo is None:
                user_time = user_time.replace(tzinfo=TZ_EAST8)
            gap_str = _format_gap(now - user_time)
        else:
            gap_str = "未知"

        mood_summary = (
            db.query(SessionSummary)
            .filter(SessionSummary.mood_tag.isnot(None))
            .order_by(SessionSummary.created_at.desc(), SessionSummary.id.desc())
            .first()
        )
        mood_tag = mood_summary.mood_tag if mood_summary else "unknown"

        # Record max message id before generation
        max_msg = (
            db.query(Message.id)
            .filter(Message.session_id == session_id)
            .order_by(Message.id.desc())
            .first()
        )
        max_id_before = max_msg[0] if max_msg else 0

        # Append trigger message with id=-1 to prevent DB persistence
        messages.append({
            "role": "user",
            "content": TRIGGER_PROMPT_TEMPLATE.format(
                now=now.strftime("%Y-%m-%d %H:%M"),
                gap=gap_str,
                mood=mood_tag,
            ),
            "id": -1,
        })

        # Consume SSE stream (side effects: saves assistant message to DB)
        for _ in chat_service.stream_chat_completion(session_id, messages):
            pass

        # Find new assistant messages
        new_msgs = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.id > max_id_before,
                Message.role == "assistant",
                Message.content.isnot(None),
                Message.content != "",
            )
            .order_by(Message.id.desc())
            .all()
        )

        if not new_msgs:
            return None, None

        msg = new_msgs[0]
        content = (msg.content or "").strip()

        if not content or "[NO_MESSAGE]" in content:
            # Model decided not to send — delete the generated message
            for m in new_msgs:
                db.delete(m)
            db.commit()
            logger.info("[proactive] Model returned NO_MESSAGE, skipping")
            return None, None

        # Tag the message as proactive
        msg.meta_info = {**(msg.meta_info or {}), "mode": "proactive"}
        db.commit()

        logger.info("[proactive] Generated message (id=%d): %s", msg.id, content[:60])
        return content, msg.id
    except Exception as e:
        logger.exception("[proactive] Layer 3 error: %s", e)
        return None, None
    finally:
        db.close()


async def _generate_and_send() -> None:
    content, msg_db_id = await asyncio.to_thread(_generate_sync)
    if not content:
        return

    bot = bots.get("acheng")
    if not bot or not ALLOWED_CHAT_ID:
        logger.warning("[proactive] Bot or chat_id not available, cannot send")
        return

    try:
        sent = await bot.send_message(chat_id=ALLOWED_CHAT_ID, text=content)
        if msg_db_id:
            await update_telegram_message_id(msg_db_id, sent.message_id)
        logger.info("[proactive] Sent to Telegram (tg_msg_id=%d)", sent.message_id)
    except Exception as e:
        logger.exception("[proactive] Telegram send error: %s", e)

    # TODO: TTS 接入后启用语音消息
    # voice_enabled = await get_setting("proactive_voice_enabled", "false") == "true"
    # voice_chance = int(await get_setting("proactive_voice_chance", "30"))
    # if voice_enabled and random.randint(1, 100) <= voice_chance:
    #     ... send voice message ...


# ── Main loop ────────────────────────────────────────────────────────────────

async def proactive_loop() -> None:
    """Background loop that periodically checks and sends proactive messages."""
    await asyncio.sleep(30)  # Startup delay
    logger.info("[proactive] Loop started")

    while True:
        try:
            interval = int(await get_setting("proactive_interval", "30"))
            await asyncio.sleep(interval * 60)

            if await get_setting("proactive_enabled", "false") != "true":
                continue

            logger.info("[proactive] Checking rules (layer 1)...")
            if not await asyncio.to_thread(_check_rules):
                continue

            logger.info("[proactive] Checking with fallback model (layer 2)...")
            if not await _check_with_fallback_model():
                logger.info("[proactive] Layer 2 said NO, skipping")
                continue

            logger.info("[proactive] Generating and sending (layer 3)...")
            await _generate_and_send()
        except Exception as e:
            logger.exception("[proactive] Loop error: %s", e)
            await asyncio.sleep(60)
