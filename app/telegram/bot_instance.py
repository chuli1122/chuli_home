from __future__ import annotations

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from .config import BOT_TOKEN

# Global Bot and Dispatcher instances (created once at import time)
bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=None),  # plain text by default
)
dp = Dispatcher(storage=MemoryStorage())
