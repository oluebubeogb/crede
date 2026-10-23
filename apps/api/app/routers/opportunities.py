"""Professional opportunities — open jobs scored by the unified matcher (no placeholder scores)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Job, Profile
from app.services import matcher

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


def _job_out(job: Job) -> dict:
    o = job.organization
    return {"id": job.id, "title": job.title, "location": job.location, "employment_type": job.employment_type,
            "department": job.department, "salary_min": job.salary_min, "salary_max": job.salary_max,
            "salary_currency": job.salary_currency, "status": job.status, "deadline": job.deadline.isoformat() if job.deadline else None,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "organization": {"id": o.id, "name": o.name, "logo_url": o.logo_url, "org_type": o.org_type,
                             "verified": o.verification_status == "verified"} if o else {"id": None, "name": None}}


@router.get("")
def list_opportunities(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)],
                       limit: int = 30, q: Optional[str] = None):
    qry = db.query(Job).options(joinedload(Job.organization)).filter(Job.status == "open")
    if q:
        qry = qry.filter(Job.title.ilike(f"%{q.strip()[:60]}%"))
    jobs = qry.order_by(Job.created_at.desc()).limit(min(limit, 60)).all()
    facts = matcher.build_facts(db, profile)
    out = []
    for job in jobs:
        m = matcher.summary(matcher.match_job(db, profile, job, facts))
        out.append({"match_id": None, "score": m["score"], "match": m, "job": _job_out(job)})
    # scored first (desc), then insufficient-data cards
    out.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    return out


@router.get("/{job_id}/match")
def job_match(job_id: int, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    job = db.query(Job).options(joinedload(Job.organization)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return {"job": {**_job_out(job), "description": job.description, "requirements": job.requirements},
            "match": matcher.match_job(db, profile, job)}
