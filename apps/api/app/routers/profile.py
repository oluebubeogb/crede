from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile
from app.schemas import DashboardOut, ProfileOut, ProfileUpdate
from app.services.completion import refresh_scores

router = APIRouter(prefix="/profile", tags=["profile"])


def _profile_out(profile: Profile) -> ProfileOut:
    """Build ProfileOut without relying on strict ORM→Pydantic edge cases."""
    return ProfileOut(
        id=profile.id,
        external_id=getattr(profile, "external_id", None),
        collab_user_id=str(profile.collab_user_id) if profile.collab_user_id is not None else None,
        email=profile.email,
        full_name=profile.full_name,
        username=profile.username,
        headline=profile.headline,
        industry=profile.industry,
        location=profile.location,
        country=getattr(profile, "country", None),
        phone=getattr(profile, "phone", None),
        phone_country_code=getattr(profile, "phone_country_code", None),
        years_experience=profile.years_experience,
        summary=profile.summary,
        onboarding_completed=bool(profile.onboarding_completed),
        verification_score=int(profile.verification_score or 0),
        profile_completion=int(profile.profile_completion or 0),
        is_public=bool(profile.is_public if profile.is_public is not None else True),
        preferences=getattr(profile, "preferences", None),
        created_at=profile.created_at,
    )


@router.get("/me", response_model=ProfileOut)
def me(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return _profile_out(profile)


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
    # Merge preferences JSON instead of clobbering
    if "preferences" in data and data["preferences"] is not None:
        existing = getattr(profile, "preferences", None) or {}
        if not isinstance(existing, dict):
            existing = {}
        incoming = data.pop("preferences") or {}
        profile.preferences = {**existing, **incoming}
    for k, v in data.items():
        setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return _profile_out(refresh_scores(db, profile))


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
        profile=_profile_out(profile),
        timeline_count=len(profile.timeline_entries or []),
        verified_docs=sum(1 for v in (profile.verifications or []) if v.status == "approved"),
        generated_cvs=sum(1 for d in (profile.documents or []) if d.doc_type == "cv"),
        recommended_actions=actions,
    )


@router.get("/public/{username}", response_model=ProfileOut)
def public_profile(username: str, db: Annotated[Session, Depends(get_db)]):
    p = db.query(Profile).filter(Profile.username == username, Profile.is_public == True).first()
    if not p:
        raise HTTPException(404, "Profile not found")
    return _profile_out(p)
