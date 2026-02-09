from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Cookie, Header, HTTPException, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()
JWT_ALGORITHM = "HS256"


class VerifyPasswordRequest(BaseModel):
    password: str


class VerifyPasswordResponse(BaseModel):
    success: bool
    token: str


def _get_jwt_secret() -> str:
    secret = os.getenv("WHISPER_SECRET") or os.getenv("WHISPER_PASSWORD")
    if not secret:
        logger.warning("WHISPER_SECRET and WHISPER_PASSWORD are not configured")
        raise HTTPException(status_code=500, detail="Auth secret is not configured")
    return secret


def _extract_token(
    authorization: str | None,
    x_auth_token: str | None,
    whisper_token: str | None,
) -> str | None:
    if authorization:
        parts = authorization.strip().split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            return parts[1].strip()
    if x_auth_token and x_auth_token.strip():
        return x_auth_token.strip()
    if whisper_token and whisper_token.strip():
        return whisper_token.strip()
    return None


def require_auth_token(
    authorization: str | None = Header(default=None),
    x_auth_token: str | None = Header(default=None),
    whisper_token: str | None = Cookie(default=None),
) -> str:
    token = _extract_token(authorization, x_auth_token, whisper_token)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        jwt.decode(token, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token


@router.post("/auth/verify", response_model=VerifyPasswordResponse)
def verify_password(payload: VerifyPasswordRequest, response: Response) -> VerifyPasswordResponse:
    expected_password = os.getenv("WHISPER_PASSWORD")
    if not expected_password:
        logger.warning("WHISPER_PASSWORD is not configured")
        raise HTTPException(status_code=500, detail="Password is not configured")

    if payload.password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid password")

    token = jwt.encode(
        {"iat": int(datetime.now(timezone.utc).timestamp())},
        _get_jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )
    response.set_cookie("whisper_token", token, httponly=True, samesite="lax")
    return VerifyPasswordResponse(success=True, token=token)
