from __future__ import annotations

import os
from typing import Any

import requests


class EmbeddingService:
    def __init__(self) -> None:
        self.api_key = os.getenv("JINA_API_KEY")
        if not self.api_key:
            raise RuntimeError("JINA_API_KEY environment variable is not set")

    def get_embedding(self, text: str) -> list[float]:
        url = "https://api.jina.ai/v1/embeddings"
        payload = {"model": "jina-embeddings-v2-base-en", "input": [text]}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        values = data.get("data", [])
        if not values or "embedding" not in values[0]:
            raise RuntimeError("Jina embedding response missing 'embedding'")
        return values[0]["embedding"]
