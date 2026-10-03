from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile, VerificationItem
from app.schemas import VerificationOut
from app.services.completion import refresh_scores

router = APIRouter(prefix="/verification", tags=["verification"])

KINDS = ("email", "phone", "degree", "certification", "employment", "organization")
POINTS = {
    "email": 10,
    "phone": 10,
    "degree": 20,
    "certification": 20,
    "employment": 30,
    "organization": 30,
}


@router.get("", response_model=list[VerificationOut])
def list_items(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    # Ensure skeleton rows exist
    existing = {v.kind for v in profile.verifications}
    for kind in KINDS:
        if kind not in existing:
            db.add(VerificationItem(profile_id=profile.id, kind=kind, status="pending", points=0))
    db.commit()
    db.refresh(profile)
    return profile.verifications


@router.post("/{kind}/submit", response_model=VerificationOut)
async def submit(
    kind: str,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if kind not in KINDS:
        raise HTTPException(400, "Invalid kind")
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == kind)
        .first()
    )
    if not item:
        item = VerificationItem(profile_id=profile.id, kind=kind)
        db.add(item)
    item.status = "submitted"
    item.notes = notes
    if file:
        # Placeholder key — wire MinIO in production
        item.document_key = f"verifications/{profile.id}/{kind}/{file.filename}"
    db.commit()
    db.refresh(item)
    return item


@router.post("/{kind}/approve", response_model=VerificationOut)
def approve_admin_stub(
    kind: str,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """Phase 1 local helper — replace with Filament admin workflow in production."""
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == kind)
        .first()
    )
    if not item:
        raise HTTPException(404, "Not found")
    item.status = "approved"
    item.points = POINTS.get(kind, 0)
    db.commit()
    refresh_scores(db, profile)
    db.refresh(item)
    return item
