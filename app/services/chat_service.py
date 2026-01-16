from __future__ import annotations

import json
import re
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from fastapi import BackgroundTasks
from typing import Any

from openai import OpenAI
import requests
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.models import ApiProvider, Assistant, ChatSession, Diary, Memory, Message, ModelPreset, SessionSummary, UserProfile
from app.services.embedding_service import EmbeddingService
from app.services.summary_service import SummaryService
from app.database import SessionLocal

logger = logging.getLogger(__name__)

TZ_EAST8 = timezone(timedelta(hours=8))


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    id: str | None = None


class MemoryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.embedding_service = EmbeddingService()

    def save_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = payload.get("content", "")
        embedding = self.embedding_service.get_embedding(content)
        memory = Memory(
            content=content,
            tags=payload.get("tags", {}),
            source=payload.get("source", "unknown"),
            embedding=embedding,
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
        source = payload.get("source")
        keywords = [word for word in query.split() if word]
        query_vector = self.embedding_service.get_embedding(query)

        vector_where = "WHERE embedding IS NOT NULL"
        vector_params = {"query_embedding": str(query_vector), "limit": limit}
        if source and source != "all":
            vector_where += " AND source = :source"
            vector_params["source"] = source

        vector_sql = text(
            """
    SELECT id, content, tags, source, category, weight, created_at,
           1 - (embedding <=> :query_embedding) AS similarity
    FROM memories
    {vector_where}
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
""".format(vector_where=vector_where)
        )
        vector_rows = self.db.execute(vector_sql, vector_params).all()

        memories_query = self.db.query(Memory)
        if source and source != "all":
            memories_query = memories_query.filter(Memory.source == source)
        for keyword in keywords:
            memories_query = memories_query.filter(Memory.content.ilike(f"%{keyword}%"))
        keyword_memories = (
            memories_query.order_by(Memory.created_at.desc()).limit(limit).all()
        )

        results = []
        seen_ids = set()
        for row in vector_rows:
            memory_id = row.id
            if memory_id in seen_ids:
                continue
            seen_ids.add(memory_id)
            results.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "tags": row.tags,
                    "source": row.source,
                    "created_at": row.created_at.replace(tzinfo=timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M"),
                }
            )

        for memory in keyword_memories:
            if memory.id in seen_ids:
                continue
            seen_ids.add(memory.id)
            results.append(
                {
                    "id": memory.id,
                    "content": memory.content,
                    "tags": memory.tags,
                    "source": memory.source,
                    "created_at": memory.created_at.replace(tzinfo=timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M"),
                }
            )
        return {"query": query, "results": results}

    def get_recent_memories(self, payload: dict[str, Any]) -> dict[str, Any]:
        limit = payload.get("limit", 10)
        source = payload.get("source")
        memories_query = self.db.query(Memory)
        if source and source != "all":
            memories_query = memories_query.filter(Memory.source == source)
        memories = memories_query.order_by(Memory.created_at.desc()).limit(limit).all()
        results = [
            {
                "id": memory.id,
                "content": memory.content,
                "tags": memory.tags,
                "source": memory.source,
                "created_at": memory.created_at.replace(tzinfo=timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M"),
            }
            for memory in memories
        ]
        return {"results": results}

    def fast_recall(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Vector search for related memories to inject into context."""
        query_vector = self.embedding_service.get_embedding(query)
        vector_sql = text(
            """
    SELECT id, content, tags, source, category, weight, created_at,
           1 - (embedding <=> :query_embedding) AS similarity
    FROM memories
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
"""
        )
        rows = self.db.execute(
            vector_sql, {"query_embedding": str(query_vector), "limit": limit}
        ).all()
        results = []
        for row in rows:
            results.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "tags": row.tags,
                    "source": row.source,
                    "created_at": row.created_at.replace(tzinfo=timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M"),
                }
            )
        return results


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
        background_tasks: BackgroundTasks | None = None,
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
        session = self.db.get(ChatSession, session_id)
        if session:
            session.round_count += 1
            self.db.commit()
            if session.round_count % 15 == 0 and background_tasks:
                start_round = session.round_count - 14
                end_round = session.round_count
                background_tasks.add_task(
                    SummaryService(SessionLocal).generate_summary,
                    session_id,
                    start_round,
                    end_round,
                )
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
            return self.memory_service.get_recent_memories(tool_call.arguments)
        if tool_name == "web_search":
            return {"status": "not_implemented", "payload": tool_call.arguments}
        return {"status": "unknown_tool", "payload": tool_call.arguments}

    def _fetch_next_tool_calls(
        self, messages: list[dict[str, Any]], session_id: int
    ) -> Iterable[ToolCall]:
        user_profile = self.db.query(UserProfile).first()
        user_name = user_profile.nickname if user_profile else "??"
        user_info = user_profile.basic_info if user_profile else ""
        assistant = self.db.query(Assistant).first()
        if not assistant:
            return []
        model_preset = self.db.get(ModelPreset, assistant.model_preset_id)
        if not model_preset:
            return []
        api_provider = self.db.get(ApiProvider, model_preset.api_provider_id)
        if not api_provider:
            return []
        full_system_prompt = assistant.system_prompt
        if user_info:
            full_system_prompt = (
                f"User info - Name: {user_name}, Details: {user_info}\n\n"
                + assistant.system_prompt
            )

        # Only inject summaries when context is short (< 10 messages)
        user_assistant_messages = [
            m for m in messages if m.get("role") in ("user", "assistant")
        ]
        if len(user_assistant_messages) < 10:
            summaries = (
                self.db.query(SessionSummary)
                .filter(SessionSummary.session_id == session_id)
                .order_by(SessionSummary.created_at.desc())
                .limit(2)
                .all()
            )
            if summaries:
                summary_text = "[Historical summaries for reference]\n"
                for summary in reversed(summaries):
                    summary_text += f"- {summary.summary_content}\n"
                full_system_prompt = summary_text + "\n" + full_system_prompt

        latest_user_message = next(
            (m.get("content") for m in reversed(messages) if m.get("role") == "user"),
            None,
        )
        if latest_user_message:
            recall_results = self.memory_service.fast_recall(latest_user_message, limit=5)
            if recall_results:
                recall_text = "\n\n[Related memories - for reference only, check timestamps, do not treat as current state]\n"
                for mem in recall_results:
                    source = mem.get("source", "unknown")
                    recall_text += f"- [{mem['created_at']}] {mem['content']} (source: {source})\n"
                full_system_prompt += recall_text
        save_memory_description = (
            f"Record important events, emotional changes, or relationship milestones. "
            f"Format: '[YYYY.MM.DD HH:MM] Name: content', use first person. "
            f"Example: '[2026.01.15 23:30] {assistant.name}: {user_name} praised me today, I am happy'. "
            f"Use '{user_name}' instead of 'user' in memories. "
            f"Do not record casual chat or already recorded content."
        )
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "save_memory",
                    "description": save_memory_description,
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
                    "description": (
                        "Search past memories. Results may come from different time points. "
                        "Check the created_at field and timestamp at the beginning of each memory. "
                        "Do not treat past events as current state. When you reference a memory in your reply, add [[used:id]] at the end of your message (e.g. [[used:5]]). This helps the system learn which memories are useful."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "limit": {"type": "integer"},
                            "source": {
                                "type": "string",
                                "description": "可选，指定只搜索某个来源的记忆（如 '阿怀'），传 'all' 或不传则搜索全部",
                            },
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_recent_memories",
                    "description": (
                        "Get recent memories in reverse chronological order. Check the created_at "
                        "field and timestamp at the beginning of each memory to distinguish past "
                        "from present. When you reference a memory in your reply, add [[used:id]] at the end of your message (e.g. [[used:5]]). This helps the system learn which memories are useful."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {"type": "integer"},
                            "source": {
                                "type": "string",
                                "description": "可选，指定只搜索某个来源的记忆（如 '阿怀'），传 'all' 或不传则搜索全部",
                            },
                        },
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
            role = message.get("role")
            content = message.get("content")
            if role == "system" and user_info:
                content = full_system_prompt
            elif role == "user" and content is not None:
                msg_time = message.get("created_at")
                if msg_time:
                    timestamp = (
                        msg_time
                        if isinstance(msg_time, str)
                        else msg_time.strftime("%Y.%m.%d %H:%M")
                    )
                else:
                    timestamp = datetime.now().strftime("%Y.%m.%d %H:%M")
                content = f"[{timestamp}] {content}"
            api_message = {
                "role": role,
                "content": content,
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
            used_ids = re.findall(r'\[\[used:(\d+)\]\]', choice.content)
            for memory_id in used_ids:
                memory = self.db.get(Memory, int(memory_id))
                if memory:
                    memory.weight += 0.1
            if used_ids:
                self.db.commit()
            clean_content = re.sub(r'\[\[used:\d+\]\]', '', choice.content).strip()
            messages.append({"role": "assistant", "content": clean_content})
            self._persist_message(session_id, "assistant", clean_content, {})
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
