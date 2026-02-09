from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)


class EmbeddingService:
    _api_keys: list[str] | None = None
    _current_key_index: int = 0

    def __init__(self) -> None:
        self._load_api_keys()

    @classmethod
    def _load_api_keys(cls) -> list[str]:
        if cls._api_keys is not None:
            return cls._api_keys
        keys = [
            key.strip()
            for key in os.environ.get("JINA_API_KEYS", "").split(",")
            if key.strip()
        ]
        if not keys:
            single_key = os.environ.get("JINA_API_KEY", "").strip()
            if single_key:
                keys = [single_key]
        cls._api_keys = keys
        return keys

    @classmethod
    def _post_with_key_rotation(
        cls, url: str, payload: dict[str, Any], timeout: int
    ) -> requests.Response:
        keys = cls._load_api_keys()
        if not keys:
            raise RuntimeError("JINA_API_KEYS/JINA_API_KEY is not configured")

        start_index = cls._current_key_index % len(keys)
        last_error: Exception | None = None

        for offset in range(len(keys)):
            key_index = (start_index + offset) % len(keys)
            headers = {"Authorization": f"Bearer {keys[key_index]}"}
            try:
                response = requests.post(
                    url, json=payload, headers=headers, timeout=timeout
                )
                response.raise_for_status()
                cls._current_key_index = key_index
                return response
            except Exception as exc:
                last_error = exc
                cls._current_key_index = (key_index + 1) % len(keys)

        if last_error:
            raise last_error
        raise RuntimeError("Jina request failed without details")

    def get_embedding(self, text: str) -> list[float] | None:
        try:
            url = "https://api.jina.ai/v1/embeddings"
            payload = {
                "model": "jina-embeddings-v3",
                "input": [text],
                "dimensions": 1024,
            }
            response = self._post_with_key_rotation(url, payload, timeout=30)
            data: dict[str, Any] = response.json()
            values = data.get("data", [])
            if not values or "embedding" not in values[0]:
                raise RuntimeError("Jina embedding response missing 'embedding'")
            embedding = values[0]["embedding"]
            if not isinstance(embedding, list):
                raise RuntimeError("Jina embedding response has invalid format")
            if len(embedding) != 1024:
                raise RuntimeError(
                    f"Jina embedding dimension mismatch: expected 1024, got {len(embedding)}"
                )
            return embedding
        except Exception as exc:
            logger.warning("Jina embedding failed, fallback to None: %s", exc)
            return None

    def rerank(
        self, query: str, documents: list[str], top_n: int = 5
    ) -> list[dict[str, Any]]:
        if not documents:
            return []
        url = "https://api.jina.ai/v1/rerank"
        payload = {
            "model": "jina-reranker-v2-base-multilingual",
            "query": query,
            "documents": documents,
            "top_n": top_n,
        }
        try:
            response = self._post_with_key_rotation(url, payload, timeout=15)
            data: dict[str, Any] = response.json()
            results = data.get("results", [])
            if isinstance(results, list):
                return results
            return []
        except Exception as exc:
            logger.warning("Jina rerank failed, fallback to original order: %s", exc)
            return []
