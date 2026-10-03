"""
AI-assisted CV generation — minimize tokens.

1. Extract requirements from job description (AI).
2. Match against timeline + skills (deterministic).
3. Fill structured templates (reportlab / python-docx).
Never store AI text as timeline truth.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from app.config import get_settings
from app.models import Profile, TimelineEntry
from app.schemas import MatchingInsights

settings = get_settings()


def _hash_jd(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()[:16]


async def analyze_job_description(job_description: str) -> MatchingInsights:
    """Use OpenAI if key present; otherwise heuristic keyword extract."""
    if settings.openai_api_key:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            prompt = (
                "Extract from this job description JSON with keys: "
                "required_skills (list of strings), keywords (list), "
                "experience_priorities (list of short phrases). "
                "Return only JSON.\n\n"
                f"{job_description[:6000]}"
            )
            resp = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            data = json.loads(resp.choices[0].message.content or "{}")
            return MatchingInsights(
                required_skills=list(data.get("required_skills") or [])[:20],
                missing_skills=[],
                suggested_experiences=list(data.get("experience_priorities") or [])[:10],
                keywords=list(data.get("keywords") or [])[:30],
            )
        except Exception:
            pass

    # Heuristic fallback
    tokens = re.findall(r"[A-Za-z][A-Za-z+#.]{2,}", job_description)
    common = {
        "the", "and", "for", "with", "you", "will", "our", "are", "this", "that",
        "from", "have", "your", "job", "role", "team", "work", "experience",
    }
    freq: dict[str, int] = {}
    for t in tokens:
        k = t.lower()
        if k in common:
            continue
        freq[k] = freq.get(k, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:15]
    return MatchingInsights(
        required_skills=top[:8],
        missing_skills=[],
        suggested_experiences=[],
        keywords=top,
    )


def match_profile(profile: Profile, insights: MatchingInsights) -> MatchingInsights:
    owned = {s.name.lower() for s in profile.skills}
    required = insights.required_skills
    missing = [s for s in required if s.lower() not in owned]
    suggested = []
    for e in profile.timeline_entries[:8]:
        label = f"{e.job_title} @ {e.organization}"
        suggested.append(label)
    insights.missing_skills = missing
    insights.suggested_experiences = suggested[:6]
    return insights


def build_cv_snapshot(profile: Profile, insights: MatchingInsights, template: str) -> dict[str, Any]:
    entries = []
    for e in profile.timeline_entries:
        entries.append(
            {
                "job_title": e.job_title,
                "organization": e.organization,
                "start": str(e.start_date),
                "end": str(e.end_date) if e.end_date else "Present",
                "description": e.description,
                "achievements": e.achievements or [],
                "responsibilities": e.responsibilities or [],
            }
        )
    return {
        "template": template,
        "name": profile.full_name or profile.email,
        "headline": profile.headline,
        "location": profile.location,
        "summary": profile.summary,
        "skills": [s.name for s in profile.skills],
        "certifications": [
            {"name": c.name, "issuer": c.issuer} for c in profile.certifications
        ],
        "experience": entries,
        "matching": insights.model_dump(),
    }


def jd_hash(job_description: str) -> str:
    return _hash_jd(job_description)
