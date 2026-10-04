"""
SSO via Collab Accounts.

Validates access_token cookie (or Authorization Bearer) by calling
GET {ACCOUNTS_URL}/auth/me and ensuring product access includes "crede".
"""

from __future__ import annotations

from typing import Annotated, Optional

import httpx
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Profile

settings = get_settings()


class CollabUser:
    def __init__(self, data: dict):
        # Collab Accounts uses UUID strings for user ids
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
        return "crede" in self.products


async def fetch_collab_user(token: str) -> CollabUser:
    url = f"{settings.accounts_url.rstrip('/')}/auth/me"
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=headers, cookies={"access_token": token})
        if r.status_code == 401:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        if r.status_code >= 400:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Accounts service error")
        data = r.json()
    return CollabUser(data)


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
    profile = db.query(Profile).filter(Profile.collab_user_id == collab.id).first()
    if not profile:
        profile = Profile(
            collab_user_id=collab.id,
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
