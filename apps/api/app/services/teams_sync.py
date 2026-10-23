"""Two-way organisation sync with Collab Teams.

Pull: GET  {TEAMS_URL}/api/suite/orgs?since=ISO   (on login, throttled, and every TEAMS_SYNC_INTERVAL_MINUTES)
Push: POST {TEAMS_URL}/api/suite/orgs/upsert      (Crede-created orgs, soon after create/update and on each periodic run)
Auth: Authorization: Bearer SUITE_SYNC_TOKEN (same value on both apps).

Dedupe rules
- Teams org with source=crede & external_id=<crede id>  → that Crede org (link only).
- Crede org whose external_id == Teams id                → update it.
- Same name + type, not yet linked                       → link, don't duplicate.
- Otherwise create a Crede org with source=teams (unclaimed: verify power still needs a Crede claim).
Errors never propagate: Teams being down only logs a warning.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import Organization, OrganizationMember, Profile
from app.models_suite import AppState
from app.services.orgs import MANAGER_ROLES, unique_slug

logger = logging.getLogger("crede.teams_sync")
CURSOR_KEY = "teams_pull_since"
PENDING_KEY = "teams_pending_members"
_last_run = 0.0
_lock = threading.Lock()
ROLE_IN = {"owner": "owner", "admin": "admin", "editor": "recruiter", "recruiter": "recruiter"}
ROLE_OUT = {"owner": "owner", "admin": "admin", "recruiter": "editor", "editor": "editor"}
TYPE_OK = ("company", "school", "issuer")


def _headers() -> dict:
    tok = get_settings().suite_sync_token
    return {"Authorization": f"Bearer {tok}", "X-Suite-Token": tok, "Accept": "application/json"}


def _base() -> str:
    return get_settings().teams_url.rstrip("/")


def _state(db: Session, key: str) -> dict:
    row = db.get(AppState, key)
    return dict(row.value or {}) if row else {}


def _set_state(db: Session, key: str, value: dict) -> None:
    row = db.get(AppState, key)
    if row:
        row.value = value
    else:
        db.add(AppState(key=key, value=value))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── pull ────────────────────────────────────────────────────────────────
def _find_profile(db: Session, m: dict) -> Profile | None:
    acc = (m.get("accounts_id") or "").strip()
    if acc:
        p = db.query(Profile).filter((Profile.collab_user_id == acc) | (Profile.external_id == f"collab:{acc}")).first()
        if p:
            return p
    email = (m.get("email") or "").strip().lower()
    return db.query(Profile).filter(func.lower(Profile.email) == email).first() if email else None


def _mirror_members(db: Session, org: Organization, members: list[dict]) -> int:
    pending = _state(db, PENDING_KEY)
    n = 0
    for m in members or []:
        if (m.get("status") or "active") not in ("active", "accepted", ""):
            continue
        role = ROLE_IN.get((m.get("role") or "").lower(), "member")
        p = _find_profile(db, m)
        if not p:
            email = (m.get("email") or "").strip().lower()
            if email:
                lst = [x for x in pending.get(email, []) if x.get("org_id") != org.id]
                pending[email] = lst + [{"org_id": org.id, "role": role}]
            continue
        existing = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id,
                                                       OrganizationMember.profile_id == p.id).first()
        if existing:
            if existing.source == "teams" and existing.role != role:
                existing.role = role
            continue
        db.add(OrganizationMember(organization_id=org.id, profile_id=p.id, role=role, source="teams"))
        n += 1
    _set_state(db, PENDING_KEY, pending)
    return n


def attach_pending(db: Session, profile: Profile) -> int:
    """Teams members who had no Crede profile at pull time get their membership on first login."""
    email = (profile.email or "").lower()
    pending = _state(db, PENDING_KEY)
    items = pending.pop(email, None)
    if not items:
        return 0
    n = 0
    for it in items:
        if db.get(Organization, it["org_id"]) and not db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == it["org_id"], OrganizationMember.profile_id == profile.id).first():
            db.add(OrganizationMember(organization_id=it["org_id"], profile_id=profile.id, role=it.get("role", "member"), source="teams"))
            n += 1
    _set_state(db, PENDING_KEY, pending)
    db.commit()
    return n


def apply_teams_org(db: Session, t: dict) -> tuple[Organization, bool]:
    tid = str(t.get("id"))
    org = None
    if (t.get("source") or "") == "crede" and str(t.get("external_id") or "").isdigit():
        org = db.get(Organization, int(t["external_id"]))
    if not org:
        org = db.query(Organization).filter(Organization.external_id == tid).first()
    org_type = t.get("org_type") if t.get("org_type") in TYPE_OK else "company"
    if not org:
        org = (db.query(Organization).filter(func.lower(Organization.name) == (t.get("name") or "").strip().lower(),
                                             Organization.org_type == org_type, Organization.external_id.is_(None)).first())
    created = False
    if not org:
        org = Organization(name=(t.get("name") or "Untitled")[:255], slug=unique_slug(db, t.get("slug") or t.get("name") or "org"),
                           org_type=org_type, source="teams", claim_status="unclaimed",
                           verification_status="verified" if t.get("verified") else "unverified")
        db.add(org)
        created = True
    org.external_id = tid
    org.teams_slug = t.get("slug") or org.teams_slug
    if org.source == "teams":  # Teams is the source of truth for its own orgs' profile fields
        org.name = (t.get("name") or org.name)[:255]
        org.website = t.get("website") or org.website
        org.location = t.get("location") or org.location
        org.description = t.get("about") or t.get("tagline") or org.description
        org.logo_url = t.get("avatar") or org.logo_url
        if t.get("verified") and org.verification_status != "verified":
            org.verification_status = "verified"
    db.flush()
    _mirror_members(db, org, t.get("members") or [])
    org.synced_at = _now()
    return org, created


def pull(db: Session, client: httpx.Client) -> dict:
    cursor = _state(db, CURSOR_KEY).get("since")
    stats = {"pulled": 0, "created": 0}
    for _ in range(20):  # page cap
        params = {"limit": 200}
        if cursor:
            params["since"] = cursor
        r = client.get(f"{_base()}/api/suite/orgs", params=params, headers=_headers())
        r.raise_for_status()
        body = r.json()
        rows = body.get("orgs") or []
        for t in rows:
            _, c = apply_teams_org(db, t)
            stats["pulled"] += 1
            stats["created"] += int(c)
        last = max((t.get("updated_at") or "" for t in rows), default="")
        cursor = last or body.get("server_time") or cursor
        _set_state(db, CURSOR_KEY, {"since": cursor, "at": _now().isoformat()})
        db.commit()
        if len(rows) < params["limit"]:
            break
    return stats


# ── push ────────────────────────────────────────────────────────────────
def _person(p: Profile, role: str) -> dict:
    acc = p.collab_user_id or ((p.external_id or "").split(":", 1)[1] if (p.external_id or "").startswith("collab:") else None)
    return {"accounts_id": acc, "email": p.email, "full_name": p.full_name, "username": p.username, "role": ROLE_OUT.get(role, "member")}


def payload_for(db: Session, org: Organization) -> dict:
    mems = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id).all()
    people = []
    owner = None
    for m in mems:
        p = db.get(Profile, m.profile_id) if m.profile_id else None
        if not p or m.source == "teams":
            continue
        d = _person(p, m.role)
        people.append(d)
        if m.role == "owner" and not owner:
            owner = d
    if not owner and org.created_by_profile_id:
        c = db.get(Profile, org.created_by_profile_id)
        owner = _person(c, "owner") if c else None
    return {"source": "crede", "external_id": str(org.id), "name": org.name, "slug": org.slug, "tagline": (org.industry or "")[:120],
            "about": org.description or "", "website": org.website or "", "location": org.location or "", "org_type": org.org_type,
            "verified": org.claim_status == "approved" or org.verification_status == "verified", "owner": owner,
            "members": [p for p in people if p is not owner]}


def push_one(db: Session, client: httpx.Client, org: Organization) -> dict:
    r = client.post(f"{_base()}/api/suite/orgs/upsert", json=payload_for(db, org), headers=_headers())
    r.raise_for_status()
    body = r.json()
    if body.get("id"):
        org.external_id = str(body["id"])
    org.teams_slug = body.get("slug") or org.teams_slug
    org.synced_at = _now()
    db.commit()
    return body


def push_pending(db: Session, client: httpx.Client) -> int:
    rows = (db.query(Organization).filter(Organization.source == "crede")
            .filter((Organization.synced_at.is_(None)) | (Organization.updated_at > Organization.synced_at)).limit(100).all())
    n = 0
    for org in rows:
        try:
            push_one(db, client, org)
            n += 1
        except httpx.HTTPError as e:
            logger.warning("teams push failed for org %s: %s", org.id, e)
            db.rollback()
    return n


# ── entry points ────────────────────────────────────────────────────────
def sync_all() -> dict:
    s = get_settings()
    if not s.teams_sync_enabled:
        return {"enabled": False}
    global _last_run
    if not _lock.acquire(blocking=False):
        return {"skipped": "running"}
    db = SessionLocal()
    try:
        _last_run = time.time()
        with httpx.Client(timeout=15) as c:
            stats = pull(db, c)
            stats["pushed"] = push_pending(db, c)
        _set_state(db, "teams_sync_status", {"ok": True, "at": _now().isoformat(), **stats})
        db.commit()
        logger.info("teams sync: %s", stats)
        return {"enabled": True, **stats}
    except Exception as e:  # noqa: BLE001 - never break the app because Teams is down
        db.rollback()
        logger.warning("teams sync failed: %s", e)
        try:
            _set_state(db, "teams_sync_status", {"ok": False, "at": _now().isoformat(), "error": str(e)[:300]})
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
        return {"enabled": True, "error": str(e)[:300]}
    finally:
        db.close()
        _lock.release()


def maybe_sync_soon(min_gap_seconds: int = 300) -> None:
    """Called on login: background pull/push at most every 5 minutes."""
    if get_settings().teams_sync_enabled and time.time() - _last_run > min_gap_seconds:
        threading.Thread(target=sync_all, daemon=True).start()


def push_org_soon(org_id: int) -> None:
    if not get_settings().teams_sync_enabled:
        return

    def _run():
        db = SessionLocal()
        try:
            org = db.get(Organization, org_id)
            if org and org.source == "crede":
                with httpx.Client(timeout=15) as c:
                    push_one(db, c, org)
        except Exception as e:  # noqa: BLE001
            logger.warning("teams push for org %s deferred: %s", org_id, e)
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()


def status(db: Session) -> dict:
    s = get_settings()
    return {"enabled": s.teams_sync_enabled, "teams_url": s.teams_url or None, "last": _state(db, "teams_sync_status"),
            "cursor": _state(db, CURSOR_KEY).get("since"), "interval_minutes": s.teams_sync_interval_minutes}
