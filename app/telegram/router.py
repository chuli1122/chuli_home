from __future__ import annotations

import logging

from aiogram.types import Update
from fastapi import APIRouter, Request, Response

from .bot_instance import bot, dp
from .handlers import router as handlers_router

logger = logging.getLogger(__name__)

router = APIRouter()

# Register handlers with the dispatcher (idempotent — safe to call multiple times)
dp.include_router(handlers_router)


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request) -> Response:
    """Receive Telegram update and feed it to aiogram dispatcher."""
    try:
        data = await request.json()
        update = Update.model_validate(data)
        await dp.feed_update(bot=bot, update=update)
    except Exception as exc:
        logger.error("telegram_webhook error: %s", exc, exc_info=True)
    return Response()
