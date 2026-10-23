"""One deterministic match engine for Opportunities, recruiter candidate matches and JD analysis.

score = must-haves 45 + skills 20 + experience/seniority 15 + education/certs 10 + location 5 + verification 5
Components that a JD does not ask for (e.g. no education requirement) are dropped and the rest re-normalised,
so a missing requirement never gives free points. Insufficient profile data → score None + prompts.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date

from sqlalchemy.orm import Session

from app.models import Profile
from app.models_suite import MatchCache, ProfileFile
from app.services import vocab
from app.services.completion import claim_level
from app.services.jd_parse import EDU_RANK, RANK, detect_seniority, edu_level

ENGINE_VERSION = 5
WEIGHTS = {"must": 45, "skills": 20, "experience": 15, "education": 10, "location": 5, "verification": 5}
LABELS = {"must": "Must-have requirements", "skills": "Skills & tools", "experience": "Experience & seniority",
          "education": "Education & certifications", "location": "Location", "verification": "Verified evidence"}
CREDIT = {"met": 1.0, "partial": 0.5, "missing": 0.0}


# ───────────────────────── profile facts ─────────────────────────
def _months(a: date, b: date) -> int:
    return max(0, (b.year - a.year) * 12 + (b.month - a.month))


def build_facts(db: Session | None, profile: Profile) -> dict:
    today = date.today()
    work, edu = [], []
    for e in sorted(profile.timeline_entries, key=lambda x: x.start_date or today, reverse=True):
        et = getattr(e, "entry_type", None) or "work"
        text = " ".join([e.job_title or "", e.organization or "", e.industry or "", e.description or "",
                         " ".join(map(str, e.responsibilities or [])), " ".join(map(str, e.achievements or [])),
                         " ".join(str(p.get("name", "")) + " " + str(p.get("description", "")) if isinstance(p, dict) else str(p)
                                  for p in (e.projects or []))])
        row = {"id": e.id, "title": e.job_title, "org": e.organization, "start": e.start_date,
               "end": None if e.is_current else (e.end_date or e.start_date), "current": e.is_current, "text": text,
               "level": claim_level(e.verification_status, getattr(e, "document_key", None)),
               "field": getattr(e, "field_of_study", None) or ""}
        (edu if et == "education" else work).append(row)
    # merged work spans → total years
    spans = sorted([(w["start"], w["end"] or today) for w in work if w["start"]])
    merged: list[list[date]] = []
    for s, e in spans:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    years = round(sum(_months(s, e) for s, e in merged) / 12, 1) if merged else float(profile.years_experience or 0)
    if profile.years_experience and not merged:
        years = float(profile.years_experience)
    skills = {}
    for s in profile.skills:
        row = {"id": s.id, "name": s.name, "verified": bool(s.verified)}
        skills.setdefault(vocab.canon(s.name), row)
        for t in vocab.find_terms(s.name):
            skills.setdefault(t, row)
    certs = [{"id": c.id, "name": c.name, "issuer": c.issuer or "", "norm": vocab.norm(f"{c.name} {c.issuer or ''}"),
              "level": claim_level(c.verification_status, c.document_key)} for c in profile.certifications]
    docs = []
    if db is not None:
        try:
            for f in db.query(ProfileFile).filter(ProfileFile.profile_id == profile.id, ProfileFile.text_excerpt.isnot(None)).limit(20):
                docs.append({"id": f.id, "name": f.filename, "text": vocab.norm(f.text_excerpt or "")[:20000]})
        except Exception:  # noqa: BLE001
            pass
    best_edu = None
    for e in edu:
        lvl = edu_level(e["title"] or "") or ("bachelors" if re.search(r"\b(b\.?|bachelor|degree)", (e["title"] or "").lower()) else None)
        if lvl and (best_edu is None or EDU_RANK[lvl] > EDU_RANK[best_edu["degree"]]):
            best_edu = {**e, "degree": lvl}
    corpus = vocab.norm(" ".join([profile.headline or "", profile.summary or ""] + [w["text"] for w in work]))
    return {"work": work, "edu": edu, "best_edu": best_edu, "years": years, "skills": skills, "certs": certs, "docs": docs,
            "corpus": corpus, "corpus_terms": set(vocab.find_terms(corpus)),
            "seniority": detect_seniority(work[0]["title"]) if work else None,
            "location": vocab.norm(f"{profile.location or ''} {getattr(profile, 'country', '') or ''}"),
            "headline": profile.headline or ""}


def facts_fingerprint(profile: Profile, docs_count: int = 0) -> str:
    raw = json.dumps({
        "v": ENGINE_VERSION, "loc": profile.location, "h": profile.headline, "y": profile.years_experience,
        "s": sorted((s.name, s.verified) for s in profile.skills),
        "t": sorted((e.id, e.job_title, e.organization, str(e.start_date), str(e.end_date), e.is_current, e.verification_status,
                     len(e.achievements or []), len(e.description or ""), getattr(e, "entry_type", "work"), bool(getattr(e, "document_key", None)))
                    for e in profile.timeline_entries),
        "c": sorted((c.id, c.name, c.verification_status, bool(c.document_key)) for c in profile.certifications), "d": docs_count,
    }, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


def insufficient(facts: dict) -> list[str] | None:
    prompts = []
    if not facts["work"] and not facts["edu"]:
        prompts.append("Add at least one role or education entry to your timeline")
    if len(facts["skills"]) < 3:
        prompts.append(f"Add {3 - len(facts['skills'])} more skill(s)")
    if not facts["work"] and len(facts["skills"]) < 3:
        return prompts
    if not facts["work"] and not facts["edu"]:
        return prompts
    return None


# ───────────────────────── requirement checks ─────────────────────────
def _find_term(term: str, facts: dict) -> tuple[str, dict | None]:
    c = vocab.canon(term)
    n = vocab.norm(term)
    if c in facts["skills"]:
        s = facts["skills"][c]
        return "met", {"source": "skill", "label": s["name"], "detail": "Listed in your skills" + (" (verified)" if s["verified"] else ""), "id": s["id"]}
    pat = re.compile(r"\b" + re.escape(n) + r"\b")
    for w in facts["work"]:
        t = vocab.norm(w["text"])
        if c in vocab.find_terms(w["text"]) or pat.search(t):
            return "met", {"source": "timeline", "label": f"{w['title']} · {w['org']}", "detail": "Mentioned in this role", "id": w["id"], "level": w["level"]}
    for cert in facts["certs"]:
        if pat.search(cert["norm"]) or c in vocab.find_terms(cert["norm"]):
            return "met", {"source": "certification", "label": cert["name"], "detail": cert["issuer"], "id": cert["id"], "level": cert["level"]}
    for d in facts["docs"]:
        if pat.search(d["text"]):
            return "partial", {"source": "document", "label": d["name"], "detail": "Found in an uploaded document — add it to your skills", "id": d["id"]}
    # stem-level fuzzy hit in timeline corpus
    st = [vocab.stem(x) for x in n.split() if x not in vocab._STOP]
    if st and all(re.search(r"\b" + re.escape(x), facts["corpus"]) for x in st):
        return "partial", {"source": "timeline", "label": "Related wording in your timeline", "detail": term}
    return "missing", None


def _check_terms(terms: list[str], keywords: list[str], facts: dict) -> tuple[str, list, list]:
    evidence, missing = [], []
    pts = 0.0
    items = terms or []
    for t in items:
        st, ev = _find_term(t, facts)
        pts += CREDIT[st]
        if ev:
            evidence.append({**ev, "term": t, "status": st})
        if st != "met":
            missing.append(t)
    if not items:  # free-text requirement → keyword overlap with the whole profile
        kws = [k for k in keywords if len(k) > 3][:8]
        if not kws:
            return "partial", [], []
        corpus = facts["corpus"] + " " + " ".join(facts["skills"]) + " " + " ".join(c["norm"] for c in facts["certs"])
        hits = [k for k in kws if re.search(r"\b" + re.escape(vocab.stem(k)), corpus)]
        ratio = len(hits) / len(kws)
        if hits:
            evidence.append({"source": "timeline", "label": "Matching words in your profile", "detail": ", ".join(hits[:6])})
        missing = [k for k in kws if k not in hits]
        return ("met" if ratio >= 0.6 else "partial" if ratio >= 0.3 else "missing"), evidence, missing
    ratio = pts / len(items)
    return ("met" if ratio >= 0.99 else "partial" if ratio >= 0.4 else "missing"), evidence, missing


def check_requirement(req: dict, parsed: dict, facts: dict) -> dict:
    kind = req.get("kind")
    out = {"id": req.get("id"), "text": req.get("text"), "kind": kind, "priority": req.get("priority", "must")}
    if kind == "experience":
        need = req.get("years") or parsed.get("years_min") or 0
        have = facts["years"]
        st_domain, ev, miss = _check_terms(req.get("terms") or [], [k for k in req.get("keywords") or [] if k not in ("years",)], facts)
        if need:
            yr = "met" if have >= need else "partial" if have >= 0.6 * need else "missing"
        else:
            yr = "met" if have >= 1 else "partial"
        if yr == "missing":
            status = "missing"
        elif st_domain == "missing":
            status = "partial"
        elif yr == "met" and st_domain == "met":
            status = "met"
        else:
            status = "partial"
        out.update(status=status, evidence=[{"source": "timeline", "label": f"{have:g} years of experience", "detail": f"Needs {need}+" if need else "From your timeline"}] + ev, missing_terms=miss)
        return out
    if kind == "education":
        need = edu_level(req.get("text") or "") or (parsed.get("education") or {}).get("level")
        best = facts["best_edu"]
        if not best:
            out.update(status="missing", evidence=[], missing_terms=[need or "degree"])
            return out
        lvl_ok = need is None or EDU_RANK.get(best["degree"], 0) >= EDU_RANK.get(need, 0)
        fields = (parsed.get("education") or {}).get("fields") or []
        field_txt = vocab.norm(f"{best['title']} {best['field']}")
        field_ok = not fields or any(all(vocab.stem(w) in field_txt for w in vocab.norm(f).split() if w not in vocab._STOP) for f in fields) \
            or "related" in (req.get("text") or "").lower()
        status = "met" if lvl_ok and field_ok else "partial" if lvl_ok or field_ok else "missing"
        out.update(status=status, evidence=[{"source": "education", "label": f"{best['title']} · {best['org']}", "detail": best["field"], "id": best["id"], "level": best["level"]}],
                   missing_terms=[] if status == "met" else ([f"{need} degree"] if not lvl_ok else fields[:1]))
        return out
    if kind == "certification":
        txt = vocab.norm(req.get("text") or "")
        for cert in facts["certs"]:
            cn = vocab.norm(cert["name"])
            toks = [t for t in cn.split() if t not in vocab._STOP]
            if cn and (cn in txt or (toks and sum(1 for t in toks if t in txt) >= max(1, len(toks) * 0.6))):
                out.update(status="met", evidence=[{"source": "certification", "label": cert["name"], "detail": cert["issuer"], "id": cert["id"], "level": cert["level"]}], missing_terms=[])
                return out
        st, ev, miss = _check_terms(req.get("terms") or [], req.get("keywords") or [], facts)
        out.update(status="partial" if st != "missing" else "missing", evidence=ev, missing_terms=miss or [req.get("text")])
        return out
    st, ev, miss = _check_terms(req.get("terms") or [], req.get("keywords") or [], facts)
    out.update(status=st, evidence=ev, missing_terms=miss)
    return out


# ───────────────────────── scoring ─────────────────────────
def suggest_bullet(req: dict, facts: dict) -> str:
    term = ", ".join(req.get("missing_terms") or []) or req.get("text") or ""
    role = facts["work"][0] if facts["work"] else None
    where = f" at {role['org']}" if role else ""
    k = req.get("kind")
    if k == "experience":
        return f"Led [project/initiative]{where} over [N] years, delivering [measurable result, e.g. 30% faster turnaround]"
    if k == "education":
        return f"Add your {term} to your timeline (Education) and attach the certificate so it can be verified"
    if k == "certification":
        return f"Earned {term} — add it under Certifications with the issuer and certificate file"
    return f"Used {term}{where} to [what you did], resulting in [measurable outcome, e.g. cut costs by 15%]"


def evaluate(profile: Profile, parsed: dict, db: Session | None = None, facts: dict | None = None) -> dict:
    facts = facts or build_facts(db, profile)
    prompts = insufficient(facts)
    if prompts:
        return {"score": None, "insufficient": True, "prompts": prompts, "breakdown": [], "requirements": [], "engine": ENGINE_VERSION}
    reqs = [check_requirement(r, parsed, facts) for r in (parsed.get("must_have") or []) + (parsed.get("nice_to_have") or [])]
    must = [r for r in reqs if r["priority"] == "must"]
    comp: dict[str, float | None] = {}
    comp["must"] = (sum(CREDIT[r["status"]] for r in must) / len(must)) if must else None
    # skills & tools coverage
    want = list(dict.fromkeys((parsed.get("skills") or []) + (parsed.get("tools") or [])))
    skill_hits = []
    if want:
        pts = 0.0
        for t in want:
            st, _ = _find_term(t, facts)
            pts += CREDIT[st]
            skill_hits.append({"term": t, "status": st})
        comp["skills"] = pts / len(want)
    else:
        comp["skills"] = None
    # experience & seniority
    need_y = parsed.get("years_min")
    yr = min(1.0, facts["years"] / need_y) if need_y else None
    js, ps = parsed.get("seniority"), facts["seniority"]
    sen = None
    if js and ps:
        gap = RANK[ps] - RANK[js]
        sen = 1.0 if gap >= 0 else 0.6 if gap == -1 else 0.25
    elif js and facts["years"]:
        expect = {"intern": 0, "entry": 0.5, "mid": 2, "senior": 5, "manager": 6, "director": 10}[js]
        sen = min(1.0, facts["years"] / expect) if expect else 1.0
    parts = [(v, w) for v, w in ((yr, 0.7), (sen, 0.3)) if v is not None]
    comp["experience"] = sum(v * w for v, w in parts) / sum(w for _, w in parts) if parts else None
    exp_reqs = [r for r in reqs if r["kind"] == "experience"]
    if exp_reqs:  # years alone are not enough — the experience must be in the right domain
        dom = sum(CREDIT[r["status"]] for r in exp_reqs) / len(exp_reqs)
        comp["experience"] = dom if comp["experience"] is None else 0.5 * comp["experience"] + 0.5 * dom
    # education & certs
    edu_need = (parsed.get("education") or {}).get("level")
    cert_need = parsed.get("certifications") or []
    ed_parts = []
    if edu_need:
        b = facts["best_edu"]
        ed_parts.append(1.0 if b and EDU_RANK[b["degree"]] >= EDU_RANK[edu_need] else 0.5 if b else 0.0)
    for cn in cert_need:
        c = vocab.norm(cn)
        ed_parts.append(1.0 if any(c in x["norm"] or x["norm"].split()[0:1] == c.split()[0:1] for x in facts["certs"]) else 0.0)
    comp["education"] = sum(ed_parts) / len(ed_parts) if ed_parts else None
    # location
    loc = parsed.get("location") or {}
    if loc.get("remote") and not loc.get("cities"):
        comp["location"] = 1.0
    elif loc.get("cities"):
        comp["location"] = 1.0 if any(c in facts["location"] for c in loc["cities"]) else (0.6 if loc.get("hybrid") or loc.get("remote") else 0.3) if facts["location"] else 0.5
    else:
        comp["location"] = None
    # verification of the evidence actually used
    levels = [e.get("level") for r in reqs if r["status"] != "missing" for e in r.get("evidence", []) if e.get("level")]
    if not levels:
        levels = [w["level"] for w in facts["work"]] + [c["level"] for c in facts["certs"]]
    vmap = {"issuer_verified": 1.0, "document_provided": 0.6, "pending": 0.3}
    comp["verification"] = sum(vmap.get(l, 0.0) for l in levels) / len(levels) if levels else 0.0
    if comp["must"] is None and comp["skills"] is None:
        return {"score": None, "insufficient": True, "engine": ENGINE_VERSION, "breakdown": [], "requirements": reqs,
                "prompts": ["This job description has no clear requirements to match against — paste the full description"]}
    active = {k: v for k, v in comp.items() if v is not None}
    total_w = sum(WEIGHTS[k] for k in active)
    score = round(sum(WEIGHTS[k] * v for k, v in active.items()) / total_w * 100)
    breakdown = [{"key": k, "label": LABELS[k], "weight": WEIGHTS[k], "applies": comp[k] is not None,
                  "value": round(comp[k], 3) if comp[k] is not None else None,
                  "points": round(WEIGHTS[k] * comp[k] / total_w * 100, 1) if comp[k] is not None else 0,
                  "max": round(WEIGHTS[k] / total_w * 100, 1) if comp[k] is not None else 0} for k in WEIGHTS]
    for r in reqs:
        if r["status"] != "met":
            r["suggestion"] = suggest_bullet(r, facts)
    counts = {s: sum(1 for r in reqs if r["status"] == s) for s in ("met", "partial", "missing")}
    return {"score": score, "insufficient": False, "breakdown": breakdown, "requirements": reqs, "skills": skill_hits,
            "counts": counts, "years": facts["years"], "years_needed": need_y, "seniority": {"job": js, "you": ps},
            "engine": ENGINE_VERSION,
            "label": "Strong match" if score >= 75 else "Good match" if score >= 55 else "Partial match" if score >= 35 else "Low match"}


def match_cached(db: Session, profile: Profile, target_key: str, parsed: dict, jd_h: str, facts: dict | None = None) -> dict:
    """Cached by (profile, target) + fingerprint of the profile facts and the parsed JD."""
    try:
        docs_count = db.query(ProfileFile).filter(ProfileFile.profile_id == profile.id).count()
    except Exception:  # noqa: BLE001
        docs_count = 0
    fp = hashlib.sha256(f"{facts_fingerprint(profile, docs_count)}|{jd_h}".encode()).hexdigest()[:40]
    row = db.query(MatchCache).filter(MatchCache.profile_id == profile.id, MatchCache.target_key == target_key).first()
    if row and row.fingerprint == fp:
        return row.result
    result = evaluate(profile, parsed, db, facts)
    if row:
        row.fingerprint, row.score, row.result = fp, result.get("score"), result
    else:
        db.add(MatchCache(profile_id=profile.id, target_key=target_key, fingerprint=fp, score=result.get("score"), result=result))
    try:
        db.commit()
    except Exception:  # noqa: BLE001 - concurrent insert; result is still valid
        db.rollback()
    return result


def match_job(db: Session, profile: Profile, job, facts: dict | None = None) -> dict:
    from app.services.jd_parse import compose_job_text, parse_sync
    h, parsed = parse_sync(db, compose_job_text(job), title=job.title, location=job.location or "",
                           requirements=job.requirements, years_min=job.experience_years_min)
    return match_cached(db, profile, f"job:{job.id}", parsed, h, facts)


def summary(result: dict) -> dict:
    """Compact form for list cards (score + hover breakdown)."""
    return {"score": result.get("score"), "insufficient": result.get("insufficient", False), "label": result.get("label"),
            "prompts": result.get("prompts", []), "breakdown": result.get("breakdown", []), "counts": result.get("counts"),
            "top_gaps": [r["text"] for r in result.get("requirements", []) if r["status"] == "missing" and r["priority"] == "must"][:3],
            "top_matches": [r["text"] for r in result.get("requirements", []) if r["status"] == "met"][:3]}
