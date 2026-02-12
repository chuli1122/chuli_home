from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import ChatSession, Message, SessionSummary
from app.utils import format_datetime

logger = logging.getLogger(__name__)
router = APIRouter()
VALID_MOOD_TAGS = {
    "sad",
    "angry",
    "anxious",
    "tired",
    "emo",
    "happy",
    "flirty",
    "proud",
    "calm",
}


class SessionItem(BaseModel):
    id: int
    assistant_id: int | None
    title: str
    type: str
    created_at: str | None
    updated_at: str | None


class SessionListResponse(BaseModel):
    sessions: list[SessionItem]
    total: int


class SessionCreateRequest(BaseModel):
    assistant_id: int
    title: str = ""
    type: str = "chat"


class SessionUpdateRequest(BaseModel):
    title: str


class SessionDeleteResponse(BaseModel):
    status: str
    id: int


class SessionMessageItem(BaseModel):
    id: int
    role: str
    content: str
    meta_info: dict
    created_at: str | None


class SessionMessagesResponse(BaseModel):
    messages: list[SessionMessageItem]
    has_more: bool


class SessionSummaryItem(BaseModel):
    id: int
    session_id: int
    summary_content: str
    perspective: str
    msg_id_start: int | None
    msg_id_end: int | None
    time_start: str | None
    time_end: str | None
    mood_tag: str | None
    created_at: str | None


class SessionSummariesResponse(BaseModel):
    summaries: list[SessionSummaryItem]


class SessionSummaryUpdateRequest(BaseModel):
    mood_tag: str


class MessageUpdateRequest(BaseModel):
    content: str


class MessageDeleteResponse(BaseModel):
    status: str
    id: int


