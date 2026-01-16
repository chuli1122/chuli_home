from fastapi import FastAPI
from app.routers import chat

app = FastAPI(title="Chuli Home Backend")

# 引入聊天路由
app.include_router(chat.router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "online", "message": "阿怀正在听。"}