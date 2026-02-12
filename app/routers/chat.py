from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Assistant, ChatSession, Message as MessageModel
from app.services.chat_service import ChatService, ToolCall

router = APIRouter()


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict[str, Any]


class ChatCompletionRequest(BaseModel):
    session_id: int
    message: str | list[dict[str, Any]] | None = None
    messages: list[dict[str, Any]] = []
    tool_calls: list[ToolCallPayload] = []
    stream: bool = False
    short_mode: bool = False


class ChatCompletionResponse(BaseModel):
    messages: list[dict[str, Any]]


def _load_session_messages(db: Session, session_id: int) -> list[dict[str, Any]]:
    """Load message history from DB for a session."""
    db_msgs = (
        db.query(MessageModel)
        .filter(
            MessageModel.session_id == session_id,
            MessageModel.role.in_(["user", "assistant"]),
        )
        .order_by(MessageModel.id.asc())
        .all()
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": ""}]
    for m in db_msgs:
        # Skip empty assistant messages (tool call artifacts without context)
        if m.role == "assistant" and (not m.content or not m.content.strip()):
            continue
        messages.append({
            "role": m.role,
            "content": m.content,
            "id": m.id,
            "created_at": m.created_at,
        })
    return messages


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Resolve assistant
    session = db.get(ChatSession, payload.session_id)
    if session and session.assistant_id:
        assistant = db.get(Assistant, session.assistant_id)
    else:
        assistant = db.query(Assistant).first()
    assistant_name = assistant.name if assistant else "unknown"
    chat_service = ChatService(db, assistant_name)

    # Build messages list
    if payload.message is not None:
        messages = _load_session_messages(db, payload.session_id)
        # Only append non-empty user messages (empty = receive mode)
        if isinstance(payload.message, list) or (payload.message and payload.message.strip()):
            messages.append({"role": "user", "content": payload.message})
    elif payload.messages and any(m.get("role") == "system" for m in payload.messages):
        messages = payload.messages
    else:
        messages = _load_session_messages(db, payload.session_id)
        for m in payload.messages:
            content = m.get("content", "")
            # Only append non-empty user messages (empty = receive mode)
            if isinstance(content, list) or (content and content.strip()):
                messages.append({"role": "user", "content": content})

    if payload.stream:
        def generate():
            yield from chat_service.stream_chat_completion(
                payload.session_id, messages, background_tasks=background_tasks
            )
        return StreamingResponse(generate(), media_type="text/event-stream")

    # Non-streaming path
    tool_calls = [ToolCall(name=call.name, arguments=call.arguments) for call in payload.tool_calls]
    result_messages = chat_service.chat_completion(
        payload.session_id, messages, tool_calls, background_tasks=background_tasks,
        short_mode=payload.short_mode,
    )
    return ChatCompletionResponse(messages=result_messages)
