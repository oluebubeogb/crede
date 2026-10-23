"""Phase 2 — Job posting & management."""

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Job, Organization, Profile
from app.services import orgs
from app.services.admin import is_platform_admin

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobIn(BaseModel):
    organization_id: int
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: str = "NGN"
    description: Optional[str] = None
    requirements: Optional[list[str]] = None
    experience_years_min: Optional[int] = None
    status: str = "draft"
    deadline: Optional[date] = None


class JobPatch(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[list[str]] = None
    experience_years_min: Optional[int] = None
    status: Optional[str] = None
    deadline: Optional[date] = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: str
    description: Optional[str] = None
    requirements: Optional[list] = None
    experience_years_min: Optional[int] = None
    status: str
    deadline: Optional[date] = None
    created_at: object


POSTER_ROLES = ("owner", "admin", "recruiter", "editor")


def _ensure_member(db: Session, org_id: int, profile: Profile) -> None:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if is_platform_admin(profile):
        return
    m = orgs.membership(db, org_id, profile)
    if not m or (m.role not in POSTER_ROLES and org.created_by_profile_id != profile.id):
        raise HTTPException(403, "Only recruiters or admins of this organization can manage its jobs")


@router.post("", response_model=JobOut)
def create_job(
    body: JobIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    _ensure_member(db, body.organization_id, profile)
    job = Job(**body.model_dump(), created_by_user_id=orgs.local_user_id(profile))
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/org/{org_id}", response_model=list[JobOut])
def list_org_jobs(
    org_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    _ensure_member(db, org_id, profile)
    return db.query(Job).filter(Job.organization_id == org_id).order_by(Job.created_at.desc()).all()


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Annotated[Session, Depends(get_db)]):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.patch("/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    body: JobPatch,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    _ensure_member(db, job.organization_id, profile)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(job, k, v)
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=list[JobOut])
def list_open_jobs(db: Annotated[Session, Depends(get_db)], q: Optional[str] = None, limit: int = 30):
    qry = db.query(Job).filter(Job.status == "open")
    if q:
        qry = qry.filter(Job.title.ilike(f"%{q.strip()[:60]}%"))
    return qry.order_by(Job.created_at.desc()).limit(min(limit, 60)).all()


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return
    _ensure_member(db, job.organization_id, profile)
    db.delete(job)
    db.commit()
