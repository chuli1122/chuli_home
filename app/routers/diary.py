from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Diary
from app.utils import format_datetime

logger = logging.getLogger(__name__)
router = APIRouter()


class DiaryItem(BaseModel):
    id: int
    title: str
    content: str
    is_read: bool
    created_at: str | None


class DiaryListResponse(BaseModel):
    diary: list[DiaryItem]
    total: int


class DiaryReadResponse(BaseModel):
    status: str
    id: int


@router.get("/diary", response_model=DiaryListResponse)
def list_diary(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> DiaryListResponse:
    query = db.query(Diary)
    total = query.count()
    rows = query.order_by(Diary.created_at.desc(), Diary.id.desc()).offset(offset).limit(limit).all()
    items = [
        DiaryItem(
            id=row.id,
            title=row.title,
            content=row.content,
            is_read=row.is_read,
            created_at=format_datetime(row.created_at),
        )
        for row in rows
    ]
    return DiaryListResponse(diary=items, total=total)


@router.get("/diary/{diary_id}", response_model=DiaryItem)
def get_diary(diary_id: int, db: Session = Depends(get_db)) -> DiaryItem:
    row = db.query(Diary).filter(Diary.id == diary_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Diary not found")
    return DiaryItem(
        id=row.id,
        title=row.title,
        content=row.content,
        is_read=row.is_read,
        created_at=format_datetime(row.created_at),
    )


@router.post("/diary/{diary_id}/read", response_model=DiaryReadResponse)
def mark_diary_read(diary_id: int, db: Session = Depends(get_db)) -> DiaryReadResponse:
    row = db.query(Diary).filter(Diary.id == diary_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Diary not found")
    row.is_read = True
    db.commit()
    return DiaryReadResponse(status="ok", id=diary_id)
