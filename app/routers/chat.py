from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Assistant, ChatSession, Message as MessageModel
from app.services.chat_service import ChatService, ToolCall

logger = logging.getLogger(__name__)
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


def _compress_tool_result(tool_name: str, content: str) -> str:
    """Compress tool_result content into a short summary for context injection."""
    try:
        data = json.loads(content) if content else {}
    except (json.JSONDecodeError, TypeError):
        data = {}

    if not isinstance(data, dict):
        return f"[{tool_name}] {str(data)[:60]}"

    if "error" in data:
        return f"[{tool_name}] 错误: {data['error']}"

    if tool_name == "save_memory":
        mid = data.get("id", "?")
        c = str(data.get("content", ""))[:30]
        if data.get("duplicate"):
            return f"[已存储记忆] 重复, existing_id={data.get('existing_id', '?')}"
        return f"[已存储记忆] id={mid}, {c}..."

    if tool_name == "update_memory":
        mid = data.get("id", "?")
        c = str(data.get("content", ""))[:30]
        return f"[已更新记忆] id={mid}, {c}..."

    if tool_name == "list_memories":
        memories = data.get("memories", [])
        ids = [str(m.get("id", "?")) for m in memories]
        return f"[已列出记忆] 返回{len(memories)}条, ids=[{','.join(ids)}]"

    if tool_name == "search_memory":
        results = data.get("results", [])
        query = data.get("query", "")
        ids = [str(r.get("id", "?")) for r in results]
        return f"[已搜索记忆] 关键词={query}, 返回{len(results)}条, ids=[{','.join(ids)}]"

    if tool_name == "delete_memory":
        mid = data.get("id", "?")
        return f"[已删除记忆] id={mid}"

    if tool_name == "write_diary":
        did = data.get("id", "?")
        title = data.get("title", "")[:20]
        return f"[已写日记] id={did}, {title}"

    if tool_name == "read_diary":
        if "diaries" in data:
            diaries = data["diaries"]
            ids = [str(d.get("id", "?")) for d in diaries]
            return f"[已读日记列表] 返回{len(diaries)}条, ids=[{','.join(ids)}]"
        did = data.get("id", "?")
        title = data.get("title", "")[:20]
        return f"[已读日记] id={did}, {title}"

    if tool_name == "search_summary":
        results = data.get("results", [])
        query = data.get("query", "")
        ids = [str(r.get("id", "?")) for r in results]
        return f"[已搜索摘要] 关键词={query}, 返回{len(results)}条, ids=[{','.join(ids)}]"

    if tool_name == "get_summary_by_id":
        sid = data.get("id", "?")
        sc = str(data.get("summary_content", ""))[:40]
        return f"[已查看摘要] id={sid}, {sc}..."

    if tool_name == "search_chat_history":
        results = data.get("results", [])
        query = data.get("query", "")
        n = len(results)
        return f"[已搜索聊天记录] 关键词={query}, 返回{n}条"

    if tool_name == "search_theater":
        results = data.get("results", [])
        query = data.get("query", "")
        return f"[已搜索小剧场] 关键词={query}, 返回{len(results)}条"

    # Fallback: tool_name + truncated content
    return f"[{tool_name}] {str(data)[:60]}"


def _load_session_messages(db: Session, session_id: int) -> list[dict[str, Any]]:
    """Load message history from DB for a session, including tool messages."""
    db_msgs = (
        db.query(MessageModel)
        .filter(
            MessageModel.session_id == session_id,
            MessageModel.role.in_(["user", "assistant", "tool"]),
        )
        .order_by(MessageModel.id.asc())
        .all()
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": ""}]
    for m in db_msgs:
        if m.role == "assistant":
            meta = m.meta_info or {}
            if "tool_call" in meta:
                # Tool call placeholder — keep it with tool_call info
                tc = meta["tool_call"]
                tool_name = tc.get("tool_name", "unknown")
                args = tc.get("arguments", {})
                summary = f"[调用工具] {tool_name}({json.dumps(args, ensure_ascii=False)[:80]})"
                messages.append({
                    "role": "assistant",
                    "content": summary,
                    "id": m.id,
                    "created_at": m.created_at,
                })
            elif m.content and m.content.strip():
                messages.append({
                    "role": m.role,
                    "content": m.content,
                    "id": m.id,
                    "created_at": m.created_at,
                })
            # Skip empty assistant messages that aren't tool_call placeholders
        elif m.role == "tool":
            meta = m.meta_info or {}
            tool_name = meta.get("tool_name", "unknown")
            compressed = _compress_tool_result(tool_name, m.content)
            messages.append({
                "role": "assistant",
                "content": compressed,
                "id": m.id,
                "created_at": m.created_at,
            })
        else:
            # user messages
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
