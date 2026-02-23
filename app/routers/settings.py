from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import ChatSession, Message, SessionSummary, Settings, UserProfile

logger = logging.getLogger(__name__)
router = APIRouter()

DEFAULT_DIALOGUE_RETAIN_BUDGET = 8000
DEFAULT_DIALOGUE_TRIGGER_THRESHOLD = 16000
DEFAULT_GROUP_CHAT_WAIT_SECONDS = 5
DEFAULT_GROUP_CHAT_MAX_TOKENS = 600


class ContextBudgetResponse(BaseModel):
    retain_budget: int
    trigger_threshold: int


class ContextBudgetUpdateRequest(BaseModel):
    retain_budget: int = Field(..., ge=1)
    trigger_threshold: int = Field(..., ge=1)


class GroupChatSettingsResponse(BaseModel):
    wait_seconds: int
    max_tokens: int


class GroupChatSettingsUpdateRequest(BaseModel):
    wait_seconds: int = Field(..., ge=1)
    max_tokens: int = Field(..., ge=1)


def _safe_int(raw_value: str | None, default: int) -> int:
    try:
        return int(str(raw_value).strip())
    except Exception:
        return default


def _read_context_budget(db: Session) -> tuple[int, int]:
    rows = (
        db.query(Settings)
        .filter(Settings.key.in_(["dialogue_retain_budget", "dialogue_trigger_threshold"]))
        .all()
    )
    kv = {row.key: row.value for row in rows}
    retain_budget = _safe_int(
        kv.get("dialogue_retain_budget"), DEFAULT_DIALOGUE_RETAIN_BUDGET
    )
    trigger_threshold = _safe_int(
        kv.get("dialogue_trigger_threshold"), DEFAULT_DIALOGUE_TRIGGER_THRESHOLD
    )
    retain_budget = max(1, retain_budget)
    trigger_threshold = max(retain_budget, trigger_threshold)
    return retain_budget, trigger_threshold


def _upsert_setting(db: Session, key: str, value: str | int) -> None:
    row = db.query(Settings).filter(Settings.key == key).first()
    if row:
        row.value = str(value)
    else:
        db.add(Settings(key=key, value=str(value)))


def _read_group_chat_settings(db: Session) -> tuple[int, int]:
    rows = (
        db.query(Settings)
        .filter(Settings.key.in_(["group_chat_wait_seconds", "group_chat_max_tokens"]))
        .all()
    )
    kv = {row.key: row.value for row in rows}
    wait_seconds = _safe_int(
        kv.get("group_chat_wait_seconds"), DEFAULT_GROUP_CHAT_WAIT_SECONDS
    )
    max_tokens = _safe_int(
        kv.get("group_chat_max_tokens"), DEFAULT_GROUP_CHAT_MAX_TOKENS
    )
    wait_seconds = max(1, wait_seconds)
    max_tokens = max(1, max_tokens)
    return wait_seconds, max_tokens


@router.get("/settings/context-budget", response_model=ContextBudgetResponse)
def get_context_budget(db: Session = Depends(get_db)) -> ContextBudgetResponse:
    retain_budget, trigger_threshold = _read_context_budget(db)
    return ContextBudgetResponse(
        retain_budget=retain_budget,
        trigger_threshold=trigger_threshold,
    )


@router.put("/settings/context-budget", response_model=ContextBudgetResponse)
def update_context_budget(
    payload: ContextBudgetUpdateRequest,
    db: Session = Depends(get_db),
) -> ContextBudgetResponse:
    retain_budget = max(1, int(payload.retain_budget))
    trigger_threshold = max(retain_budget, int(payload.trigger_threshold))
    _upsert_setting(db, "dialogue_retain_budget", retain_budget)
    _upsert_setting(db, "dialogue_trigger_threshold", trigger_threshold)
    db.commit()
    return ContextBudgetResponse(
        retain_budget=retain_budget,
        trigger_threshold=trigger_threshold,
    )


