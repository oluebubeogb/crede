"""In-app notifications + optional email, honouring per-user email preferences."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Profile
from app.models_suite import Notification
from app.services import mailer
from app.services.admin import admin_profiles

# preference key per notification kind (Settings → Notifications)
EMAIL_PREF = {
    "welcome": "email_product", "verification_request": "email_verification", "verification_result": "email_verification",
    "org_claim": "email_orgs", "org_claim_result": "email_orgs", "org_invite": "email_orgs",
    "comment": "email_community", "reply": "email_community", "mention": "email_community", "like": None,
    "badge": "email_badges", "badge_admin": "email_badges", "admin": "email_badges",
}
DEFAULT_PREFS = {"email_verification": True, "email_orgs": True, "email_community": True, "email_badges": True, "email_product": True}


def email_prefs(profile: Profile) -> dict:
    prefs = dict(DEFAULT_PREFS)
    stored = ((profile.preferences or {}).get("notifications") or {}) if profile else {}
    prefs.update({k: bool(v) for k, v in stored.items() if k in DEFAULT_PREFS})
    return prefs


def notify(db: Session, profile: Profile, kind: str, title: str, body: str = "", link: str = "",
           actor_id: int | None = None, data: dict | None = None, email_template: str | None = None,
           email_ctx: dict | None = None, commit: bool = True) -> Notification:
    n = Notification(profile_id=profile.id, kind=kind, title=title[:255], body=body, link=link,
                     actor_profile_id=actor_id, data=data)
    db.add(n)
    pref = EMAIL_PREF.get(kind)
    if email_template and profile.email and (pref is None or email_prefs(profile).get(pref, True)) and kind != "like":
        ctx = {"name": profile.full_name or (profile.email or "").split("@")[0], "link": link}
        ctx.update(email_ctx or {})
        mailer.enqueue(db, profile.email, email_template, ctx, commit=False)
    if commit:
        db.commit()
    return n


def notify_admins(db: Session, kind: str, title: str, body: str = "", link: str = "/admin",
                  email_template: str = "admin_alert", email_ctx: dict | None = None, commit: bool = True) -> int:
    """In-app for admins who have signed in; email to every ADMIN_EMAILS address."""
    profiles = admin_profiles(db)
    seen = set()
    for p in profiles:
        db.add(Notification(profile_id=p.id, kind=kind, title=title[:255], body=body, link=link))
        seen.add((p.email or "").lower())
    for email in get_settings().admin_email_list:
        ctx = {"name": "admin", "link": link, "subject": title, "message": body}
        ctx.update(email_ctx or {})
        mailer.enqueue(db, email, email_template, ctx, commit=False)
    if commit:
        db.commit()
    return len(get_settings().admin_email_list)
