"""Career insights for the dashboard — deterministic, derived server-side from the profile,
MatchCache (open roles) and GenerationHistory (JDs the user tailored to).

An optional short AI narrative is cached in profile.preferences["insights_ai"], keyed by
facts_version + day, so it regenerates at most daily and only when career facts change.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import date

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GenerationHistory, Profile
from app.models_suite import MatchCache
from app.services import llm, vocab
from app.services.completion import claims_summary, recompute_profile_completion
from app.services.jd_parse import detect_seniority
from app.services.matcher import build_facts

log = logging.getLogger(__name__)

SENIORITY_LABEL = {"intern": "Intern", "entry": "Entry level", "mid": "Mid level", "senior": "Senior", "manager": "Manager", "director": "Director"}
NEXT_SENIORITY = {"intern": "entry", "entry": "mid", "mid": "senior", "senior": "manager", "manager": "director"}
YEARS_FOR = {"entry": 0, "mid": 2, "senior": 5, "manager": 7, "director": 10}

# skill (canonical, lower) → (certification, issuer). Cheap static map; extended by JD-requested certs.
CERT_MAP: list[tuple[tuple[str, ...], str, str]] = [
    (("aws", "amazon web services"), "AWS Certified Solutions Architect – Associate", "Amazon Web Services"),
    (("azure",), "Microsoft Certified: Azure Fundamentals (AZ-900)", "Microsoft"),
    (("gcp", "google cloud"), "Google Cloud Associate Cloud Engineer", "Google Cloud"),
    (("kubernetes", "k8s"), "Certified Kubernetes Administrator (CKA)", "CNCF / Linux Foundation"),
    (("docker", "devops", "terraform"), "HashiCorp Certified: Terraform Associate", "HashiCorp"),
    (("python",), "PCAP – Certified Associate Python Programmer", "Python Institute"),
    (("sql", "postgresql", "data analysis", "excel", "power bi", "tableau"), "Google Data Analytics Professional Certificate", "Google"),
    (("machine learning", "data science", "tensorflow", "pytorch"), "TensorFlow Developer Certificate", "Google"),
    (("security", "cybersecurity", "network security"), "CompTIA Security+", "CompTIA"),
    (("networking", "cisco"), "Cisco Certified Network Associate (CCNA)", "Cisco"),
    (("project management", "project manager"), "Project Management Professional (PMP)", "PMI"),
    (("scrum", "agile"), "Professional Scrum Master I (PSM I)", "Scrum.org"),
    (("product management",), "Certified Scrum Product Owner (CSPO)", "Scrum Alliance"),
    (("accounting", "financial reporting", "ifrs", "audit"), "ACCA / ICAN Professional", "ACCA · ICAN"),
    (("human resources", "recruitment", "hr"), "CIPM Professional", "CIPM Nigeria"),
    (("digital marketing", "seo", "google ads", "marketing"), "Google Ads Search Certification", "Google Skillshop"),
    (("sales", "crm", "hubspot"), "HubSpot Inbound Sales", "HubSpot Academy"),
    (("ux", "ui design", "figma", "user research"), "Google UX Design Certificate", "Google"),
]


def _months(a: date, b: date) -> int:
    return max(0, (b.year - a.year) * 12 + b.month - a.month)


def pretty(term: str) -> str:
    """Display form for vocab terms: 'ui/ux design' → 'UI/UX Design', 'aws' → 'AWS'."""
    out = []
    for w in (term or "").split():
        out.append(w.upper() if ("/" in w or w in ACRONYMS) else w if w in ("and", "of", "for", "in") else w[:1].upper() + w[1:])
    return " ".join(out)


ACRONYMS = {"aws", "gcp", "sql", "api", "apis", "ui", "ux", "hr", "seo", "sem", "crm", "css", "html", "ci", "cd", "etl", "bi", "erp",
            "sap", "ios", "qa", "k8s", "nlp", "ml", "ai", "it", "kpi", "ifrs", "gaap", "pmp", "rest", "sdk", "b2b", "b2c", "nosql"}


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _tier(v: float) -> str:
    return "strong" if v >= 0.75 else "good" if v >= 0.5 else "weak"


def _strength(profile: Profile, facts: dict, claims: dict) -> list[dict]:
    work, edu = facts["work"], facts["edu"]
    n_skills = len(profile.skills or [])
    with_ach = sum(1 for e in profile.timeline_entries if (e.entry_type or "work") == "work" and e.achievements)
    basics = sum([bool(profile.full_name), bool(profile.headline), bool(profile.summary), bool(profile.location), bool(profile.avatar_url)]) / 5
    rows = [
        ("basics", "Profile basics", basics, "Headline, summary, location and photo", "/profile"),
        ("experience", "Experience", (0.5 * min(1.0, len(work) / 2) + 0.5 * with_ach / len(work)) if work else 0.0,
         f"{len(work)} role{'s' if len(work) != 1 else ''}, {with_ach} with achievements", "/timeline"),
        ("education", "Education", 1.0 if edu else 0.0, f"{len(edu)} entr{'ies' if len(edu) != 1 else 'y'}" if edu else "No education added", "/timeline"),
        ("skills", "Skills", min(1.0, n_skills / 10), f"{n_skills} skill{'s' if n_skills != 1 else ''} (10+ is ideal)", "/skills"),
        ("certifications", "Certifications", min(1.0, len(profile.certifications or []) / 2), f"{len(profile.certifications or [])} added", "/certifications"),
        ("evidence", "Verified evidence", claims["ratio"], claims["label"], "/verification"),
    ]
    return [{"key": k, "label": l, "value": round(v, 2), "tier": _tier(v), "detail": d, "href": h} for k, l, v, d, h in rows]


def _trajectory(facts: dict) -> dict:
    work = sorted(facts["work"], key=lambda w: w["start"] or date.min)
    today = date.today()
    tenures = [_months(w["start"], w["end"] or today) for w in work if w["start"]]
    titles = [w["title"] for w in work]
    ranks = [detect_seniority(t or "") for t in titles]
    latest = next((r for w, r in zip(reversed(work), reversed(ranks)) if w["current"]), ranks[-1] if ranks else None)
    inferred = False
    seniority = latest
    if not seniority and work:  # title has no level word → infer from years
        y = facts["years"]
        seniority, inferred = ("entry" if y < 2 else "mid" if y < 5 else "senior"), True
    progression = [{"title": w["title"], "org": w["org"], "start": w["start"].isoformat() if w["start"] else None,
                    "current": w["current"], "seniority": r} for w, r in zip(work, ranks)][-5:]
    gaps = []
    for a, b in zip(work, work[1:]):
        if a["end"] and b["start"] and _months(a["end"], b["start"]) >= 6:
            gaps.append({"from": a["end"].isoformat(), "to": b["start"].isoformat(), "months": _months(a["end"], b["start"])})
    nxt = NEXT_SENIORITY.get(seniority or "")
    need = YEARS_FOR.get(nxt or "", 0)
    return {
        "years": facts["years"], "roles": len(work), "orgs": len({(w["org"] or "").lower() for w in work if w["org"]}),
        "avg_tenure_months": round(sum(tenures) / len(tenures)) if tenures else None,
        "current_tenure_months": next((_months(w["start"], today) for w in reversed(work) if w["current"] and w["start"]), None),
        "seniority": seniority, "seniority_inferred": inferred,
        "seniority_label": SENIORITY_LABEL.get(seniority or "", "Not detected"),
        "next_level": nxt, "next_label": SENIORITY_LABEL.get(nxt or ""),
        "years_to_next": round(max(0.0, need - facts["years"]), 1) if nxt else None,
        "progression": progression, "gaps": gaps[:3],
    }


def _demand(db: Session, profile: Profile, facts: dict) -> dict:
    """Skill demand from open-role matches (MatchCache) and tailored JDs (GenerationHistory)."""
    demand: Counter[str] = Counter()
    status: dict[str, Counter] = {}
    cert_asks: Counter[str] = Counter()
    rows = db.query(MatchCache).filter(MatchCache.profile_id == profile.id).limit(200).all()
    roles = sum(1 for r in rows if r.score is not None)
    for row in rows:
        res = row.result or {}
        for h in res.get("skills") or []:
            t = h.get("term")
            if not t:
                continue
            demand[t] += 1
            status.setdefault(t, Counter())[h.get("status") or "missing"] += 1
        for rq in res.get("requirements") or []:
            if rq.get("kind") == "certification" and rq.get("status") != "met" and rq.get("text"):
                cert_asks[rq["text"][:120]] += 1
    hist = db.query(GenerationHistory).filter(GenerationHistory.profile_id == profile.id).order_by(GenerationHistory.created_at.desc()).limit(30).all()
    for h in hist:
        a = h.analysis or {}
        parsed = a.get("parsed") or {}
        for t in (parsed.get("skills") or []) + (parsed.get("tools") or []):
            demand[t] += 1
            st = "met" if vocab.canon(t) in facts["skills"] else "missing"
            status.setdefault(t, Counter())[st] += 1
        for c in parsed.get("certifications") or []:
            if isinstance(c, str):
                cert_asks[c[:120]] += 1
    have = facts["skills"]
    rows_out = []
    for t, n in demand.most_common(40):
        st = status.get(t, Counter())
        own = have.get(vocab.canon(t))
        has = bool(own) or st.get("met", 0) > 0
        rows_out.append({"skill": own["name"] if own else pretty(t), "demand": n, "have": bool(has), "partial": st.get("partial", 0) > 0 and not has})
    missing = [r for r in rows_out if not r["have"]][:8]
    return {"sources": {"open_roles": roles, "tailored_jds": len(hist)}, "skills": rows_out[:12], "missing": missing, "cert_asks": cert_asks}


def _top_skills(profile: Profile, facts: dict, demand: dict) -> list[dict]:
    dem = {vocab.canon(r["skill"]): r["demand"] for r in demand["skills"]}
    corpus = facts["corpus"]
    out = []
    for s in profile.skills or []:
        c = vocab.canon(s.name)
        evidence = corpus.count(vocab.norm(s.name)) if s.name else 0
        score = (3 if s.verified else 0) + {"expert": 3, "intermediate": 2, "beginner": 1}.get((s.proficiency or "").lower(), 1) + min(evidence, 3) + min(dem.get(c, 0), 4)
        out.append({"name": s.name, "verified": bool(s.verified), "proficiency": s.proficiency, "evidence": evidence, "demand": dem.get(c, 0), "score": score})
    out.sort(key=lambda x: (-x["score"], x["name"].lower()))
    return out[:8]


def _cert_suggestions(profile: Profile, facts: dict, demand: dict) -> list[dict]:
    have = " ".join(vocab.norm(f"{c.name} {c.issuer or ''}") for c in profile.certifications or [])
    mine = set(facts["skills"].keys())
    wanted_terms = {vocab.canon(r["skill"]) for r in demand["skills"]}
    corpus = facts["corpus"][:4000]
    out: list[dict] = []
    for ask, n in demand["cert_asks"].most_common(3):
        if vocab.norm(ask)[:20] not in have:
            out.append({"name": ask, "issuer": None, "reason": f"Asked for in {n} role{'s' if n != 1 else ''} you matched or tailored to"})
    for keys, name, issuer in CERT_MAP:
        if len(out) >= 4:
            break
        own = next((k for k in keys if k in mine or f" {k} " in f" {corpus} "), None)
        wanted = next((k for k in keys if k in wanted_terms), None)
        hit = own or wanted
        if hit and vocab.norm(name)[:12] not in have and not any(o["name"] == name for o in out):
            reason = f"Builds on your {pretty(hit)} experience" if own else f"{pretty(hit)} is in demand in roles you match"
            out.append({"name": name, "issuer": issuer, "reason": reason})
    return out


def _actions(profile: Profile, strength: list[dict], traj: dict, demand: dict, certs: list[dict], claims: dict) -> list[dict]:
    s = {r["key"]: r for r in strength}
    acts: list[dict] = []

    def add(key, title, body, href, impact):
        acts.append({"key": key, "title": title, "body": body, "href": href, "impact": impact})

    if not traj["roles"]:
        add("timeline", "Add your roles", "Upload a CV on Career Timeline — we'll fill roles, skills and education for you.", "/timeline#import", "high")
    elif s["experience"]["value"] < 1 and traj["roles"] < 2:
        add("roles", "Add your earlier roles", "A fuller history raises your years of experience and seniority in matching.", "/timeline", "medium")
    elif s["experience"]["value"] < 1:
        add("achievements", "Add achievements to your roles", "Quantified results (%, ₦, users) lift your match scores and CV quality.", "/timeline", "high")
    if claims["total"] and claims["issuer_verified"] == 0:
        add("verify", "Get one claim confirmed by an issuer", "Recruiters filter for issuer-verified roles first.", "/verification", "high")
    if demand["missing"]:
        names = ", ".join(r["skill"] for r in demand["missing"][:3])
        add("skills", f"Close skill gaps: {names}", "These come up most in roles you match. Add them if you have them, or evidence of learning.", "/skills", "high" if len(demand["missing"]) > 2 else "medium")
    elif s["skills"]["value"] < 0.75:
        add("skills", "List at least 10 skills", "Skills drive matching — tools, methods and domains all count.", "/skills", "medium")
    if not s["education"]["value"]:
        add("education", "Add your education", "Many roles require a degree level; it's checked automatically.", "/timeline", "medium")
    if certs:
        add("cert", f"Consider: {certs[0]['name']}", certs[0]["reason"], "/certifications", "medium")
    if s["basics"]["value"] < 1:
        add("basics", "Finish your profile basics", "A clear headline and summary are the first things recruiters read.", "/profile", "low")
    if not (profile.documents or []):
        add("cv", "Tailor a CV to a real job", "Paste a job description; we match your facts and design the CV.", "/generate", "low")
    return acts[:6]


def build(db: Session, profile: Profile) -> dict:
    facts = build_facts(db, profile)
    claims = claims_summary(profile)
    strength = _strength(profile, facts, claims)
    traj = _trajectory(facts)
    demand = _demand(db, profile, facts)
    certs = _cert_suggestions(profile, facts, demand)
    top = _top_skills(profile, facts, demand)
    overall = round(sum(r["value"] for r in strength) / len(strength), 2)
    headline_bits = []
    if traj["years"]:
        headline_bits.append(f"{traj['years']:g} years")
    if traj["seniority"]:
        headline_bits.append(traj["seniority_label"] + (" (by years)" if traj.get("seniority_inferred") else ""))
    if top:
        headline_bits.append("strongest in " + ", ".join(t["name"] for t in top[:2]))
    out = {
        "facts_version": profile.facts_version or 0,
        "completion": recompute_profile_completion(profile),
        "overall": {"value": overall, "tier": _tier(overall)},
        "summary": (_cap(" · ".join(headline_bits)) + ".") if headline_bits else "Add your roles and skills to unlock career insights.",
        "strength": strength, "trajectory": traj,
        "skills": {"top": top, "in_demand": demand["skills"], "missing": demand["missing"], "sources": demand["sources"]},
        "certifications": certs,
        "actions": _actions(profile, strength, traj, demand, certs, claims),
        "ai": cached_narrative(profile),
        "ai_available": bool(get_settings().insights_ai and llm.llm_available()),
    }
    return out


def cached_narrative(profile: Profile) -> dict | None:
    c = (profile.preferences or {}).get("insights_ai")
    if not c or c.get("facts_version") != (profile.facts_version or 0):
        return None
    return {"text": c.get("text"), "generated_on": c.get("day")}


async def narrative(db: Session, profile: Profile, data: dict, force: bool = False) -> dict | None:
    """Short AI career read. Cached per facts_version; regenerated at most once a day."""
    if not get_settings().insights_ai or not llm.llm_available():
        return None
    prefs = dict(profile.preferences or {})
    c = prefs.get("insights_ai") or {}
    today = date.today().isoformat()
    fresh = c.get("facts_version") == (profile.facts_version or 0)
    if c.get("text") and (fresh or c.get("day") == today) and not (force and c.get("day") != today):
        return {"text": c["text"], "generated_on": c.get("day")}
    compact = {
        "headline": profile.headline, "summary": data["summary"], "trajectory": {k: data["trajectory"][k] for k in ("years", "roles", "avg_tenure_months", "seniority_label", "next_label")},
        "titles": [p["title"] for p in data["trajectory"]["progression"]],
        "top_skills": [t["name"] for t in data["skills"]["top"]], "missing_in_demand": [m["skill"] for m in data["skills"]["missing"]],
        "strength": {r["label"]: r["tier"] for r in data["strength"]}, "certs_suggested": [x["name"] for x in data["certifications"]],
    }
    system = ("You are a concise career coach for African professionals. Given structured facts, write 3 short, specific sentences: "
              "where they stand, the most valuable next move, and one risk or opportunity. No fluff, no invented facts. "
              'Return JSON: {"text": "..."}')
    try:
        res = await llm.chat_json(system, str(compact), temperature=0.3, max_tokens=220)
        text_ = str(res.get("text") or "").strip()[:900]
    except Exception as e:  # noqa: BLE001 - optional
        log.info("insights narrative skipped: %s", e)
        return None
    if not text_:
        return None
    prefs["insights_ai"] = {"text": text_, "day": today, "facts_version": profile.facts_version or 0}
    profile.preferences = prefs
    db.commit()
    return {"text": text_, "generated_on": today}
