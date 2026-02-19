from __future__ import annotations

import os

# Bot token
BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "8559205356:AAGlHa5unl9bK8g0V3I3Ufrn7CZfDj_FXfY")

# Only respond to this chat_id. 0 = not configured (allow all in dev).
_raw_chat_id = os.getenv("TELEGRAM_CHAT_ID", "0")
ALLOWED_CHAT_ID: int = int(_raw_chat_id) if _raw_chat_id.lstrip("-").isdigit() else 0

# Mini App URL for ❤ button
MINI_APP_URL: str = "https://chat.chuli.win/miniapp/#/cot"

# Webhook
WEBHOOK_PATH: str = "/telegram/webhook"
WEBHOOK_BASE_URL: str = os.getenv("WEBHOOK_BASE_URL", "https://chat.chuli.win")
WEBHOOK_URL: str = f"{WEBHOOK_BASE_URL}{WEBHOOK_PATH}"

# Defaults
DEFAULT_BUFFER_SECONDS: float = 15.0
