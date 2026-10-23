"""Organizations: membership, claims (official email domain + platform admin approval), issuer verification requests."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Certification, Organization, OrganizationMember, Profile, TimelineEntry
from app.models_suite import OrgClaim, VerificationRequest
from app.services import mailer
from app.services.admin import is_platform_admin
from app.services.notify import notify, notify_admins

ORG_TYPES = ("company", "school", "issuer")
MANAGER_ROLES = ("owner", "admin")
FREE_MAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com", "outlook.com", "live.com",
    "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "mail.com",
    "yandex.com", "rocketmail.com",
}


def now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60] or "org"


def unique_slug(db: Session, name: str, own_id: int | None = None) -> str:
    base, n = slugify(name), 0
    cand = base
    while True:
        row = db.query(Organization.id).filter(Organization.slug == cand).first()
        if not row or row[0] == own_id:
            return cand
        n += 1
        cand = f"{base}-{n}"


def domain_of(value: str | None) -> str | None:
    v = (value or "").strip().lower()
    if not v:
        return None
    if "@" in v:
        v = v.rsplit("@", 1)[1]
    v = re.sub(r"^[a-z]+://", "", v).split("/")[0].split(":")[0]
    v = v[4:] if v.startswith("www.") else v
    return v if "." in v else None


def domain_matches(email_domain: str, org_domain: str) -> bool:
    """Exact domain or a subdomain of it (staff.unilag.edu.ng matches unilag.edu.ng)."""
    return email_domain == org_domain or email_domain.endswith("." + org_domain)


# ─── membership ─────────────────────────────────────────────────────────────

def local_user_id(profile: Profile) -> int | None:
    ext = profile.external_id or ""
    return int(ext.split(":", 1)[1]) if ext.startswith("local:") and ext.split(":", 1)[1].isdigit() else None


def membership(db: Session, org_id: int, profile: Profile) -> OrganizationMember | None:
    uid = local_user_id(profile)
    conds = [OrganizationMember.profile_id == profile.id]
    if uid:
        conds.append(OrganizationMember.user_id == uid)
    return db.query(OrganizationMember).filter(OrganizationMember.organization_id == org_id, or_(*conds)).first()


def my_org_ids(db: Session, profile: Profile, roles: tuple[str, ...] | None = None) -> list[int]:
    uid = local_user_id(profile)
    conds = [OrganizationMember.profile_id == profile.id]
    if uid:
        conds.append(OrganizationMember.user_id == uid)
    q = db.query(OrganizationMember.organization_id).filter(or_(*conds))
    if roles:
        q = q.filter(OrganizationMember.role.in_(roles))
    return sorted({r[0] for r in q.all()})


def add_member(db: Session, org: Organization, profile: Profile, role: str, source: str = "crede") -> OrganizationMember:
    m = membership(db, org.id, profile)
    if m:
        if role == "owner" or (role == "admin" and m.role not in MANAGER_ROLES):
            m.role = role
        m.profile_id = profile.id
        return m
    m = OrganizationMember(organization_id=org.id, profile_id=profile.id, user_id=local_user_id(profile), role=role, source=source)
    db.add(m)
    return m


def can_manage(db: Session, org: Organization, profile: Profile) -> bool:
    if is_platform_admin(profile):
        return True
    m = membership(db, org.id, profile)
    return bool(m and m.role in MANAGER_ROLES)


def can_verify(db: Session, org: Organization, profile: Profile) -> bool:
    """Only claimed & approved orgs can verify, and only through their managers."""
    if org.claim_status != "approved":
        return False
    m = membership(db, org.id, profile)
    return bool(m and m.role in MANAGER_ROLES)


def managers(db: Session, org: Organization) -> list[Profile]:
    rows = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id,
                                               OrganizationMember.role.in_(MANAGER_ROLES)).all()
    pids = {r.profile_id for r in rows if r.profile_id}
    uids = {r.user_id for r in rows if r.user_id and not r.profile_id}
    out = db.query(Profile).filter(Profile.id.in_(pids)).all() if pids else []
    if uids:
        out += db.query(Profile).filter(Profile.external_id.in_([f"local:{u}" for u in uids])).all()
    seen, uniq = set(), []
    for p in out:
        if p.id not in seen:
            seen.add(p.id)
            uniq.append(p)
    return uniq


def org_out(org: Organization, db: Session | None = None, profile: Profile | None = None) -> dict:
    d = {
        "id": org.id, "name": org.name, "slug": org.slug, "org_type": org.org_type or "company", "website": org.website,
        "industry": org.industry, "location": org.location, "description": org.description, "logo_url": org.logo_url,
        "email_domain": org.email_domain, "claim_status": org.claim_status or "unclaimed",
        "verification_status": org.verification_status, "can_verify": (org.claim_status == "approved"),
        "source": org.source or "crede", "teams_slug": org.teams_slug,
        "teams_url": f"{get_settings().teams_url.rstrip('/')}/o/{org.teams_slug}" if org.teams_slug and get_settings().teams_url else None,
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }
    if db is not None and profile is not None:
        m = membership(db, org.id, profile)
        d["my_role"] = m.role if m else None
        d["i_manage"] = bool(m and m.role in MANAGER_ROLES and org.claim_status == "approved")
        d["member_count"] = db.query(func.count(OrganizationMember.id)).filter(OrganizationMember.organization_id == org.id).scalar()
    return d


def search(db: Session, q: str = "", org_type: str | None = None, limit: int = 20) -> list[Organization]:
    query = db.query(Organization)
    if org_type in ORG_TYPES:
        query = query.filter(Organization.org_type == org_type)
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(or_(func.lower(Organization.name).like(like), func.lower(Organization.email_domain).like(like)))
        # prefix matches & approved orgs first
        query = query.order_by((func.lower(Organization.name).like(f"{q.lower()}%")).desc(),
                               (Organization.claim_status == "approved").desc(), Organization.name)
    else:
        query = query.order_by((Organization.claim_status == "approved").desc(), Organization.name)
    return query.limit(limit).all()


def find_by_name(db: Session, name: str, org_type: str | None = None) -> Organization | None:
    q = db.query(Organization).filter(func.lower(Organization.name) == (name or "").strip().lower())
    if org_type:
        q = q.filter(Organization.org_type == org_type)
    return q.first()


def create_org(db: Session, profile: Profile, data: dict) -> Organization:
    name = (data.get("name") or "").strip()
    if len(name) < 2:
        raise HTTPException(422, "Organization name is too short")
    org_type = data.get("org_type") if data.get("org_type") in ORG_TYPES else "company"
    dup = find_by_name(db, name, org_type)
    if dup:
        raise HTTPException(409, f"{dup.name} already exists on Crede — pick it instead, or claim it")
    dom = domain_of(data.get("email_domain")) or domain_of(data.get("website"))
    if dom in FREE_MAIL:
        dom = None
    org = Organization(
        name=name[:255], slug=unique_slug(db, name), org_type=org_type, website=data.get("website"), industry=data.get("industry"),
        location=data.get("location"), description=data.get("description"), cac_number=data.get("cac_number"),
        email_domain=dom, claim_status="unclaimed", verification_status="unverified", created_by_profile_id=profile.id,
        created_by_user_id=local_user_id(profile), source="crede",
    )
    db.add(org)
    db.flush()
    # creator is a member; managing (and verifying) still needs an approved claim
    add_member(db, org, profile, "member")
    db.commit()
    db.refresh(org)
    return org


# ─── claims ────────────────────────────────────────────────────────────────

def _hash(code: str) -> str:
    return hashlib.sha256(f"{get_settings().secret_key}:{code}".encode()).hexdigest()


def start_claim(db: Session, profile: Profile, org: Organization, work_email: str, evidence: str | None = None) -> OrgClaim:
    if org.claim_status == "approved" and can_manage(db, org, profile):
        raise HTTPException(400, "You already manage this organization")
    email = (work_email or "").strip().lower()
    dom = domain_of(email)
    if not dom or "@" not in email:
        raise HTTPException(422, "Enter your official work email")
    if dom in FREE_MAIL:
        raise HTTPException(422, "Use your official organization email, not a personal mailbox")
    if org.email_domain and not domain_matches(dom, org.email_domain):
        raise HTTPException(422, f"That email is not on {org.name}'s official domain (@{org.email_domain})")
    open_claim = db.query(OrgClaim).filter(OrgClaim.organization_id == org.id, OrgClaim.profile_id == profile.id,
                                           OrgClaim.status.in_(("pending_email", "pending_admin"))).first()
    claim = open_claim or OrgClaim(organization_id=org.id, profile_id=profile.id, method="domain")
    code = f"{secrets.randbelow(1_000_000):06d}"
    claim.work_email, claim.domain, claim.evidence = email, dom, (evidence or claim.evidence)
    claim.code_hash, claim.code_expires_at, claim.status = _hash(code), now() + timedelta(minutes=30), "pending_email"
    if not open_claim:
        db.add(claim)
    db.flush()
    mailer.enqueue(db, email, "org_claim_code", {"name": profile.full_name, "org": org.name, "code": code}, commit=False)
    db.commit()
    db.refresh(claim)
    claim._dev_code = code  # type: ignore[attr-defined]  # surfaced only when SMTP is not configured
    return claim


def confirm_claim(db: Session, profile: Profile, claim: OrgClaim, code: str) -> OrgClaim:
    if claim.profile_id != profile.id:
        raise HTTPException(404, "Claim not found")
    if claim.status != "pending_email":
        raise HTTPException(400, "This claim is not waiting for an email code")
    if not claim.code_expires_at or claim.code_expires_at < now():
        raise HTTPException(400, "Code expired — request a new one")
    if not hmac.compare_digest(claim.code_hash or "", _hash((code or "").strip())):
        raise HTTPException(400, "That code is not right")
    org = db.get(Organization, claim.organization_id)
    claim.email_verified_at, claim.code_hash = now(), None
    if not org.email_domain:
        org.email_domain = claim.domain
    s = get_settings()
    if s.org_domain_auto_approve:
        # compatibility mode: the official-domain check alone approves
        return decide_claim(db, None, claim, True, "Approved automatically (official email domain verified)")
    claim.status = "pending_admin"
    if org.claim_status != "approved":
        org.claim_status = "pending"
    db.commit()
    notify_admins(db, "org_claim", f"Org claim: {org.name}", f"{profile.full_name or profile.email} verified {claim.work_email}",
                  link="/admin?tab=claims", email_template="org_claim_admin",
                  email_ctx={"org": org.name, "requester": profile.full_name or profile.email, "method": "official email domain",
                             "work_email": claim.work_email, "email_verified": True, "evidence": claim.evidence})
    db.refresh(claim)
    return claim


def decide_claim(db: Session, admin: Profile | None, claim: OrgClaim, approve: bool, note: str | None = None) -> OrgClaim:
    if claim.status not in ("pending_admin", "pending_email") and not (claim.status == "approved" and not approve):
        raise HTTPException(400, f"Claim is already {claim.status}")
    if approve and not claim.email_verified_at:
        raise HTTPException(400, "The official email domain has not been confirmed yet")
    org = db.get(Organization, claim.organization_id)
    claimant = db.get(Profile, claim.profile_id)
    claim.status = "approved" if approve else "rejected"
    claim.admin_note, claim.decided_at = note, now()
    claim.decided_by_profile_id = admin.id if admin else None
    if approve:
        org.claim_status, org.verification_status = "approved", "verified"
        has_owner = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id,
                                                        OrganizationMember.role == "owner",
                                                        OrganizationMember.profile_id != claimant.id).first()
        add_member(db, org, claimant, "admin" if has_owner else "owner")
        _release_queued(db, org)
    else:
        still = db.query(OrgClaim).filter(OrgClaim.organization_id == org.id, OrgClaim.id != claim.id,
                                          OrgClaim.status.in_(("pending_admin", "approved"))).first()
        if not still and org.claim_status != "approved":
            org.claim_status = "unclaimed"
    db.commit()
    if claimant:
        notify(db, claimant, "org_claim_result", f"Claim for {org.name} {'approved' if approve else 'declined'}",
               note or "", link=f"/orgs/{org.id}", email_template="org_claim_result",
               email_ctx={"org": org.name, "approved": approve, "note": note})
    db.refresh(claim)
    return claim


def claim_out(c: OrgClaim, db: Session) -> dict:
    org = db.get(Organization, c.organization_id)
    p = db.get(Profile, c.profile_id)
    return {"id": c.id, "status": c.status, "method": c.method, "work_email": c.work_email, "domain": c.domain,
            "email_verified": bool(c.email_verified_at), "evidence": c.evidence, "admin_note": c.admin_note,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "decided_at": c.decided_at.isoformat() if c.decided_at else None,
            "organization": org_out(org) if org else None,
            "requester": {"id": p.id, "name": p.full_name, "email": p.email, "username": p.username} if p else None}


# ─── verification requests (claims → issuer orgs) ───────────────────────────

def _subject(db: Session, subject_type: str, subject_id: int):
    model = TimelineEntry if subject_type == "timeline" else Certification
    return db.get(model, subject_id)


def subject_summary(subject_type: str, obj) -> str:
    if subject_type == "certification":
        return f"{obj.name}" + (f" — issued by {obj.issuer}" if obj.issuer else "") + (f" ({obj.issued_at:%b %Y})" if obj.issued_at else "")
    et = getattr(obj, "entry_type", None) or "work"
    rng = f"{obj.start_date:%b %Y} – {'present' if obj.is_current or not obj.end_date else f'{obj.end_date:%b %Y}'}" if obj.start_date else ""
    if et == "education":
        return f"{obj.job_title}{' in ' + obj.field_of_study if getattr(obj, 'field_of_study', None) else ''} at {obj.organization} ({rng})"
    return f"{obj.job_title} at {obj.organization} ({rng})"


def request_verification(db: Session, profile: Profile, subject_type: str, subject_id: int, org: Organization,
                         commit: bool = True) -> VerificationRequest:
    obj = _subject(db, subject_type, subject_id)
    if not obj or obj.profile_id != profile.id:
        raise HTTPException(404, "Claim not found")
    vr = db.query(VerificationRequest).filter(VerificationRequest.subject_type == subject_type, VerificationRequest.subject_id == subject_id,
                                              VerificationRequest.organization_id == org.id).first()
    summary = subject_summary(subject_type, obj)[:500]
    if vr and vr.status in ("pending", "queued"):
        return vr
    if not vr:
        vr = VerificationRequest(profile_id=profile.id, organization_id=org.id, subject_type=subject_type, subject_id=subject_id)
        db.add(vr)
    vr.summary, vr.note, vr.decided_at, vr.decided_by_profile_id = summary, None, None, None
    # an unclaimed org cannot verify yet: queue the request until someone claims it
    vr.status = "pending" if org.claim_status == "approved" else "queued"
    if (obj.verification_status or "unverified") not in ("verified", "approved"):
        obj.verification_status = "pending"
    db.flush()
    if vr.status == "pending":
        _notify_org(db, org, profile, vr)
    if commit:
        db.commit()
        db.refresh(vr)
    return vr


def _notify_org(db: Session, org: Organization, requester: Profile, vr: VerificationRequest) -> None:
    for m in managers(db, org):
        notify(db, m, "verification_request", f"Verify {requester.full_name or requester.email}", vr.summary or "",
               link=f"/orgs/{org.id}?tab=requests", actor_id=requester.id, data={"request_id": vr.id},
               email_template="verification_request",
               email_ctx={"requester": requester.full_name or requester.email, "org": org.name, "summary": vr.summary}, commit=False)


def _release_queued(db: Session, org: Organization) -> None:
    rows = db.query(VerificationRequest).filter(VerificationRequest.organization_id == org.id, VerificationRequest.status == "queued").all()
    for vr in rows:
        vr.status = "pending"
        req = db.get(Profile, vr.profile_id)
        if req:
            db.flush()
            _notify_org(db, org, req, vr)


def decide_verification(db: Session, actor: Profile, vr: VerificationRequest, approve: bool, note: str | None = None) -> VerificationRequest:
    from app.services.completion import refresh_scores
    org = db.get(Organization, vr.organization_id)
    if not can_verify(db, org, actor):
        raise HTTPException(403, "Only managers of a claimed, approved organization can verify")
    if vr.status != "pending":
        raise HTTPException(400, f"Request is {vr.status}")
    vr.status = "approved" if approve else "rejected"
    vr.note, vr.decided_at, vr.decided_by_profile_id = note, now(), actor.id
    obj = _subject(db, vr.subject_type, vr.subject_id)
    owner = db.get(Profile, vr.profile_id)
    if obj:
        obj.verification_status = "verified" if approve else "rejected"
    db.commit()
    if owner:
        refresh_scores(db, owner)
        notify(db, owner, "verification_result", f"{org.name} {'verified' if approve else 'declined'} your claim", vr.summary or "",
               link="/verification", actor_id=actor.id, email_template="verification_result",
               email_ctx={"org": org.name, "approved": approve, "summary": vr.summary, "note": note})
    db.refresh(vr)
    return vr


def vr_out(vr: VerificationRequest, db: Session, include_requester: bool = True) -> dict:
    org = db.get(Organization, vr.organization_id)
    d = {"id": vr.id, "subject_type": vr.subject_type, "subject_id": vr.subject_id, "summary": vr.summary, "status": vr.status,
         "note": vr.note, "created_at": vr.created_at.isoformat() if vr.created_at else None,
         "decided_at": vr.decided_at.isoformat() if vr.decided_at else None,
         "organization": {"id": org.id, "name": org.name, "org_type": org.org_type, "claim_status": org.claim_status} if org else None}
    if include_requester:
        p = db.get(Profile, vr.profile_id)
        d["requester"] = {"id": p.id, "name": p.full_name, "username": p.username, "headline": p.headline} if p else None
    return d


def link_and_request(db: Session, profile: Profile, subject_type: str, obj, org_id: int | None, org_name: str | None,
                     want_type: str) -> None:
    """Attach a picked org (or an exact-name match) to a claim and send it a verification request."""
    org = db.get(Organization, org_id) if org_id else (find_by_name(db, org_name or "", want_type) if org_name else None)
    if subject_type == "timeline":
        obj.organization_id = org.id if org else None
        if org:
            obj.organization = org.name
    else:
        obj.issuer_org_id = org.id if org else None
        if org:
            obj.issuer = org.name
    db.flush()
    if org:
        request_verification(db, profile, subject_type, obj.id, org, commit=False)


def verification_info(db: Session, subject_type: str, subject_id: int) -> dict | None:
    vr = (db.query(VerificationRequest).filter(VerificationRequest.subject_type == subject_type, VerificationRequest.subject_id == subject_id)
          .order_by(VerificationRequest.created_at.desc()).first())
    if not vr:
        return None
    org = db.get(Organization, vr.organization_id)
    return {"request_id": vr.id, "status": vr.status, "note": vr.note,
            "org": {"id": org.id, "name": org.name, "claim_status": org.claim_status} if org else None}
