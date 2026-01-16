from __future__ import annotations

import logging
from typing import Iterable

from openai import OpenAI
from sqlalchemy.orm import Session, sessionmaker

from app.models.models import ApiProvider, Assistant, ChatSession, Message, ModelPreset, SessionSummary, UserProfile

logger = logging.getLogger(__name__)


class SummaryService:
    def __init__(self, session_factory: sessionmaker) -> None:
        self.session_factory = session_factory

    def generate_summary(self, session_id: int, start_round: int, end_round: int) -> None:
        db: Session = self.session_factory()
        try:
            messages = (
                db.query(Message)
                .filter(Message.session_id == session_id)
                .order_by(Message.created_at.asc())
                .all()
            )
            if not messages:
                return

            assistant = db.query(Assistant).first()
            assistant_name = assistant.name if assistant else "assistant"
            user_profile = db.query(UserProfile).first()
            user_name = user_profile.nickname if user_profile else "user"

            selected_messages, start_time, end_time = self._select_messages(
                messages, start_round, end_round
            )
            if not selected_messages:
                return

            api_provider = (
                db.query(ApiProvider).filter(ApiProvider.name == "summary").first()
                or db.query(ApiProvider).first()
            )
            if not api_provider:
                return

            model_preset = (
                db.query(ModelPreset)
                .filter(
                    ModelPreset.api_provider_id == api_provider.id,
                    ModelPreset.name == "summary",
                )
                .first()
                or db.query(ModelPreset)
                .filter(ModelPreset.api_provider_id == api_provider.id)
                .first()
                or db.query(ModelPreset).first()
            )
            if not model_preset:
                return

            base_url = api_provider.base_url
            if base_url.endswith("/chat/completions"):
                base_url = base_url[: -len("/chat/completions")]
                if not base_url.endswith("/v1"):
                    base_url = f"{base_url.rstrip('/')}/v1"

            client = OpenAI(api_key=api_provider.api_key, base_url=base_url)

            system_prompt = (
                "You are a summarizer. Write in third person. "
                "Use names for all people; do not use pronouns like 'you', 'me', or 'she'. "
                "Only record what happened, no emotions. "
                "Output format: [start_time - end_time] summary content."
            )

            formatted = []
            for message in selected_messages:
                name = user_name if message.role == "user" else assistant_name
                formatted.append(f"{name}: {message.content}")

            user_prompt = (
                f"start_time: {start_time}\n"
                f"end_time: {end_time}\n"
                f"Names: {user_name}, {assistant_name}\n\n"
                "Conversation:\n"
                + "\n".join(formatted)
            )

            response = client.chat.completions.create(
                model=model_preset.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=model_preset.temperature,
                top_p=model_preset.top_p,
                max_tokens=model_preset.max_tokens,
            )
            if not response.choices:
                logger.warning("Summary response contained no choices.")
                return
            summary_text = (response.choices[0].message.content or "").strip()
            if not summary_text:
                return

            summary = SessionSummary(
                session_id=session_id,
                summary_content=summary_text,
                perspective=assistant_name,
            )
            db.add(summary)
            db.commit()
        except Exception as exc:
            logger.exception("Failed to generate summary: %s", exc)
        finally:
            db.close()

    def _select_messages(
        self,
        messages: Iterable[Message],
        start_round: int,
        end_round: int,
    ) -> tuple[list[Message], str, str]:
        round_index = 0
        selected = []
        start_time = None
        end_time = None
        for message in messages:
            if message.role not in {"user", "assistant"}:
                continue
            current_round = round_index + 1
            if current_round > end_round:
                break
            if start_round <= current_round <= end_round:
                selected.append(message)
                if start_time is None:
                    start_time = message.created_at
                end_time = message.created_at
            if message.role == "assistant":
                round_index += 1
        if not selected or not start_time or not end_time:
            return [], "", ""
        start_str = start_time.strftime("%Y.%m.%d %H:%M")
        end_str = end_time.strftime("%Y.%m.%d %H:%M")
        return selected, start_str, end_str
