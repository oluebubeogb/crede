"""
AI document generation — single LLM call → Markdown draft.

PDF/DOCX are rendered from the stored markdown (no second LLM call).
Never write AI prose back into TimelineEntry / Profile as source of truth.
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


def jd_hash(job_description: str) -> str:
    return hashlib.sha256(job_description.strip().encode()).hexdigest()[:16]


def _facts_payload(profile: Profile) -> dict[str, Any]:
    return {
        "name": profile.full_name or profile.email,
        "headline": profile.headline,
        "location": profile.location,
        "email": profile.email,
        "summary": profile.summary,
        "skills": [s.name for s in profile.skills],
        "certifications": [
            {"name": c.name, "issuer": c.issuer} for c in profile.certifications
        ],
        "experience": [
            {
                "job_title": e.job_title,
                "organization": e.organization,
                "start": str(e.start_date),
                "end": str(e.end_date) if e.end_date else "Present",
                "description": e.description,
                "achievements": list(e.achievements or []),
                "responsibilities": list(e.responsibilities or []),
            }
            for e in profile.timeline_entries
        ],
    }


def _heuristic_insights(job_description: str) -> MatchingInsights:
    tokens = re.findall(r"[A-Za-z][A-Za-z+#./]{2,}", job_description)
    common = {
        "the", "and", "for", "with", "you", "will", "our", "are", "this", "that",
        "from", "have", "your", "job", "role", "team", "work", "experience",
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


def _markdown_from_facts(profile: Profile, doc_type: str) -> str:
    """Fallback draft without LLM."""
    f = _facts_payload(profile)
    lines = [f"# {f['name']}", ""]
    if f.get("headline"):
        lines.append(f"**{f['headline']}**")
    meta = " · ".join(x for x in [f.get("location"), f.get("email")] if x)
    if meta:
        lines.append(meta)
    lines.append("")
    if doc_type == "cover_letter":
        lines.append("## Cover Letter")
        lines.append("")
        lines.append(
            f"Dear Hiring Manager,\n\n"
            f"I am writing to express interest in this role. "
            f"With experience including "
            + (", ".join(e["job_title"] for e in f["experience"][:3]) or "relevant work")
            + ", I bring skills in "
            + (", ".join(f["skills"][:8]) or "my field")
            + ".\n\nSincerely,\n"
            + str(f["name"])
        )
        return "\n".join(lines)

    if f.get("summary"):
        lines += ["## Summary", "", f["summary"], ""]
    if f.get("skills"):
        lines += ["## Skills", "", ", ".join(f["skills"]), ""]
    if f.get("experience"):
        lines += ["## Experience", ""]
        for e in f["experience"]:
            lines.append(f"### {e['job_title']} — {e['organization']}")
            lines.append(f"*{e['start']} – {e['end']}*")
            lines.append("")
            if e.get("description"):
                lines.append(e["description"])
                lines.append("")
            for a in (e.get("achievements") or [])[:6]:
                lines.append(f"- {a}")
            for r in (e.get("responsibilities") or [])[:4]:
                lines.append(f"- {r}")
            lines.append("")
    if f.get("certifications"):
        lines += ["## Certifications", ""]
        for c in f["certifications"]:
            line = c.get("name") or ""
            if c.get("issuer"):
                line += f" — {c['issuer']}"
            lines.append(f"- {line}")
    return "\n".join(lines)


async def generate_document_markdown(
    profile: Profile,
    job_description: str,
    doc_type: str = "cv",
    template: str = "professional",
) -> dict[str, Any]:
    """
    Single LLM call producing markdown + matching insights.
    Returns snapshot ready for storage and PDF/DOCX render.
    """
    facts = _facts_payload(profile)
    owned = {s.lower() for s in facts["skills"]}

    if not settings.llm_enabled:
        insights = _heuristic_insights(job_description)
        insights.missing_skills = [s for s in insights.required_skills if s.lower() not in owned]
        md = _markdown_from_facts(profile, doc_type)
        return {
            "markdown": md,
            "name": facts["name"],
            "email": facts["email"],
            "headline": facts.get("headline"),
            "location": facts.get("location"),
            "template": template,
            "doc_type": doc_type,
            "matching": insights.model_dump(),
            "tailored": False,
            "tailor_mode": "heuristic",
        }

    if doc_type == "cover_letter":
        system = (
            "You write professional cover letters. Return JSON only with keys:\n"
            "  markdown (string: full cover letter in Markdown),\n"
            "  required_skills (string[]),\n"
            "  keywords (string[]),\n"
            "  missing_skills (string[] relative to candidate skills),\n"
            "  suggested_experiences (string[]).\n"
            "Rules: use only real employers/titles/dates from candidate facts; "
            "align language with the job description; do not invent metrics."
        )
    else:
        system = (
            "You write tailored professional CVs in Markdown. Return JSON only with keys:\n"
            "  markdown (string: full CV in Markdown with sections Summary, Skills, Experience, Certifications),\n"
            "  required_skills (string[] from the job),\n"
            "  keywords (string[]),\n"
            "  missing_skills (string[] candidate lacks),\n"
            "  suggested_experiences (string[]).\n"
            "Rules:\n"
            "- Ground every bullet in candidate facts (employers, titles, dates, real achievements).\n"
            "- Rephrase using the job description's vocabulary when the work is equivalent "
            "(e.g. 'monitoring and evaluation' → 'monitoring and analytics' if JD uses that).\n"
            "- Reorder skills and roles for relevance; keep all real roles.\n"
            "- Do not invent companies, titles, tools, or numbers."
        )

    user = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE FACTS:\n{json.dumps(facts, ensure_ascii=False)[:12000]}"
    )

    try:
        data = await chat_json(system, user, temperature=0.25)
        insights = MatchingInsights(
            required_skills=list(data.get("required_skills") or [])[:20],
            missing_skills=list(data.get("missing_skills") or [])[:20],
            suggested_experiences=list(data.get("suggested_experiences") or [])[:10],
            keywords=list(data.get("keywords") or [])[:30],
        )
        md = (data.get("markdown") or "").strip()
        if not md:
            md = _markdown_from_facts(profile, doc_type)
            mode = "llm_empty_fallback"
            tailored = False
        else:
            mode = "llm"
            tailored = True
    except Exception as e:
        logger.warning("Document LLM failed, heuristic: %s", e)
        insights = _heuristic_insights(job_description)
        insights.missing_skills = [s for s in insights.required_skills if s.lower() not in owned]
        md = _markdown_from_facts(profile, doc_type)
        tailored = False
        mode = "heuristic"

    return {
        "markdown": md,
        "name": facts["name"],
        "email": facts["email"],
        "headline": facts.get("headline"),
        "location": facts.get("location"),
        "template": template,
        "doc_type": doc_type,
        "matching": insights.model_dump(),
        "tailored": tailored,
        "tailor_mode": mode,
    }


# Back-compat aliases used by older imports
async def analyze_job_description(job_description: str) -> MatchingInsights:
    return _heuristic_insights(job_description)


def match_profile(profile: Profile, insights: MatchingInsights) -> MatchingInsights:
    owned = {s.name.lower() for s in profile.skills}
    insights.missing_skills = [s for s in insights.required_skills if s.lower() not in owned]
    insights.suggested_experiences = [
        f"{e.job_title} @ {e.organization}" for e in profile.timeline_entries[:6]
    ]
    return insights


def build_cv_snapshot(profile: Profile, insights: MatchingInsights, template: str) -> dict[str, Any]:
    return {
        "markdown": _markdown_from_facts(profile, "cv"),
        "template": template,
        "matching": insights.model_dump(),
        "tailored": False,
    }
