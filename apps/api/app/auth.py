"""
SSO via Collab Accounts — same pattern as Collab Teams:
- Login/signup proxied through this API
- access_token cookie set on response (COOKIE_DOMAIN=.collab.name.ng)
- Local Profile keyed by accounts UUID string (collab_user_id)
"""

from __future__ import annotations

from typing import Annotated, Optional

import httpx
from fastapi import Cookie, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Profile

settings = get_settings()


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
        # If products list empty, treat as allowed (Accounts may not have backfilled yet)
        if not self.products:
            return True
        return "crede" in self.products


class LoginBody(BaseModel):
    email: EmailStr
    password: str


def set_access_cookie(response: Response, token: str) -> None:
    kwargs = dict(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=60 * 60 * 24 * 7,
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


async def get_current_collab_user(
    access_token: Annotated[Optional[str], Cookie()] = None,
    authorization: Annotated[Optional[str], Header()] = None,
) -> CollabUser:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif access_token:
        token = access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = await fetch_collab_user(token)
    if not user.has_crede:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Crede access not granted. Open Collab Accounts once or contact support.",
        )
    return user


async def get_or_create_profile(
    collab: Annotated[CollabUser, Depends(get_current_collab_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Profile:
    uid = str(collab.id)
    profile = db.query(Profile).filter(Profile.collab_user_id == uid).first()
    if not profile:
        profile = Profile(
            collab_user_id=uid,
            email=collab.email,
            full_name=collab.full_name,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    else:
        changed = False
        if collab.email and profile.email != collab.email:
            profile.email = collab.email
            changed = True
        if collab.full_name and not profile.full_name:
            profile.full_name = collab.full_name
            changed = True
        if changed:
            db.commit()
            db.refresh(profile)
    return profile
