"""
Auth helpers for PolicyIQ admin endpoints.

Uses a secure ADMIN_PASSWORD env var hashed with bcrypt.
On success, issues a short-lived JWT signed with JWT_SECRET.
"""
import os
import time
import jwt
import bcrypt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_bearer = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or JWT_SECRET == "change-me-in-production":
    raise RuntimeError("JWT_SECRET is not set or uses the default insecure value.")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD is not set.")

_ADMIN_PASSWORD_HASH = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())

JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 60 * 60  # 1 hour


def create_token() -> str:
    payload = {
        "sub": "admin",
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_password(password: str) -> bool:
    return bcrypt.checkpw(password.encode(), _ADMIN_PASSWORD_HASH)


def require_admin(credentials: HTTPAuthorizationCredentials = Security(_bearer)) -> str:
    """FastAPI dependency — validates Bearer JWT on admin routes."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")
