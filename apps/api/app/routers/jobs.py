"""Phase 2 — Job posting & management."""

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.database import get_db
from app.models import Job, Organization, OrganizationMember

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


def _ensure_member(db: Session, org_id: int, user_id: int) -> None:
    m = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .first()
    )
    if not m:
        raise HTTPException(403, "Not a member of this organization")


def _local_uid(auth: AuthUser) -> int:
    if not auth.id.startswith("local:"):
        raise HTTPException(400, "Requires local account")
    return int(auth.id.split(":", 1)[1])


@router.post("", response_model=JobOut)
def create_job(
    body: JobIn,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    uid = _local_uid(auth)
    _ensure_member(db, body.organization_id, uid)
    job = Job(**body.model_dump(), created_by_user_id=uid)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/org/{org_id}", response_model=list[JobOut])
def list_org_jobs(
    org_id: int,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    uid = _local_uid(auth)
    _ensure_member(db, org_id, uid)
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
    body: JobIn,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    uid = _local_uid(auth)
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    _ensure_member(db, job.organization_id, uid)
    for k, v in body.model_dump(exclude_unset=True).items():
        if k != "organization_id":
            setattr(job, k, v)
    db.commit()
    db.refresh(job)
    return job
