"""Recruiter candidate search & matching — uses the same unified matcher as Opportunities."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Job, JobMatch, Profile, Skill
from app.routers.jobs import _ensure_member
from app.services import matcher
from app.services.completion import claims_summary

router = APIRouter(prefix="/candidates", tags=["candidates"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]


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
    avatar_url: Optional[str] = None
    badge_level: str = "none"
    claims: Optional[dict] = None
    match_score: Optional[float] = None


class MatchOut(BaseModel):
    id: int
    job_id: int
    profile_id: int
    overall_score: Optional[float] = None
    experience_score: float = 0
    skill_score: float = 0
    certification_score: float = 0
    location_score: float = 0
    verification_bonus: float = 0
    insights: Optional[dict] = None
    match: Optional[dict] = None
    status: str
    profile: Optional[CandidateCard] = None


def _card(p: Profile, score: Optional[float] = None) -> CandidateCard:
    return CandidateCard(id=p.id, full_name=p.full_name, headline=p.headline, industry=p.industry, location=p.location,
                         years_experience=p.years_experience, verification_score=p.verification_score, username=p.username,
                         avatar_url=p.avatar_url, badge_level=p.badge_level or "none", claims=claims_summary(p), match_score=score)


def _comp(m: dict, key: str) -> float:
    for b in m.get("breakdown") or []:
        if b["key"] == key and b.get("value") is not None:
            return round(b["value"] * 100, 1)
    return 0.0


def _out(row: JobMatch, p: Profile | None, m: dict) -> MatchOut:
    return MatchOut(id=row.id, job_id=row.job_id, profile_id=row.profile_id, overall_score=m.get("score"),
                    experience_score=row.experience_score, skill_score=row.skill_score, certification_score=row.certification_score,
                    location_score=row.location_score, verification_bonus=row.verification_bonus, insights=row.insights,
                    match=matcher.summary(m), status=row.status, profile=_card(p, m.get("score")) if p else None)


@router.get("/search", response_model=list[CandidateCard])
def search_candidates(profile: Prof, db: DB, q: Optional[str] = None, industry: Optional[str] = None, location: Optional[str] = None,
                      min_verification: int = Query(0, ge=0, le=100), min_experience: Optional[int] = None,
                      skill: Optional[str] = None, badge: Optional[str] = None, limit: int = Query(20, le=50)):
    query = db.query(Profile).filter(Profile.is_public.is_(True), Profile.onboarding_completed.is_(True))
    if min_verification:
        query = query.filter(Profile.verification_score >= min_verification)
    if industry:
        query = query.filter(Profile.industry.ilike(f"%{industry}%"))
    if location:
        query = query.filter(Profile.location.ilike(f"%{location}%"))
    if min_experience is not None:
        query = query.filter(Profile.years_experience >= min_experience)
    if badge in ("gray", "green"):
        query = query.filter(Profile.badge_level.in_(("gray", "green") if badge == "gray" else ("green",)))
    if q:
        query = query.filter(or_(Profile.full_name.ilike(f"%{q}%"), Profile.headline.ilike(f"%{q}%"), Profile.summary.ilike(f"%{q}%")))
    if skill:
        query = query.join(Skill).filter(Skill.name.ilike(f"%{skill}%"))
    return [_card(p) for p in query.order_by(Profile.verification_score.desc()).limit(limit).all()]


@router.post("/jobs/{job_id}/matches", response_model=list[MatchOut])
def run_matching(job_id: int, profile: Prof, db: DB, limit: int = Query(25, le=50)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    _ensure_member(db, job.organization_id, profile)
    profiles = (db.query(Profile).filter(Profile.is_public.is_(True), Profile.onboarding_completed.is_(True))
                .order_by(Profile.verification_score.desc()).limit(150).all())
    results = []
    for p in profiles:
        m = matcher.match_job(db, p, job)
        if m.get("score") is None:
            continue
        row = db.query(JobMatch).filter(JobMatch.job_id == job_id, JobMatch.profile_id == p.id).first()
        if not row:
            row = JobMatch(job_id=job_id, profile_id=p.id)
            db.add(row)
        row.overall_score = float(m["score"])
        row.experience_score = _comp(m, "experience")
        row.skill_score = _comp(m, "skills")
        row.certification_score = _comp(m, "education")
        row.location_score = _comp(m, "location")
        row.verification_bonus = _comp(m, "verification")
        row.insights = {"engine": m.get("engine"), "label": m.get("label"), "counts": m.get("counts")}
        row.status = row.status or "suggested"
        results.append((row, p, m))
    db.commit()
    results.sort(key=lambda x: -(x[2]["score"] or 0))
    return [_out(r, p, m) for r, p, m in results[:limit]]


@router.get("/jobs/{job_id}/matches", response_model=list[MatchOut])
def list_matches(job_id: int, profile: Prof, db: DB):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    _ensure_member(db, job.organization_id, profile)
    rows = db.query(JobMatch).filter(JobMatch.job_id == job_id).order_by(JobMatch.overall_score.desc()).limit(50).all()
    out = []
    for r in rows:
        p = db.get(Profile, r.profile_id)
        if p:
            out.append(_out(r, p, matcher.match_job(db, p, job)))
    return out
