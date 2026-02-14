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
from app.constants import KLASS_DEFAULTS

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
        source = payload.get("source", "unknown")

        # Deduplication check: find similar memories with similarity > 0.88
        if embedding is not None:
            dup_sql = text(
                """
    SELECT id, content, source, 1 - (embedding <=> :query_embedding) AS similarity
    FROM memories
    WHERE embedding IS NOT NULL
      AND deleted_at IS NULL
      AND 1 - (embedding <=> :query_embedding) > 0.88
    ORDER BY embedding <=> :query_embedding
    LIMIT 1
"""
            )
            dup_result = self.db.execute(
                dup_sql, {"query_embedding": str(embedding)}
            ).first()
            if dup_result:
                # If source is from auto_extract, silently discard
                if source.startswith("auto_extract"):
                    return {
                        "duplicate": True,
                        "discarded": True,
                        "existing_id": dup_result.id,
                    }
                # If source is main model (assistant name), return duplicate info
                return {
                    "duplicate": True,
                    "existing_id": dup_result.id,
                    "existing_content": dup_result.content,
                }

        memory = Memory(
            content=content,
            tags=payload.get("tags", {}),
            source=source,
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
        # Permission check: can modify own memories and auto_extract:own_name memories
        allowed_sources = {source, "unknown", f"auto_extract:{source}"}
        if memory.source not in allowed_sources and not memory.source.startswith(f"auto_extract:{source}"):
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
        # Permission check: can delete own memories and auto_extract:own_name memories
        allowed_sources = {source, "unknown", f"auto_extract:{source}"}
        if memory.source not in allowed_sources and not memory.source.startswith(f"auto_extract:{source}"):
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

    def list_memories(self, payload: dict[str, Any]) -> dict[str, Any]:
        start_time = self._parse_iso_datetime(payload.get("start_time"))
        end_time = self._parse_iso_datetime(payload.get("end_time"))
        klass = payload.get("klass")
        try:
            limit = max(1, int(payload.get("limit", 20)))
        except Exception:
            limit = 20

        if start_time and end_time and start_time > end_time:
            start_time, end_time = end_time, start_time

        # Build SQL query with optional filters
        where_clauses = ["deleted_at IS NULL"]
        params: dict[str, Any] = {"limit": limit}

        if start_time is not None:
            where_clauses.append("created_at >= :start_time")
            params["start_time"] = start_time
        if end_time is not None:
            where_clauses.append("created_at <= :end_time")
            params["end_time"] = end_time
        if klass:
            where_clauses.append("klass = :klass")
            params["klass"] = klass

        where_clause = " AND ".join(where_clauses)
        sql = text(
            f"""
    SELECT id, content, tags, klass, source, created_at
    FROM memories
    WHERE {where_clause}
    ORDER BY created_at DESC
    LIMIT :limit
"""
        )
        rows = self.db.execute(sql, params).all()

        results = [
            {
                "id": row.id,
                "content": row.content,
                "tags": row.tags,
                "klass": row.klass,
                "source": row.source,
                "created_at": self._format_time_east8(row.created_at),
            }
            for row in rows
        ]
        return {"results": results}

    def search_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        source = payload.get("source")
        query_vector = self.embedding_service.get_embedding(query) if query else None

        # Vector search top 10
        vector_rows = []
        if query_vector is not None:
            vector_where = "WHERE embedding IS NOT NULL AND deleted_at IS NULL"
            vector_params = {"query_embedding": str(query_vector)}
            if source and source != "all":
                vector_where += " AND source = :source"
                vector_params["source"] = source

            vector_sql = text(
                """
    SELECT id, content, tags, klass, created_at
    FROM memories
    {vector_where}
    ORDER BY embedding <=> :query_embedding
    LIMIT 10
""".format(vector_where=vector_where)
            )
            vector_rows = self.db.execute(vector_sql, vector_params).all()

        # Pgroonga full-text search top 10
        pgroonga_rows = []
        if query:
            pgroonga_where = "WHERE deleted_at IS NULL AND search_text &@~ :query"
            pgroonga_params = {"query": query}
            if source and source != "all":
                pgroonga_where += " AND source = :source"
                pgroonga_params["source"] = source

            pgroonga_sql = text(
                """
    SELECT id, content, tags, klass, created_at
    FROM memories
    {pgroonga_where}
    ORDER BY pgroonga_score(tableoid, ctid) DESC
    LIMIT 10
""".format(pgroonga_where=pgroonga_where)
            )
            pgroonga_rows = self.db.execute(pgroonga_sql, pgroonga_params).all()

        # Merge by memory id, deduplicate, return all without truncation
        results = []
        seen_ids = set()
        for row in vector_rows:
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            results.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "tags": row.tags,
                    "klass": row.klass,
                    "created_at": self._format_time_east8(row.created_at),
                }
            )

        for row in pgroonga_rows:
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            results.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "tags": row.tags,
                    "klass": row.klass,
                    "created_at": self._format_time_east8(row.created_at),
                }
            )

        return {"query": query, "results": results}

    def search_summary(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        try:
            limit = max(1, int(payload.get("limit", 5)))
        except Exception:
            limit = 5
        start_time = self._parse_iso_datetime(payload.get("start_time"))
        end_time = self._parse_iso_datetime(payload.get("end_time"))
        if start_time and end_time and start_time > end_time:
            start_time, end_time = end_time, start_time

        if not query:
            return {"query": query, "results": []}

        # Pgroonga search on session_summaries
        pgroonga_where = "WHERE summary_content &@~ :query"
        pgroonga_params = {"query": query, "limit": limit}
        if start_time is not None:
            pgroonga_where += " AND time_start >= :start_time"
            pgroonga_params["start_time"] = start_time
        if end_time is not None:
            pgroonga_where += " AND time_end <= :end_time"
            pgroonga_params["end_time"] = end_time

        pgroonga_sql = text(
            """
    SELECT id, summary_content, session_id, assistant_id, msg_id_start, msg_id_end,
           time_start, time_end, mood_tag
    FROM session_summaries
    {pgroonga_where}
    ORDER BY pgroonga_score(tableoid, ctid) DESC
    LIMIT :limit
""".format(pgroonga_where=pgroonga_where)
        )
        rows = self.db.execute(pgroonga_sql, pgroonga_params).all()

        results = [
            {
                "id": row.id,
                "summary_content": row.summary_content,
                "session_id": row.session_id,
                "assistant_id": row.assistant_id,
                "msg_id_start": row.msg_id_start,
                "msg_id_end": row.msg_id_end,
                "time_start": self._format_time_east8(row.time_start),
                "time_end": self._format_time_east8(row.time_end),
                "mood_tag": row.mood_tag,
            }
            for row in rows
        ]
        return {"query": query, "results": results}

    def search_chat_history(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
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
        try:
            message_id = (
                int(payload.get("message_id"))
                if payload.get("message_id") is not None
                else None
            )
        except Exception:
            message_id = None

        if (
            msg_id_start is not None
            and msg_id_end is not None
            and msg_id_start > msg_id_end
        ):
            msg_id_start, msg_id_end = msg_id_end, msg_id_start

        context_size = 3

        # Mode 1: ID range mode
        use_id_range = msg_id_start is not None and msg_id_end is not None
        if use_id_range:
            messages_query = self.db.query(Message).filter(
                Message.role.in_(["user", "assistant"]),
                Message.content.is_not(None),
                Message.content != "",
            )
            if session_id is not None:
                messages_query = messages_query.filter(Message.session_id == session_id)
            hit_messages = (
                messages_query.filter(Message.id.between(msg_id_start, msg_id_end))
                .order_by(Message.id.asc())
                .all()
            )
            results = [
                {
                    "id": message.id,
                    "session_id": message.session_id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": self._format_time_east8(message.created_at),
                }
                for message in hit_messages
            ]
            return {
                "query": query,
                "results": results,
                "mode": "id_range",
            }

        # Mode 2: Single message ID mode (returns message + 3 before + 3 after)
        if message_id is not None:
            target_message = self.db.get(Message, message_id)
            if not target_message:
                return {
                    "query": query,
                    "results": [],
                    "mode": "message_id",
                }
            # Get 3 messages before
            prev_messages = (
                self.db.query(Message)
                .filter(
                    Message.session_id == target_message.session_id,
                    Message.id < message_id,
                )
                .order_by(Message.id.desc())
                .limit(context_size)
                .all()
            )
            # Get 3 messages after
            next_messages = (
                self.db.query(Message)
                .filter(
                    Message.session_id == target_message.session_id,
                    Message.id > message_id,
                )
                .order_by(Message.id.asc())
                .limit(context_size)
                .all()
            )
            all_messages = list(reversed(prev_messages)) + [target_message] + next_messages
            results = [
                {
                    "id": msg.id,
                    "session_id": msg.session_id,
                    "role": msg.role,
                    "content": msg.content,
                    "created_at": self._format_time_east8(msg.created_at),
                    "is_target": msg.id == message_id,
                }
                for msg in all_messages
            ]
            return {
                "query": query,
                "results": results,
                "mode": "message_id",
            }

        # Mode 3: Keyword search using pgroonga (returns hit messages only, no context)
        if query:
            pgroonga_sql = text(
                """
    SELECT id, session_id, role, content, created_at
    FROM messages
    WHERE content &@~ :query
    ORDER BY pgroonga_score(tableoid, ctid) DESC
    LIMIT 10
"""
            )
            rows = self.db.execute(pgroonga_sql, {"query": query}).all()
            results = [
                {
                    "id": row.id,
                    "session_id": row.session_id,
                    "role": row.role,
                    "content": row.content,
                    "created_at": self._format_time_east8(row.created_at),
                }
                for row in rows
            ]
            return {
                "query": query,
                "results": results,
                "mode": "keyword",
            }

        return {
            "query": query,
            "results": [],
            "mode": "unknown",
        }

    def search_theater(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query", "") or "").strip()
        try:
            limit = max(1, int(payload.get("limit", 5)))
        except Exception:
            limit = 5
        if not query:
            return {"query": query, "results": []}

        # Use pgroonga for full-text search on summary
        pgroonga_sql = text(
            """
    SELECT title, ai_partner, summary, story_timespan
    FROM theater_stories
    WHERE summary IS NOT NULL AND summary &@~ :query
    ORDER BY pgroonga_score(tableoid, ctid) DESC
    LIMIT :limit
"""
        )
        rows = self.db.execute(pgroonga_sql, {"query": query, "limit": limit}).all()
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
        """Dual-path recall: vector top 20 + pgroonga top 20, then rerank and decay-score."""
        CANDIDATE_POOL_SIZE = 20
        TAG_EXPANSION_LIMIT = 3
        rerank_top_n = max(limit, 1)
        query_vector = self.embedding_service.get_embedding(query)
        if query_vector is None:
            return []

        # Vector search top 20
        vector_sql = text(
            """
    SELECT id, content, tags, source, klass, importance, manual_boost, hits,
           halflife_days, last_access_ts, created_at
    FROM memories
    WHERE embedding IS NOT NULL
      AND deleted_at IS NULL
      AND 1 - (embedding <=> :query_embedding) >= :min_similarity
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
"""
        )
        vector_rows = self.db.execute(
            vector_sql,
            {
                "query_embedding": str(query_vector),
                "limit": CANDIDATE_POOL_SIZE,
                "min_similarity": 0.35,
            },
        ).all()

        # Pgroonga full-text search top 20
        pgroonga_sql = text(
            """
    SELECT id, content, tags, source, klass, importance, manual_boost, hits,
           halflife_days, last_access_ts, created_at
    FROM memories
    WHERE deleted_at IS NULL AND search_text &@~ :query
    ORDER BY pgroonga_score(tableoid, ctid) DESC
    LIMIT 20
"""
        )
        pgroonga_rows = self.db.execute(pgroonga_sql, {"query": query}).all()

        # Deduplicate by memory id
        seen_ids = set()
        candidate_rows = []
        for row in vector_rows:
            if row.id not in seen_ids:
                seen_ids.add(row.id)
                candidate_rows.append(row)
        for row in pgroonga_rows:
            if row.id not in seen_ids:
                seen_ids.add(row.id)
                candidate_rows.append(row)

        # Rerank to get top 5
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

        # Always apply decay score weighting after reranking
        try:
            scored_rows: list[tuple[float, Any]] = []
            now_utc = datetime.now(timezone.utc)
            mood = (current_mood_tag or "").strip().lower()
            is_negative_mood = mood in NEGATIVE_MOOD_TAGS

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
                # Extra boost for conflict/bond in negative mood
                if is_negative_mood:
                    if row.klass == "conflict":
                        decayed_score *= 1.5
                    elif row.klass == "bond":
                        decayed_score *= 1.3
                scored_rows.append((decayed_score, row))
            scored_rows.sort(key=lambda item: item[0], reverse=True)
            primary_rows = [row for _, row in scored_rows]
        except Exception as exc:
            logger.warning("Decay score weighting failed in fast_recall: %s", exc)

        result_ids = {row.id for row in primary_rows if getattr(row, "id", None) is not None}
        collected_tags: set[str] = set()
        for row in primary_rows:
            tags = row.tags
            if isinstance(tags, dict):
                for value in tags.values():
                    if isinstance(value, list):
                        for item in value:
                            item_text = str(item).strip()
                            if item_text:
                                collected_tags.add(item_text)

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
              AND EXISTS (
                SELECT 1 FROM jsonb_each(tags) AS t(k, v),
                LATERAL jsonb_array_elements_text(
                  CASE jsonb_typeof(v) WHEN 'array' THEN v ELSE '[]' END
                ) AS elem
                WHERE elem = ANY(:tag_list)
              )
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
    silent_tools = {"list_memories", "search_memory", "search_summary", "search_chat_history", "search_theater"}
    tool_display_names = {
        "save_memory": "创建记忆",
        "update_memory": "更新记忆",
        "delete_memory": "删除记忆",
        "write_diary": "写日记",
        "list_memories": "列出记忆",
        "search_memory": "搜索记忆",
        "search_summary": "搜索对话摘要",
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
        short_mode: bool = False,
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
            pending_tool_calls = list(self._fetch_next_tool_calls(messages, session_id, short_mode=short_mode))
            all_trimmed_messages.extend(self._trimmed_messages)
            all_trimmed_message_ids.extend(self._trimmed_message_ids)
        while pending_tool_calls:
            # Execute ALL tool calls in this batch before calling the API again
            for tool_call in pending_tool_calls:
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
                try:
                    self._persist_tool_call(session_id, tool_call)
                except Exception as e:
                    logger.error("Failed to persist tool call %s: %s", tool_name, e)
                    try:
                        self.db.rollback()
                    except Exception:
                        pass
                try:
                    tool_result = self._execute_tool(tool_call)
                except Exception as e:
                    logger.error("Tool execution error (%s): %s", tool_name, e)
                    tool_result = {"error": str(e)}
                messages.append(
                    {
                        "role": "tool",
                        "name": tool_name,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                        "tool_call_id": tool_call.id,
                    }
                )
                try:
                    self._persist_tool_result(session_id, tool_name, tool_result)
                except Exception as e:
                    logger.error("Failed to persist tool result %s: %s", tool_name, e)
                    try:
                        self.db.rollback()
                    except Exception:
                        pass
            # All tool results added, now call API again for next response
            logger.info("[chat_completion] Tool calls done, making follow-up API call (session=%s)", session_id)
            pending_tool_calls = list(self._fetch_next_tool_calls(messages, session_id, short_mode=short_mode))
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
        self, messages: list[dict[str, Any]], session_id: int, *, short_mode: bool = False,
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
                    recall_text += f"- {mem['content']} (source: {source})\n"
                recall_text += "[If above memories are insufficient, you can use search_memory or search_chat_history to supplement]\n"
                full_system_prompt += recall_text
        if short_mode:
            full_system_prompt += (
                "\n\n[短消息模式]\n"
                "像真人发微信一样回复。用多条短消息，每条一个想法或一句话，最多8条。"
                "可以很短（一个字、一个标点都行），可以中途补充，语气自然口语化。"
                "不需要完整句子，不需要Markdown。用[NEXT]分隔每条消息。"
            )
        save_memory_description = (
            "Actively store long-term useful information. Use content for memory text and klass for category: identity, relationship, bond, conflict, fact, preference, health, task, ephemeral, other. "
            "Timestamp is added by backend automatically. Save when you detect preferences, important facts, or emotional milestones. "
            "存储时注意：涉及的人写清楚名字或昵称，避免纯代词；带 tags；选对 klass。"
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
                            "tags": {
                                "type": "object",
                                "description": "搜索用主题标签，放具体关键词方便检索，不放 klass 已覆盖的大类词。示例：{\"topic\": [\"跨年夜\", \"伪骨科RP\"]}",
                            },
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
            {"type": "function", "function": {"name": "list_memories", "description": "按时间范围或分类列出记忆，不搜索。用于回顾已存的记忆、避免重复存储。", "parameters": {"type": "object", "properties": {"start_time": {"type": "string"}, "end_time": {"type": "string"}, "klass": {"type": "string"}, "limit": {"type": "integer"}}}}},
            {"type": "function", "function": {"name": "search_memory", "description": "搜索记忆卡片,从长期记忆中查找信息。", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "source": {"type": "string"}}}}},
            {"type": "function", "function": {"name": "search_summary", "description": "搜索对话摘要。用于查找过去某段对话的概要、定位时间范围。可用返回的 msg_id_start 和 msg_id_end 配合 search_chat_history 拉取原文。", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}, "start_time": {"type": "string"}, "end_time": {"type": "string"}}, "required": ["query"]}}},
            {"type": "function", "function": {"name": "search_chat_history", "description": "搜索聊天记录。三种模式:1) 关键词搜索(传 query,返回命中消息不带上下文); 2) ID范围(传 msg_id_start + msg_id_end); 3) 单条ID(传 message_id,返回该条+前后各3条)", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "session_id": {"type": "integer"}, "msg_id_start": {"type": "integer"}, "msg_id_end": {"type": "integer"}, "message_id": {"type": "integer"}}}}},
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
            try:
                params = self._build_api_call_params(messages, session_id)
            except Exception as e:
                logger.error("[stream] Failed to build API call params (session=%s): %s", session_id, e)
                yield f'data: {json.dumps({"error": str(e)})}\n\n'
                yield 'data: [DONE]\n\n'
                return
            if params is None:
                logger.error("[stream] _build_api_call_params returned None (session=%s)", session_id)
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
            try:
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
            except Exception as e:
                logger.error(f"Stream iteration error: {e}")
                yield f'data: {json.dumps({"error": str(e)})}\n\n'
                yield 'data: [DONE]\n\n'
                return
            if tool_calls_acc:
                tool_calls_payload = []
                parsed_tool_calls = []
                for idx in sorted(tool_calls_acc.keys()):
                    tc = tool_calls_acc[idx]
                    tool_calls_payload.append({
                        "id": tc["id"], "type": "function",
                        "function": {"name": tc["name"], "arguments": tc["arguments"]},
                    })
                    try:
                        parsed_tool_calls.append(ToolCall(
                            name=tc["name"],
                            arguments=json.loads(tc["arguments"] or "{}"),
                            id=tc["id"],
                        ))
                    except json.JSONDecodeError as e:
                        logger.error("Failed to parse tool call arguments for %s: %s", tc["name"], e)
                        parsed_tool_calls.append(ToolCall(name=tc["name"], arguments={}, id=tc["id"]))
                full_content = "".join(content_chunks)
                messages.append({
                    "role": "assistant", "content": full_content,
                    "tool_calls": tool_calls_payload,
                })
                try:
                    self._persist_message(session_id, "assistant", full_content, {"tool_calls": tool_calls_payload})
                except Exception as e:
                    logger.error("Failed to persist assistant tool_calls message: %s", e)
                    try:
                        self.db.rollback()
                    except Exception:
                        pass
                for tc in parsed_tool_calls:
                    try:
                        self._persist_tool_call(session_id, tc)
                    except Exception as e:
                        logger.error("Failed to persist tool call %s: %s", tc.name, e)
                        try:
                            self.db.rollback()
                        except Exception:
                            pass
                    try:
                        tool_result = self._execute_tool(tc)
                    except Exception as e:
                        logger.error("Tool execution error (%s): %s", tc.name, e)
                        tool_result = {"error": str(e)}
                    messages.append({
                        "role": "tool", "name": tc.name,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                        "tool_call_id": tc.id,
                    })
                    try:
                        self._persist_tool_result(session_id, tc.name, tool_result)
                    except Exception as e:
                        logger.error("Failed to persist tool result %s: %s", tc.name, e)
                        try:
                            self.db.rollback()
                        except Exception:
                            pass
                logger.info("[stream] Tool calls done, making follow-up API call (session=%s)", session_id)
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
        if tool_name == "list_memories":
            return self.memory_service.list_memories(tool_call.arguments)
        if tool_name == "search_memory":
            return self.memory_service.search_memory(tool_call.arguments)
        if tool_name == "search_summary":
            return self.memory_service.search_summary(tool_call.arguments)
        if tool_name == "search_chat_history":
            return self.memory_service.search_chat_history(tool_call.arguments)
        if tool_name == "search_theater":
            return self.memory_service.search_theater(tool_call.arguments)
        if tool_name == "web_search":
            return {"status": "not_implemented", "payload": tool_call.arguments}
        return {"status": "unknown_tool", "payload": tool_call.arguments}

    def _fetch_next_tool_calls(
        self, messages: list[dict[str, Any]], session_id: int, *, short_mode: bool = False,
    ) -> Iterable[ToolCall]:
        params = self._build_api_call_params(messages, session_id, short_mode=short_mode)
        if params is None:
            return []
        client, model_name, api_messages, tools, preset_temperature, preset_top_p = params
        logger.info("[_fetch_next_tool_calls] Calling model: %s (session=%s, msg_count=%d)",
                    model_name, session_id, len(api_messages))
        try:
            call_params: dict[str, Any] = {
                "model": model_name,
                "messages": api_messages,
                "tools": tools,
                "tool_choice": "auto",
            }
            if preset_temperature is not None:
                call_params["temperature"] = preset_temperature
            if preset_top_p is not None:
                call_params["top_p"] = preset_top_p
            response = client.chat.completions.create(**call_params)
        except Exception as e:
            logger.error("[_fetch_next_tool_calls] API request FAILED (session=%s): %s", session_id, e)
            # Persist error as assistant message so user sees something
            error_content = f"(API调用失败: {e})"
            messages.append({"role": "assistant", "content": error_content})
            try:
                self._persist_message(session_id, "assistant", error_content, {})
            except Exception:
                try:
                    self.db.rollback()
                except Exception:
                    pass
            return []
        if not response.choices:
            logger.warning("[_fetch_next_tool_calls] LLM response had no choices (session=%s)", session_id)
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
            if short_mode and "[NEXT]" in clean_content:
                parts = [p.strip() for p in clean_content.split("[NEXT]") if p.strip()]
                for part in parts:
                    messages.append({"role": "assistant", "content": part})
                    self._persist_message(session_id, "assistant", part, {})
            else:
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

