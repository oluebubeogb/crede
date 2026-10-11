"""Phase 2 — Organizations & membership."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.database import get_db
from app.models import Organization, OrganizationMember, User

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrgIn(BaseModel):
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    cac_number: Optional[str] = None


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    verification_status: str
    created_at: object


def _local_user_id(auth: AuthUser) -> int:
    if not auth.id.startswith("local:"):
        raise HTTPException(400, "Organization features require a local Crede account for now")
    return int(auth.id.split(":", 1)[1])


@router.post("", response_model=OrgOut)
def create_org(
    body: OrgIn,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    uid = _local_user_id(auth)
    org = Organization(
        name=body.name,
        website=body.website,
        industry=body.industry,
        location=body.location,
        description=body.description,
        cac_number=body.cac_number,
        created_by_user_id=uid,
        verification_status="pending",
    )
    db.add(org)
    db.flush()
    member = OrganizationMember(organization_id=org.id, user_id=uid, role="owner")
    db.add(member)
    # promote user role
    user = db.query(User).filter(User.id == uid).first()
    if user and user.role == "professional":
        user.role = "recruiter"
    db.commit()
    db.refresh(org)
    return org


@router.get("/mine", response_model=list[OrgOut])
def my_orgs(
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    uid = _local_user_id(auth)
    memberships = db.query(OrganizationMember).filter(OrganizationMember.user_id == uid).all()
    org_ids = [m.organization_id for m in memberships]
    if not org_ids:
        return []
    return db.query(Organization).filter(Organization.id.in_(org_ids)).all()


@router.get("/{org_id}", response_model=OrgOut)
def get_org(org_id: int, db: Annotated[Session, Depends(get_db)]):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    return org
