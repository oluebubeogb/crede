"""Claim-backed verification: every timeline entry and certification is a claim.

Levels: self_reported → document_provided → pending (sent to an org) → issuer_verified (an approved org confirmed).
Identity (government ID) is reviewed by platform admins and unlocks badges.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Certification, Organization, Profile, TimelineEntry, VerificationItem
from app.models_suite import BadgeRequest, ProfileFile, VerificationRequest
from app.services import orgs
from app.services.completion import badge_eligibility, badge_tier, claims_summary, list_claims, refresh_scores
from app.services.files import save_evidence
from app.services.notify import notify_admins
from app.services.storage import exists, read_bytes

router = APIRouter(prefix="/verification", tags=["verification"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]


class RequestIn(BaseModel):
    subject_type: str
    subject_id: int
    organization_id: int


def _subject(db: Session, profile: Profile, subject_type: str, subject_id: int):
    model = {"timeline": TimelineEntry, "certification": Certification}.get(subject_type)
    if not model:
        raise HTTPException(400, "subject_type must be timeline or certification")
    obj = db.get(model, subject_id)
    if not obj or obj.profile_id != profile.id:
        raise HTTPException(404, "Claim not found")
    return obj


def _identity(db: Session, profile: Profile) -> dict:
    item = db.query(VerificationItem).filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == "identity").first()
    status = "verified" if profile.identity_verified else (item.status if item else "not_started")
    return {"verified": bool(profile.identity_verified), "status": status, "notes": item.notes if item else None,
            "has_document": bool(item and item.document_key)}


@router.get("")
def overview(profile: Prof, db: DB):
    claims = list_claims(profile)
    for c in claims:
        c["request"] = orgs.verification_info(db, c["subject_type"], c["subject_id"])
    last_badge = db.query(BadgeRequest).filter(BadgeRequest.profile_id == profile.id).order_by(BadgeRequest.created_at.desc()).first()
    return {
        "summary": claims_summary(profile), "claims": claims, "identity": _identity(db, profile), "tier": badge_tier(profile),
        "badge": {"level": profile.badge_level or "none", "granted_at": profile.badge_granted_at.isoformat() if profile.badge_granted_at else None,
                  "eligibility": badge_eligibility(profile),
                  "last_request": {"id": last_badge.id, "level": last_badge.level, "status": last_badge.status,
                                   "created_at": last_badge.created_at.isoformat()} if last_badge else None},
    }


@router.post("/identity")
async def submit_identity(profile: Prof, db: DB, file: UploadFile = File(...), notes: Optional[str] = Form(None)):
    if profile.identity_verified:
        raise HTTPException(400, "Your identity is already confirmed")
    f = await save_evidence(db, profile, file, kind="identity")
    item = db.query(VerificationItem).filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == "identity").first()
    if not item:
        item = VerificationItem(profile_id=profile.id, kind="identity", points=0)
        db.add(item)
    item.status, item.document_key, item.notes, item.reviewed_at = "submitted", f.storage_key, notes, None
    db.commit()
    notify_admins(db, "admin", "Identity document to review", f"{profile.full_name or profile.email} uploaded an ID",
                  link="/admin?tab=identity", email_ctx={"subject": "Identity document to review",
                                                         "message": f"{profile.full_name or profile.email} uploaded a government ID for review."})
    return _identity(db, profile)


@router.post("/{subject_type}/{subject_id}/document")
async def attach_document(subject_type: str, subject_id: int, profile: Prof, db: DB, file: UploadFile = File(...)):
    obj = _subject(db, profile, subject_type, subject_id)
    f = await save_evidence(db, profile, file, kind="evidence", subject_type=subject_type, subject_id=subject_id)
    obj.document_key = f.storage_key
    db.commit()
    refresh_scores(db, profile)
    return {"ok": True, "file_id": f.id, "filename": f.filename, "text_extracted": bool(f.text_excerpt),
            "summary": claims_summary(profile)}


@router.get("/{subject_type}/{subject_id}/document")
def download_document(subject_type: str, subject_id: int, profile: Prof, db: DB):
    obj = _subject(db, profile, subject_type, subject_id)
    if not obj.document_key or not exists(obj.document_key):
        raise HTTPException(404, "No document attached")
    f = db.query(ProfileFile).filter(ProfileFile.storage_key == obj.document_key).first()
    name = f.filename if f else obj.document_key.rsplit("/", 1)[-1]
    return Response(read_bytes(obj.document_key), media_type=(f.mime if f else "application/octet-stream"),
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/request")
def request_verification(body: RequestIn, profile: Prof, db: DB):
    obj = _subject(db, profile, body.subject_type, body.subject_id)
    org = db.get(Organization, body.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.subject_type == "timeline":
        obj.organization_id = org.id
    else:
        obj.issuer_org_id = org.id
    vr = orgs.request_verification(db, profile, body.subject_type, body.subject_id, org)
    refresh_scores(db, profile)
    out = orgs.vr_out(vr, db, include_requester=False)
    out["message"] = ("Sent to the organization's verifiers." if vr.status == "pending"
                      else f"{org.name} hasn't been claimed on Crede yet. Your request is queued and will be sent once it is.")
    return out


@router.get("/requests/mine")
def my_requests(profile: Prof, db: DB):
    rows = db.query(VerificationRequest).filter(VerificationRequest.profile_id == profile.id).order_by(VerificationRequest.created_at.desc()).all()
    return [orgs.vr_out(v, db, include_requester=False) for v in rows]


@router.delete("/requests/{request_id}", status_code=204)
def cancel_request(request_id: int, profile: Prof, db: DB):
    vr = db.get(VerificationRequest, request_id)
    if not vr or vr.profile_id != profile.id:
        raise HTTPException(404, "Request not found")
    if vr.status in ("pending", "queued"):
        vr.status = "cancelled"
        obj = orgs._subject(db, vr.subject_type, vr.subject_id)
        if obj and obj.verification_status == "pending":
            obj.verification_status = "unverified"
        db.commit()
        refresh_scores(db, profile)
