"""Organizations (company | school | issuer): directory, create, claim, members, issuer verification inbox."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.config import get_settings
from app.database import get_db
from app.models import Organization, OrganizationMember, Profile
from app.models_suite import OrgClaim, VerificationRequest
from app.services import orgs as svc
from app.services.notify import notify

router = APIRouter(prefix="/organizations", tags=["organizations"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]


class OrgIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    org_type: str = "company"
    website: Optional[str] = None
    email_domain: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    cac_number: Optional[str] = None


class OrgPatch(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None


class ClaimIn(BaseModel):
    work_email: str
    evidence: Optional[str] = Field(None, max_length=2000)


class CodeIn(BaseModel):
    code: str


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=1000)


class MemberIn(BaseModel):
    email: str
    role: str = "member"


def _org(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


@router.get("")
def list_orgs(profile: Prof, db: DB, q: str = "", type: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    return [svc.org_out(o, db, profile) for o in svc.search(db, q, type, limit)]


@router.get("/suggest")
def suggest(db: DB, q: str = "", type: Optional[str] = None, limit: int = Query(8, ge=1, le=20)):
    """Lightweight typeahead (school picker on Education, issuer suggestions on Certifications)."""
    return [{"id": o.id, "name": o.name, "org_type": o.org_type, "claim_status": o.claim_status, "email_domain": o.email_domain,
             "location": o.location, "logo_url": o.logo_url} for o in svc.search(db, q, type, limit)]


@router.post("", status_code=201)
def create_org(body: OrgIn, profile: Prof, db: DB):
    org = svc.create_org(db, profile, body.model_dump())
    try:
        from app.services.teams_sync import push_org_soon
        push_org_soon(org.id)
    except Exception:  # noqa: BLE001
        pass
    return svc.org_out(org, db, profile)


@router.get("/mine")
def my_orgs(profile: Prof, db: DB):
    ids = svc.my_org_ids(db, profile)
    rows = db.query(Organization).filter(Organization.id.in_(ids)).order_by(Organization.name).all() if ids else []
    return [svc.org_out(o, db, profile) for o in rows]


@router.get("/claims/mine")
def my_claims(profile: Prof, db: DB):
    rows = db.query(OrgClaim).filter(OrgClaim.profile_id == profile.id).order_by(OrgClaim.created_at.desc()).all()
    return [svc.claim_out(c, db) for c in rows]


@router.post("/claims/{claim_id}/confirm")
def confirm_claim(claim_id: int, body: CodeIn, profile: Prof, db: DB):
    claim = db.get(OrgClaim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    return svc.claim_out(svc.confirm_claim(db, profile, claim, body.code), db)


@router.get("/requests/inbox")
def verification_inbox(profile: Prof, db: DB, status: str = "pending"):
    """Verification requests across every approved org I manage."""
    ids = [i for i in svc.my_org_ids(db, profile, svc.MANAGER_ROLES) if (db.get(Organization, i).claim_status == "approved")]
    if not ids:
        return []
    q = db.query(VerificationRequest).filter(VerificationRequest.organization_id.in_(ids))
    if status != "all":
        q = q.filter(VerificationRequest.status == status)
    return [svc.vr_out(v, db) for v in q.order_by(VerificationRequest.created_at.desc()).limit(200).all()]


@router.post("/requests/{request_id}/decide")
def decide_request(request_id: int, body: DecideIn, profile: Prof, db: DB):
    vr = db.get(VerificationRequest, request_id)
    if not vr:
        raise HTTPException(404, "Request not found")
    return svc.vr_out(svc.decide_verification(db, profile, vr, body.approve, body.note), db)


@router.get("/{org_id}")
def get_org(org_id: int, profile: Prof, db: DB):
    org = _org(db, org_id)
    out = svc.org_out(org, db, profile)
    out["pending_requests"] = (db.query(VerificationRequest).filter(VerificationRequest.organization_id == org.id,
                                                                     VerificationRequest.status == "pending").count()
                               if svc.can_verify(db, org, profile) else None)
    out["my_claim"] = next((svc.claim_out(c, db) for c in db.query(OrgClaim).filter(
        OrgClaim.organization_id == org.id, OrgClaim.profile_id == profile.id).order_by(OrgClaim.created_at.desc()).limit(1)), None)
    return out


@router.patch("/{org_id}")
def update_org(org_id: int, body: OrgPatch, profile: Prof, db: DB):
    org = _org(db, org_id)
    if not svc.can_manage(db, org, profile) or org.claim_status != "approved" and not svc.is_platform_admin(profile):
        raise HTTPException(403, "Only managers of a claimed organization can edit it")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(org, k, v)
    db.commit()
    try:
        from app.services.teams_sync import push_org_soon
        push_org_soon(org.id)
    except Exception:  # noqa: BLE001
        pass
    return svc.org_out(org, db, profile)


@router.post("/{org_id}/claim")
def start_claim(org_id: int, body: ClaimIn, profile: Prof, db: DB):
    org = _org(db, org_id)
    claim = svc.start_claim(db, profile, org, body.work_email, body.evidence)
    out = svc.claim_out(claim, db)
    s = get_settings()
    if not s.smtp_enabled and not s.org_domain_auto_approve:
        # Dev/pilot without SMTP: the email was only logged, so show the code. Admin approval is still required.
        out["dev_code"] = getattr(claim, "_dev_code", None)
    out["message"] = f"We sent a 6-digit code to {claim.work_email}."
    return out


@router.get("/{org_id}/members")
def list_members(org_id: int, profile: Prof, db: DB):
    org = _org(db, org_id)
    if not svc.membership(db, org.id, profile) and not svc.is_platform_admin(profile):
        raise HTTPException(403, "Members only")
    rows = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id).all()
    out = []
    for m in rows:
        p = db.get(Profile, m.profile_id) if m.profile_id else (
            db.query(Profile).filter(Profile.external_id == f"local:{m.user_id}").first() if m.user_id else None)
        out.append({"id": m.id, "role": m.role, "source": m.source,
                    "profile": {"id": p.id, "name": p.full_name, "email": p.email, "username": p.username} if p else None})
    return out


@router.post("/{org_id}/members")
def add_member(org_id: int, body: MemberIn, profile: Prof, db: DB):
    org = _org(db, org_id)
    if not svc.can_verify(db, org, profile) and not svc.is_platform_admin(profile):
        raise HTTPException(403, "Only managers of a claimed organization can add members")
    role = body.role if body.role in ("admin", "recruiter", "member") else "member"
    target = db.query(Profile).filter(Profile.email == body.email.strip().lower()).first()
    if not target:
        raise HTTPException(404, "No Crede user with that email yet — ask them to sign up first")
    svc.add_member(db, org, target, role)
    db.commit()
    notify(db, target, "org_invite", f"You were added to {org.name}", f"Role: {role}", link=f"/orgs/{org.id}",
           actor_id=profile.id, email_template="org_invite",
           email_ctx={"org": org.name, "inviter": profile.full_name or profile.email, "role": role})
    return {"ok": True}


@router.delete("/{org_id}/members/{member_id}", status_code=204)
def remove_member(org_id: int, member_id: int, profile: Prof, db: DB):
    org = _org(db, org_id)
    if not svc.can_verify(db, org, profile) and not svc.is_platform_admin(profile):
        raise HTTPException(403, "Not allowed")
    m = db.get(OrganizationMember, member_id)
    if not m or m.organization_id != org.id:
        raise HTTPException(404, "Member not found")
    if m.role == "owner":
        raise HTTPException(400, "The owner cannot be removed")
    db.delete(m)
    db.commit()


@router.get("/{org_id}/requests")
def org_requests(org_id: int, profile: Prof, db: DB, status: str = "pending"):
    org = _org(db, org_id)
    if not svc.can_verify(db, org, profile):
        raise HTTPException(403, "Only managers of a claimed, approved organization can see requests")
    q = db.query(VerificationRequest).filter(VerificationRequest.organization_id == org.id)
    if status != "all":
        q = q.filter(VerificationRequest.status == status)
    return [svc.vr_out(v, db) for v in q.order_by(VerificationRequest.created_at.desc()).limit(200).all()]
