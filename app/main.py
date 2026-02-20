from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import asyncio
import logging
import os

logging.basicConfig(level=logging.INFO)

import jwt
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect, Query as WSQuery
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import (
    api_providers,
    assistants,
    auth,
    chat,
    core_blocks,
    cot,
    diary,
    maintenance,
    memories,
    messages,
    model_presets,
    settings,
    sessions,
    theater,
    upload,
    user_profile,
    world_books,
)
from app.routers.auth import require_auth_token
from app.telegram.router import router as telegram_router
from app.telegram.bot_instance import bots
from app.telegram.config import BOTS_CONFIG, WEBHOOK_BASE_URL
from app.cot_broadcaster import cot_broadcaster
from app.database import engine
from app.models.models import Base

logger = logging.getLogger(__name__)

app = FastAPI(title="Chuli Home Backend")


@app.on_event("startup")
async def on_startup() -> None:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning("create_all failed (tables may already exist): %s", exc)
    cot_broadcaster.set_loop(asyncio.get_running_loop())
    print(f"[startup] bots to register: {list(bots.keys())}")
    for key, bot in bots.items():
        webhook_url = f"{WEBHOOK_BASE_URL}{BOTS_CONFIG[key]['webhook_path']}"
        try:
            await bot.set_webhook(webhook_url, drop_pending_updates=True)
            print(f"[startup] Webhook set for {key}: {webhook_url}")
            logger.info("Telegram webhook set for %s: %s", key, webhook_url)
        except Exception as exc:
            print(f"[startup] Webhook FAILED for {key}: {exc}")
            logger.warning("Failed to set webhook for %s: %s", key, exc)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    for key, bot in bots.items():
        try:
            await bot.delete_webhook()
        except Exception:
            pass
        try:
            await bot.session.close()
        except Exception:
            pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
auth_deps = [Depends(require_auth_token)]
app.include_router(chat.router, prefix="/api", tags=["chat"], dependencies=auth_deps)
app.include_router(messages.router, prefix="/api", tags=["messages"], dependencies=auth_deps)
app.include_router(sessions.router, prefix="/api", tags=["sessions"], dependencies=auth_deps)
app.include_router(assistants.router, prefix="/api", tags=["assistants"], dependencies=auth_deps)
app.include_router(user_profile.router, prefix="/api", tags=["user_profile"], dependencies=auth_deps)
app.include_router(memories.router, prefix="/api", tags=["memories"], dependencies=auth_deps)
app.include_router(core_blocks.router, prefix="/api", tags=["core_blocks"], dependencies=auth_deps)
app.include_router(world_books.router, prefix="/api", tags=["world_books"], dependencies=auth_deps)
app.include_router(diary.router, prefix="/api", tags=["diary"], dependencies=auth_deps)
app.include_router(maintenance.router, prefix="/api", tags=["maintenance"], dependencies=auth_deps)
app.include_router(settings.router, prefix="/api", tags=["settings"], dependencies=auth_deps)
app.include_router(theater.router, prefix="/api", tags=["theater"], dependencies=auth_deps)
app.include_router(api_providers.router, prefix="/api", tags=["api_providers"], dependencies=auth_deps)
app.include_router(model_presets.router, prefix="/api", tags=["model_presets"], dependencies=auth_deps)
app.include_router(cot.router, prefix="/api", tags=["cot"], dependencies=auth_deps)
app.include_router(upload.router, prefix="/api", tags=["upload"], dependencies=auth_deps)
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(telegram_router, tags=["telegram"])

# ── WebSocket: real-time COT push ──
@app.websocket("/ws/cot")
async def ws_cot(ws: WebSocket, token: str = WSQuery(...)):
    secret = os.getenv("WHISPER_SECRET") or os.getenv("WHISPER_PASSWORD")
    if not secret:
        await ws.close(code=4001, reason="Auth not configured")
        return
    try:
        jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        await ws.close(code=4003, reason="Invalid token")
        return

    await ws.accept()
    cot_broadcaster.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        cot_broadcaster.disconnect(ws)


# Serve uploaded static files
_static_dir = Path(__file__).parent.parent / "static"
_static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

# Serve miniapp frontend
_miniapp_dir = Path(__file__).parent.parent / "miniapp" / "dist"
if _miniapp_dir.is_dir():
    app.mount("/miniapp", StaticFiles(directory=str(_miniapp_dir), html=True), name="miniapp")

@app.get("/")
async def root():
    return {"status": "online", "message": "阿怀正在听。"}
