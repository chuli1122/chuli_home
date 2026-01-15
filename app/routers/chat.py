from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Assistant
from app.services.chat_service import ChatService, ToolCall

router = APIRouter()


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict[str, Any]


class ChatCompletionRequest(BaseModel):
    messages: list[dict[str, Any]]
    tool_calls: list[ToolCallPayload] = []
    session_id: int


class ChatCompletionResponse(BaseModel):
    messages: list[dict[str, Any]]


@router.post("/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(
    payload: ChatCompletionRequest, db: Session = Depends(get_db)
) -> ChatCompletionResponse:
    assistant = db.query(Assistant).first()
    assistant_name = assistant.name if assistant else "unknown"
    chat_service = ChatService(db, assistant_name)
    tool_calls = [ToolCall(name=call.name, arguments=call.arguments) for call in payload.tool_calls]
    messages = chat_service.chat_completion(payload.session_id, payload.messages, tool_calls)
    return ChatCompletionResponse(messages=messages)
