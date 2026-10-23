"""Profile completion + claim-backed verification (replaces the old 100-point score).

A *claim* is every timeline entry (work or education) and every certification. Each has a level:
  self_reported      – the user typed it
  document_provided  – the user attached evidence (degree, certificate, letter, payslip…)
  pending            – sent to an approved org for confirmation
  issuer_verified    – an approved (claimed) org confirmed it
  rejected           – the org declined it
Summary shown everywhere: "X of Y claims verified, Z by issuers".
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Profile


def claim_level(status: str | None, document_key: str | None) -> str:
    s = (status or "unverified").lower()
    if s in ("verified", "issuer_verified", "approved"):
        return "issuer_verified"
    if s == "rejected":
        return "rejected"
    if s == "pending":
        return "pending"
    return "document_provided" if document_key else "self_reported"


def list_claims(profile: Profile) -> list[dict]:
    out = []
    for e in profile.timeline_entries:
        et = getattr(e, "entry_type", None) or "work"
        out.append({
            "subject_type": "timeline", "subject_id": e.id, "claim_type": "education" if et == "education" else "employment",
            "title": e.job_title, "subtitle": e.organization, "organization_id": getattr(e, "organization_id", None),
            "start": e.start_date.isoformat() if e.start_date else None,
            "end": e.end_date.isoformat() if e.end_date else None, "is_current": e.is_current,
            "has_document": bool(getattr(e, "document_key", None)),
            "level": claim_level(e.verification_status, getattr(e, "document_key", None)),
        })
    for c in profile.certifications:
        out.append({
            "subject_type": "certification", "subject_id": c.id, "claim_type": "certification",
            "title": c.name, "subtitle": c.issuer or "", "organization_id": getattr(c, "issuer_org_id", None),
            "start": c.issued_at.isoformat() if c.issued_at else None, "end": c.expires_at.isoformat() if c.expires_at else None,
            "is_current": False, "has_document": bool(c.document_key),
            "level": claim_level(c.verification_status, c.document_key),
        })
    return out


def claims_summary(profile: Profile) -> dict:
    claims = list_claims(profile)
    total = len(claims)
    issuer = sum(1 for c in claims if c["level"] == "issuer_verified")
    doc = sum(1 for c in claims if c["level"] == "document_provided")
    pending = sum(1 for c in claims if c["level"] == "pending")
    verified = issuer + doc
    return {
        "total": total, "verified": verified, "issuer_verified": issuer, "document_provided": doc, "pending": pending,
        "self_reported": sum(1 for c in claims if c["level"] == "self_reported"),
        "rejected": sum(1 for c in claims if c["level"] == "rejected"),
        "identity_verified": bool(getattr(profile, "identity_verified", False)),
        "label": f"{verified} of {total} claims verified, {issuer} by issuers" if total else "No claims yet",
        "ratio": round(verified / total, 3) if total else 0.0,
    }


def badge_eligibility(profile: Profile) -> dict:
    claims = list_claims(profile)
    identity = bool(getattr(profile, "identity_verified", False))
    issuer_claims = [c for c in claims if c["level"] == "issuer_verified"]
    key_issuer = [c for c in issuer_claims if c["claim_type"] in ("employment", "education")]
    gray_missing = [] if identity else ["Confirm your identity (government ID) on the Verification page"]
    green_missing = list(gray_missing)
    if len(issuer_claims) < 2:
        green_missing.append(f"Get {2 - len(issuer_claims)} more claim(s) verified by an issuer")
    if not key_issuer:
        green_missing.append("Have at least one employer or school verify a role or degree")
    return {
        "gray": {"eligible": not gray_missing, "missing": gray_missing},
        "green": {"eligible": not green_missing, "missing": green_missing},
        "current": getattr(profile, "badge_level", None) or "none",
    }


def recompute_verification_score(profile: Profile) -> int:
    """Legacy column: % of claims that are document- or issuer-backed (kept for old clients)."""
    s = claims_summary(profile)
    return int(round(s["ratio"] * 100))


def recompute_profile_completion(profile: Profile) -> int:
    work = [e for e in profile.timeline_entries if (getattr(e, "entry_type", None) or "work") == "work"]
    edu = [e for e in profile.timeline_entries if getattr(e, "entry_type", None) == "education"]
    weighted = [
        (bool(profile.full_name), 5), (bool(profile.headline), 10), (bool(profile.location), 5),
        (bool(profile.summary), 10), (bool(profile.username), 5), (bool(profile.phone), 5),
        (len(work) >= 1, 20), (any(e.achievements for e in work), 10), (len(edu) >= 1, 10),
        (len(profile.skills) >= 5, 10), (len(profile.certifications) >= 1, 5), (bool(profile.avatar_url), 5),
    ]
    return min(100, sum(w for ok, w in weighted if ok))


def snapshot(db: Session, profile: Profile) -> None:
    s = claims_summary(profile)
    db.execute(text("""INSERT INTO profile_snapshots(profile_id, day, completion, claims_total, claims_verified, claims_issuer)
                       VALUES (:p, :d, :c, :t, :v, :i)
                       ON CONFLICT (profile_id, day) DO UPDATE SET completion=EXCLUDED.completion,
                         claims_total=EXCLUDED.claims_total, claims_verified=EXCLUDED.claims_verified,
                         claims_issuer=EXCLUDED.claims_issuer"""),
               {"p": profile.id, "d": date.today(), "c": profile.profile_completion or 0, "t": s["total"],
                "v": s["verified"], "i": s["issuer_verified"]})


def refresh_scores(db: Session, profile: Profile) -> Profile:
    profile.verification_score = recompute_verification_score(profile)
    profile.profile_completion = recompute_profile_completion(profile)
    profile.facts_version = (profile.facts_version or 0) + 1
    if profile.profile_completion >= 60 and profile.headline and profile.timeline_entries:
        profile.onboarding_completed = True
    try:
        with db.begin_nested():
            snapshot(db, profile)
    except Exception:  # noqa: BLE001 - chart data must never break a save
        pass
    db.commit()
    db.refresh(profile)
    return profile
