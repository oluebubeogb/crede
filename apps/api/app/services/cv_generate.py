"""
AI-assisted CV generation.

1. Extract requirements from job description (LLM or heuristic).
2. Match against timeline + skills (deterministic).
3. Tailor CV wording to the JD (LLM) — summary, skills order, bullet phrasing.
   Output lives only in content_snapshot / generated files.
   Never write AI prose back into TimelineEntry or Profile as source of truth.
4. Templates (reportlab / python-docx) render the snapshot.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from app.config import get_settings
from app.models import Profile
from app.schemas import MatchingInsights
from app.services.llm import LLMError, chat_json

logger = logging.getLogger("crede.cv")
settings = get_settings()


def _hash_jd(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()[:16]


def jd_hash(job_description: str) -> str:
    return _hash_jd(job_description)


async def analyze_job_description(job_description: str) -> MatchingInsights:
    """Extract structured requirements from JD via LLM; heuristic fallback."""
    if settings.llm_enabled:
        try:
            data = await chat_json(
                system=(
                    "You extract hiring requirements from job descriptions. "
                    "Return JSON only with keys: required_skills (string[]), "
                    "keywords (string[]), experience_priorities (string[] of short phrases). "
                    "Be specific to the role; no prose outside JSON."
                ),
                user=job_description[:6000],
                temperature=0.1,
            )
            return MatchingInsights(
                required_skills=list(data.get("required_skills") or [])[:20],
                missing_skills=[],
                suggested_experiences=list(data.get("experience_priorities") or [])[:10],
                keywords=list(data.get("keywords") or [])[:30],
            )
        except Exception as e:
            logger.warning("JD analysis LLM failed, using heuristic: %s", e)

    return _heuristic_jd(job_description)


def _heuristic_jd(job_description: str) -> MatchingInsights:
    tokens = re.findall(r"[A-Za-z][A-Za-z+#./]{2,}", job_description)
    common = {
        "the", "and", "for", "with", "you", "will", "our", "are", "this", "that",
        "from", "have", "your", "job", "role", "team", "work", "experience",
        "ability", "strong", "using", "including", "must", "should", "years",
    }
    freq: dict[str, int] = {}
    for t in tokens:
        k = t.lower()
        if k in common or len(k) < 3:
            continue
        freq[k] = freq.get(k, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:20]
    return MatchingInsights(
        required_skills=top[:10],
        missing_skills=[],
        suggested_experiences=[],
        keywords=top,
    )


def match_profile(profile: Profile, insights: MatchingInsights) -> MatchingInsights:
    owned = {s.name.lower() for s in profile.skills}
    required = insights.required_skills
    missing = [s for s in required if s.lower() not in owned]
    suggested = [f"{e.job_title} @ {e.organization}" for e in profile.timeline_entries[:8]]
    insights.missing_skills = missing
    insights.suggested_experiences = suggested[:6]
    return insights


def _raw_snapshot(profile: Profile, insights: MatchingInsights, template: str) -> dict[str, Any]:
    """Literal timeline dump — baseline before tailoring."""
    entries = []
    for e in profile.timeline_entries:
        entries.append(
            {
                "job_title": e.job_title,
                "organization": e.organization,
                "start": str(e.start_date),
                "end": str(e.end_date) if e.end_date else "Present",
                "description": e.description,
                "achievements": list(e.achievements or []),
                "responsibilities": list(e.responsibilities or []),
            }
        )
    skills = [s.name for s in profile.skills]
    # Prefer skills that appear in JD keywords first (deterministic reordering)
    kw = {k.lower() for k in (insights.keywords or []) + (insights.required_skills or [])}
    if kw:
        skills = sorted(
            skills,
            key=lambda n: (0 if any(k in n.lower() or n.lower() in k for k in kw) else 1, n.lower()),
        )
    return {
        "template": template,
        "name": profile.full_name or profile.email,
        "headline": profile.headline,
        "location": profile.location,
        "summary": profile.summary,
        "skills": skills,
        "certifications": [{"name": c.name, "issuer": c.issuer} for c in profile.certifications],
        "experience": entries,
        "matching": insights.model_dump(),
        "tailored": False,
    }


def _keyword_overlap_score(text: str, keywords: list[str]) -> int:
    t = (text or "").lower()
    return sum(1 for k in keywords if k and k.lower() in t)


def _heuristic_tailor(
    snapshot: dict[str, Any],
    insights: MatchingInsights,
    job_description: str,
) -> dict[str, Any]:
    """
    Without LLM: reorder bullets by JD keyword overlap so relevant lines surface first.
    Does not invent wording — only prioritizes.
    """
    keywords = list(insights.keywords or []) + list(insights.required_skills or [])
    if not keywords:
        return snapshot

    out = dict(snapshot)
    exp = []
    for entry in snapshot.get("experience") or []:
        e = dict(entry)
        for field in ("achievements", "responsibilities"):
            items = list(e.get(field) or [])
            e[field] = sorted(
                items,
                key=lambda line: -_keyword_overlap_score(line, keywords),
            )
        # Prefer description that hits keywords when both exist — leave text as-is
        exp.append(e)
    # Rank roles by total keyword hits
    exp.sort(
        key=lambda e: -(
            _keyword_overlap_score(e.get("description") or "", keywords)
            + sum(_keyword_overlap_score(x, keywords) for x in (e.get("achievements") or []))
            + sum(_keyword_overlap_score(x, keywords) for x in (e.get("responsibilities") or []))
        ),
    )
    out["experience"] = exp
    out["tailored"] = False
    out["tailor_mode"] = "heuristic_reorder"
    return out


async def tailor_cv_to_job(
    profile: Profile,
    insights: MatchingInsights,
    job_description: str,
    template: str,
) -> dict[str, Any]:
    """
    Build a CV snapshot tailored to the job description.

    With LLM: rewrite summary + experience bullets using JD terminology
    (e.g. "monitoring and evaluation" → "monitoring and analytics" when JD
    uses that language) without inventing employers, dates, or metrics.

    Without LLM: reorder content by keyword overlap only.
    """
    base = _raw_snapshot(profile, insights, template)

    if not settings.llm_enabled:
        return _heuristic_tailor(base, insights, job_description)

    facts = {
        "name": base["name"],
        "headline": base["headline"],
        "location": base["location"],
        "summary": base["summary"],
        "skills": base["skills"],
        "certifications": base["certifications"],
        "experience": base["experience"],
        "jd_required_skills": insights.required_skills,
        "jd_keywords": insights.keywords,
        "jd_priorities": insights.suggested_experiences,
    }

    system = (
        "You are a professional CV editor for Crede. "
        "You rewrite a candidate's CV so wording aligns with a target job description, "
        "while remaining strictly factual.\n\n"
        "Rules:\n"
        "- Use the candidate's real employers, job titles, dates, and metrics only.\n"
        "- You MAY rephrase responsibilities and achievements to mirror the job's "
        "vocabulary when the underlying work is the same "
        "(e.g. timeline 'monitoring and evaluation' + JD 'monitoring and analytics' "
        "→ phrase as monitoring and analytics if that is accurate).\n"
        "- You MAY reorder skills and experience to put the most relevant first.\n"
        "- You MAY write a short professional summary tailored to the role.\n"
        "- Do NOT invent companies, titles, degrees, tools, or numbers not in the facts.\n"
        "- Do NOT drop all experience; keep every role, but bullets can be tightened.\n"
        "- Return JSON only with keys:\n"
        "  headline (string),\n"
        "  summary (string),\n"
        "  skills (string[]),\n"
        "  experience (array of {\n"
        "    job_title, organization, start, end, description,\n"
        "    achievements (string[]), responsibilities (string[])\n"
        "  })\n"
        "Keep start/end/organization/job_title aligned with the input facts."
    )
    user = (
        "JOB DESCRIPTION:\n"
        f"{job_description[:5000]}\n\n"
        "CANDIDATE FACTS (source of truth):\n"
        f"{json.dumps(facts, ensure_ascii=False)[:12000]}"
    )

    try:
        data = await chat_json(system, user, temperature=0.3)
    except LLMError as e:
        logger.warning("CV tailor LLM failed, heuristic reorder: %s", e)
        return _heuristic_tailor(base, insights, job_description)
    except Exception as e:
        logger.warning("CV tailor unexpected error: %s", e)
        return _heuristic_tailor(base, insights, job_description)

    # Merge AI wording onto factual skeleton (preserve dates/orgs if model drifts)
    tailored_exp = []
    raw_by_key = {
        (e["organization"], e["job_title"], e["start"]): e for e in base["experience"]
    }
    for item in data.get("experience") or []:
        if not isinstance(item, dict):
            continue
        key = (item.get("organization"), item.get("job_title"), item.get("start"))
        raw = raw_by_key.get(key) or {}
        tailored_exp.append(
            {
                "job_title": raw.get("job_title") or item.get("job_title"),
                "organization": raw.get("organization") or item.get("organization"),
                "start": raw.get("start") or item.get("start"),
                "end": raw.get("end") or item.get("end"),
                "description": item.get("description") or raw.get("description"),
                "achievements": list(item.get("achievements") or raw.get("achievements") or []),
                "responsibilities": list(
                    item.get("responsibilities") or raw.get("responsibilities") or []
                ),
            }
        )
    # If model omitted roles, append remaining raw roles
    seen = {(e["organization"], e["job_title"], e["start"]) for e in tailored_exp}
    for e in base["experience"]:
        k = (e["organization"], e["job_title"], e["start"])
        if k not in seen:
            tailored_exp.append(e)

    out = {
        **base,
        "headline": data.get("headline") or base["headline"],
        "summary": data.get("summary") or base["summary"],
        "skills": list(data.get("skills") or base["skills"])[:30],
        "experience": tailored_exp,
        "matching": insights.model_dump(),
        "tailored": True,
        "tailor_mode": "llm",
    }
    return out


def build_cv_snapshot(profile: Profile, insights: MatchingInsights, template: str) -> dict[str, Any]:
    """Sync baseline snapshot (no JD tailoring). Prefer tailor_cv_to_job when generating."""
    return _raw_snapshot(profile, insights, template)
