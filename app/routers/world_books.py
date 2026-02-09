from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import WorldBook
from app.utils import format_datetime

logger = logging.getLogger(__name__)
router = APIRouter()


class WorldBookItem(BaseModel):
    id: int
    name: str
    content: str
    activation: str
    keywords: list[Any] | None
    folder: str | None
    created_at: str | None


class WorldBooksResponse(BaseModel):
    world_books: list[WorldBookItem]
    total: int


class WorldBookCreateRequest(BaseModel):
    name: str
    content: str = ""
    activation: str = "always"
    keywords: list[Any] | None = None
    folder: str | None = None


class WorldBookUpdateRequest(BaseModel):
    name: str | None = None
    content: str | None = None
    activation: str | None = None
    keywords: list[Any] | None = None
    folder: str | None = None


class WorldBookDeleteResponse(BaseModel):
    status: str
    id: int


@router.get("/world-books", response_model=WorldBooksResponse)
def list_world_books(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> WorldBooksResponse:
    query = db.query(WorldBook)
    total = query.count()
    rows = (
        query.order_by(WorldBook.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        WorldBookItem(
            id=row.id,
            name=row.name,
            content=row.content,
            activation=row.activation,
            keywords=row.keywords or [],
            folder=row.folder,
            created_at=format_datetime(row.created_at),
        )
        for row in rows
    ]
    return WorldBooksResponse(world_books=items, total=total)


@router.post("/world-books", response_model=WorldBookItem)
def create_world_book(
    payload: WorldBookCreateRequest,
    db: Session = Depends(get_db),
) -> WorldBookItem:
    row = WorldBook(
        name=payload.name,
        content=payload.content,
        activation=payload.activation,
        keywords=payload.keywords or [],
        folder=payload.folder,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WorldBookItem(
        id=row.id,
        name=row.name,
        content=row.content,
        activation=row.activation,
        keywords=row.keywords or [],
        folder=row.folder,
        created_at=format_datetime(row.created_at),
    )


@router.put("/world-books/{book_id}", response_model=WorldBookItem)
def update_world_book(
    book_id: int,
    payload: WorldBookUpdateRequest,
    db: Session = Depends(get_db),
) -> WorldBookItem:
    row = db.query(WorldBook).filter(WorldBook.id == book_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="World book not found")

    if hasattr(payload, "model_dump"):
        update_data = payload.model_dump(exclude_unset=True)
    else:
        update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return WorldBookItem(
        id=row.id,
        name=row.name,
        content=row.content,
        activation=row.activation,
        keywords=row.keywords or [],
        folder=row.folder,
        created_at=format_datetime(row.created_at),
    )


@router.delete("/world-books/{book_id}", response_model=WorldBookDeleteResponse)
def delete_world_book(book_id: int, db: Session = Depends(get_db)) -> WorldBookDeleteResponse:
    row = db.query(WorldBook).filter(WorldBook.id == book_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="World book not found")
    db.delete(row)
    db.commit()
    return WorldBookDeleteResponse(status="deleted", id=book_id)
