"""Profile completion + verification score helpers."""

from sqlalchemy.orm import Session

from app.models import Profile, VERIFICATION_POINTS, VerificationLevel


def recompute_verification_score(profile: Profile) -> int:
    score = 0
    approved = {v.kind for v in profile.verifications if v.status == "approved"}
    mapping = {
        "email": VerificationLevel.email,
        "phone": VerificationLevel.phone,
        "certification": VerificationLevel.certification,
        "degree": VerificationLevel.certification,  # degree counts like cert bucket
        "employment": VerificationLevel.employment,
        "organization": VerificationLevel.organization,
    }
    seen_levels: set[VerificationLevel] = set()
    for kind in approved:
        level = mapping.get(kind)
        if level and level not in seen_levels:
            score += VERIFICATION_POINTS[level]
            seen_levels.add(level)
    return min(100, score)


def recompute_profile_completion(profile: Profile) -> int:
    checks = [
        bool(profile.headline),
        bool(profile.industry),
        bool(profile.location),
        bool(profile.summary),
        bool(profile.years_experience is not None),
        len(profile.timeline_entries) >= 1,
        len(profile.skills) >= 3,
        len(profile.certifications) >= 1 or True,  # optional soft
        bool(profile.username),
    ]
    # Weight timeline heavier
    base = sum(1 for c in checks if c)
    pct = int(round((base / len(checks)) * 100))
    return min(100, pct)


def refresh_scores(db: Session, profile: Profile) -> Profile:
    profile.verification_score = recompute_verification_score(profile)
    profile.profile_completion = recompute_profile_completion(profile)
    if profile.profile_completion >= 60 and profile.headline and profile.timeline_entries:
        profile.onboarding_completed = True
    db.commit()
    db.refresh(profile)
    return profile
