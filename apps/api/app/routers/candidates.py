"""Phase 2 — Candidate search & AI matching."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.database import get_db
from app.models import (
    Job,
    JobMatch,
    Profile,
    Skill,
    TimelineEntry,
    Certification,
    OrganizationMember,
)

router = APIRouter(prefix="/candidates", tags=["candidates"])


class CandidateCard(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: Optional[str] = None
    headline: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    years_experience: Optional[int] = None
    verification_score: int
    username: Optional[str] = None
    match_score: Optional[float] = None


class MatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    job_id: int
    profile_id: int
    overall_score: float
    experience_score: float
    skill_score: float
    certification_score: float
    location_score: float
    verification_bonus: float
    insights: Optional[dict] = None
    status: str
    profile: Optional[CandidateCard] = None


def _local_uid(auth: AuthUser) -> int:
    if not auth.id.startswith("local:"):
        from fastapi import HTTPException
        raise HTTPException(400, "Requires local account")
    return int(auth.id.split(":", 1)[1])


@router.get("/search", response_model=list[CandidateCard])
def search_candidates(
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: Optional[str] = None,
    industry: Optional[str] = None,
    location: Optional[str] = None,
    min_verification: int = Query(0, ge=0, le=100),
    min_experience: Optional[int] = None,
    skill: Optional[str] = None,
    limit: int = Query(20, le=50),
):
    """Recruiter candidate search over public verified profiles."""
    query = db.query(Profile).filter(Profile.is_public == True, Profile.onboarding_completed == True)
    if min_verification:
        query = query.filter(Profile.verification_score >= min_verification)
    if industry:
        query = query.filter(Profile.industry.ilike(f"%{industry}%"))
    if location:
        query = query.filter(Profile.location.ilike(f"%{location}%"))
    if min_experience is not None:
        query = query.filter(Profile.years_experience >= min_experience)
    if q:
        query = query.filter(
            or_(
                Profile.full_name.ilike(f"%{q}%"),
                Profile.headline.ilike(f"%{q}%"),
                Profile.summary.ilike(f"%{q}%"),
            )
        )
    if skill:
        query = query.join(Skill).filter(Skill.name.ilike(f"%{skill}%"))
    profiles = query.order_by(Profile.verification_score.desc()).limit(limit).all()
    return [
        CandidateCard(
            id=p.id,
            full_name=p.full_name,
            headline=p.headline,
            industry=p.industry,
            location=p.location,
            years_experience=p.years_experience,
            verification_score=p.verification_score,
            username=p.username,
        )
        for p in profiles
    ]


def _score_match(job: Job, profile: Profile, db: Session) -> dict:
    """Simple deterministic matching (no OpenAI required for base scores)."""
    exp_score = 50.0
    if job.experience_years_min and profile.years_experience is not None:
        if profile.years_experience >= job.experience_years_min:
            exp_score = 95.0
        elif profile.years_experience >= job.experience_years_min - 2:
            exp_score = 70.0
        else:
            exp_score = 40.0

    skill_score = 40.0
    reqs = job.requirements or []
    if reqs:
        profile_skills = {s.name.lower() for s in profile.skills}
        hits = sum(1 for r in reqs if any(r.lower() in ps or ps in r.lower() for ps in profile_skills))
        skill_score = min(100.0, (hits / max(len(reqs), 1)) * 100)

    cert_score = 50.0
    if profile.certifications:
        cert_score = min(100.0, 50 + len(profile.certifications) * 10)

    loc_score = 80.0
    if job.location and profile.location:
        if job.location.lower() in profile.location.lower() or profile.location.lower() in job.location.lower():
            loc_score = 100.0
        else:
            loc_score = 40.0

    ver_bonus = min(20.0, profile.verification_score / 5.0)

    overall = (
        exp_score * 0.35
        + skill_score * 0.30
        + cert_score * 0.15
        + loc_score * 0.10
        + ver_bonus * 0.10
    )
    return {
        "overall_score": round(overall, 1),
        "experience_score": round(exp_score, 1),
        "skill_score": round(skill_score, 1),
        "certification_score": round(cert_score, 1),
        "location_score": round(loc_score, 1),
        "verification_bonus": round(ver_bonus, 1),
        "insights": {
            "required_skills_matched": skill_score,
            "years_experience": profile.years_experience,
            "verification_score": profile.verification_score,
        },
    }


@router.post("/jobs/{job_id}/matches", response_model=list[MatchOut])
def run_matching(
    job_id: int,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(25, le=50),
):
    """Compute / refresh matches for a job against public profiles."""
    uid = _local_uid(auth)
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(404, "Job not found")
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == job.organization_id,
            OrganizationMember.user_id == uid,
        )
        .first()
    )
    if not member:
        from fastapi import HTTPException
        raise HTTPException(403, "Not a member of this organization")

    profiles = (
        db.query(Profile)
        .filter(Profile.is_public == True, Profile.onboarding_completed == True)
        .order_by(Profile.verification_score.desc())
        .limit(100)
        .all()
    )
    results = []
    for p in profiles:
        scores = _score_match(job, p, db)
        existing = (
            db.query(JobMatch)
            .filter(JobMatch.job_id == job_id, JobMatch.profile_id == p.id)
            .first()
        )
        if existing:
            for k, v in scores.items():
                if k != "insights":
                    setattr(existing, k, v)
            existing.insights = scores["insights"]
            match = existing
        else:
            match = JobMatch(job_id=job_id, profile_id=p.id, **{k: v for k, v in scores.items() if k != "insights"}, insights=scores["insights"])
            db.add(match)
        results.append((match, p, scores["overall_score"]))
    db.commit()
    results.sort(key=lambda x: x[2], reverse=True)
    out = []
    for match, p, _ in results[:limit]:
        db.refresh(match)
        card = CandidateCard(
            id=p.id,
            full_name=p.full_name,
            headline=p.headline,
            industry=p.industry,
            location=p.location,
            years_experience=p.years_experience,
            verification_score=p.verification_score,
            username=p.username,
            match_score=match.overall_score,
        )
        out.append(
            MatchOut(
                id=match.id,
                job_id=match.job_id,
                profile_id=match.profile_id,
                overall_score=match.overall_score,
                experience_score=match.experience_score,
                skill_score=match.skill_score,
                certification_score=match.certification_score,
                location_score=match.location_score,
                verification_bonus=match.verification_bonus,
                insights=match.insights,
                status=match.status,
                profile=card,
            )
        )
    return out


@router.get("/jobs/{job_id}/matches", response_model=list[MatchOut])
def list_matches(
    job_id: int,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    matches = (
        db.query(JobMatch)
        .filter(JobMatch.job_id == job_id)
        .order_by(JobMatch.overall_score.desc())
        .limit(50)
        .all()
    )
    out = []
    for m in matches:
        p = db.query(Profile).filter(Profile.id == m.profile_id).first()
        card = None
        if p:
            card = CandidateCard(
                id=p.id,
                full_name=p.full_name,
                headline=p.headline,
                industry=p.industry,
                location=p.location,
                years_experience=p.years_experience,
                verification_score=p.verification_score,
                username=p.username,
                match_score=m.overall_score,
            )
        out.append(
            MatchOut(
                id=m.id,
                job_id=m.job_id,
                profile_id=m.profile_id,
                overall_score=m.overall_score,
                experience_score=m.experience_score,
                skill_score=m.skill_score,
                certification_score=m.certification_score,
                location_score=m.location_score,
                verification_bonus=m.verification_bonus,
                insights=m.insights,
                status=m.status,
                profile=card,
            )
        )
    return out
