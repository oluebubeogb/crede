from typing import Annotated

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile
from app.schemas import DashboardOut, ProfileOut, ProfileUpdate
from app.models import GeneratedDocument
from app.models_suite import Comment, MatchCache, Post, PostReaction, ProfileSnapshot
from app.services.admin import is_platform_admin
from app.services.completion import claims_summary, refresh_scores

router = APIRouter(prefix="/profile", tags=["profile"])


def _profile_out(profile: Profile) -> ProfileOut:
    """Build ProfileOut without relying on strict ORM→Pydantic edge cases."""
    return ProfileOut(
        id=profile.id,
        external_id=getattr(profile, "external_id", None),
        collab_user_id=str(profile.collab_user_id) if profile.collab_user_id is not None else None,
        email=profile.email,
        full_name=profile.full_name,
        username=profile.username,
        headline=profile.headline,
        industry=profile.industry,
        location=profile.location,
        country=getattr(profile, "country", None),
        phone=getattr(profile, "phone", None),
        phone_country_code=getattr(profile, "phone_country_code", None),
        years_experience=profile.years_experience,
        summary=profile.summary,
        onboarding_completed=bool(profile.onboarding_completed),
        verification_score=int(profile.verification_score or 0),
        profile_completion=int(profile.profile_completion or 0),
        is_public=bool(profile.is_public if profile.is_public is not None else True),
        preferences=getattr(profile, "preferences", None),
        avatar_url=profile.avatar_url,
        badge_level=profile.badge_level or "none",
        identity_verified=bool(profile.identity_verified),
        is_admin=is_platform_admin(profile),
        claims=claims_summary(profile),
        created_at=profile.created_at,
    )