@router.get("/settings/group-chat", response_model=GroupChatSettingsResponse)
def get_group_chat_settings(
    db: Session = Depends(get_db),
) -> GroupChatSettingsResponse:
    wait_seconds, max_tokens = _read_group_chat_settings(db)
    return GroupChatSettingsResponse(
        wait_seconds=wait_seconds,
        max_tokens=max_tokens,
    )


@router.put("/settings/group-chat", response_model=GroupChatSettingsResponse)
def update_group_chat_settings(
    payload: GroupChatSettingsUpdateRequest,
    db: Session = Depends(get_db),
) -> GroupChatSettingsResponse:
    wait_seconds = max(1, int(payload.wait_seconds))
    max_tokens = max(1, int(payload.max_tokens))
    _upsert_setting(db, "group_chat_wait_seconds", wait_seconds)
    _upsert_setting(db, "group_chat_max_tokens", max_tokens)
    db.commit()
    return GroupChatSettingsResponse(
        wait_seconds=wait_seconds,
        max_tokens=max_tokens,
    )


# ── Chat mode ────────────────────────────────────────────────────────────────

VALID_CHAT_MODES = ("short", "long", "theater")


class ChatModeResponse(BaseModel):
    mode: str


class ChatModeUpdateRequest(BaseModel):
    mode: str


@router.get("/settings/chat-mode", response_model=ChatModeResponse)
def get_chat_mode(db: Session = Depends(get_db)) -> ChatModeResponse:
    row = db.query(Settings).filter(Settings.key == "chat_mode").first()
    mode = row.value if row and row.value in VALID_CHAT_MODES else "long"
    return ChatModeResponse(mode=mode)


MODE_LABELS = {"short": "短消息", "long": "长消息", "theater": "小剧场"}


@router.put("/settings/chat-mode", response_model=ChatModeResponse)
def update_chat_mode(
    payload: ChatModeUpdateRequest,
    db: Session = Depends(get_db),
) -> ChatModeResponse:
    mode = payload.mode if payload.mode in VALID_CHAT_MODES else "long"
    _upsert_setting(db, "chat_mode", mode)

    # Insert system message, similar to mood switch
    label = MODE_LABELS.get(mode, mode)
    latest_session = (
        db.query(ChatSession)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        .first()
    )
    if latest_session:
        msg = Message(
            session_id=latest_session.id,
            role="system",
            content=f"已切换到{label}模式",
            meta_info={"mode_switch": True},
            created_at=datetime.now(timezone.utc),
        )
        db.add(msg)

    db.commit()
    return ChatModeResponse(mode=mode)


# ── Buffer seconds ────────────────────────────────────────────────────────────

class BufferSecondsResponse(BaseModel):
    seconds: float


class BufferSecondsUpdateRequest(BaseModel):
    seconds: float = Field(..., ge=1, le=120)


@router.put("/settings/buffer-seconds", response_model=BufferSecondsResponse)
def update_buffer_seconds(
    payload: BufferSecondsUpdateRequest,
    db: Session = Depends(get_db),
) -> BufferSecondsResponse:
    seconds = max(1.0, float(payload.seconds))
    _upsert_setting(db, "telegram_buffer_seconds", int(seconds))
    db.commit()
    return BufferSecondsResponse(seconds=seconds)


# ── Short message max count ───────────────────────────────────────────────────

class ShortMsgMaxResponse(BaseModel):
    max_count: int


class ShortMsgMaxUpdateRequest(BaseModel):
    max_count: int = Field(..., ge=2, le=20)


@router.get("/settings/short-msg-max", response_model=ShortMsgMaxResponse)
def get_short_msg_max(db: Session = Depends(get_db)) -> ShortMsgMaxResponse:
    row = db.query(Settings).filter(Settings.key == "short_msg_max").first()
    return ShortMsgMaxResponse(max_count=int(row.value) if row else 8)


