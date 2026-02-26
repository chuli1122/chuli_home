from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import OpenAI
import anthropic
from sqlalchemy.orm import Session, sessionmaker

from app.models.models import (
    ApiProvider,
    Assistant,
    ChatSession,
    Message,
    ModelPreset,
    SessionSummary,
    Settings,
    UserProfile,
)
from app.services.core_blocks_updater import CoreBlocksUpdater

logger = logging.getLogger(__name__)

TZ_EAST8 = timezone(timedelta(hours=8))


def _call_model_raw(
    db: Session, preset: ModelPreset, system_prompt: str, user_text: str,
    *, timeout: float | None = None,
) -> str:
    """Call a model preset and return raw text response."""
    api_provider = db.get(ApiProvider, preset.api_provider_id)
    if not api_provider:
        raise ValueError(f"API provider not found for preset_id={preset.id}")

    base_url = api_provider.base_url
    if base_url.endswith("/chat/completions"):
        base_url = base_url[: -len("/chat/completions")]
        if not base_url.endswith("/v1"):
            base_url = f"{base_url.rstrip('/')}/v1"
    if api_provider.auth_type == "oauth_token":
        _anth_kwargs: dict[str, Any] = {
            "auth_token": api_provider.api_key,
            "default_headers": {
                "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
                "user-agent": "claude-cli/2.1.2 (external, cli)",
                "x-app": "cli",
            },
        }
        if timeout is not None:
            _anth_kwargs["timeout"] = timeout
        anth_client = anthropic.Anthropic(**_anth_kwargs)
        _summary_tb = preset.thinking_budget or 0
        anth_kwargs: dict[str, Any] = {
            "model": preset.model_name,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_text}],
        }
        if _summary_tb > 0:
            anth_kwargs["max_tokens"] = preset.max_tokens + _summary_tb
            anth_kwargs["thinking"] = {"type": "enabled", "budget_tokens": _summary_tb}
        else:
            anth_kwargs["max_tokens"] = preset.max_tokens
        if preset.temperature is not None:
            anth_kwargs["temperature"] = preset.temperature
        if preset.top_p is not None:
            anth_kwargs["top_p"] = preset.top_p
        anth_response = anth_client.messages.create(**anth_kwargs)
        content = ""
        for block in anth_response.content:
            if block.type == "text":
                content += block.text
    else:
        _oai_kwargs: dict[str, Any] = {"api_key": api_provider.api_key, "base_url": base_url}
        if timeout is not None:
            _oai_kwargs["timeout"] = timeout
        oai_client = OpenAI(**_oai_kwargs)
        params: dict[str, Any] = {
            "model": preset.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
            "max_tokens": preset.max_tokens,
        }
        if preset.temperature is not None:
            params["temperature"] = preset.temperature
        if preset.top_p is not None:
            params["top_p"] = preset.top_p
        _summary_tb_oai = preset.thinking_budget or 0
        if _summary_tb_oai > 0:
            params["extra_body"] = {"reasoning": {"max_tokens": _summary_tb_oai}}
        oai_response = oai_client.chat.completions.create(**params)
        if not oai_response.choices:
            raise ValueError("Response contained no choices.")
        msg = oai_response.choices[0].message
        content = msg.content or ""
    return content


