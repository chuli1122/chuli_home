from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    user_profile,
    world_books,
)
from app.routers.auth import require_auth_token

app = FastAPI(title="Chuli Home Backend")

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
app.include_router(auth.router, prefix="/api", tags=["auth"])

@app.get("/")
async def root():
    return {"status": "online", "message": "阿怀正在听。"}
