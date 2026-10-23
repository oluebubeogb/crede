from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile, TimelineEntry
from app.schemas import TimelineEntryIn, TimelineEntryOut
from app.services import orgs
from app.services.completion import refresh_scores

router = APIRouter(prefix="/timeline", tags=["timeline"])
FIELDS = set(TimelineEntryIn.model_fields) - {"organization_id"}


def _out(db: Session, e: TimelineEntry) -> dict:
    d = TimelineEntryOut.model_validate(e).model_dump()
    d["verification"] = orgs.verification_info(db, "timeline", e.id)
    return d


def _owned(db: Session, profile: Profile, entry_id: int) -> TimelineEntry:
    e = db.query(TimelineEntry).filter(TimelineEntry.id == entry_id, TimelineEntry.profile_id == profile.id).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    return e


@router.get("")
def list_entries(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    return [_out(db, e) for e in profile.timeline_entries]


@router.post("", status_code=201)
def create_entry(body: TimelineEntryIn, profile: Annotated[Profile, Depends(get_or_create_profile)],
                 db: Annotated[Session, Depends(get_db)]):
    data = body.model_dump()
    data["entry_type"] = "education" if data.get("entry_type") == "education" else "work"
    entry = TimelineEntry(profile_id=profile.id, **{k: v for k, v in data.items() if k in FIELDS})
    db.add(entry)
    db.flush()
    orgs.link_and_request(db, profile, "timeline", entry, body.organization_id,
                          body.organization if data["entry_type"] == "education" else None,
                          "school" if data["entry_type"] == "education" else "company")
    db.commit()
    db.refresh(entry)
    refresh_scores(db, profile)
    return _out(db, entry)


@router.get("/{entry_id}")
def get_entry(entry_id: int, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    return _out(db, _owned(db, profile, entry_id))


@router.patch("/{entry_id}")
def update_entry(entry_id: int, body: TimelineEntryIn, profile: Annotated[Profile, Depends(get_or_create_profile)],
                 db: Annotated[Session, Depends(get_db)]):
    entry = _owned(db, profile, entry_id)
    before = (entry.job_title, entry.organization, entry.start_date, entry.end_date, entry.is_current, entry.organization_id)
    for k, v in body.model_dump().items():
        if k in FIELDS:
            setattr(entry, k, v)
    entry.entry_type = "education" if body.entry_type == "education" else "work"
    changed_core = before[:5] != (entry.job_title, entry.organization, entry.start_date, entry.end_date, entry.is_current)
    if changed_core and (entry.verification_status or "").lower() in ("verified", "approved"):
        entry.verification_status = "unverified"  # edits to a verified claim need re-verification
    if body.organization_id != before[5] or changed_core:
        orgs.link_and_request(db, profile, "timeline", entry, body.organization_id, None, "school")
    db.commit()
    db.refresh(entry)
    refresh_scores(db, profile)
    return _out(db, entry)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: int, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    from app.models_suite import VerificationRequest
    entry = _owned(db, profile, entry_id)
    db.query(VerificationRequest).filter(VerificationRequest.subject_type == "timeline", VerificationRequest.subject_id == entry.id).delete()
    db.delete(entry)
    db.commit()
    refresh_scores(db, profile)
