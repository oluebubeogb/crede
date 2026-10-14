"""
AI document generation — single LLM call → clean Markdown draft.

PDF/DOCX are rendered from the stored markdown (no second LLM call).
Never write AI prose back into TimelineEntry / Profile as source of truth.
Matching insights (skills gaps, keywords) stay in a separate JSON field —
never inside the document body.
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
from app.services.llm import chat_json

logger = logging.getLogger("crede.cv")
settings = get_settings()

# Headings that must never appear in the user-facing document
_JUNK_SECTION_RE = re.compile(
    r"(?im)^#{1,3}\s*("
    r"required\s+skills?|missing\s+skills?|keywords?|suggested\s+experiences?|"
    r"matching\s+insights?|job\s+analysis|gap\s+analysis|ats\s+keywords?"
    r")\s*$"
)


def jd_hash(job_description: str) -> str:
    return hashlib.sha256(job_description.strip().encode()).hexdigest()[:16]


def _facts_payload(profile: Profile) -> dict[str, Any]:
    return {
        "name": profile.full_name or profile.email,
        "headline": profile.headline,
        "location": profile.location,
        "email": profile.email,
        "phone": profile.phone,
        "summary": profile.summary,
        "years_experience": profile.years_experience,
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


def sanitize_document_markdown(md: str, *, name: str | None = None) -> str:
    """
    Strip analysis junk the model sometimes appends, and ensure a name header exists.
    """
    if not md:
        return md or ""

    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    skipping = False
    for line in lines:
        if _JUNK_SECTION_RE.match(line.strip()):
            skipping = True
            continue
        if skipping:
            # stop skipping when a new top-level or ## section that is allowed starts
            if re.match(r"(?im)^#{1,2}\s+\S", line) and not _JUNK_SECTION_RE.match(line.strip()):
                skipping = False
            else:
                # also stop at sign-off duplicates like "Best regards" after junk
                continue
        out.append(line)

    text = "\n".join(out).strip()

    # Remove trailing repeated "Best regards" / double signatures after body
    text = re.sub(
        r"(?is)\n+(##\s*)?(Required Skills|Missing Skills|Keywords|Suggested Experiences).*$",
        "",
        text,
    ).strip()

    # Ensure document starts with the candidate's name as H1 when possible
    if name and name.strip():
        first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        # If first heading is a job title (e.g. "# Senior Product Designer") without the name
        if first.startswith("# "):
            heading = first[2:].strip()
            if name.lower() not in heading.lower() and len(heading) < 80:
                # Prepend name block
                rest = "\n".join(text.splitlines()[1:]).lstrip()
                text = f"# {name}\n\n**{heading}**\n\n{rest}".strip()
        elif not first.lower().startswith(name.split()[0].lower() if name.split() else ""):
            text = f"# {name}\n\n{text}".strip()

    return text.strip() + "\n"


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
    """Professional fallback draft without LLM — still not a raw dump."""
    f = _facts_payload(profile)
    name = f["name"]
    lines = [f"# {name}", ""]
    if f.get("headline"):
        lines.append(f"**{f['headline']}**")
    meta = " · ".join(x for x in [f.get("location"), f.get("email"), f.get("phone")] if x)
    if meta:
        lines.append(meta)
    lines.append("")

    if doc_type == "cover_letter":
        roles = ", ".join(e["job_title"] for e in f["experience"][:2]) or "my career"
        lines += [
            "Dear Hiring Manager,",
            "",
            f"I am writing to express interest in this opportunity. "
            f"My background includes {roles}, and I would welcome the chance to contribute.",
            "",
            f"Sincerely,\n{name}",
        ]
        return "\n".join(lines)

    if f.get("summary"):
        lines += ["## Professional Summary", "", str(f["summary"]), ""]
    if f.get("skills"):
        lines += ["## Core Skills", "", ", ".join(f["skills"]), ""]
    if f.get("experience"):
        lines += ["## Professional Experience", ""]
        for e in f["experience"]:
            lines.append(f"### {e['job_title']} — {e['organization']}")
            lines.append(f"*{e['start']} – {e['end']}*")
            lines.append("")
            bullets = list(e.get("achievements") or [])[:5]
            if not bullets and e.get("description"):
                bullets = [e["description"]]
            for b in bullets:
                lines.append(f"- {b}")
            for r in (e.get("responsibilities") or [])[:3]:
                if r not in bullets:
                    lines.append(f"- {r}")
            lines.append("")
    if f.get("certifications"):
        lines += ["## Certifications", ""]
        for c in f["certifications"]:
            line = c.get("name") or ""
            if c.get("issuer"):
                line += f" — {c['issuer']}"
            lines.append(f"- {line}")
    return sanitize_document_markdown("\n".join(lines), name=name)


def _cv_system_prompt() -> str:
    return """You are an expert career writer for Crede. You produce ONE polished CV in Markdown.

OUTPUT FORMAT — return a single JSON object with exactly these keys:
{
  "markdown": "<string — the full CV only>",
  "required_skills": ["..."],
  "keywords": ["..."],
  "missing_skills": ["..."],
  "suggested_experiences": ["..."]
}