@router.put("/settings/short-msg-max", response_model=ShortMsgMaxResponse)
def update_short_msg_max(
    payload: ShortMsgMaxUpdateRequest,
    db: Session = Depends(get_db),
) -> ShortMsgMaxResponse:
    count = max(2, min(20, payload.max_count))
    _upsert_setting(db, "short_msg_max", str(count))
    db.commit()
    return ShortMsgMaxResponse(max_count=count)


# ── Mood ─────────────────────────────────────────────────────────────────────

VALID_MOOD_TAGS = {
    "happy", "sad", "angry", "anxious", "tired", "emo", "flirty", "proud", "calm",
}


class MoodResponse(BaseModel):
    mood: str | None


class MoodUpdateRequest(BaseModel):
    mood: str


@router.get("/settings/mood", response_model=MoodResponse)
def get_mood(db: Session = Depends(get_db)) -> MoodResponse:
    latest_summary = (
        db.query(SessionSummary)
        .filter(SessionSummary.mood_tag.isnot(None))
        .order_by(SessionSummary.created_at.desc(), SessionSummary.id.desc())
        .first()
    )
    mood = latest_summary.mood_tag if latest_summary else None
    return MoodResponse(mood=mood)


@router.put("/settings/mood", response_model=MoodResponse)
def set_mood(
    payload: MoodUpdateRequest,
    db: Session = Depends(get_db),
) -> MoodResponse:
    mood = (payload.mood or "").strip().lower()
    if mood not in VALID_MOOD_TAGS:
        raise HTTPException(status_code=400, detail="Invalid mood")

    # Find latest session
    latest_session = (
        db.query(ChatSession)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        .first()
    )
    if not latest_session:
        raise HTTPException(status_code=404, detail="No session found")

    # Find latest summary for that session, or create placeholder
    latest_summary = (
        db.query(SessionSummary)
        .filter(SessionSummary.session_id == latest_session.id)
        .order_by(SessionSummary.created_at.desc(), SessionSummary.id.desc())
        .first()
    )
    if latest_summary:
        latest_summary.mood_tag = mood
    else:
        latest_summary = SessionSummary(
            session_id=latest_session.id,
            assistant_id=latest_session.assistant_id,
            summary_content="(手动设置心情)",
            perspective="user",
            mood_tag=mood,
        )
        db.add(latest_summary)
    db.flush()

    # Write a system message (status change, not a user message)
    user_profile = db.query(UserProfile).first()
    nickname = user_profile.nickname if user_profile and user_profile.nickname else "她"
    msg = Message(
        session_id=latest_session.id,
        role="system",
        content=f"{nickname}手动切换心情为：{mood}",
        meta_info={"mood_switch": True},
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)

    # Mark as manual
    _upsert_setting(db, "mood_manual", "true")

    db.commit()
    return MoodResponse(mood=mood)


# ── Thinking Budget ──


class ThinkingBudgetResponse(BaseModel):
    main: int
    summary: int


class ThinkingBudgetUpdateRequest(BaseModel):
    main: int = Field(..., ge=0)
    summary: int = Field(..., ge=0)


@router.get("/settings/thinking-budget", response_model=ThinkingBudgetResponse)
def get_thinking_budget(db: Session = Depends(get_db)) -> ThinkingBudgetResponse:
    rows = (
        db.query(Settings)
        .filter(Settings.key.in_(["main_thinking_budget", "summary_thinking_budget"]))
        .all()
    )
    kv = {row.key: row.value for row in rows}
    return ThinkingBudgetResponse(
        main=_safe_int(kv.get("main_thinking_budget"), 0),
        summary=_safe_int(kv.get("summary_thinking_budget"), 0),
    )


@router.put("/settings/thinking-budget", response_model=ThinkingBudgetResponse)
def update_thinking_budget(
    payload: ThinkingBudgetUpdateRequest,
    db: Session = Depends(get_db),
) -> ThinkingBudgetResponse:
    _upsert_setting(db, "main_thinking_budget", payload.main)
    _upsert_setting(db, "summary_thinking_budget", payload.summary)
    db.commit()
    return ThinkingBudgetResponse(main=payload.main, summary=payload.summary)
