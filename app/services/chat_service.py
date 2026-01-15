from __future__ import annotations

import json
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from openai import OpenAI
import requests
from sqlalchemy.orm import Session

from app.models.models import ApiProvider, Assistant, Diary, Memory, Message, ModelPreset

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    id: str | None = None


class MemoryService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def save_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        memory = Memory(
            content=payload.get("content", ""),
            tags=payload.get("tags", {}),
            source=payload.get("source", "unknown"),
        )
        self.db.add(memory)
        self.db.commit()
        self.db.refresh(memory)
        return {
            "id": memory.id,
            "content": memory.content,
            "tags": memory.tags,
            "source": memory.source,
        }

    def update_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        memory_id = payload.get("id")
        source = payload.get("source", "unknown")
        if memory_id is None:
            return {"error": "id is required"}
        memory = self.db.get(Memory, memory_id)
        if not memory:
            return {"error": "memory not found"}
        if memory.source not in {source, "unknown"}:
            return {"error": "permission denied"}
        if "content" in payload:
            memory.content = payload["content"]
        if "tags" in payload:
            memory.tags = payload["tags"]
        self.db.commit()
        self.db.refresh(memory)
        return {
            "id": memory.id,
            "content": memory.content,
            "tags": memory.tags,
            "source": memory.source,
        }

    def delete_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        memory_id = payload.get("id")
        source = payload.get("source", "unknown")
        if memory_id is None:
            return {"error": "id is required"}
        memory = self.db.get(Memory, memory_id)
        if not memory:
            return {"error": "memory not found"}
        if memory.source not in {source, "unknown"}:
            return {"error": "permission denied"}
        self.db.delete(memory)
        self.db.commit()
        return {"status": "deleted", "id": memory_id}

    def write_diary(self, payload: dict[str, Any]) -> dict[str, Any]:
        diary = Diary(
            title=payload.get("title", ""),
            content=payload.get("content", ""),
            is_read=payload.get("is_read", False),
        )
        self.db.add(diary)
        self.db.commit()
        self.db.refresh(diary)
        return {"id": diary.id, "title": diary.title}

    def search_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = payload.get("query", "")
        limit = payload.get("limit", 10)
        keywords = [word for word in query.split() if word]
        memories_query = self.db.query(Memory)
        for keyword in keywords:
            memories_query = memories_query.filter(Memory.content.ilike(f"%{keyword}%"))
        memories = (
            memories_query.order_by(Memory.created_at.desc()).limit(limit).all()
        )
        results = [
            {
                "id": memory.id,
                "content": memory.content,
                "tags": memory.tags,
                "source": memory.source,
            }
            for memory in memories
        ]
        return {"query": query, "results": results}

    def get_recent_memories(self, limit: int = 10) -> dict[str, Any]:
        memories = (
            self.db.query(Memory).order_by(Memory.created_at.desc()).limit(limit).all()
        )
        results = [
            {
                "id": memory.id,
                "content": memory.content,
                "tags": memory.tags,
                "source": memory.source,
            }
            for memory in memories
        ]
        return {"results": results}


