from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile
from app.schemas import DashboardOut, ProfileOut, ProfileUpdate
from app.services.completion import refresh_scores

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileOut)
def me(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile


@router.patch("/me", response_model=ProfileOut)
def update_me(
    body: ProfileUpdate,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    data = body.model_dump(exclude_unset=True)
    if "username" in data and data["username"]:
        exists = (
            db.query(Profile)
            .filter(Profile.username == data["username"], Profile.id != profile.id)
            .first()
        )
        if exists:
            raise HTTPException(400, "Username taken")
    for k, v in data.items():
        setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return refresh_scores(db, profile)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    profile = refresh_scores(db, profile)
    actions = []
    if profile.profile_completion < 80:
        actions.append("Complete Profile")
    if profile.verification_score < 40:
        actions.append("Verify Employment")
    if not profile.documents:
        actions.append("Generate CV")
    if not profile.timeline_entries:
        actions.append("Add first career milestone")
    return DashboardOut(
        profile=ProfileOut.model_validate(profile),
        timeline_count=len(profile.timeline_entries),
        verified_docs=sum(1 for v in profile.verifications if v.status == "approved"),
        generated_cvs=sum(1 for d in profile.documents if d.doc_type == "cv"),
        recommended_actions=actions,
    )


@router.get("/public/{username}", response_model=ProfileOut)
def public_profile(username: str, db: Annotated[Session, Depends(get_db)]):
    p = db.query(Profile).filter(Profile.username == username, Profile.is_public == True).first()
    if not p:
        raise HTTPException(404, "Profile not found")
    return p
