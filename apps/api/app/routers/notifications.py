from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile
from app.models_suite import Notification
from app.services.notify import DEFAULT_PREFS, email_prefs

router = APIRouter(prefix="/notifications", tags=["notifications"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]


class ReadIn(BaseModel):
    ids: Optional[list[int]] = None  # None => all


def _out(n: Notification, actors: dict) -> dict:
    a = actors.get(n.actor_profile_id)
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link, "data": n.data,
            "read": n.read_at is not None, "created_at": n.created_at.isoformat() if n.created_at else None,
            "actor": {"id": a.id, "name": a.full_name, "avatar_url": a.avatar_url} if a else None}


@router.get("")
def list_notifications(profile: Prof, db: DB, limit: int = 30, before_id: Optional[int] = None, unread: bool = False):
    q = db.query(Notification).filter(Notification.profile_id == profile.id)
    if before_id:
        q = q.filter(Notification.id < before_id)
    if unread:
        q = q.filter(Notification.read_at.is_(None))
    rows = q.order_by(Notification.id.desc()).limit(min(limit, 100)).all()
    ids = {r.actor_profile_id for r in rows if r.actor_profile_id}
    actors = {p.id: p for p in db.query(Profile).filter(Profile.id.in_(ids)).all()} if ids else {}
    unread_count = db.query(Notification).filter(Notification.profile_id == profile.id, Notification.read_at.is_(None)).count()
    return {"items": [_out(n, actors) for n in rows], "unread": unread_count}


@router.get("/unread-count")
def unread_count(profile: Prof, db: DB):
    return {"unread": db.query(Notification).filter(Notification.profile_id == profile.id, Notification.read_at.is_(None)).count()}


@router.post("/read")
def mark_read(body: ReadIn, profile: Prof, db: DB):
    q = db.query(Notification).filter(Notification.profile_id == profile.id, Notification.read_at.is_(None))
    if body.ids:
        q = q.filter(Notification.id.in_(body.ids))
    n = q.update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
    return {"marked": n}


@router.get("/preferences")
def get_prefs(profile: Prof):
    return {"email": email_prefs(profile), "keys": list(DEFAULT_PREFS)}


@router.put("/preferences")
def set_prefs(body: dict, profile: Prof, db: DB):
    prefs = dict(profile.preferences or {})
    cur = dict(prefs.get("notifications") or {})
    for k, v in (body.get("email") or body).items():
        if k in DEFAULT_PREFS:
            cur[k] = bool(v)
    prefs["notifications"] = cur
    profile.preferences = prefs
    db.commit()
    return {"email": email_prefs(profile)}
