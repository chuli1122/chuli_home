from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Assistant
from app.utils import format_datetime

logger = logging.getLogger(__name__)
router = APIRouter()


class AssistantItem(BaseModel):
    id: int
    name: str
    model_preset_id: int
    created_at: str | None


class AssistantsResponse(BaseModel):
    assistants: list[AssistantItem]


class AssistantUpdateRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    model_preset_id: int | None = None
    summary_model_preset_id: int | None = None
    summary_fallback_preset_id: int | None = None
    rule_set_ids: list[Any] | None = None


class AssistantUpdateResponse(BaseModel):
    id: int
    name: str
    system_prompt: str
    model_preset_id: int
    summary_model_preset_id: int | None
    summary_fallback_preset_id: int | None
    rule_set_ids: list[Any] | None
    created_at: str | None


@router.get("/assistants", response_model=AssistantsResponse)
def list_assistants(db: Session = Depends(get_db)) -> AssistantsResponse:
    rows = db.query(Assistant).order_by(Assistant.id.asc()).all()
    items = [
        AssistantItem(
            id=row.id,
            name=row.name,
            model_preset_id=row.model_preset_id,
            created_at=format_datetime(row.created_at),
        )
        for row in rows
    ]
    return AssistantsResponse(assistants=items)


@router.put("/assistants/{assistant_id}", response_model=AssistantUpdateResponse)
def update_assistant(
    assistant_id: int,
    payload: AssistantUpdateRequest,
    db: Session = Depends(get_db),
) -> AssistantUpdateResponse:
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    if hasattr(payload, "model_dump"):
        update_data = payload.model_dump(exclude_unset=True)
    else:
        update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(assistant, key, value)

    db.commit()
    db.refresh(assistant)
    return AssistantUpdateResponse(
        id=assistant.id,
        name=assistant.name,
        system_prompt=assistant.system_prompt,
        model_preset_id=assistant.model_preset_id,
        summary_model_preset_id=assistant.summary_model_preset_id,
        summary_fallback_preset_id=assistant.summary_fallback_preset_id,
        rule_set_ids=assistant.rule_set_ids,
        created_at=format_datetime(assistant.created_at),
    )
