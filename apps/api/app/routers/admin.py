"""Platform admin console (ADMIN_EMAILS): org claims, badge requests, identity reviews, reports, mail outbox, Teams sync."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.config import get_settings
from app.database import get_db
from app.models import Organization, Profile, VerificationItem
from app.models_suite import BadgeRequest, Comment, ContentReport, EmailOutbox, OrgClaim, Payment, Post
from app.services import badges, mailer, orgs, teams_sync
from app.services.admin import is_platform_admin
from app.services.completion import badge_eligibility, claims_summary, refresh_scores
from app.services.notify import notify
from app.services.storage import exists, read_bytes

router = APIRouter(prefix="/admin", tags=["admin"])
DB = Annotated[Session, Depends(get_db)]


def require_admin(profile: Annotated[Profile, Depends(get_or_create_profile)]) -> Profile:
    if not is_platform_admin(profile):
        raise HTTPException(403, "Platform admins only")
    return profile


Admin = Annotated[Profile, Depends(require_admin)]


class Decide(BaseModel):
    approve: bool
    note: Optional[str] = None


class BadgeDecide(BaseModel):
    action: str  # grant | reject | revoke
    level: Optional[str] = None
    note: Optional[str] = None


class ReportDecide(BaseModel):
    action: str  # hide | dismiss | restore


def _iso(d):
    return d.isoformat() if d else None


@router.get("/me")
def admin_me(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return {"is_admin": is_platform_admin(profile)}


@router.get("/overview")
def overview(admin: Admin, db: DB):
    return {
        "claims_pending": db.query(OrgClaim).filter(OrgClaim.status == "pending_admin").count(),
        "badges_pending": db.query(BadgeRequest).filter(BadgeRequest.status == "pending_review").count(),
        "identity_pending": db.query(VerificationItem).filter(VerificationItem.kind == "identity", VerificationItem.status == "submitted").count(),
        "reports_open": db.query(ContentReport).filter(ContentReport.status == "open").count(),
        "outbox_queued": db.query(EmailOutbox).filter(EmailOutbox.status == "queued").count(),
        "users": db.query(Profile).count(), "orgs": db.query(Organization).count(), "posts": db.query(Post).count(),
        "payment_provider": get_settings().payment_provider, "smtp": get_settings().smtp_enabled,
        "org_domain_auto_approve": get_settings().org_domain_auto_approve, "teams": teams_sync.status(db),
    }


# ── org claims ────────────────────────────────────────────────────────────
@router.get("/claims")
def list_claims(admin: Admin, db: DB, status: str = "pending_admin"):
    q = db.query(OrgClaim)
    if status != "all":
        q = q.filter(OrgClaim.status == status)
    return [orgs.claim_out(c, db) for c in q.order_by(OrgClaim.created_at.desc()).limit(100).all()]


@router.post("/claims/{claim_id}/decide")
def decide_claim(claim_id: int, body: Decide, admin: Admin, db: DB):
    c = db.get(OrgClaim, claim_id)
    if not c:
        raise HTTPException(404, "Claim not found")
    c = orgs.decide_claim(db, admin, c, body.approve, body.note)
    try:
        teams_sync.push_org_soon(c.organization_id)
    except Exception:  # noqa: BLE001
        pass
    return orgs.claim_out(c, db)


# ── badges ────────────────────────────────────────────────────────────────
@router.get("/badges")
def list_badge_requests(admin: Admin, db: DB, status: str = "pending_review"):
    q = db.query(BadgeRequest)
    if status != "all":
        q = q.filter(BadgeRequest.status == status)
    return [badges.request_out(r, db) for r in q.order_by(BadgeRequest.created_at.desc()).limit(100).all()]


@router.post("/badges/{request_id}/decide")
def decide_badge(request_id: int, body: BadgeDecide, admin: Admin, db: DB):
    r = db.get(BadgeRequest, request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    p = db.get(Profile, r.profile_id)
    badges.decide(db, admin, p, body.action, body.level or r.level, body.note, request=r)
    return badges.request_out(r, db)


@router.post("/profiles/{profile_id}/badge")
def set_badge(profile_id: int, body: BadgeDecide, admin: Admin, db: DB):
    p = db.get(Profile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    if body.action not in ("grant", "revoke"):
        raise HTTPException(400, "action must be grant or revoke")
    p = badges.decide(db, admin, p, body.action, body.level, body.note)
    return {"id": p.id, "badge_level": p.badge_level}


@router.get("/users")
def users(admin: Admin, db: DB, q: str = "", limit: int = 30):
    qry = db.query(Profile)
    if q:
        like = f"%{q.strip()[:60]}%"
        qry = qry.filter(or_(Profile.email.ilike(like), Profile.full_name.ilike(like), Profile.username.ilike(like)))
    out = []
    for p in qry.order_by(Profile.id.desc()).limit(min(limit, 100)).all():
        out.append({"id": p.id, "name": p.full_name, "email": p.email, "username": p.username, "badge_level": p.badge_level,
                    "identity_verified": bool(p.identity_verified), "claims": claims_summary(p),
                    "eligibility": badge_eligibility(p), "created_at": _iso(p.created_at)})
    return out


# ── identity ──────────────────────────────────────────────────────────────
@router.get("/identity")
def identity_queue(admin: Admin, db: DB, status: str = "submitted"):
    q = db.query(VerificationItem).filter(VerificationItem.kind == "identity")
    if status != "all":
        q = q.filter(VerificationItem.status == status)
    out = []
    for it in q.order_by(VerificationItem.created_at.desc()).limit(100).all():
        p = db.get(Profile, it.profile_id)
        out.append({"id": it.id, "profile_id": it.profile_id, "status": it.status, "notes": it.notes, "created_at": _iso(it.created_at),
                    "has_document": bool(it.document_key), "profile": {"name": p.full_name, "email": p.email} if p else None})
    return out


@router.get("/identity/{item_id}/document")
def identity_document(item_id: int, admin: Admin, db: DB):
    it = db.get(VerificationItem, item_id)
    if not it or not it.document_key or not exists(it.document_key):
        raise HTTPException(404, "No document")
    ext = it.document_key.rsplit(".", 1)[-1].lower()
    mime = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(ext, "application/octet-stream")
    return Response(read_bytes(it.document_key), media_type=mime, headers={"Cache-Control": "private, no-store"})


@router.post("/identity/{item_id}/decide")
def identity_decide(item_id: int, body: Decide, admin: Admin, db: DB):
    it = db.get(VerificationItem, item_id)
    if not it or it.kind != "identity":
        raise HTTPException(404, "Not found")
    p = db.get(Profile, it.profile_id)
    it.status = "approved" if body.approve else "rejected"
    it.reviewed_at = datetime.now(timezone.utc)
    if body.note:
        it.notes = body.note
    p.identity_verified = bool(body.approve)
    db.commit()
    refresh_scores(db, p)
    notify(db, p, "verification_result", "Identity confirmed" if body.approve else "Identity document not accepted",
           body.note or ("You can now request a badge." if body.approve else "Please upload a clearer, valid government ID."),
           link="/verification", actor_id=admin.id, email_template="verification_result",
           email_ctx={"approved": body.approve, "summary": "Your identity document", "org": "Crede", "note": body.note})
    return {"id": it.id, "status": it.status}


# ── reports ───────────────────────────────────────────────────────────────
@router.get("/reports")
def reports(admin: Admin, db: DB, status: str = "open"):
    q = db.query(ContentReport.target_type, ContentReport.target_id, func.count(ContentReport.id), func.max(ContentReport.created_at),
                 func.array_agg(ContentReport.reason))
    if status != "all":
        q = q.filter(ContentReport.status == status)
    rows = q.group_by(ContentReport.target_type, ContentReport.target_id).order_by(func.count(ContentReport.id).desc()).limit(100).all()
    out = []
    for tt, tid, n, last, reasons in rows:
        t = db.get(Post if tt == "post" else Comment, tid)
        author = db.get(Profile, t.profile_id) if t else None
        out.append({"target_type": tt, "target_id": tid, "reports": n, "last_at": _iso(last), "reasons": sorted(set(reasons or [])),
                    "body": (t.body if t else "[deleted]")[:500], "hidden": bool(t and t.hidden),
                    "post_id": (t.id if tt == "post" else t.post_id) if t else None,
                    "author": {"id": author.id, "name": author.full_name, "email": author.email} if author else None})
    return out


@router.post("/reports/{target_type}/{target_id}")
def decide_report(target_type: str, target_id: int, body: ReportDecide, admin: Admin, db: DB):
    model = Post if target_type == "post" else Comment
    t = db.get(model, target_id)
    if body.action == "hide" and t:
        t.hidden = True
    elif body.action == "restore" and t:
        t.hidden = False
    new_status = "actioned" if body.action == "hide" else "dismissed"
    db.query(ContentReport).filter(ContentReport.target_type == target_type, ContentReport.target_id == target_id,
                                   ContentReport.status == "open").update({ContentReport.status: new_status}, synchronize_session=False)
    db.commit()
    return {"ok": True, "hidden": bool(t and t.hidden)}


# ── mail / payments / teams ──────────────────────────────────────────────
@router.get("/outbox")
def outbox(admin: Admin, db: DB, limit: int = 50):
    rows = db.query(EmailOutbox).order_by(EmailOutbox.id.desc()).limit(min(limit, 200)).all()
    return {"smtp": get_settings().smtp_enabled,
            "items": [{"id": r.id, "to": r.to_email, "subject": r.subject, "template": r.template, "status": r.status,
                       "attempts": r.attempts, "error": r.last_error, "created_at": _iso(r.created_at), "sent_at": _iso(r.sent_at)} for r in rows]}


@router.get("/outbox/{mail_id}", response_class=Response)
def outbox_preview(mail_id: int, admin: Admin, db: DB):
    r = db.get(EmailOutbox, mail_id)
    if not r:
        raise HTTPException(404, "Not found")
    return Response(r.html, media_type="text/html")


@router.post("/outbox/process")
def outbox_process(admin: Admin, db: DB):
    return mailer.process_outbox(db, limit=50)


@router.get("/payments")
def payments_list(admin: Admin, db: DB, limit: int = 50):
    rows = db.query(Payment).order_by(Payment.id.desc()).limit(min(limit, 200)).all()
    out = []
    for r in rows:
        p = db.get(Profile, r.profile_id)
        out.append({"id": r.id, "reference": r.reference, "provider": r.provider, "status": r.status, "purpose": r.purpose,
                    "amount_ngn": r.amount_kobo // 100, "created_at": _iso(r.created_at), "paid_at": _iso(r.paid_at),
                    "profile": {"id": p.id, "name": p.full_name, "email": p.email} if p else None})
    return {"provider": get_settings().payment_provider, "items": out}


@router.get("/teams-sync")
def teams_status(admin: Admin, db: DB):
    return teams_sync.status(db)


@router.post("/teams-sync/run")
def teams_run(admin: Admin):
    return teams_sync.sync_all()
