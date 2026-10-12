"""Professional opportunities — matched open jobs."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Job, JobMatch, Profile, Organization

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("")
def list_opportunities(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = 20,
):
    """Return open jobs matched to the current profile (or all open jobs with scores)."""
    # Prefer existing JobMatch rows
    matches = (
        db.query(JobMatch)
        .filter(JobMatch.profile_id == profile.id)
        .order_by(JobMatch.overall_score.desc())
        .limit(limit)
        .all()
    )
    if matches:
        out = []
        for m in matches:
            job = db.query(Job).options(joinedload(Job.organization)).filter(Job.id == m.job_id).first()
            if not job or job.status != "open":
                continue
            out.append(
                {
                    "match_id": m.id,
                    "score": m.overall_score,
                    "job": {
                        "id": job.id,
                        "title": job.title,
                        "location": job.location,
                        "salary_min": getattr(job, "salary_min", None),
                        "salary_max": getattr(job, "salary_max", None),
                        "status": job.status,
                        "organization": {
                            "id": job.organization.id if job.organization else None,
                            "name": job.organization.name if job.organization else None,
                        },
                    },
                }
            )
        return out

    # Fallback: all open jobs with naive score
    jobs = (
        db.query(Job)
        .options(joinedload(Job.organization))
        .filter(Job.status == "open")
        .order_by(Job.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for job in jobs:
        score = 50.0
        if profile.industry and job.organization and profile.industry == getattr(job.organization, "industry", None):
            score += 15
        if profile.location and job.location and profile.location.lower() in (job.location or "").lower():
            score += 10
        if profile.verification_score:
            score += min(15, profile.verification_score / 10)
        out.append(
            {
                "match_id": None,
                "score": min(100, score),
                "job": {
                    "id": job.id,
                    "title": job.title,
                    "location": job.location,
                    "salary_min": getattr(job, "salary_min", None),
                    "salary_max": getattr(job, "salary_max", None),
                    "status": job.status,
                    "organization": {
                        "id": job.organization.id if job.organization else None,
                        "name": job.organization.name if job.organization else None,
                    },
                },
            }
        )
    return sorted(out, key=lambda x: x["score"], reverse=True)