@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    assistant_id: int | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> SessionListResponse:
    query = db.query(ChatSession)
    if assistant_id is not None:
        query = query.filter(ChatSession.assistant_id == assistant_id)

    total = query.count()
    rows = (
        query.order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    sessions = [
        SessionItem(
            id=row.id,
            assistant_id=row.assistant_id,
            title=row.title or "",
            type=row.type,
            created_at=format_datetime(row.created_at),
            updated_at=format_datetime(row.updated_at),
        )
        for row in rows
    ]
    return SessionListResponse(sessions=sessions, total=total)


@router.post("/sessions", response_model=SessionItem)
def create_session(
    payload: SessionCreateRequest,
    db: Session = Depends(get_db),
) -> SessionItem:
    now_utc = datetime.now(timezone.utc)
    row = ChatSession(
        assistant_id=payload.assistant_id,
        title=payload.title,
        type=payload.type,
        updated_at=now_utc,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SessionItem(
        id=row.id,
        assistant_id=row.assistant_id,
        title=row.title or "",
        type=row.type,
        created_at=format_datetime(row.created_at),
        updated_at=format_datetime(row.updated_at),
    )


@router.get("/sessions/{session_id}/messages", response_model=SessionMessagesResponse)
def get_session_messages(
    session_id: int,
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> SessionMessagesResponse:
    session_row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    query = db.query(Message).filter(
        Message.session_id == session_id,
        Message.role.in_(["user", "assistant", "system"]),
    )
    if before_id is not None:
        query = query.filter(Message.id < before_id)

    # Query limit + 1 to check if there are more messages
    rows_desc = query.order_by(Message.id.desc()).limit(limit + 1).all()
    rows = list(reversed(rows_desc))

    # Check if there are more messages
    has_more = len(rows) > limit
    # Only return up to limit messages
    rows = rows[:limit]

    items = [
        SessionMessageItem(
            id=row.id,
            role=row.role,
            content=row.content,
            meta_info=row.meta_info or {},
            created_at=format_datetime(row.created_at),
        )
        for row in rows
    ]

    return SessionMessagesResponse(messages=items, has_more=has_more)


@router.get("/sessions/{session_id}/summaries", response_model=SessionSummariesResponse)
def get_session_summaries(
    session_id: int,
    db: Session = Depends(get_db),
) -> SessionSummariesResponse:
    session_row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    rows = (
        db.query(SessionSummary)
        .filter(SessionSummary.session_id == session_id)
        .order_by(SessionSummary.created_at.desc(), SessionSummary.id.desc())
        .all()
    )
    items = [
        SessionSummaryItem(
            id=row.id,
            session_id=row.session_id,
            summary_content=row.summary_content,
            perspective=row.perspective,
            msg_id_start=row.msg_id_start,
            msg_id_end=row.msg_id_end,
            time_start=format_datetime(row.time_start),
            time_end=format_datetime(row.time_end),
            mood_tag=row.mood_tag,
            created_at=format_datetime(row.created_at),
        )
        for row in rows
    ]
    return SessionSummariesResponse(summaries=items)


@router.put("/sessions/{session_id}/summaries/{summary_id}", response_model=SessionSummaryItem)
def update_session_summary_mood(
    session_id: int,
    summary_id: int,
    payload: SessionSummaryUpdateRequest,
    db: Session = Depends(get_db),
) -> SessionSummaryItem:
    session_row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    mood_tag = (payload.mood_tag or "").strip().lower()
    if mood_tag not in VALID_MOOD_TAGS:
        raise HTTPException(status_code=400, detail="Invalid mood_tag")

    summary_row = (
        db.query(SessionSummary)
        .filter(
            SessionSummary.id == summary_id,
            SessionSummary.session_id == session_id,
        )
        .first()
    )
    if summary_row is None:
        raise HTTPException(status_code=404, detail="Summary not found")

    summary_row.mood_tag = mood_tag
    db.commit()
    db.refresh(summary_row)
    return SessionSummaryItem(
        id=summary_row.id,
        session_id=summary_row.session_id,
        summary_content=summary_row.summary_content,
        perspective=summary_row.perspective,
        msg_id_start=summary_row.msg_id_start,
        msg_id_end=summary_row.msg_id_end,
        time_start=format_datetime(summary_row.time_start),
        time_end=format_datetime(summary_row.time_end),
        mood_tag=summary_row.mood_tag,
        created_at=format_datetime(summary_row.created_at),
    )


@router.put("/sessions/{session_id}", response_model=SessionItem)
def update_session(
    session_id: int,
    payload: SessionUpdateRequest,
    db: Session = Depends(get_db),
) -> SessionItem:
    row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    row.title = payload.title
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return SessionItem(
        id=row.id,
        assistant_id=row.assistant_id,
        title=row.title or "",
        type=row.type,
        created_at=format_datetime(row.created_at),
        updated_at=format_datetime(row.updated_at),
    )


@router.delete("/sessions/{session_id}", response_model=SessionDeleteResponse)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
) -> SessionDeleteResponse:
    row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    db.query(Message).filter(Message.session_id == session_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return SessionDeleteResponse(status="deleted", id=session_id)


@router.put("/sessions/{session_id}/messages/{message_id}", response_model=SessionMessageItem)
def update_message(
    session_id: int,
    message_id: int,
    payload: MessageUpdateRequest,
    db: Session = Depends(get_db),
) -> SessionMessageItem:
    # Verify session exists
    session_row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Find and update message
    message_row = (
        db.query(Message)
        .filter(Message.id == message_id, Message.session_id == session_id)
        .first()
    )
    if message_row is None:
        raise HTTPException(status_code=404, detail="Message not found")

    message_row.content = payload.content
    db.commit()
    db.refresh(message_row)

    return SessionMessageItem(
        id=message_row.id,
        role=message_row.role,
        content=message_row.content,
        meta_info=message_row.meta_info or {},
        created_at=format_datetime(message_row.created_at),
    )


@router.delete("/sessions/{session_id}/messages/{message_id}", response_model=MessageDeleteResponse)
def delete_message(
    session_id: int,
    message_id: int,
    db: Session = Depends(get_db),
) -> MessageDeleteResponse:
    # Verify session exists
    session_row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Find and delete message
    message_row = (
        db.query(Message)
        .filter(Message.id == message_id, Message.session_id == session_id)
        .first()
    )
    if message_row is None:
        raise HTTPException(status_code=404, detail="Message not found")

    db.delete(message_row)
    db.commit()

    return MessageDeleteResponse(status="deleted", id=message_id)