CRITICAL RULES FOR "markdown":
1. The CV document must contain ONLY content a hiring manager should read.
2. NEVER include sections named Required Skills, Missing Skills, Keywords, Suggested Experiences, Matching Insights, or similar analysis blocks inside markdown.
3. Put those analysis lists ONLY in the separate JSON keys (required_skills, keywords, etc.).
4. Structure the CV as:
   - # Full legal name (required first line)
   - Optional one-line target headline aligned to the job (not a dump of old titles)
   - Contact line: location · email · phone (use only facts provided)
   - ## Professional Summary — 3–5 sentences tailored to THIS job description. Reframe the candidate's real background toward the target role; do not invent employers or degrees.
   - ## Core Skills — a short, curated list (8–14 items) mixing real candidate skills with truthful rephrasing toward the JD. Never list tools the candidate has no evidence for.
   - ## Professional Experience — for EACH role keep real title, employer, dates. Write 3–6 achievement-style bullets that emphasize impact (metrics when present in facts). Rephrase timeline wording to match the JD's vocabulary when the underlying work is the same (e.g. monitoring and evaluation → monitoring and analytics). Do NOT paste the timeline word-for-word. Prefer outcomes over duty lists.
   - ## Certifications — only if present in facts
5. Do not invent companies, job titles, dates, degrees, or metrics.
6. Do not invent a design portfolio if the facts show engineering work — instead bridge honestly (e.g. systems thinking, cross-functional collaboration) without claiming design roles the person never held.
7. No "Best regards" or letter sign-off on a CV.
8. markdown must start with "# <candidate name>"."""


def _cover_letter_system_prompt() -> str:
    return """You are an expert career writer for Crede. You produce ONE polished cover letter in Markdown.

OUTPUT FORMAT — return a single JSON object with exactly these keys:
{
  "markdown": "<string — the full cover letter only>",
  "required_skills": ["..."],
  "keywords": ["..."],
  "missing_skills": ["..."],
  "suggested_experiences": ["..."]
}

CRITICAL RULES FOR "markdown":
1. The letter must contain ONLY what the candidate would send to a hiring manager.
2. NEVER include Required Skills, Missing Skills, Keywords, Suggested Experiences, or any analysis sections inside markdown.
3. Put analysis ONLY in the separate JSON keys.
4. Structure:
   - Optional: # Candidate full name
   - Dear Hiring Manager, (or named contact if present in the JD)
   - 3–5 short paragraphs: interest in the specific role/company, relevant evidence from real experience, why they fit, close with a call to action
   - Sincerely, / candidate name
5. Do not invent employers, titles, or achievements. Bridge honestly from their real history to the target role.
6. No skill lists, keyword dumps, or "missing skills" anywhere in the letter body.
7. Do not repeat the sign-off twice."""


async def generate_document_markdown(
    profile: Profile,
    job_description: str,
    doc_type: str = "cv",
    template: str = "professional",
) -> dict[str, Any]:
    """
    Single LLM call producing clean markdown + separate matching insights.
    """
    facts = _facts_payload(profile)
    owned = {s.lower() for s in facts["skills"]}
    name = str(facts.get("name") or profile.email or "Candidate")

    if not settings.llm_enabled:
        insights = _heuristic_insights(job_description)
        insights.missing_skills = [s for s in insights.required_skills if s.lower() not in owned]
        md = _markdown_from_facts(profile, doc_type)
        return {
            "markdown": md,
            "name": name,
            "email": facts.get("email"),
            "headline": facts.get("headline"),
            "location": facts.get("location"),
            "template": template,
            "doc_type": doc_type,
            "matching": insights.model_dump(),
            "tailored": False,
            "tailor_mode": "heuristic",
        }

    system = _cover_letter_system_prompt() if doc_type == "cover_letter" else _cv_system_prompt()
    user = (
        f"TARGET JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE FACTS (source of truth — do not invent beyond this):\n"
        f"{json.dumps(facts, ensure_ascii=False)[:12000]}\n\n"
        f"Remember: markdown = document only. Analysis fields = separate JSON keys only."
    )

    try:
        data = await chat_json(system, user, temperature=0.35)
        insights = MatchingInsights(
            required_skills=list(data.get("required_skills") or [])[:20],
            missing_skills=list(data.get("missing_skills") or [])[:20],
            suggested_experiences=list(data.get("suggested_experiences") or [])[:10],
            keywords=list(data.get("keywords") or [])[:30],
        )
        md = sanitize_document_markdown(str(data.get("markdown") or "").strip(), name=name)
        if not md or len(md) < 80:
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
        "name": name,
        "email": facts.get("email"),
        "headline": facts.get("headline"),
        "location": facts.get("location"),
        "template": template,
        "doc_type": doc_type,
        "matching": insights.model_dump(),
        "tailored": tailored,
        "tailor_mode": mode,
    }


# Back-compat
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
