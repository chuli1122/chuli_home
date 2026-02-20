from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Settings

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


@router.put("/settings/chat-mode", response_model=ChatModeResponse)
def update_chat_mode(
    payload: ChatModeUpdateRequest,
    db: Session = Depends(get_db),
) -> ChatModeResponse:
    mode = payload.mode if payload.mode in VALID_CHAT_MODES else "long"
    _upsert_setting(db, "chat_mode", mode)
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