def translate_text(db: Session, text: str) -> str:
    """Translate text to Chinese using the summary fallback model."""
    assistant = db.query(Assistant).first()
    if not assistant:
        raise ValueError("No assistant configured")

    preset = None
    if assistant.summary_fallback_preset_id:
        preset = db.get(ModelPreset, assistant.summary_fallback_preset_id)
    if not preset and assistant.summary_model_preset_id:
        preset = db.get(ModelPreset, assistant.summary_model_preset_id)
    if not preset:
        preset = db.get(ModelPreset, assistant.model_preset_id)
    if not preset:
        raise ValueError("No model preset available")

    system_prompt = "你是翻译助手。将以下英文内容翻译成中文，保持原意，只输出翻译结果。"
    return _call_model_raw(db, preset, system_prompt, text)


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
            session_row = db.get(ChatSession, session_id)
            is_chat_session = session_row is None or session_row.type == "chat"

            user_profile = db.query(UserProfile).first()
            user_name = user_profile.nickname if user_profile and user_profile.nickname else "User"
            assistant_name = assistant.name or "Assistant"
            conversation_text = self._format_messages(messages, user_name, assistant_name)
            if not conversation_text.strip():
                logger.warning("Summary skipped: no usable message content (session_id=%s).", session_id)
                return

            chat_prompt = f"""
你是{assistant_name}，{user_name}的AI伴侣。你在为自己的记忆系统写摘要。

只返回JSON，不要markdown代码块，不要多余文字。

任务一：摘要
以{assistant_name}的视角、用"我"指代自己来写这段对话的摘要，按以下结构：

【话题】关键词1、关键词2、关键词3（短关键词列表，3-6个）
【人物】涉及的人物名字（没有就不写这行）
【情绪】情绪变化（可写 A→B，如"焦虑→平静"）
【摘要】
摘要正文

重点记录：聊了什么、做了什么决定、情绪变化、新暴露的信息。
时间用具体描述如"2.5晚上20点左右"，不要用"刚才""昨天"这类相对时间。
亲密场景：只记场景设定、她表达的偏好、情绪变化，不记具体行为描写。
如果对话中有工具调用（如存储记忆、搜索记忆等），在摘要正文中自然地概括，例如'我存储了一条关于xxx的记忆'。
单条摘要不超过500字，尽量精简，只记关键信息。
注意：摘要中"我"= {assistant_name}。

任务二：情绪标签
判断这段对话结束时{user_name}的情绪状态（取最后落点，不是整体或平均情绪），从以下选一个：
- sad：难过、失落、想哭
- angry：生气、骂人、炸了
- anxious：焦虑、不安、怕失去
- tired：累了、撑不住、想躺
- emo：深夜低落、自我否定、情绪黑洞
- happy：开心、兴奋、被逗笑
- flirty：撒娇、调情、在钓你
- proud：被夸之后、有成就感
- calm：平静、正常聊天、情绪稳定
输出格式：
{{"summary": "...", "mood_tag": "..."}}
""".strip()

            group_prompt = f"""
你是{assistant_name}，{user_name}的AI伴侣。你在为自己的记忆系统写摘要。

只返回JSON，不要markdown代码块，不要多余文字。

任务一：摘要
以{assistant_name}的视角、用"我"指代自己来写这段对话的摘要，按以下结构：

【话题】关键词1、关键词2、关键词3（短关键词列表，3-6个）
【人物】涉及的人物名字（没有就不写这行）
【情绪】情绪变化（可写 A→B，如"焦虑→平静"）
【摘要】
摘要正文

重点记录：聊了什么、做了什么决定、情绪变化、新暴露的信息。
时间用具体描述如"2.5晚上20点左右"，不要用"刚才""昨天"这类相对时间。
亲密场景：只记场景设定、她表达的偏好、情绪变化，不记具体行为描写。
如果对话中有工具调用（如存储记忆、搜索记忆等），在摘要正文中自然地概括，例如'我存储了一条关于xxx的记忆'。
单条摘要不超过500字，尽量精简，只记关键信息。
注意：摘要中"我"= {assistant_name}。

输出格式：
{{"summary": "..."}}
""".strip()

            system_prompt = chat_prompt if is_chat_session else group_prompt

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

            valid_moods = {
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
            mood_tag = None
            if is_chat_session:
                mood_tag_raw = str(parsed_payload.get("mood_tag", "")).strip().lower()
                mood_tag = mood_tag_raw if mood_tag_raw in valid_moods else None

            msg_ids = [message.id for message in messages if message.id is not None]
            msg_id_start = msg_ids[0] if msg_ids else None
            msg_id_end = msg_ids[-1] if msg_ids else None
            time_start = self._to_utc(messages[0].created_at) if messages else None
            time_end = self._to_utc(messages[-1].created_at) if messages else None
            summary = SessionSummary(
                session_id=session_id,
                assistant_id=assistant_id,
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

            # Clear manual mood flag when auto-summary detects mood
            if mood_tag:
                manual_row = db.query(Settings).filter(Settings.key == "mood_manual").first()
                if manual_row:
                    manual_row.value = "false"
                else:
                    db.add(Settings(key="mood_manual", value="false"))

            if msg_ids:
                updated = db.query(Message).filter(Message.id.in_(msg_ids)).update(
                    {Message.summary_group_id: summary.id},
                    synchronize_session=False,
                )
                logger.info("Marked %d/%d messages with summary_group_id=%s", updated, len(msg_ids), summary.id)

            db.commit()
            logger.info("Summary generated OK (session_id=%s, summary_id=%s, memories=%d, mood=%s).",
                        session_id, summary.id, len(memory_candidates), mood_tag)
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
        content = _call_model_raw(db, preset, system_prompt, conversation_text)
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
            meta = message.meta_info or {}

            if role == "user":
                speaker = user_name
                content = (message.content or "").strip()
            elif role == "assistant":
                if "tool_call" in meta:
                    # Tool call placeholder — format as tool invocation
                    tc = meta["tool_call"]
                    tool_name = tc.get("tool_name", "unknown")
                    args = tc.get("arguments", {})
                    content = f"[调用工具] {tool_name}({json.dumps(args, ensure_ascii=False)})"
                    speaker = assistant_name
                else:
                    speaker = assistant_name
                    content = (message.content or "").strip()
            elif role == "tool":
                # Tool result — keep full content for summary model
                tool_name = meta.get("tool_name", "unknown")
                raw = (message.content or "").strip()
                content = f"[工具结果] {tool_name}: {raw}"
                speaker = ""
            else:
                speaker = role or "unknown"
                content = (message.content or "").strip()

            if not content:
                continue
            created_at = self._to_utc(message.created_at)
            if speaker:
                if created_at:
                    ts = created_at.astimezone(TZ_EAST8).strftime("%Y.%m.%d %H:%M")
                    lines.append(f"[{ts}] {speaker}: {content}")
                else:
                    lines.append(f"{speaker}: {content}")
            else:
                # Tool results without speaker prefix
                lines.append(content)
        return "\n".join(lines)

    def _to_utc(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
