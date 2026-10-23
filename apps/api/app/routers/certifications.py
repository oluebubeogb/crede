from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Certification, Profile
from app.schemas import CertificationIn, CertificationOut
from app.services import orgs
from app.services.completion import refresh_scores

router = APIRouter(prefix="/certifications", tags=["certifications"])
FIELDS = set(CertificationIn.model_fields) - {"issuer_org_id"}


def _out(db: Session, c: Certification) -> dict:
    d = CertificationOut.model_validate(c).model_dump()
    d["verification"] = orgs.verification_info(db, "certification", c.id)
    return d


def _owned(db: Session, profile: Profile, cert_id: int) -> Certification:
    c = db.query(Certification).filter(Certification.id == cert_id, Certification.profile_id == profile.id).first()
    if not c:
        raise HTTPException(404, "Not found")
    return c


@router.get("")
def list_certs(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    return [_out(db, c) for c in profile.certifications]


@router.get("/issuer-suggestions")
def issuer_suggestions(db: Annotated[Session, Depends(get_db)], q: str = "", limit: int = 8):
    """Issuer orgs on Crede (claimed ones first) — shown while typing a certification."""
    return [{"id": o.id, "name": o.name, "claim_status": o.claim_status, "can_verify": o.claim_status == "approved",
             "website": o.website} for o in orgs.search(db, q, "issuer", limit)]


@router.post("", status_code=201)
def add_cert(body: CertificationIn, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    cert = Certification(profile_id=profile.id, **{k: v for k, v in body.model_dump().items() if k in FIELDS})
    db.add(cert)
    db.flush()
    orgs.link_and_request(db, profile, "certification", cert, body.issuer_org_id, body.issuer, "issuer")
    db.commit()
    db.refresh(cert)
    refresh_scores(db, profile)
    return _out(db, cert)


@router.patch("/{cert_id}")
def update_cert(cert_id: int, body: CertificationIn, profile: Annotated[Profile, Depends(get_or_create_profile)],
                db: Annotated[Session, Depends(get_db)]):
    cert = _owned(db, profile, cert_id)
    before = (cert.name, cert.issuer, cert.issued_at, cert.credential_id, cert.issuer_org_id)
    for k, v in body.model_dump().items():
        if k in FIELDS:
            setattr(cert, k, v)
    changed = before[:4] != (cert.name, cert.issuer, cert.issued_at, cert.credential_id)
    if changed and (cert.verification_status or "").lower() in ("verified", "approved"):
        cert.verification_status = "unverified"
    if body.issuer_org_id != before[4] or changed:
        orgs.link_and_request(db, profile, "certification", cert, body.issuer_org_id, None, "issuer")
    db.commit()
    db.refresh(cert)
    refresh_scores(db, profile)
    return _out(db, cert)


@router.delete("/{cert_id}", status_code=204)
def remove_cert(cert_id: int, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    from app.models_suite import VerificationRequest
    cert = _owned(db, profile, cert_id)
    db.query(VerificationRequest).filter(VerificationRequest.subject_type == "certification", VerificationRequest.subject_id == cert.id).delete()
    db.delete(cert)
    db.commit()
    refresh_scores(db, profile)
