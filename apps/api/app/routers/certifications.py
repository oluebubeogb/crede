from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Certification, Profile
from app.schemas import CertificationIn, CertificationOut
from app.services.completion import refresh_scores

router = APIRouter(prefix="/certifications", tags=["certifications"])


@router.get("", response_model=list[CertificationOut])
def list_certs(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile.certifications


@router.post("", response_model=CertificationOut, status_code=201)
def add_cert(
    body: CertificationIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    cert = Certification(profile_id=profile.id, **body.model_dump())
    db.add(cert)
    db.commit()
    db.refresh(cert)
    refresh_scores(db, profile)
    return cert


@router.delete("/{cert_id}", status_code=204)
def remove_cert(
    cert_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    cert = (
        db.query(Certification)
        .filter(Certification.id == cert_id, Certification.profile_id == profile.id)
        .first()
    )
    if not cert:
        raise HTTPException(404, "Not found")
    db.delete(cert)
    db.commit()