@router.get("/me", response_model=ProfileOut)
def me(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return _profile_out(profile)


@router.patch("/me", response_model=ProfileOut)
def update_me(
    body: ProfileUpdate,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    data = body.model_dump(exclude_unset=True)
    if "username" in data and data["username"]:
        exists = (
            db.query(Profile)
            .filter(Profile.username == data["username"], Profile.id != profile.id)
            .first()
        )
        if exists:
            raise HTTPException(400, "Username taken")
    # Merge preferences JSON instead of clobbering
    if "preferences" in data and data["preferences"] is not None:
        existing = getattr(profile, "preferences", None) or {}
        if not isinstance(existing, dict):
            existing = {}
        incoming = data.pop("preferences") or {}
        profile.preferences = {**existing, **incoming}
    for k, v in data.items():
        setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return _profile_out(refresh_scores(db, profile))


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    profile = refresh_scores(db, profile)
    actions = []
    if profile.profile_completion < 80:
        actions.append("Complete Profile")
    if profile.verification_score < 40:
        actions.append("Verify Employment")
    if not profile.documents:
        actions.append("Generate CV")
    if not profile.timeline_entries:
        actions.append("Add first career milestone")
    return DashboardOut(
        profile=_profile_out(profile),
        timeline_count=len(profile.timeline_entries or []),
        verified_docs=sum(1 for v in (profile.verifications or []) if v.status == "approved"),
        generated_cvs=sum(1 for d in (profile.documents or []) if d.doc_type == "cv"),
        recommended_actions=actions,
    )


@router.get("/public/{username}")
def public_profile(username: str, db: Annotated[Session, Depends(get_db)]):
    """Public profile + activity data for career chart (no private CVs)."""
    p = db.query(Profile).filter(Profile.username == username, Profile.is_public == True).first()
    if not p:
        raise HTTPException(404, "Profile not found")
    profile = _profile_out(p)
    timeline = [
        {
            "id": e.id,
            "job_title": e.job_title,
            "organization": e.organization,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "is_current": bool(e.is_current),
            "entry_type": getattr(e, "entry_type", None) or "work",
            "field_of_study": getattr(e, "field_of_study", None),
            "verification_status": getattr(e, "verification_status", None),
        }
        for e in (p.timeline_entries or [])
    ]
    skills = [
        {
            "id": s.id,
            "name": s.name,
            "acquired_at": s.acquired_at.isoformat() if getattr(s, "acquired_at", None) else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in (p.skills or [])
    ]
    certifications = [
        {
            "id": c.id,
            "name": c.name,
            "issuer": getattr(c, "issuer", None),
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "verification_status": getattr(c, "verification_status", None),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in (p.certifications or [])
    ]
    out = profile.model_dump(mode="json")
    for k in ("email", "phone", "phone_country_code", "preferences", "external_id", "collab_user_id", "is_admin"):
        out.pop(k, None)
    return {
        **out,
        "timeline_entries": timeline,
        "skills": skills,
        "certifications": certifications,
    }


@router.post("/avatar", response_model=ProfileOut)
async def upload_avatar(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)],
                        file: UploadFile = File(...)):
    from app.services.files import save_image
    img = await save_image(profile, file, "avatars", max_side=480)
    profile.avatar_url = img["url"]
    db.commit()
    return _profile_out(refresh_scores(db, profile))


def _month_keys(n: int) -> list[str]:
    today = date.today().replace(day=1)
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return keys[::-1]


@router.get("/dashboard/stats")
def dashboard_stats(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    """Data for the dashboard charts (all deterministic, cheap queries)."""
    since = date.today() - timedelta(days=120)
    snaps = (db.query(ProfileSnapshot).filter(ProfileSnapshot.profile_id == profile.id, ProfileSnapshot.day >= since)
             .order_by(ProfileSnapshot.day.asc()).all())
    strength = [{"day": s.day.isoformat(), "completion": s.completion, "claims": s.claims_total, "verified": s.claims_verified,
                 "issuer": s.claims_issuer} for s in snaps]
    if not strength:
        c = claims_summary(profile)
        strength = [{"day": date.today().isoformat(), "completion": profile.profile_completion or 0, "claims": c["total"],
                     "verified": c["verified"], "issuer": c["issuer_verified"]}]
    months = _month_keys(6)
    docs = {k: {"month": k, "cv": 0, "cover_letter": 0, "bio": 0} for k in months}
    for d in db.query(GeneratedDocument).filter(GeneratedDocument.profile_id == profile.id).all():
        k = d.created_at.strftime("%Y-%m") if d.created_at else None
        if k in docs and d.doc_type in docs[k]:
            docs[k][d.doc_type] += 1
    buckets = [{"range": f"{lo}-{lo + 19 if lo < 80 else 100}", "count": 0} for lo in (0, 20, 40, 60, 80)]
    insufficient = 0
    skills: dict[str, dict] = {}
    for row in db.query(MatchCache).filter(MatchCache.profile_id == profile.id).all():
        if row.score is None:
            insufficient += 1
        else:
            buckets[min(4, int(row.score) // 20)]["count"] += 1
        for h in (row.result or {}).get("skills") or []:
            t = skills.setdefault(h["term"], {"skill": h["term"], "demand": 0, "met": 0, "partial": 0, "missing": 0})
            t["demand"] += 1
            t[h["status"]] = t.get(h["status"], 0) + 1
    coverage = sorted(skills.values(), key=lambda x: -x["demand"])[:10]
    weeks = []
    start = datetime.now(timezone.utc) - timedelta(weeks=8)
    my_posts = db.query(Post.id, Post.created_at, Post.like_count, Post.comment_count, Post.share_count).filter(Post.profile_id == profile.id).all()
    for i in range(8):
        a, b = start + timedelta(weeks=i), start + timedelta(weeks=i + 1)
        weeks.append({"week": a.date().isoformat(), "posts": sum(1 for p in my_posts if p.created_at and a <= p.created_at < b),
                      "comments": db.query(Comment).filter(Comment.profile_id == profile.id, Comment.created_at >= a, Comment.created_at < b).count(),
                      "likes_received": 0})
    post_ids = [p.id for p in my_posts]
    if post_ids:
        for r in db.query(PostReaction.created_at).filter(PostReaction.target_type == "post", PostReaction.kind == "like",
                                                         PostReaction.target_id.in_(post_ids), PostReaction.created_at >= start).all():
            idx = min(7, int((r.created_at - start).total_seconds() // (7 * 86400)))
            weeks[idx]["likes_received"] += 1
    return {
        "strength": strength, "documents": list(docs.values()),
        "matches": {"buckets": buckets, "insufficient": insufficient}, "skill_coverage": coverage,
        "community": {"weeks": weeks, "totals": {"posts": len(my_posts), "likes": sum(p.like_count or 0 for p in my_posts),
                                                 "comments": sum(p.comment_count or 0 for p in my_posts),
                                                 "shares": sum(p.share_count or 0 for p in my_posts)}},
        "claims": claims_summary(profile), "badge_level": profile.badge_level or "none",
    }
