"""Occupation catalog search + user title learning."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile, get_current_user, AuthUser
from app.database import get_db
from app.models import Occupation, Profile, UserTitleSuggestion
from app.services.occupations_import import import_all, discover_files, CURATION_DIR, _norm_title

router = APIRouter(prefix="/occupations", tags=["occupations"])


class OccupationOut(BaseModel):
    id: int
    title: str
    isco_code: Optional[str] = None
    level: Optional[str] = None
    definition: Optional[str] = None
    tasks: Optional[str] = None
    aliases: Optional[list] = None
    skills_suggested: Optional[list] = None

    class Config:
        from_attributes = True


class SuggestBody(BaseModel):
    title: str = Field(min_length=2, max_length=255)


@router.get("/search", response_model=list[OccupationOut])
def search_occupations(
    q: str = Query("", max_length=120),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Flexible autocomplete — matches title, aliases, isco code."""
    q = (q or "").strip()
    if len(q) < 1:
        return (
            db.query(Occupation)
            .filter(Occupation.is_active.is_(True))
            .order_by(Occupation.title)
            .limit(limit)
            .all()
        )
    nq = f"%{_norm_title(q)}%"
    rows = (
        db.query(Occupation)
        .filter(
            Occupation.is_active.is_(True),
            or_(
                Occupation.title_normalized.ilike(nq),
                Occupation.title.ilike(f"%{q}%"),
                Occupation.isco_code.ilike(f"%{q}%") if q else True,
            ),
        )
        .order_by(Occupation.title)
        .limit(limit * 3)
        .all()
    )
    # Alias match + rank: prefer prefix matches
    ql = q.lower()
    scored = []
    seen = set()
    for r in rows:
        seen.add(r.id)
        t = (r.title or "").lower()
        score = 0
        if t.startswith(ql):
            score = 0
        elif ql in t:
            score = 1
        else:
            score = 2
        scored.append((score, r.title, r))
    # scan a wider set for alias hits if still short
    if len(scored) < limit:
        more = db.query(Occupation).filter(Occupation.is_active.is_(True)).limit(2000).all()
        for r in more:
            if r.id in seen:
                continue
            aliases = r.aliases or []
            if any(ql in str(a).lower() for a in aliases):
                scored.append((3, r.title, r))
                seen.add(r.id)
            if len(scored) >= limit * 2:
                break
    scored.sort(key=lambda x: (x[0], x[1] or ""))
    return [r for _, _, r in scored[:limit]]


@router.get("/{occ_id}", response_model=OccupationOut)
def get_occupation(occ_id: int, db: Session = Depends(get_db)):
    occ = db.query(Occupation).filter(Occupation.id == occ_id, Occupation.is_active.is_(True)).first()
    if not occ:
        raise HTTPException(404, "Not found")
    return occ


@router.post("/suggest")
def suggest_title(
    body: SuggestBody,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Session = Depends(get_db),
):
    """Record a free-typed title not found in catalog (learning signal)."""
    title = body.title.strip()
    norm = _norm_title(title)
    existing_occ = (
        db.query(Occupation)
        .filter(Occupation.title_normalized == norm, Occupation.is_active.is_(True))
        .first()
    )
    if existing_occ:
        return {"status": "known", "occupation_id": existing_occ.id}

    row = (
        db.query(UserTitleSuggestion)
        .filter(UserTitleSuggestion.title_normalized == norm)
        .first()
    )
    if row:
        row.times_seen = (row.times_seen or 0) + 1
        row.last_seen_at = datetime.now(timezone.utc)
        row.profile_id = profile.id
    else:
        row = UserTitleSuggestion(
            title=title[:255],
            title_normalized=norm[:255],
            times_seen=1,
            profile_id=profile.id,
        )
        db.add(row)
    db.commit()
    return {"status": "recorded", "times_seen": row.times_seen}


@router.post("/import")
def run_import(
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Re-scan data/jobs_curation/ and upsert. Authenticated users can trigger."""
    result = import_all(db)
    result["files_on_disk"] = [p.name for p in discover_files()]
    return result


@router.get("/admin/suggestions")
def list_suggestions(
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(50, le=200),
):
    rows = (
        db.query(UserTitleSuggestion)
        .filter(UserTitleSuggestion.promoted.is_(False))
        .order_by(UserTitleSuggestion.times_seen.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "title": r.title,
            "times_seen": r.times_seen,
            "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
        }
        for r in rows
    ]


@router.delete("/{occ_id}")
def deactivate_occupation(
    occ_id: int,
    auth: Annotated[AuthUser, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Soft-delete obsolete catalog entries."""
    occ = db.query(Occupation).filter(Occupation.id == occ_id).first()
    if not occ:
        raise HTTPException(404, "Not found")
    occ.is_active = False
    db.commit()
    return {"ok": True, "id": occ_id}
