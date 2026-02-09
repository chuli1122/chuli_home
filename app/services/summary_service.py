from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.models.models import (
    ApiProvider,
    Assistant,
    Memory,
    Message,
    ModelPreset,
    SessionSummary,
    UserProfile,
)
from app.services.embedding_service import EmbeddingService
from app.services.core_blocks_updater import CoreBlocksUpdater

logger = logging.getLogger(__name__)

TZ_EAST8 = timezone(timedelta(hours=8))


class SummaryService:
    def __init__(self, session_factory: sessionmaker) -> None:
        self.session_factory = session_factory

    def generate_summary(
        self, session_id: int, messages: list[Message], assistant_id: int
    ) -> None:
        db: Session = self.session_factory()
        try:
            if not messages:
                return

            assistant = db.get(Assistant, assistant_id)
            if not assistant:
                logger.warning(
                    "Summary skipped: assistant not found (assistant_id=%s).",
                    assistant_id,
                )
                return

            primary_preset = self._resolve_primary_preset(db, assistant)
            if not primary_preset:
                logger.warning(
                    "Summary skipped: no available preset (assistant_id=%s).",
                    assistant_id,
                )
                return
            fallback_preset = self._resolve_fallback_preset(db, assistant)

            user_profile = db.query(UserProfile).first()
            user_name = user_profile.nickname if user_profile and user_profile.nickname else "User"
            assistant_name = assistant.name or "Assistant"
            conversation_text = self._format_messages(messages, user_name, assistant_name)
            if not conversation_text.strip():
                logger.warning("Summary skipped: no usable message content (session_id=%s).", session_id)
                return

            system_prompt = """
You are a conversation summarizer for a private AI companion system. The user is an adult.

Respond ONLY with a JSON object, no markdown fences, no extra text.

Task 1 - Summary:
Write a third-person objective summary of the conversation.
Focus on: topics discussed, decisions made, emotions expressed, new information revealed.
Use specific timestamps like "2.5 evening around 20:00", never relative time like "yesterday" or "just now".
For intimate content: record the scenario setup, preferences expressed, and emotional shifts, but do not reproduce explicit details.
Adjust length to content density, between 100-800 characters (Chinese).

Task 2 - Memory extraction:
Extract facts worth remembering long-term: preferences, facts, relationships, identity info, important agreements.
Do NOT extract casual conversation or temporary context.
Output as a list of objects with "content" (string) and "klass" (one of: identity, relationship, bond, conflict, fact, preference, health, task, ephemeral, other).

Task 3 - Mood tag:
Choose the single best mood tag for the user during this conversation segment: calm / happy / sad / anxious / angry / tired / emo / excited / mixed
Add a one-sentence explanation.

Output format:
{
  "summary": "...",
  "memories": [{"content": "...", "klass": "..."}],
  "mood_tag": "...",
  "mood_note": "..."
}
""".strip()

            parsed_payload: dict[str, Any] | None = None
            try:
                parsed_payload = self._call_summary_model(
                    db,
                    primary_preset,
                    system_prompt,
                    conversation_text,
                )
            except Exception:
                logger.exception(
                    "Primary summary model failed (session_id=%s, preset_id=%s).",
                    session_id,
                    primary_preset.id,
                )
                if fallback_preset and fallback_preset.id != primary_preset.id:
                    try:
                        parsed_payload = self._call_summary_model(
                            db,
                            fallback_preset,
                            system_prompt,
                            conversation_text,
                        )
                    except Exception:
                        logger.exception(
                            "Fallback summary model failed (session_id=%s, preset_id=%s).",
                            session_id,
                            fallback_preset.id,
                        )
                elif fallback_preset and fallback_preset.id == primary_preset.id:
                    logger.warning(
                        "Fallback preset equals primary preset (session_id=%s, preset_id=%s).",
                        session_id,
                        primary_preset.id,
                    )
            if not parsed_payload:
                return

            summary_text = str(parsed_payload.get("summary", "")).strip()
            if not summary_text:
                logger.warning("Summary skipped: empty summary content (session_id=%s).", session_id)
                return

            mood_tag_raw = str(parsed_payload.get("mood_tag", "")).strip().lower()
            valid_moods = {
                "calm",
                "happy",
                "sad",
                "anxious",
                "angry",
                "tired",
                "emo",
                "excited",
                "mixed",
            }
            mood_tag = mood_tag_raw if mood_tag_raw in valid_moods else None

            msg_ids = [message.id for message in messages if message.id is not None]
            msg_id_start = msg_ids[0] if msg_ids else None
            msg_id_end = msg_ids[-1] if msg_ids else None
            time_start = self._to_utc(messages[0].created_at) if messages else None
            time_end = self._to_utc(messages[-1].created_at) if messages else None

            summary = SessionSummary(
                session_id=session_id,
                summary_content=summary_text,
                perspective=assistant_name,
                msg_id_start=msg_id_start,
                msg_id_end=msg_id_end,
                time_start=time_start,
                time_end=time_end,
                mood_tag=mood_tag,
            )
            db.add(summary)
            db.flush()

            if msg_ids:
                db.query(Message).filter(Message.id.in_(msg_ids)).update(
                    {Message.summary_group_id: summary.id},
                    synchronize_session=False,
                )

            klass_defaults = {
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
            memory_candidates = parsed_payload.get("memories", [])
            if not isinstance(memory_candidates, list):
                memory_candidates = []

            anchor_utc = time_end or datetime.now(timezone.utc)
            anchor_text = anchor_utc.astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")
            embedding_service = EmbeddingService()

            for item in memory_candidates:
                if not isinstance(item, dict):
                    continue
                raw_content = str(item.get("content", "")).strip()
                if not raw_content:
                    continue

                raw_klass = str(item.get("klass", "other")).strip().lower()
                klass = raw_klass if raw_klass in klass_defaults else "other"
                klass_config = klass_defaults[klass]
                memory_content = f"[{anchor_text}] {raw_content}"

                embedding = embedding_service.get_embedding(memory_content)
                if embedding is not None:
                    duplicate = db.execute(
                        text(
                            """
SELECT id
FROM memories
WHERE embedding IS NOT NULL
  AND deleted_at IS NULL
  AND 1 - (embedding <=> :query_embedding) > :threshold
ORDER BY embedding <=> :query_embedding
LIMIT 1
"""
                        ),
                        {
                            "query_embedding": str(embedding),
                            "threshold": 0.9,
                        },
                    ).first()
                    if duplicate:
                        continue

                memory = Memory(
                    content=memory_content,
                    tags={},
                    source="auto_extract",
                    embedding=embedding,
                    klass=klass,
                    importance=klass_config["importance"],
                    halflife_days=klass_config["halflife_days"],
                    created_at=anchor_utc,
                )
                db.add(memory)

            db.commit()
            self._dispatch_core_block_signal(summary.id, assistant.id)
        except Exception:
            logger.exception("Failed to generate summary (session_id=%s).", session_id)
        finally:
            db.close()

    def _dispatch_core_block_signal(self, summary_id: int, assistant_id: int) -> None:
        def _worker() -> None:
            try:
                updater = CoreBlocksUpdater(self.session_factory)
                updater.collect_signals_from_summary(summary_id, assistant_id)
            except Exception:
                logger.exception(
                    "Core block signal task failed (summary_id=%s, assistant_id=%s).",
                    summary_id,
                    assistant_id,
                )

        threading.Thread(target=_worker, daemon=True).start()

    def _resolve_primary_preset(
        self, db: Session, assistant: Assistant
    ) -> ModelPreset | None:
        if assistant.summary_model_preset_id:
            preset = db.get(ModelPreset, assistant.summary_model_preset_id)
            if preset:
                return preset
            logger.warning(
                "Configured summary preset not found (preset_id=%s).",
                assistant.summary_model_preset_id,
            )
        summary_named = db.query(ModelPreset).filter(ModelPreset.name == "summary").first()
        if summary_named:
            return summary_named
        return db.get(ModelPreset, assistant.model_preset_id)

    def _resolve_fallback_preset(
        self, db: Session, assistant: Assistant
    ) -> ModelPreset | None:
        if not assistant.summary_fallback_preset_id:
            return None
        preset = db.get(ModelPreset, assistant.summary_fallback_preset_id)
        if preset:
            return preset
        logger.warning(
            "Configured fallback summary preset not found (preset_id=%s).",
            assistant.summary_fallback_preset_id,
        )
        return None

    def _call_summary_model(
        self,
        db: Session,
        preset: ModelPreset,
        system_prompt: str,
        conversation_text: str,
    ) -> dict[str, Any]:
        api_provider = db.get(ApiProvider, preset.api_provider_id)
        if not api_provider:
            raise ValueError(f"API provider not found for preset_id={preset.id}")

        base_url = api_provider.base_url
        if base_url.endswith("/chat/completions"):
            base_url = base_url[: -len("/chat/completions")]
            if not base_url.endswith("/v1"):
                base_url = f"{base_url.rstrip('/')}/v1"
        client = OpenAI(api_key=api_provider.api_key, base_url=base_url)

        response = client.chat.completions.create(
            model=preset.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": conversation_text},
            ],
            temperature=preset.temperature,
            top_p=preset.top_p,
            max_tokens=preset.max_tokens,
        )
        if not response.choices:
            raise ValueError("Summary response contained no choices.")
        content = response.choices[0].message.content or ""
        cleaned_content = content.strip()
        if cleaned_content.startswith("```json"):
            cleaned_content = cleaned_content[len("```json") :]
        elif cleaned_content.startswith("```"):
            cleaned_content = cleaned_content[len("```") :]
        if cleaned_content.endswith("```"):
            cleaned_content = cleaned_content[: -len("```")]
        payload = json.loads(cleaned_content.strip())
        if not isinstance(payload, dict):
            raise ValueError("Summary response is not a JSON object.")
        return payload

    def _format_messages(
        self, messages: list[Message], user_name: str, assistant_name: str
    ) -> str:
        lines: list[str] = []
        for message in messages:
            role = (message.role or "").lower()
            if role == "user":
                speaker = user_name
            elif role == "assistant":
                speaker = assistant_name
            else:
                speaker = role or "unknown"
            content = (message.content or "").strip()
            if not content:
                continue
            created_at = self._to_utc(message.created_at)
            if created_at:
                ts = created_at.astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")
                lines.append(f"[{ts}] {speaker}: {content}")
            else:
                lines.append(f"{speaker}: {content}")
        return "\n".join(lines)

    def _to_utc(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
