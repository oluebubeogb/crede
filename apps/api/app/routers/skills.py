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
