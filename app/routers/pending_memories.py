from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.constants import KLASS_DEFAULTS
from app.database import get_db
from app.models.models import Memory, PendingMemory

logger = logging.getLogger(__name__)
router = APIRouter()


class PendingMemoryItem(BaseModel):
    id: int
    content: str
    klass: str
    importance: int
    tags: dict | None
    related_memory_id: int | None
    related_memory_content: str | None
    similarity: float | None
    status: str
    summary_id: int | None
    created_at: str | None


class PendingMemoriesResponse(BaseModel):
    items: list[PendingMemoryItem]
    total: int


class ConfirmRequest(BaseModel):
    ids: list[int]


class DismissRequest(BaseModel):
    ids: list[int]


class EditPendingRequest(BaseModel):
    content: str | None = None
    klass: str | None = None
    tags: dict | None = None


class UpdateExistingRequest(BaseModel):
    pending_id: int
    target_memory_id: int


@router.get("/pending-memories", response_model=PendingMemoriesResponse)
def list_pending_memories(db: Session = Depends(get_db)):
    """List all pending memories with re-checked related memories."""
    rows = (
        db.query(PendingMemory)
        .filter(PendingMemory.status == "pending")
        .order_by(PendingMemory.created_at.desc())
        .all()
    )

    items: list[PendingMemoryItem] = []
    for row in rows:
        # Re-check: has a very similar memory been saved since extraction?
        if row.embedding is not None:
            dup_sql = text("""
                SELECT id, content, 1 - (embedding <=> :query_embedding) AS similarity
                FROM memories
                WHERE embedding IS NOT NULL AND deleted_at IS NULL
                ORDER BY embedding <=> :query_embedding
                LIMIT 1
            """)
            dup = db.execute(dup_sql, {"query_embedding": str([float(x) for x in row.embedding])}).first()
            if dup and dup.similarity > 0.88:
                # Auto-resolve: an equivalent memory now exists
                row.status = "auto_resolved"
                row.related_memory_id = dup.id
                row.similarity = round(dup.similarity, 3)
                row.resolved_at = datetime.now(timezone.utc)
                db.commit()
                continue
            # Update related memory info (may have changed)
            if dup and dup.similarity > 0.5:
                row.related_memory_id = dup.id
                row.similarity = round(dup.similarity, 3)
            elif row.related_memory_id:
                # Check if related memory still exists
                existing = db.get(Memory, row.related_memory_id)
                if not existing or existing.deleted_at:
                    row.related_memory_id = None
                    row.similarity = None

        related_content = None
        if row.related_memory_id:
            related = db.get(Memory, row.related_memory_id)
            if related:
                related_content = related.content

        items.append(PendingMemoryItem(
            id=row.id,
            content=row.content,
            klass=row.klass,
            importance=row.importance,
            tags=row.tags,
            related_memory_id=row.related_memory_id,
            related_memory_content=related_content,
            similarity=row.similarity,
            status=row.status,
            summary_id=row.summary_id,
            created_at=row.created_at.isoformat() if row.created_at else None,
        ))

    db.commit()  # persist any updated related_memory_id/similarity
    return PendingMemoriesResponse(items=items, total=len(items))


@router.get("/pending-memories/count")
def pending_memory_count(db: Session = Depends(get_db)):
    """Quick count for badge display."""
    count = db.query(PendingMemory).filter(PendingMemory.status == "pending").count()
    return {"count": count}


@router.post("/pending-memories/confirm")
def confirm_pending_memories(req: ConfirmRequest, db: Session = Depends(get_db)):
    """Confirm pending memories — save them as real memories."""
    from app.services.embedding_service import EmbeddingService

    saved = 0
    skipped = 0
    for pid in req.ids:
        pm = db.get(PendingMemory, pid)
        if not pm or pm.status != "pending":
            skipped += 1
            continue

        # Final dedup check before saving
        if pm.embedding is not None:
            dup_sql = text("""
                SELECT id FROM memories
                WHERE embedding IS NOT NULL AND deleted_at IS NULL
                  AND 1 - (embedding <=> :query_embedding) > 0.88
                LIMIT 1
            """)
            dup = db.execute(dup_sql, {"query_embedding": str([float(x) for x in pm.embedding])}).first()
            if dup:
                pm.status = "auto_resolved"
                pm.resolved_at = datetime.now(timezone.utc)
                skipped += 1
                continue

        klass_config = KLASS_DEFAULTS.get(pm.klass, KLASS_DEFAULTS["other"])
        now_east8 = datetime.now(timezone.utc)
        memory = Memory(
            content=pm.content,
            tags=pm.tags or {},
            source="auto_extract",
            embedding=pm.embedding,
            klass=pm.klass,
            importance=klass_config["importance"],
            halflife_days=klass_config["halflife_days"],
        )
        db.add(memory)
        pm.status = "confirmed"
        pm.resolved_at = datetime.now(timezone.utc)
        saved += 1

    db.commit()
    return {"saved": saved, "skipped": skipped}


@router.post("/pending-memories/dismiss")
def dismiss_pending_memories(req: DismissRequest, db: Session = Depends(get_db)):
    """Dismiss pending memories."""
    dismissed = 0
    for pid in req.ids:
        pm = db.get(PendingMemory, pid)
        if not pm or pm.status != "pending":
            continue
        pm.status = "dismissed"
        pm.resolved_at = datetime.now(timezone.utc)
        dismissed += 1
    db.commit()
    return {"dismissed": dismissed}


@router.patch("/pending-memories/{pid}")
def edit_pending_memory(pid: int, req: EditPendingRequest, db: Session = Depends(get_db)):
    """Edit a pending memory's content, klass, or tags."""
    from app.services.embedding_service import EmbeddingService

    pm = db.get(PendingMemory, pid)
    if not pm or pm.status != "pending":
        raise HTTPException(status_code=404, detail="Pending memory not found")

    if req.content is not None and req.content.strip():
        pm.content = req.content.strip()
        embedding_service = EmbeddingService()
        new_emb = embedding_service.get_embedding(pm.content)
        if new_emb is not None:
            pm.embedding = new_emb
    if req.klass is not None:
        pm.klass = req.klass
    if req.tags is not None:
        pm.tags = req.tags

    db.commit()
    return {"id": pm.id, "content": pm.content, "klass": pm.klass, "tags": pm.tags}


@router.post("/pending-memories/update-existing")
def update_existing_memory(req: UpdateExistingRequest, db: Session = Depends(get_db)):
    """Replace an existing memory's content with a pending memory's content."""
    pm = db.get(PendingMemory, req.pending_id)
    if not pm or pm.status != "pending":
        raise HTTPException(status_code=404, detail="Pending memory not found")

    target = db.get(Memory, req.target_memory_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="Target memory not found")

    target.content = pm.content
    target.embedding = pm.embedding
    target.klass = pm.klass
    target.tags = pm.tags or target.tags
    target.updated_at = datetime.now(timezone.utc)

    pm.status = "confirmed"
    pm.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"updated_memory_id": target.id, "content": target.content}