class ChatService:
    interactive_tools = {
        "save_memory",
        "update_memory",
        "delete_memory",
        "write_diary",
        "web_search",
    }
    silent_tools = {"search_memory", "get_recent_memories"}
    tool_display_names = {
        "save_memory": "创建记忆",
        "update_memory": "编辑记忆",
        "delete_memory": "删除记忆",
        "write_diary": "他写了一页日记",
        "web_search": "联网搜索",
    }

    def __init__(self, db: Session, assistant_name: str) -> None:
        self.db = db
        self.assistant_name = assistant_name
        self.memory_service = MemoryService(db)

    def chat_completion(
        self,
        session_id: int,
        messages: list[dict[str, Any]],
        tool_calls: Iterable[ToolCall],
        event_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> list[dict[str, Any]]:
        if messages:
            last_message = messages[-1]
            if last_message.get("role") == "user":
                self._persist_message(
                    session_id, "user", last_message.get("content", ""), {}
                )
        pending_tool_calls = (
            list(tool_calls)
            if tool_calls
            else list(self._fetch_next_tool_calls(messages, session_id))
        )
        while pending_tool_calls:
            tool_call = pending_tool_calls.pop(0)
            tool_name = tool_call.name
            if tool_name in self.interactive_tools and event_callback:
                display_name = self.tool_display_names.get(tool_name, tool_name)
                sanitized_args = self._sanitize_tool_args(tool_call)
                event_callback(
                    {
                        "event": "tool_call_start",
                        "display_name": display_name,
                        "tool_name": tool_name,
                        "arguments": sanitized_args,
                    }
                )
            self._persist_tool_call(session_id, tool_call)
            tool_result = self._execute_tool(tool_call)
            messages.append(
                {
                    "role": "tool",
                    "name": tool_name,
                    "content": json.dumps(tool_result, ensure_ascii=False),
                    "tool_call_id": tool_call.id,
                }
            )
            self._persist_tool_result(session_id, tool_name, tool_result)
            pending_tool_calls = list(self._fetch_next_tool_calls(messages, session_id))
        return messages

    def _execute_tool(self, tool_call: ToolCall) -> dict[str, Any]:
        tool_name = tool_call.name
        if tool_name == "save_memory":
            tool_call.arguments["source"] = self.assistant_name
            return self.memory_service.save_memory(tool_call.arguments)
        if tool_name == "update_memory":
            tool_call.arguments["source"] = self.assistant_name
            return self.memory_service.update_memory(tool_call.arguments)
        if tool_name == "delete_memory":
            tool_call.arguments["source"] = self.assistant_name
            return self.memory_service.delete_memory(tool_call.arguments)
        if tool_name == "write_diary":
            return self.memory_service.write_diary(tool_call.arguments)
        if tool_name == "search_memory":
            return self.memory_service.search_memory(tool_call.arguments)
        if tool_name == "get_recent_memories":
            limit = tool_call.arguments.get("limit", 10)
            return self.memory_service.get_recent_memories(limit)
        if tool_name == "web_search":
            return {"status": "not_implemented", "payload": tool_call.arguments}
        return {"status": "unknown_tool", "payload": tool_call.arguments}

    def _fetch_next_tool_calls(
        self, messages: list[dict[str, Any]], session_id: int
    ) -> Iterable[ToolCall]:
        assistant = self.db.query(Assistant).first()
        if not assistant:
            return []
        model_preset = self.db.get(ModelPreset, assistant.model_preset_id)
        if not model_preset:
            return []
        api_provider = self.db.get(ApiProvider, model_preset.api_provider_id)
        if not api_provider:
            return []
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "save_memory",
                    "description": (
                        "Use this to remember important events, preferences, AND the emotional "
                        "context associated with them (The AI's Long-term Memory). NOT for exchange "
                        "diary."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "content": {"type": "string"},
                            "tags": {"type": "object"},
                        },
                        "required": ["content"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "update_memory",
                    "description": "Update an existing memory.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "content": {"type": "string"},
                            "tags": {"type": "object"},
                        },
                        "required": ["id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "delete_memory",
                    "description": "Delete a memory.",
                    "parameters": {
                        "type": "object",
                        "properties": {"id": {"type": "integer"}},
                        "required": ["id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "write_diary",
                    "description": (
                        "Use this to write a private diary entry or a message for the user to read "
                        "later. This is an 'Exchange Diary' for expressing deep feelings, inner "
                        "thoughts, or love that isn't a direct chat reply."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                            "is_read": {"type": "boolean"},
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_memory",
                    "description": "Search past memories.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "limit": {"type": "integer"},
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_recent_memories",
                    "description": "Get the most recent memories.",
                    "parameters": {
                        "type": "object",
                        "properties": {"limit": {"type": "integer"}},
                    },
                },
            },
        ]
        base_url = api_provider.base_url
        if base_url.endswith("/chat/completions"):
            base_url = base_url[: -len("/chat/completions")]
            if not base_url.endswith("/v1"):
                base_url = f"{base_url.rstrip('/')}/v1"
        client = OpenAI(api_key=api_provider.api_key, base_url=base_url)
        print(
            f"📡 [DEBUG] 原始 Base URL: {api_provider.base_url} | SDK 实际 Base URL: {client.base_url}"
        )
        api_messages = []
        for message in messages:
            api_message = {
                "role": message.get("role"),
                "content": message.get("content"),
            }
            if "name" in message:
                api_message["name"] = message["name"]
            if "tool_calls" in message:
                api_message["tool_calls"] = message["tool_calls"]
            if "tool_call_id" in message:
                api_message["tool_call_id"] = message["tool_call_id"]
            api_messages.append(api_message)
        print(f"📡 [DEBUG] 正在调用的模型: {model_preset.model_name}")
        try:
            response = client.chat.completions.create(
                model=model_preset.model_name,
                messages=api_messages,
                tools=tools,
                tool_choice="auto",
            )
        except Exception as e:
            print(f"❌ [API ERROR] 请求失败! 错误信息: {str(e)}")
            return []
        if not response.choices:
            logger.warning("LLM response contained no choices.")
            return []
        choice = response.choices[0].message
        tool_calls = []
        if getattr(choice, "tool_calls", None):
            tool_calls_payload = []
            for tool_call in choice.tool_calls:
                tool_calls_payload.append(
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        },
                    }
                )
                tool_calls.append(
                    ToolCall(
                        name=tool_call.function.name,
                        arguments=json.loads(tool_call.function.arguments or "{}"),
                        id=tool_call.id,
                    )
                )
            messages.append(
                {
                    "role": "assistant",
                    "content": choice.content or "",
                    "tool_calls": tool_calls_payload,
                }
            )
            self._persist_message(
                session_id,
                "assistant",
                choice.content or "",
                {"tool_calls": tool_calls_payload},
            )
            return tool_calls
        if choice.content is not None and choice.content != "":
            messages.append({"role": "assistant", "content": choice.content})
            self._persist_message(session_id, "assistant", choice.content, {})
        else:
            fallback_content = "（未在记忆库中检索到相关信息，以下基于系统设定回复）"
            messages.append({"role": "assistant", "content": fallback_content})
            self._persist_message(session_id, "assistant", fallback_content, {})
        return []

    def fetch_available_models(self) -> list[dict[str, Any]]:
        api_provider = self.db.query(ApiProvider).first()
        if not api_provider:
            return []
        base_url = api_provider.base_url.rstrip("/")
        response = requests.get(
            f"{base_url}/v1/models",
            headers={"Authorization": f"Bearer {api_provider.api_key}"},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        return payload.get("data", [])

    def _sanitize_tool_args(self, tool_call: ToolCall) -> dict[str, Any]:
        if tool_call.name == "write_diary":
            return {}
        return tool_call.arguments

    def _persist_tool_call(self, session_id: int, tool_call: ToolCall) -> None:
        payload = {
            "tool_name": tool_call.name,
            "arguments": tool_call.arguments,
        }
        self._persist_message(session_id, "assistant", "", {"tool_call": payload})

    def _persist_tool_result(
        self, session_id: int, tool_name: str, tool_result: dict[str, Any]
    ) -> None:
        content = json.dumps(tool_result, ensure_ascii=False)
        self._persist_message(session_id, "tool", content, {"tool_name": tool_name})

    def _persist_message(
        self, session_id: int, role: str, content: str, metadata: dict[str, Any]
    ) -> None:
        message = Message(
            session_id=session_id,
            role=role,
            content=content,
            meta_info=metadata,
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
