from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile, TimelineEntry
from app.schemas import TimelineEntryIn, TimelineEntryOut
from app.services.completion import refresh_scores

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("", response_model=list[TimelineEntryOut])
def list_entries(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile.timeline_entries


@router.post("", response_model=TimelineEntryOut, status_code=201)
def create_entry(
    body: TimelineEntryIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    entry = TimelineEntry(profile_id=profile.id, **body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    refresh_scores(db, profile)
    return entry


@router.get("/{entry_id}", response_model=TimelineEntryOut)
def get_entry(
    entry_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    entry = (
        db.query(TimelineEntry)
        .filter(TimelineEntry.id == entry_id, TimelineEntry.profile_id == profile.id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.patch("/{entry_id}", response_model=TimelineEntryOut)
def update_entry(
    entry_id: int,
    body: TimelineEntryIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    entry = (
        db.query(TimelineEntry)
        .filter(TimelineEntry.id == entry_id, TimelineEntry.profile_id == profile.id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Entry not found")
    for k, v in body.model_dump().items():
        setattr(entry, k, v)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    entry = (
        db.query(TimelineEntry)
        .filter(TimelineEntry.id == entry_id, TimelineEntry.profile_id == profile.id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Entry not found")
    db.delete(entry)
    db.commit()
    refresh_scores(db, profile)
