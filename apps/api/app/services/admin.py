"""Platform admins come from ADMIN_EMAILS (comma-separated)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Profile


def is_platform_admin(profile: Profile | None) -> bool:
    if not profile or not profile.email:
        return False
    return profile.email.strip().lower() in get_settings().admin_email_list


def admin_profiles(db: Session) -> list[Profile]:
    emails = get_settings().admin_email_list
    if not emails:
        return []
    return db.query(Profile).filter(Profile.email.in_(emails)).all()
