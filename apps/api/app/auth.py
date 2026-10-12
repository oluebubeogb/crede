"""
Crede auth — dual mode:
1. Local (default for Phase 2 testing): email + password stored in Crede DB, JWT in access_token cookie.
2. Collab Accounts SSO (future reintegration): set AUTH_MODE=collab and ACCOUNTS_URL.

AUTH_MODE=local | collab
When collab is restored, local users can be linked via collab_user_id.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import httpx
from fastapi import Cookie, Depends, Header, HTTPException, Response, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Profile, User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


# ─── Password helpers ───────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT helpers ────────────────────────────────────────────────────────────

def create_access_token(subject: str, extra: Optional[dict] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc)}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from e


# ─── Cookie helpers ─────────────────────────────────────────────────────────

def set_access_cookie(response: Response, token: str) -> None:
    kwargs = dict(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=60 * 60 * 24 * ACCESS_TOKEN_EXPIRE_DAYS,
    )
    if settings.cookie_domain:
        kwargs["domain"] = settings.cookie_domain
    response.set_cookie(**kwargs)


def clear_access_cookie(response: Response) -> None:
    kwargs = dict(key="access_token", path="/")
    if settings.cookie_domain:
        kwargs["domain"] = settings.cookie_domain
    response.delete_cookie(**kwargs)
    kwargs["key"] = "refresh_token"
    response.delete_cookie(**kwargs)


# ─── Request bodies ─────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


# ─── Collab (kept for future reintegration) ─────────────────────────────────

class CollabUser:
    def __init__(self, data: dict):
        self.id: str = str(data["id"])
        self.email: str = data["email"]
        self.full_name: Optional[str] = (
            data.get("display_name") or data.get("full_name") or data.get("name")
        )
        raw_products = data.get("products") or data.get("product_access") or []
        self.products: list[str] = [
            (p.get("product") if isinstance(p, dict) else str(p)).lower()
            for p in raw_products
        ]
        self.raw = data

    @property
    def has_crede(self) -> bool:
        if not self.products:
            return True
        return "crede" in self.products


async def accounts_login(email: str, password: str) -> tuple[Optional[dict], Optional[str]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{settings.accounts_url.rstrip('/')}/auth/login",
                json={"email": email, "password": password},
            )
            data = r.json() if r.content else {}
            if r.status_code == 200:
                return data, None
            detail = data.get("detail") or "Invalid credentials"
            if isinstance(detail, list):
                detail = "; ".join(
                    str(x.get("msg", x)) if isinstance(x, dict) else str(x) for x in detail
                )
            return None, str(detail)
    except Exception as e:
        return None, f"Accounts unreachable: {e}"


async def fetch_collab_user(token: str) -> CollabUser:
    url = f"{settings.accounts_url.rstrip('/')}/auth/me"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            cookies={"access_token": token},
        )
        if r.status_code == 401:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        if r.status_code >= 400:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Accounts service error")
        return CollabUser(r.json())


# ─── Unified current user ───────────────────────────────────────────────────

class AuthUser:
    """Normalized identity used by the rest of the app."""

    def __init__(
        self,
        *,
        id: str,
        email: str,
        full_name: Optional[str] = None,
        source: str = "local",
        role: str = "professional",
    ):
        self.id = id
        self.email = email
        self.full_name = full_name
        self.source = source  # local | collab
        self.role = role  # professional | recruiter | admin


async def get_current_user(
    access_token: Annotated[Optional[str], Cookie()] = None,
    authorization: Annotated[Optional[str], Header()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
) -> AuthUser:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif access_token:
        token = access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Local JWT first
    if settings.auth_mode == "local" or settings.auth_mode == "hybrid":
        try:
            payload = decode_token(token)
            sub = payload.get("sub")
            if sub and sub.startswith("local:"):
                user_id = int(sub.split(":", 1)[1])
                user = db.query(User).filter(User.id == user_id).first()
                if not user or not user.is_active:
                    raise HTTPException(status_code=401, detail="User inactive or not found")
                return AuthUser(
                    id=f"local:{user.id}",
                    email=user.email,
                    full_name=user.full_name,
                    source="local",
                    role=user.role or "professional",
                )
        except HTTPException:
            if settings.auth_mode == "local":
                raise
            # hybrid: fall through to collab

    # Collab path
    if settings.auth_mode in ("collab", "hybrid"):
        collab = await fetch_collab_user(token)
        if not collab.has_crede:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Crede access not granted. Open Collab Accounts once or contact support.",
            )
        return AuthUser(
            id=f"collab:{collab.id}",
            email=collab.email,
            full_name=collab.full_name,
            source="collab",
            role="professional",
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_or_create_profile(
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Profile:
    """Resolve or create Profile. Keyed by external_id (local:N or collab:UUID)."""
    from sqlalchemy.exc import SQLAlchemyError

    external_id = auth.id
    try:
        profile = db.query(Profile).filter(Profile.external_id == external_id).first()
    except SQLAlchemyError as e:
        # Column missing or schema drift — try email fallback then surface clear error
        db.rollback()
        try:
            profile = db.query(Profile).filter(Profile.email == auth.email).first()
        except SQLAlchemyError as e2:
            raise HTTPException(
                status_code=500,
                detail=f"Profile schema error (run API migration / restart): {e2}",
            ) from e2
        if profile is None:
            raise HTTPException(
                status_code=500,
                detail=f"Profile lookup failed (external_id column?). DB error: {e}",
            ) from e

    if not profile:
        # legacy lookup by collab_user_id for existing rows
        if auth.source == "collab":
            try:
                legacy = (
                    db.query(Profile)
                    .filter(Profile.collab_user_id == auth.id.replace("collab:", ""))
                    .first()
                )
            except SQLAlchemyError:
                db.rollback()
                legacy = None
            if legacy:
                try:
                    legacy.external_id = external_id
                    db.commit()
                    db.refresh(legacy)
                except SQLAlchemyError:
                    db.rollback()
                return legacy

        # Also match existing row by email (local re-login)
        profile = db.query(Profile).filter(Profile.email == auth.email).first()
        if profile:
            try:
                if not getattr(profile, "external_id", None):
                    profile.external_id = external_id
                    db.commit()
                    db.refresh(profile)
            except SQLAlchemyError:
                db.rollback()
            return profile

        try:
            profile = Profile(
                external_id=external_id,
                collab_user_id=auth.id.replace("collab:", "") if auth.source == "collab" else None,
                email=auth.email,
                full_name=auth.full_name,
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
        except SQLAlchemyError as e:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Could not create profile (check DB columns users/profiles.external_id): {e}",
            ) from e
    else:
        changed = False
        if auth.email and profile.email != auth.email:
            profile.email = auth.email
            changed = True
        if auth.full_name and not profile.full_name:
            profile.full_name = auth.full_name
            changed = True
        if changed:
            try:
                db.commit()
                db.refresh(profile)
            except SQLAlchemyError as e:
                db.rollback()
                raise HTTPException(status_code=500, detail=f"Profile update failed: {e}") from e
    return profile


# Back-compat alias used by existing routers
get_current_collab_user = get_current_user
