from __future__ import annotations

import json
import re
import logging
import math
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from fastapi import BackgroundTasks
from typing import Any

from openai import OpenAI
import requests
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import func, text

from app.models.models import ApiProvider, Assistant, ChatSession, Diary, Memory, Message, ModelPreset, SessionSummary, Settings, TheaterStory, UserProfile
from app.services.core_blocks_service import CoreBlocksService
from app.services.embedding_service import EmbeddingService
from app.services.summary_service import SummaryService
from app.services.world_books_service import WorldBooksService
from app.database import SessionLocal

logger = logging.getLogger(__name__)

TZ_EAST8 = timezone(timedelta(hours=8))
NEGATIVE_MOOD_TAGS = [
    "sad",
    "angry",
    "anxious",
    "tired",
    "emo",
]
DEFAULT_DIALOGUE_RETAIN_BUDGET = 8000
DEFAULT_DIALOGUE_TRIGGER_THRESHOLD = 16000
KLASS_DEFAULTS = {
    "identity": {"importance": 0.9, "halflife_days": 365.0},
    "relationship": {"importance": 0.9, "halflife_days": 365.0},
    "bond": {"importance": 0.85, "halflife_days": 365.0},
    "conflict": {"importance": 0.85, "halflife_days": 365.0},
    "fact": {"importance": 0.8, "halflife_days": 180.0},
    "preference": {"importance": 0.6, "halflife_days": 120.0},
    "health": {"importance": 0.8, "halflife_days": 120.0},
    "task": {"importance": 0.5, "halflife_days": 30.0},
    "ephemeral": {"importance": 0.3, "halflife_days": 7.0},
    "other": {"importance": 0.5, "halflife_days": 60.0},
}


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
        raw_klass = payload.get("klass", "other")
        klass = raw_klass if raw_klass in KLASS_DEFAULTS else "other"
        klass_config = KLASS_DEFAULTS[klass]
        now_east8 = datetime.now(timezone.utc).astimezone(TZ_EAST8)
        content = f"[{now_east8.strftime('%Y.%m.%d %H:%M')}] {content}"
        embedding = self.embedding_service.get_embedding(content)
        memory = Memory(
            content=content,
            tags=payload.get("tags", {}),
            source=payload.get("source", "unknown"),
            embedding=embedding,
            klass=klass,
            importance=klass_config["importance"],
            halflife_days=klass_config["halflife_days"],
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
        if memory.deleted_at is not None:
            return {"error": "memory already deleted"}
        if memory.source not in {source, "unknown"}:
            return {"error": "permission denied"}
        memory.deleted_at = datetime.now(timezone.utc)
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

    @staticmethod
    def _format_time_east8(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            utc_value = value.replace(tzinfo=timezone.utc)
        else:
            utc_value = value.astimezone(timezone.utc)
        return utc_value.astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")

    @staticmethod
    def _parse_iso_datetime(raw_value: Any) -> datetime | None:
        if raw_value is None:
            return None
        try:
            text_value = str(raw_value).strip()
            if not text_value:
                return None
            parsed = datetime.fromisoformat(text_value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    def search_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        try:
            limit = max(1, int(payload.get("limit", 10)))
        except Exception:
            limit = 10
        source = payload.get("source")
        start_time = self._parse_iso_datetime(payload.get("start_time"))
        end_time = self._parse_iso_datetime(payload.get("end_time"))
        if start_time and end_time and start_time > end_time:
            start_time, end_time = end_time, start_time
        keywords = [word for word in query.split() if word]
        query_vector = self.embedding_service.get_embedding(query) if query else None

        vector_rows = []
        if query_vector is not None:
            vector_where = "WHERE embedding IS NOT NULL AND deleted_at IS NULL"
            vector_params = {"query_embedding": str(query_vector), "limit": limit}
            if source and source != "all":
                vector_where += " AND source = :source"
                vector_params["source"] = source

            vector_sql = text(
                """
    SELECT id, content, tags, source, created_at,
           1 - (embedding <=> :query_embedding) AS similarity
    FROM memories
    {vector_where}
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
""".format(vector_where=vector_where)
            )
            vector_rows = self.db.execute(vector_sql, vector_params).all()

        memories_query = self.db.query(Memory)
        memories_query = memories_query.filter(Memory.deleted_at.is_(None))
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
                    "type": "memory",
                    "content": row.content,
                    "tags": row.tags,
                    "source": row.source,
                    "created_at": self._format_time_east8(row.created_at),
                }
            )

        for memory in keyword_memories:
            if memory.id in seen_ids:
                continue
            seen_ids.add(memory.id)
            results.append(
                {
                    "id": memory.id,
                    "type": "memory",
                    "content": memory.content,
                    "tags": memory.tags,
                    "source": memory.source,
                    "created_at": self._format_time_east8(memory.created_at),
                }
            )

        summary_vector_rows = []
        if query_vector is not None:
            summary_where = "WHERE embedding IS NOT NULL"
            summary_params = {"query_embedding": str(query_vector), "limit": limit}
            if start_time is not None:
                summary_where += (
                    " AND COALESCE(time_end, time_start, created_at) >= :start_time"
                )
                summary_params["start_time"] = start_time
            if end_time is not None:
                summary_where += (
                    " AND COALESCE(time_start, time_end, created_at) <= :end_time"
                )
                summary_params["end_time"] = end_time
            summary_vector_sql = text(
                """
    SELECT id, session_id, summary_content, msg_id_start, msg_id_end,
           time_start, time_end, created_at,
           1 - (embedding <=> :query_embedding) AS similarity
    FROM session_summaries
    {summary_where}
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
""".format(summary_where=summary_where)
            )
            summary_vector_rows = self.db.execute(
                summary_vector_sql, summary_params
            ).all()

        summaries_query = self.db.query(SessionSummary)
        if start_time is not None:
            summaries_query = summaries_query.filter(
                func.coalesce(
                    SessionSummary.time_end,
                    SessionSummary.time_start,
                    SessionSummary.created_at,
                )
                >= start_time
            )
        if end_time is not None:
            summaries_query = summaries_query.filter(
                func.coalesce(
                    SessionSummary.time_start,
                    SessionSummary.time_end,
                    SessionSummary.created_at,
                )
                <= end_time
            )
        for keyword in keywords:
            summaries_query = summaries_query.filter(
                SessionSummary.summary_content.ilike(f"%{keyword}%")
            )
        summary_keyword_rows = (
            summaries_query.order_by(SessionSummary.created_at.desc())
            .limit(limit)
            .all()
        )

        summary_results = []
        seen_summary_ids: set[int] = set()
        for row in summary_vector_rows:
            if row.id in seen_summary_ids:
                continue
            seen_summary_ids.add(row.id)
            summary_results.append(
                {
                    "id": row.id,
                    "type": "summary",
                    "session_id": row.session_id,
                    "content": row.summary_content,
                    "msg_id_start": row.msg_id_start,
                    "msg_id_end": row.msg_id_end,
                    "time_start": self._format_time_east8(row.time_start),
                    "time_end": self._format_time_east8(row.time_end),
                    "created_at": self._format_time_east8(row.created_at),
                }
            )
        for summary in summary_keyword_rows:
            if summary.id in seen_summary_ids:
                continue
            seen_summary_ids.add(summary.id)
            summary_results.append(
                {
                    "id": summary.id,
                    "type": "summary",
                    "session_id": summary.session_id,
                    "content": summary.summary_content,
                    "msg_id_start": summary.msg_id_start,
                    "msg_id_end": summary.msg_id_end,
                    "time_start": self._format_time_east8(summary.time_start),
                    "time_end": self._format_time_east8(summary.time_end),
                    "created_at": self._format_time_east8(summary.created_at),
                }
            )
        return {"query": query, "results": results + summary_results}

    def search_chat_history(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        try:
            limit = max(1, int(payload.get("limit", 20)))
        except Exception:
            limit = 20
        session_id = payload.get("session_id")
        try:
            msg_id_start = (
                int(payload.get("msg_id_start"))
                if payload.get("msg_id_start") is not None
                else None
            )
        except Exception:
            msg_id_start = None
        try:
            msg_id_end = (
                int(payload.get("msg_id_end"))
                if payload.get("msg_id_end") is not None
                else None
            )
        except Exception:
            msg_id_end = None
        if (
            msg_id_start is not None
            and msg_id_end is not None
            and msg_id_start > msg_id_end
        ):
            msg_id_start, msg_id_end = msg_id_end, msg_id_start

        context_size = 3
        keywords = [word for word in query.split() if word]

        messages_query = self.db.query(Message).filter(Message.role.in_(["user", "assistant"]))
        if session_id is not None:
            messages_query = messages_query.filter(Message.session_id == session_id)
        messages_query = messages_query.filter(Message.content.is_not(None), Message.content != "")

        use_id_range = msg_id_start is not None and msg_id_end is not None
        if use_id_range:
            hit_messages = (
                messages_query.filter(Message.id.between(msg_id_start, msg_id_end))
                .order_by(Message.id.asc())
                .all()
            )
        else:
            for keyword in keywords:
                messages_query = messages_query.filter(Message.content.ilike(f"%{keyword}%"))
            hit_messages = (
                messages_query.order_by(Message.created_at.desc(), Message.id.desc())
                .limit(limit)
                .all()
            )

        if not hit_messages:
            return {
                "query": query,
                "results": [],
                "mode": "id_range" if use_id_range else "keyword",
            }

        if use_id_range:
            results = [
                {
                    "id": message.id,
                    "session_id": message.session_id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": self._format_time_east8(message.created_at),
                    "is_hit": True,
                }
                for message in hit_messages
            ]
            return {
                "query": query,
                "results": results,
                "mode": "id_range",
            }

        merged_messages: dict[int, Message] = {}
        hit_ids = {msg.id for msg in hit_messages}
        for hit in hit_messages:
            context_query = self.db.query(Message).filter(
                Message.role.in_(["user", "assistant"]),
                Message.content.is_not(None),
                Message.content != "",
                Message.session_id == hit.session_id,
            )
            prev_rows = (
                context_query.filter(Message.id < hit.id)
                .order_by(Message.id.desc())
                .limit(context_size)
                .all()
            )
            next_rows = (
                context_query.filter(Message.id > hit.id)
                .order_by(Message.id.asc())
                .limit(context_size)
                .all()
            )
            ordered_context = list(reversed(prev_rows)) + [hit] + list(next_rows)
            for row in ordered_context:
                merged_messages[row.id] = row

        merged_sorted = sorted(
            merged_messages.values(),
            key=lambda m: (m.session_id, m.id),
        )
        results = [
            {
                "id": message.id,
                "session_id": message.session_id,
                "role": message.role,
                "content": message.content,
                "created_at": self._format_time_east8(message.created_at),
                "is_hit": message.id in hit_ids,
            }
            for message in merged_sorted
        ]
        return {
            "query": query,
            "results": results,
            "mode": "id_range" if use_id_range else "keyword",
        }

    def search_theater(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        try:
            limit = max(1, int(payload.get("limit", 5)))
        except Exception:
            limit = 5
        if not query:
            return {"query": query, "results": []}

        rows = (
            self.db.query(TheaterStory)
            .filter(
                TheaterStory.summary.is_not(None),
                TheaterStory.summary.ilike(f"%{query}%"),
            )
            .order_by(TheaterStory.updated_at.desc(), TheaterStory.id.desc())
            .limit(limit)
            .all()
        )
        results = [
            {
                "title": row.title,
                "ai_partner": row.ai_partner,
                "summary": row.summary,
                "story_timespan": row.story_timespan,
            }
            for row in rows
        ]
        return {"query": query, "results": results}

    def fast_recall(
        self, query: str, limit: int = 5, current_mood_tag: str | None = None
    ) -> list[dict[str, Any]]:
        """Vector search for related memories to inject into context."""
        CANDIDATE_POOL_SIZE = 20
        TAG_EXPANSION_LIMIT = 3
        rerank_top_n = max(limit, 1)
        query_vector = self.embedding_service.get_embedding(query)
        if query_vector is None:
            return []
        vector_sql = text(
            """
    SELECT id, content, tags, source, klass, importance, manual_boost, hits,
           halflife_days, last_access_ts, created_at,
           1 - (embedding <=> :query_embedding) AS similarity
    FROM memories
    WHERE embedding IS NOT NULL
      AND deleted_at IS NULL
      AND 1 - (embedding <=> :query_embedding) >= :min_similarity
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
"""
        )
        candidate_rows = self.db.execute(
            vector_sql,
            {
                "query_embedding": str(query_vector),
                "limit": CANDIDATE_POOL_SIZE,
                "min_similarity": 0.35,
            },
        ).all()

        if len(candidate_rows) <= 5:
            primary_rows = list(candidate_rows)
        else:
            documents = [row.content or "" for row in candidate_rows]
            rerank_results = self.embedding_service.rerank(
                query, documents, top_n=rerank_top_n
            )
            if not rerank_results:
                primary_rows = list(candidate_rows[:5])
            else:
                primary_rows = []
                seen_indices = set()
                for item in rerank_results:
                    if not isinstance(item, dict):
                        continue
                    index = item.get("index")
                    if not isinstance(index, int):
                        continue
                    if index < 0 or index >= len(candidate_rows):
                        continue
                    if index in seen_indices:
                        continue
                    seen_indices.add(index)
                    primary_rows.append(candidate_rows[index])
                if not primary_rows:
                    primary_rows = list(candidate_rows[:5])
                else:
                    primary_rows = primary_rows[:rerank_top_n]

        try:
            mood = (current_mood_tag or "").strip().lower()
            if mood in NEGATIVE_MOOD_TAGS:
                scored_rows: list[tuple[float, Any]] = []
                now_utc = datetime.now(timezone.utc)
                for row in primary_rows:
                    created_at = row.created_at
                    if created_at is None:
                        age_days = 0.0
                    else:
                        if created_at.tzinfo is None:
                            created_utc = created_at.replace(tzinfo=timezone.utc)
                        else:
                            created_utc = created_at.astimezone(timezone.utc)
                        last_access_ts = row.last_access_ts
                        if last_access_ts is not None:
                            if last_access_ts.tzinfo is None:
                                last_access_utc = last_access_ts.replace(
                                    tzinfo=timezone.utc
                                )
                            else:
                                last_access_utc = last_access_ts.astimezone(
                                    timezone.utc
                                )
                            base_time = last_access_utc
                        else:
                            base_time = created_utc
                        age_days = max(
                            0.0, (now_utc - base_time).total_seconds() / 86400.0
                        )
                    base = min(
                        max((row.importance or 0.5) + (row.manual_boost or 0.0), 0.0),
                        1.0,
                    )
                    halflife = row.halflife_days or 60.0
                    boost = 1 + 0.35 * math.log(1 + (row.hits or 0))
                    decayed_score = (
                        base * math.exp(-math.log(2) / halflife * age_days) * boost
                    )
                    if row.klass == "conflict":
                        decayed_score *= 1.5
                    elif row.klass == "bond":
                        decayed_score *= 1.3
                    scored_rows.append((decayed_score, row))
                scored_rows.sort(key=lambda item: item[0], reverse=True)
                primary_rows = [row for _, row in scored_rows]
        except Exception as exc:
            logger.warning("Mood-based fast_recall boost failed: %s", exc)

        result_ids = {row.id for row in primary_rows if getattr(row, "id", None) is not None}
        collected_tags: set[str] = set()
        for row in primary_rows:
            tags = row.tags
            if isinstance(tags, dict):
                for key in tags.keys():
                    key_text = str(key).strip()
                    if key_text:
                        collected_tags.add(key_text)
                for value in tags.values():
                    if isinstance(value, list):
                        for item in value:
                            item_text = str(item).strip()
                            if item_text:
                                collected_tags.add(item_text)
                    else:
                        value_text = str(value).strip()
                        if value_text:
                            collected_tags.add(value_text)
            elif isinstance(tags, list):
                for item in tags:
                    item_text = str(item).strip()
                    if item_text:
                        collected_tags.add(item_text)
            elif isinstance(tags, str):
                tag_text = tags.strip()
                if tag_text:
                    collected_tags.add(tag_text)

        expansion_rows = []
        if result_ids and collected_tags:
            try:
                tag_list = list(collected_tags)
                exclude_ids = list(result_ids)
                exp_sql = text(
                    """
            SELECT id, content, tags, source, created_at
            FROM memories
            WHERE id != ALL(:exclude_ids)
              AND deleted_at IS NULL
              AND tags ?| :tag_list
            ORDER BY created_at DESC
            LIMIT :limit
        """
                )
                raw_rows = self.db.execute(
                    exp_sql,
                    {
                        "exclude_ids": exclude_ids,
                        "tag_list": tag_list,
                        "limit": TAG_EXPANSION_LIMIT,
                    },
                ).all()
                for row in raw_rows:
                    expansion_rows.append(row)
            except Exception as exc:
                logger.warning("Tag-based memory expansion failed: %s", exc)

        combined_rows = list(primary_rows)
        for row in expansion_rows:
            if getattr(row, "id", None) in result_ids:
                continue
            combined_rows.append(row)
            result_ids.add(row.id)
            if len(combined_rows) >= 8:
                break

        results = []
        for row in combined_rows[:8]:
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
    silent_tools = {"search_memory", "search_chat_history", "search_theater"}
    tool_display_names = {
        "save_memory": "创建记忆",
        "update_memory": "更新记忆",
        "delete_memory": "删除记忆",
        "write_diary": "写日记",
        "search_memory": "搜索记忆",
        "search_chat_history": "搜索聊天记录",
        "search_theater": "搜索小剧场",
    }

    def __init__(
        self,
        db: Session,
        assistant_name: str,
        session_factory: sessionmaker | None = None,
    ) -> None:
        self.db = db
        self.assistant_name = assistant_name
        self.memory_service = MemoryService(db)
        self.session_factory = session_factory or SessionLocal
        self._trimmed_messages: list[dict[str, Any]] = []
        self._trimmed_message_ids: list[int] = []
        self.dialogue_retain_budget, self.dialogue_trigger_threshold = (
            self._load_context_budgets()
        )

    def _load_context_budgets(self) -> tuple[int, int]:
        retain_budget = DEFAULT_DIALOGUE_RETAIN_BUDGET
        trigger_threshold = DEFAULT_DIALOGUE_TRIGGER_THRESHOLD
        try:
            rows = (
                self.db.query(Settings)
                .filter(
                    Settings.key.in_(
                        ["dialogue_retain_budget", "dialogue_trigger_threshold"]
                    )
                )
                .all()
            )
            kv = {row.key: row.value for row in rows}
            retain_budget = self._safe_int(
                kv.get("dialogue_retain_budget"), DEFAULT_DIALOGUE_RETAIN_BUDGET
            )
            trigger_threshold = self._safe_int(
                kv.get("dialogue_trigger_threshold"),
                DEFAULT_DIALOGUE_TRIGGER_THRESHOLD,
            )
        except Exception:
            logger.exception("Failed to load context budget settings, using defaults.")
        retain_budget = max(1, retain_budget)
        trigger_threshold = max(retain_budget, trigger_threshold)
        return retain_budget, trigger_threshold

    @staticmethod
    def _safe_int(raw_value: Any, default: int) -> int:
        try:
            return int(str(raw_value).strip())
        except Exception:
            return default

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        if not text:
            return 0
        cjk_count = 0
        other_count = 0
        for char in text:
            codepoint = ord(char)
            if 0x4E00 <= codepoint <= 0x9FFF:
                cjk_count += 1
            else:
                other_count += 1
        quarter_tokens = cjk_count * 6 + other_count
        return (quarter_tokens + 3) // 4

    def chat_completion(
        self,
        session_id: int,
        messages: list[dict[str, Any]],
        tool_calls: Iterable[ToolCall],
        event_callback: Callable[[dict[str, Any]], None] | None = None,
        background_tasks: BackgroundTasks | None = None,
    ) -> list[dict[str, Any]]:
        # Persist all NEW user messages (those without a DB id)
        for msg in messages:
            if msg.get("role") == "user" and not msg.get("id"):
                user_content = msg.get("content", "")
                has_content = bool(user_content) if isinstance(user_content, list) else bool(user_content and user_content.strip())
                if has_content:
                    self._persist_message(session_id, "user", user_content, {})
        all_trimmed_messages: list[dict[str, Any]] = []
        all_trimmed_message_ids: list[int] = []
        if tool_calls:
            pending_tool_calls = list(tool_calls)
        else:
            pending_tool_calls = list(self._fetch_next_tool_calls(messages, session_id))
            all_trimmed_messages.extend(self._trimmed_messages)
            all_trimmed_message_ids.extend(self._trimmed_message_ids)
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
            all_trimmed_messages.extend(self._trimmed_messages)
            all_trimmed_message_ids.extend(self._trimmed_message_ids)
        session = self.db.get(ChatSession, session_id)
        if all_trimmed_messages and background_tasks:
            assistant_id = session.assistant_id if session and session.assistant_id else None
            if assistant_id is None:
                assistant_row = self.db.query(Assistant).first()
                if assistant_row:
                    assistant_id = assistant_row.id
            if assistant_id is not None:
                unique_trimmed_ids = list(
                    dict.fromkeys(
                        message_id
                        for message_id in all_trimmed_message_ids
                        if isinstance(message_id, int)
                    )
                )
                background_tasks.add_task(
                    self._trigger_summary,
                    session_id,
                    unique_trimmed_ids,
                    assistant_id,
                )
        return messages

    def _build_api_call_params(
        self, messages: list[dict[str, Any]], session_id: int
    ) -> tuple | None:
        """Build all params needed for an API call.
        Returns (client, model_name, api_messages, tools) or None.
        Side effects: updates self._trimmed_messages and self._trimmed_message_ids.
        """
        self._trimmed_messages = []
        self._trimmed_message_ids = []
        user_profile = self.db.query(UserProfile).first()
        user_info = user_profile.basic_info if user_profile else ""
        session = self.db.get(ChatSession, session_id)
        if session and session.assistant_id:
            assistant = self.db.get(Assistant, session.assistant_id)
        else:
            assistant = self.db.query(Assistant).first()
        if not assistant:
            return None
        model_preset = self.db.get(ModelPreset, assistant.model_preset_id)
        if not model_preset:
            return None
        api_provider = self.db.get(ApiProvider, model_preset.api_provider_id)
        if not api_provider:
            return None
        raw_latest = next(
            (m.get("content") for m in reversed(messages) if m.get("role") == "user"),
            None,
        )
        latest_user_message = self._content_to_storage(raw_latest) if isinstance(raw_latest, list) else raw_latest
        base_system_prompt = assistant.system_prompt
        summaries_desc = (
            self.db.query(SessionSummary)
            .filter(SessionSummary.assistant_id == assistant.id)
            .order_by(SessionSummary.created_at.desc())
            .all()
        )
        summary_budget_tokens = 2000
        used_summary_tokens = 0
        selected_summaries_desc: list[SessionSummary] = []
        latest_mood_tag = None
        for summary in summaries_desc:
            if latest_mood_tag is None and summary.mood_tag:
                latest_mood_tag = summary.mood_tag
            if summary.msg_id_start is None:
                continue
            summary_content = (summary.summary_content or "").strip()
            if not summary_content:
                continue
            summary_tokens = self._estimate_tokens(summary_content)
            if used_summary_tokens + summary_tokens > summary_budget_tokens:
                break
            selected_summaries_desc.append(summary)
            used_summary_tokens += summary_tokens
        prompt_parts: list[str] = []
        if selected_summaries_desc:
            summary_text = "[Historical conversation summaries]\n"
            for s in reversed(selected_summaries_desc):
                summary_text += f"- {s.summary_content}\n"
            prompt_parts.append(summary_text.rstrip())
        if latest_mood_tag:
            prompt_parts.append(f"[User recent mood: {latest_mood_tag}]")
        world_books_service = WorldBooksService(self.db)
        active_books = world_books_service.get_active_books(
            assistant.id, latest_user_message, latest_mood_tag
        )
        before_books_text = "\n\n".join(
            c.strip() for c in active_books.get("before", []) if c and c.strip()
        )
        after_books_text = "\n\n".join(
            c.strip() for c in active_books.get("after", []) if c and c.strip()
        )
        if before_books_text:
            prompt_parts.append(before_books_text)
        prompt_parts.append(base_system_prompt)
        if after_books_text:
            prompt_parts.append(after_books_text)
        full_system_prompt = "\n\n".join(part for part in prompt_parts if part)
        if user_info and user_info.strip():
            full_system_prompt += f"\n\n[About the user - basic info]\n{user_info.strip()}"
        core_blocks_service = CoreBlocksService(self.db)
        core_blocks_text = core_blocks_service.get_blocks_for_prompt(assistant.id)
        if core_blocks_text:
            full_system_prompt += "\n\n" + core_blocks_text
        if latest_user_message:
            recall_results = self.memory_service.fast_recall(
                latest_user_message, limit=5, current_mood_tag=latest_mood_tag
            )
            if recall_results:
                recall_text = (
                    "\n\n[The following are related memories automatically retrieved based on this conversation. "
                    "Usually no need to call search_memory again]\n"
                )
                for mem in recall_results:
                    source = mem.get("source", "unknown")
                    recall_text += f"- [{mem['created_at']}] {mem['content']} (source: {source})\n"
                recall_text += "[If above memories are insufficient, you can use search_memory or search_chat_history to supplement]\n"
                full_system_prompt += recall_text
        save_memory_description = (
            "Actively store long-term useful information. Use content for memory text and klass for category: identity, relationship, bond, conflict, fact, preference, health, task, ephemeral, other."
            "Timestamp is added by backend automatically. Save when you detect preferences, important facts, or emotional milestones."
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
                            "klass": {
                                "type": "string",
                                "description": "Memory class for weighting: identity, relationship, bond, conflict, fact, preference, health, task, ephemeral, other.",
                                "enum": ["identity", "relationship", "bond", "conflict", "fact", "preference", "health", "task", "ephemeral", "other"],
                            },
                        },
                        "required": ["content"],
                    },
                },
            },
            {"type": "function", "function": {"name": "update_memory", "description": "Update an existing memory.", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}, "content": {"type": "string"}, "tags": {"type": "object"}}, "required": ["id"]}}},
            {"type": "function", "function": {"name": "delete_memory", "description": "Delete a memory.", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
            {"type": "function", "function": {"name": "write_diary", "description": "Use this to write a private diary entry or a message for the user to read later. This is an Exchange Diary for expressing deep feelings, inner thoughts, or love that isn't a direct chat reply.", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "is_read": {"type": "boolean"}}}}},
            {"type": "function", "function": {"name": "search_memory", "description": "Search memories and summaries. Returns memory cards (type=memory) and summary records (type=summary). Summary items include msg_id_start and msg_id_end. Supports start_time/end_time filtering.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}, "source": {"type": "string"}, "start_time": {"type": "string"}, "end_time": {"type": "string"}}}}},
            {"type": "function", "function": {"name": "search_chat_history", "description": "Search chat history. Mode 1: keyword query. Mode 2: ID-range query with msg_id_start and msg_id_end.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}, "session_id": {"type": "integer"}, "msg_id_start": {"type": "integer"}, "msg_id_end": {"type": "integer"}}}}},
            {"type": "function", "function": {"name": "search_theater", "description": "Search theater story summaries.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["query"]}}},
        ]
        # Client setup
        base_url = api_provider.base_url
        if base_url.endswith("/chat/completions"):
            base_url = base_url[: -len("/chat/completions")]
            if not base_url.endswith("/v1"):
                base_url = f"{base_url.rstrip('/')}/v1"
        client = OpenAI(api_key=api_provider.api_key, base_url=base_url)
        # Token trimming
        retain_budget = self.dialogue_retain_budget
        trigger_threshold = self.dialogue_trigger_threshold
        dialogue_token_total = 0
        for message in messages:
            if message.get("role") in ("user", "assistant"):
                raw_content = message.get("content", "") or ""
                text_for_tokens = self._content_to_storage(raw_content) if isinstance(raw_content, list) else raw_content
                dialogue_token_total += self._estimate_tokens(text_for_tokens)
        message_index = 0
        if dialogue_token_total > trigger_threshold:
            while dialogue_token_total > retain_budget and message_index < len(messages):
                role = messages[message_index].get("role")
                if role in ("user", "assistant"):
                    trimmed_message = messages.pop(message_index)
                    raw_content = trimmed_message.get("content", "") or ""
                    text_for_tokens = self._content_to_storage(raw_content) if isinstance(raw_content, list) else raw_content
                    dialogue_token_total -= self._estimate_tokens(text_for_tokens)
                    self._trimmed_messages.append(trimmed_message)
                    trimmed_id = trimmed_message.get("id")
                    if isinstance(trimmed_id, int):
                        self._trimmed_message_ids.append(trimmed_id)
                    if role == "assistant":
                        while message_index < len(messages):
                            next_msg = messages[message_index]
                            if next_msg.get("role") != "tool":
                                break
                            trimmed_tool = messages.pop(message_index)
                            self._trimmed_messages.append(trimmed_tool)
                            trimmed_tool_id = trimmed_tool.get("id")
                            if isinstance(trimmed_tool_id, int):
                                self._trimmed_message_ids.append(trimmed_tool_id)
                    continue
                message_index += 1
        # Format api_messages
        api_messages = []
        first_system_seen = False
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role == "system":
                if not first_system_seen:
                    content = full_system_prompt
                    first_system_seen = True
                else:
                    # System notification (e.g. mood change) — add timestamp
                    msg_time = message.get("created_at")
                    if msg_time:
                        timestamp = msg_time if isinstance(msg_time, str) else msg_time.strftime("%Y.%m.%d %H:%M")
                    else:
                        timestamp = datetime.now(timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")
                    content = f"[{timestamp}] {content}"
            elif role == "user" and content is not None:
                msg_time = message.get("created_at")
                if msg_time:
                    timestamp = msg_time if isinstance(msg_time, str) else msg_time.strftime("%Y.%m.%d %H:%M")
                else:
                    timestamp = datetime.now(timezone.utc).astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            part["text"] = f"[{timestamp}] {part.get('text', '')}"
                            break
                else:
                    content = f"[{timestamp}] {content}"
            elif role == "assistant" and content is not None:
                msg_time = message.get("created_at")
                if msg_time:
                    timestamp = msg_time if isinstance(msg_time, str) else msg_time.strftime("%Y.%m.%d %H:%M")
                    content = f"[{timestamp}] {content}"
            api_message = {"role": role, "content": content}
            if "name" in message:
                api_message["name"] = message["name"]
            if "tool_calls" in message:
                api_message["tool_calls"] = message["tool_calls"]
            if "tool_call_id" in message:
                api_message["tool_call_id"] = message["tool_call_id"]
            api_messages.append(api_message)
        return (client, model_preset.model_name, api_messages, tools, model_preset.temperature, model_preset.top_p)

    def stream_chat_completion(
        self,
        session_id: int,
        messages: list[dict[str, Any]],
        background_tasks: BackgroundTasks | None = None,
    ) -> Iterable[str]:
        """Streaming chat completion. Yields SSE events."""
        if messages:
            last_message = messages[-1]
            user_content = last_message.get("content", "")
            has_content = bool(user_content) if isinstance(user_content, list) else bool(user_content and user_content.strip())
            if last_message.get("role") == "user" and has_content:
                self._persist_message(session_id, "user", user_content, {})
        all_trimmed_message_ids: list[int] = []
        while True:
            params = self._build_api_call_params(messages, session_id)
            if params is None:
                yield 'data: [DONE]\n\n'
                return
            client, model_name, api_messages, tools, preset_temperature, preset_top_p = params
            all_trimmed_message_ids.extend(self._trimmed_message_ids)
            try:
                stream_params: dict[str, Any] = {
                    "model": model_name,
                    "messages": api_messages,
                    "tools": tools,
                    "tool_choice": "auto",
                    "stream": True,
                }
                if preset_temperature is not None:
                    stream_params["temperature"] = preset_temperature
                if preset_top_p is not None:
                    stream_params["top_p"] = preset_top_p
                stream = client.chat.completions.create(**stream_params)
            except Exception as e:
                logger.error(f"Streaming request failed: {e}")
                yield f'data: {json.dumps({"error": str(e)})}\n\n'
                yield 'data: [DONE]\n\n'
                return
            content_chunks: list[str] = []
            tool_calls_acc: dict[int, dict] = {}
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if getattr(delta, "content", None):
                    content_chunks.append(delta.content)
                    yield f'data: {json.dumps({"content": delta.content})}\n\n'
                if getattr(delta, "tool_calls", None):
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc_delta.id:
                            tool_calls_acc[idx]["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                tool_calls_acc[idx]["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                tool_calls_acc[idx]["arguments"] += tc_delta.function.arguments
            if tool_calls_acc:
                tool_calls_payload = []
                parsed_tool_calls = []
                for idx in sorted(tool_calls_acc.keys()):
                    tc = tool_calls_acc[idx]
                    tool_calls_payload.append({
                        "id": tc["id"], "type": "function",
                        "function": {"name": tc["name"], "arguments": tc["arguments"]},
                    })
                    parsed_tool_calls.append(ToolCall(
                        name=tc["name"],
                        arguments=json.loads(tc["arguments"] or "{}"),
                        id=tc["id"],
                    ))
                full_content = "".join(content_chunks)
                messages.append({
                    "role": "assistant", "content": full_content,
                    "tool_calls": tool_calls_payload,
                })
                self._persist_message(session_id, "assistant", full_content, {"tool_calls": tool_calls_payload})
                for tc in parsed_tool_calls:
                    self._persist_tool_call(session_id, tc)
                    tool_result = self._execute_tool(tc)
                    messages.append({
                        "role": "tool", "name": tc.name,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                        "tool_call_id": tc.id,
                    })
                    self._persist_tool_result(session_id, tc.name, tool_result)
                continue
            # Final text response
            full_content = "".join(content_chunks)
            used_ids = re.findall(r'\[\[used:(\d+)\]\]', full_content)
            now_utc = datetime.now(timezone.utc)
            for memory_id in used_ids:
                memory = self.db.get(Memory, int(memory_id))
                if memory:
                    memory.hits += 1
                    memory.last_access_ts = now_utc
            if used_ids:
                self.db.commit()
            clean_content = re.sub(r'\[\[used:\d+\]\]', '', full_content).strip()
            if not clean_content:
                clean_content = "(No relevant memory found.)"
            self._persist_message(session_id, "assistant", clean_content, {})
            session = self.db.get(ChatSession, session_id)
            if session:
                session.updated_at = datetime.now(timezone.utc)
                self.db.commit()
            if all_trimmed_message_ids and background_tasks:
                assistant_id = session.assistant_id if session else None
                if assistant_id:
                    unique_ids = list(dict.fromkeys(
                        mid for mid in all_trimmed_message_ids if isinstance(mid, int)
                    ))
                    background_tasks.add_task(
                        self._trigger_summary, session_id, unique_ids, assistant_id,
                    )
            yield 'data: [DONE]\n\n'
            return

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
        if tool_name == "search_chat_history":
            return self.memory_service.search_chat_history(tool_call.arguments)
        if tool_name == "search_theater":
            return self.memory_service.search_theater(tool_call.arguments)
        if tool_name == "web_search":
            return {"status": "not_implemented", "payload": tool_call.arguments}
        return {"status": "unknown_tool", "payload": tool_call.arguments}

    def _fetch_next_tool_calls(
        self, messages: list[dict[str, Any]], session_id: int
    ) -> Iterable[ToolCall]:
        self._trimmed_messages = []
        self._trimmed_message_ids = []
        user_profile = self.db.query(UserProfile).first()
        user_name = user_profile.nickname if user_profile else "??"
        user_info = user_profile.basic_info if user_profile else ""
        session = self.db.get(ChatSession, session_id)
        if session and session.assistant_id:
            assistant = self.db.get(Assistant, session.assistant_id)
        else:
            assistant = self.db.query(Assistant).first()
        if not assistant:
            return []
        model_preset = self.db.get(ModelPreset, assistant.model_preset_id)
        if not model_preset:
            return []
        api_provider = self.db.get(ApiProvider, model_preset.api_provider_id)
        if not api_provider:
            return []
        raw_latest = next(
            (m.get("content") for m in reversed(messages) if m.get("role") == "user"),
            None,
        )
        latest_user_message = self._content_to_storage(raw_latest) if isinstance(raw_latest, list) else raw_latest

        base_system_prompt = assistant.system_prompt

        summaries_desc = (
            self.db.query(SessionSummary)
            .filter(SessionSummary.assistant_id == assistant.id)
            .order_by(SessionSummary.created_at.desc())
            .all()
        )
        summary_budget_tokens = 2000
        used_summary_tokens = 0
        selected_summaries_desc: list[SessionSummary] = []
        latest_mood_tag = None
        for summary in summaries_desc:
            if latest_mood_tag is None and summary.mood_tag:
                latest_mood_tag = summary.mood_tag
            if summary.msg_id_start is None:
                continue
            summary_content = (summary.summary_content or "").strip()
            if not summary_content:
                continue
            summary_tokens = self._estimate_tokens(summary_content)
            if used_summary_tokens + summary_tokens > summary_budget_tokens:
                break
            selected_summaries_desc.append(summary)
            used_summary_tokens += summary_tokens

        prompt_parts: list[str] = []
        if selected_summaries_desc:
            summary_text = "[Historical conversation summaries]\n"
            for summary in reversed(selected_summaries_desc):
                summary_text += f"- {summary.summary_content}\n"
            prompt_parts.append(summary_text.rstrip())
        if latest_mood_tag:
            prompt_parts.append(f"[User recent mood: {latest_mood_tag}]")

        world_books_service = WorldBooksService(self.db)
        active_books = world_books_service.get_active_books(
            assistant.id, latest_user_message, latest_mood_tag
        )
        before_books_text = "\n\n".join(
            content.strip() for content in active_books.get("before", []) if content and content.strip()
        )
        after_books_text = "\n\n".join(
            content.strip() for content in active_books.get("after", []) if content and content.strip()
        )

        if before_books_text:
            prompt_parts.append(before_books_text)
        prompt_parts.append(base_system_prompt)
        if after_books_text:
            prompt_parts.append(after_books_text)
        full_system_prompt = "\n\n".join(part for part in prompt_parts if part)

        if user_info and user_info.strip():
            full_system_prompt += (
                f"\n\n[About the user - basic info]\n{user_info.strip()}"
            )

        core_blocks_service = CoreBlocksService(self.db)
        core_blocks_text = core_blocks_service.get_blocks_for_prompt(assistant.id)
        if core_blocks_text:
            full_system_prompt += "\n\n" + core_blocks_text

        if latest_user_message:
            recall_results = self.memory_service.fast_recall(
                latest_user_message, limit=5, current_mood_tag=latest_mood_tag
            )
            if recall_results:
                recall_text = (
                    "\n\n[The following are related memories automatically retrieved based on this conversation. "
                    "Usually no need to call search_memory again]\n"
                )
                for mem in recall_results:
                    source = mem.get("source", "unknown")
                    recall_text += f"- [{mem['created_at']}] {mem['content']} (source: {source})\n"
                recall_text += "[If above memories are insufficient, you can use search_memory or search_chat_history to supplement]\n"
                full_system_prompt += recall_text
        save_memory_description = (
            "Actively store long-term useful information. Use content for memory text and klass for category: identity, relationship, bond, conflict, fact, preference, health, task, ephemeral, other."
            "Timestamp is added by backend automatically. Save when you detect preferences, important facts, or emotional milestones."
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
                            "klass": {
                                "type": "string",
                                "description": "Memory class for weighting: identity (stable self-profile), relationship (long-term people ties), bond (attachment and closeness signals), conflict (argument lessons and emotional incidents), fact (durable factual info), preference (taste or habits), health (physical or mental condition), task (action item or to-do), ephemeral (short-lived context), other (fallback when unclear).",
                                "enum": [
                                    "identity",
                                    "relationship",
                                    "bond",
                                    "conflict",
                                    "fact",
                                    "preference",
                                    "health",
                                    "task",
                                    "ephemeral",
                                    "other",
                                ],
                            },
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
                    "description": "Search memories and summaries. Returns memory cards (type=memory) and summary records (type=summary). Summary items include msg_id_start and msg_id_end and can be used with search_chat_history for range lookup. Supports start_time/end_time filtering.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "limit": {"type": "integer"},
                            "source": {
                                "type": "string",
                                "description": "Optional memory source filter; pass all or omit for global search.",
                            },
                            "start_time": {
                                "type": "string",
                                "description": "ISO datetime lower bound for filtering summaries by time range.",
                            },
                            "end_time": {
                                "type": "string",
                                "description": "ISO datetime upper bound for filtering summaries by time range.",
                            },
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_chat_history",
                    "description": "Search chat history. Mode 1: keyword query returns hit messages with 3 messages of context before and after, merged and deduplicated. Mode 2: ID-range query with msg_id_start and msg_id_end returns all messages in range.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "limit": {"type": "integer"},
                            "session_id": {"type": "integer"},
                            "msg_id_start": {
                                "type": "integer",
                                "description": "Start id of a message range, used together with msg_id_end.",
                            },
                            "msg_id_end": {
                                "type": "integer",
                                "description": "End id of a message range, used together with msg_id_start.",
                            },
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_theater",
                    "description": "Search theater story summaries. Use keywords to find RP history and return title, AI partner, summary, and timespan.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "limit": {"type": "integer"},
                        },
                        "required": ["query"],
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
        print(f"[DEBUG] Raw Base URL: {api_provider.base_url} | SDK Base URL: {client.base_url}")
        retain_budget = self.dialogue_retain_budget
        trigger_threshold = self.dialogue_trigger_threshold
        dialogue_token_total = 0
        for message in messages:
            if message.get("role") in ("user", "assistant"):
                raw_content = message.get("content", "") or ""
                text_for_tokens = self._content_to_storage(raw_content) if isinstance(raw_content, list) else raw_content
                dialogue_token_total += self._estimate_tokens(text_for_tokens)
        message_index = 0
        if dialogue_token_total > trigger_threshold:
            while dialogue_token_total > retain_budget and message_index < len(messages):
                role = messages[message_index].get("role")
                if role in ("user", "assistant"):
                    trimmed_message = messages.pop(message_index)
                    raw_content = trimmed_message.get("content", "") or ""
                    text_for_tokens = self._content_to_storage(raw_content) if isinstance(raw_content, list) else raw_content
                    dialogue_token_total -= self._estimate_tokens(text_for_tokens)
                    self._trimmed_messages.append(trimmed_message)
                    trimmed_id = trimmed_message.get("id")
                    if isinstance(trimmed_id, int):
                        self._trimmed_message_ids.append(trimmed_id)
                    if role == "assistant":
                        while message_index < len(messages):
                            next_message = messages[message_index]
                            if next_message.get("role") != "tool":
                                break
                            trimmed_tool_message = messages.pop(message_index)
                            self._trimmed_messages.append(trimmed_tool_message)
                            trimmed_tool_id = trimmed_tool_message.get("id")
                            if isinstance(trimmed_tool_id, int):
                                self._trimmed_message_ids.append(trimmed_tool_id)
                    continue
                message_index += 1
        api_messages = []
        first_system_seen = False
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role == "system":
                if not first_system_seen and user_info:
                    content = full_system_prompt
                    first_system_seen = True
                else:
                    if not first_system_seen:
                        first_system_seen = True
                    # System notification — add timestamp
                    msg_time = message.get("created_at")
                    if msg_time:
                        timestamp = (
                            msg_time
                            if isinstance(msg_time, str)
                            else msg_time.strftime("%Y.%m.%d %H:%M")
                        )
                    else:
                        timestamp = (
                            datetime.now(timezone.utc)
                            .astimezone(TZ_EAST8)
                            .strftime("%Y.%m.%d %H:%M")
                        )
                    content = f"[{timestamp}] {content}"
            elif role == "user" and content is not None:
                msg_time = message.get("created_at")
                if msg_time:
                    timestamp = (
                        msg_time
                        if isinstance(msg_time, str)
                        else msg_time.strftime("%Y.%m.%d %H:%M")
                    )
                else:
                    timestamp = (
                        datetime.now(timezone.utc)
                        .astimezone(TZ_EAST8)
                        .strftime("%Y.%m.%d %H:%M")
                    )
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            part["text"] = f"[{timestamp}] {part.get('text', '')}"
                            break
                else:
                    content = f"[{timestamp}] {content}"
            elif role == "assistant" and content is not None:
                msg_time = message.get("created_at")
                if msg_time:
                    timestamp = (
                        msg_time
                        if isinstance(msg_time, str)
                        else msg_time.strftime("%Y.%m.%d %H:%M")
                    )
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
        print(f"[DEBUG] Calling model: {model_preset.model_name}")
        try:
            call_params: dict[str, Any] = {
                "model": model_preset.model_name,
                "messages": api_messages,
                "tools": tools,
                "tool_choice": "auto",
            }
            if model_preset.temperature is not None:
                call_params["temperature"] = model_preset.temperature
            if model_preset.top_p is not None:
                call_params["top_p"] = model_preset.top_p
            response = client.chat.completions.create(**call_params)
        except Exception as e:
            print(f"[API ERROR] Request failed: {str(e)}")
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
            now_utc = datetime.now(timezone.utc)
            for memory_id in used_ids:
                memory = self.db.get(Memory, int(memory_id))
                if memory:
                    memory.hits += 1
                    memory.last_access_ts = now_utc
            if used_ids:
                self.db.commit()
            clean_content = re.sub(r'\[\[used:\d+\]\]', '', choice.content).strip()
            messages.append({"role": "assistant", "content": clean_content})
            self._persist_message(session_id, "assistant", clean_content, {})
        else:
            fallback_content = "(No relevant memory found. Reply based on current prompt.)"
            messages.append({"role": "assistant", "content": fallback_content})
            self._persist_message(session_id, "assistant", fallback_content, {})
        return []

    def _trigger_summary(
        self,
        session_id: int,
        message_ids: list[int],
        assistant_id: int,
    ) -> None:
        if not self.session_factory:
            logger.warning(
                "Summary trigger skipped: session_factory is not configured (session_id=%s).",
                session_id,
            )
            return
        if not message_ids:
            logger.warning(
                "Summary trigger skipped: no trimmed message ids (session_id=%s).",
                session_id,
            )
            return
        db: Session = self.session_factory()
        try:
            trimmed_messages = (
                db.query(Message)
                .filter(
                    Message.session_id == session_id,
                    Message.id.in_(message_ids),
                )
                .order_by(Message.created_at.asc(), Message.id.asc())
                .all()
            )
            if not trimmed_messages:
                logger.warning(
                    "Summary trigger skipped: trimmed messages not found in db (session_id=%s).",
                    session_id,
                )
                return
            summary_service = SummaryService(self.session_factory)
            summary_service.generate_summary(session_id, trimmed_messages, assistant_id)
        except Exception:
            logger.exception(
                "Summary trigger failed (session_id=%s, assistant_id=%s).",
                session_id,
                assistant_id,
            )
        finally:
            db.close()

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

    @staticmethod
    def _content_to_storage(content: str | list | None) -> str:
        """Convert multimodal content to text-only storage format.
        Image parts are replaced with [图片:imageId] markers.
        """
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif item.get("type") == "image_url":
                image_id = item.get("image_id", "unknown")
                parts.append(f"[图片:{image_id}]")
            elif item.get("type") == "file":
                file_id = item.get("file_id", "unknown")
                file_name = item.get("file_name", "")
                parts.append(f"[文件:{file_id}:{file_name}]")
        return "".join(parts)

    def _persist_message(
        self, session_id: int, role: str, content: str | list, metadata: dict[str, Any]
    ) -> None:
        storage_content = self._content_to_storage(content)
        message = Message(
            session_id=session_id,
            role=role,
            content=storage_content,
            meta_info=metadata,
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)

