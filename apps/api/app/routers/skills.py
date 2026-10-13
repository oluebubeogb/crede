from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile, Skill
from app.schemas import SkillIn, SkillOut
from app.services.completion import refresh_scores

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
def list_skills(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile.skills


@router.post("", response_model=SkillOut, status_code=201)
def add_skill(
    body: SkillIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = Skill(profile_id=profile.id, **body.model_dump())
    db.add(skill)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Skill already exists")
    db.refresh(skill)
    refresh_scores(db, profile)
    return skill


@router.patch("/{skill_id}", response_model=SkillOut)
def update_skill(
    skill_id: int,
    body: SkillIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.profile_id == profile.id).first()
    if not skill:
        raise HTTPException(404, "Not found")
    was_verified = bool(skill.verified)
    for k, v in body.model_dump().items():
        setattr(skill, k, v)
    if was_verified:
        skill.verified = False
    db.commit()
    db.refresh(skill)
    refresh_scores(db, profile)
    return skill


@router.delete("/{skill_id}", status_code=204)
def remove_skill(
    skill_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.profile_id == profile.id).first()
    if not skill:
        raise HTTPException(404, "Not found")
    db.delete(skill)
    db.commit()
    refresh_scores(db, profile)


@router.get("/catalog/search")
def search_skill_catalog(
    q: str = "",
    limit: int = 15,
    db: Session = Depends(get_db),
):
    """Autocomplete from curated skills drop folder."""
    from app.models import SkillCatalog
    from sqlalchemy import or_

    q = (q or "").strip()
    query = db.query(SkillCatalog).filter(SkillCatalog.is_active.is_(True))
    if q:
        nq = f"%{q.lower()}%"
        query = query.filter(
            or_(
                SkillCatalog.name_normalized.ilike(nq),
                SkillCatalog.name.ilike(f"%{q}%"),
            )
        )
    rows = query.order_by(SkillCatalog.name).limit(limit).all()
    # alias fallback
    if len(rows) < limit and q:
        more = db.query(SkillCatalog).filter(SkillCatalog.is_active.is_(True)).limit(800).all()
        seen = {r.id for r in rows}
        ql = q.lower()
        for r in more:
            if r.id in seen:
                continue
            if any(ql in str(a).lower() for a in (r.aliases or [])):
                rows.append(r)
            if len(rows) >= limit:
                break
    return [
        {"id": r.id, "name": r.name, "category": r.category, "description": r.description}
        for r in rows[:limit]
    ]


@router.post("/catalog/import")
def import_skill_catalog(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Session = Depends(get_db),
):
    from app.services.skills_import import import_all, discover_files
    result = import_all(db)
    result["files_on_disk"] = [p.name for p in discover_files()]
    return result
