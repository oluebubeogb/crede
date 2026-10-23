"""Parse a job description once into structured requirements (AI when available, heuristic fallback), cached by jd_hash."""
from __future__ import annotations

import hashlib
import logging
import re

from sqlalchemy.orm import Session

from app.models_suite import JdParse
from app.services import vocab

log = logging.getLogger("crede.jd")
PARSE_VERSION = 6

SENIORITY = [  # (level, rank, words)
    ("intern", 0, ["intern", "internship", "trainee", "nysc", "siwes", "graduate trainee"]),
    ("entry", 1, ["entry", "junior", "jr", "graduate", "assistant", "associate"]),
    ("mid", 2, ["mid", "intermediate", "officer", "specialist", "analyst", "executive"]),
    ("senior", 3, ["senior", "sr", "lead", "principal", "staff", "supervisor"]),
    ("manager", 4, ["manager", "head", "management"]),
    ("director", 5, ["director", "vp", "vice president", "chief", "cto", "ceo", "cfo", "coo", "gm", "general manager", "partner"]),
]
RANK = {lvl: r for lvl, r, _ in SENIORITY}
EDU_LEVELS = [  # (key, rank, patterns)
    ("phd", 5, r"\b(ph\.?\s?d|doctorate|doctoral)\b"),
    ("masters", 4, r"\b(master'?s?|m\.?\s?sc|m\.?\s?a\b|mba|m\.?\s?eng|m\.?\s?ed|postgraduate|pgd)\b"),
    ("bachelors", 3, r"\b(bachelor'?s?|b\.?\s?sc|b\.?\s?a\b|b\.?\s?eng|b\.?\s?tech|b\.?\s?ed|ll\.?b|mbbs|undergraduate degree|university degree|first degree|degree)\b"),
    ("hnd", 2, r"\b(hnd|higher national diploma)\b"),
    ("diploma", 1, r"\b(ond|nd|diploma|nce)\b"),
    ("secondary", 0, r"\b(ssce|waec|neco|o'?level|secondary school)\b"),
]
EDU_RANK = {k: r for k, r, _ in EDU_LEVELS}
CERTS = ["pmp", "prince2", "acca", "ican", "aca", "cima", "cfa", "cpa", "citn", "cipm", "chrm", "shrm", "cipd", "cissp", "cisa",
         "cism", "ceh", "comptia", "ccna", "ccnp", "itil", "six sigma", "lean six sigma", "scrum master", "csm", "psm", "aws certified",
         "azure certified", "google certified", "coren", "nim", "nse", "cibn", "nmcn", "pcn", "trcn", "nebosh", "iosh", "osha",
         "cips", "cfe", "frm", "capm", "togaf", "ocp", "rhce", "mcse"]
NG_CITIES = ["lagos", "abuja", "port harcourt", "ibadan", "kano", "enugu", "kaduna", "benin city", "warri", "owerri", "abeokuta",
             "uyo", "calabar", "jos", "ilorin", "aba", "umuahia", "asaba", "akure", "onitsha", "lekki", "ikeja", "victoria island"]
MUST_HDR = re.compile(r"(requirement|qualification|must|you have|you'll need|you will need|what we.?re looking|who you are|skills|essential|minimum)", re.I)
NICE_HDR = re.compile(r"(nice to have|nice-to-have|bonus|preferred|desirable|a plus|good to have|added advantage|advantageous)", re.I)
SKIP_HDR = re.compile(r"(responsibilit|duties|what you.?ll do|about (us|the)|benefits|perks|we offer|salary|how to apply|role overview|job summary)", re.I)
NICE_INLINE = re.compile(r"(nice to have|is a plus|a plus|preferred|bonus|added advantage|advantageous|desirable|ideally)", re.I)
META_LINE = re.compile(r"^\s*(location|salary|deadline|closing date|apply|employment type|job type|type|department|reports to)\s*:", re.I)
INTRO = re.compile(r"^\s*(we are|we're|our|at |join|about|this role|the role|as a|you will|you'll)\b", re.I)
YEARS = re.compile(r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)", re.I)


def jd_hash(text: str) -> str:
    return hashlib.sha256((f"v{PARSE_VERSION}|" + re.sub(r"\s+", " ", (text or "").strip().lower())).encode()).hexdigest()


INLINE_HDR = re.compile(r"(?i)(?:^|(?<=[.!?]\s))\s*((?:key\s+|minimum\s+|basic\s+|preferred\s+)?(?:requirements|qualifications|"
                        r"what you(?:'ll)? need|must[- ]haves?|nice[- ]to[- ]haves?|bonus(?: points)?|preferred|skills(?: required)?))\s*:\s+")


def _lines(text: str) -> list[str]:
    text = INLINE_HDR.sub(lambda m: "\n" + m.group(1) + ":\n", text or "")
    raw = re.split(r"[\r\n]+|(?<=[.;])\s+(?=[A-Z•\-*])|\s[•●▪]\s", text or "")
    out = []
    for ln in raw:
        ln = re.sub(r"^\s*([-*•●▪◦]|\d+[.)])\s*", "", ln).strip()
        if ln:
            out.append(ln)
    return out


def _classify(line: str) -> str:
    l = line.lower()
    if YEARS.search(l) and ("experience" in l or "years" in l):
        return "experience"
    if any(re.search(p, l) for _, _, p in EDU_LEVELS):
        return "education"
    if any(re.search(r"\b" + re.escape(c) + r"\b", l) for c in CERTS) or re.search(r"\b(certified|certification|certificate|licen[cs]e)\b", l):
        return "certification"
    return "skill" if vocab.find_terms(line) else "other"


def detect_seniority(title: str, text: str = "") -> str | None:
    t = vocab.norm(title)
    for lvl, _, words in reversed(SENIORITY):
        if any(re.search(r"\b" + re.escape(w) + r"\b", t) for w in words):
            return lvl
    return None


def edu_level(text: str) -> str | None:
    l = (text or "").lower()
    for key, _, pat in EDU_LEVELS:
        if re.search(pat, l):
            return key
    return None


def heuristic_parse(text: str, title: str = "", location: str = "", requirements: list | None = None,
                    years_min: int | None = None) -> dict:
    body = text or ""
    lines = _lines(body)
    must, nice = [], []
    mode = None
    def _hdr(ln):
        return len(ln) < 70 and (ln.endswith(":") or ln.isupper() or len(ln.split()) <= 6)
    has_sections = any(_hdr(ln) and (MUST_HDR.search(ln) or NICE_HDR.search(ln)) for ln in lines)
    for ln in lines:
        is_hdr = len(ln) < 70 and (ln.endswith(":") or ln.isupper() or len(ln.split()) <= 6)
        if is_hdr and NICE_HDR.search(ln):
            mode = "nice"; continue
        if is_hdr and SKIP_HDR.search(ln):
            mode = "skip"; continue
        if is_hdr and MUST_HDR.search(ln):
            mode = "must"; continue
        if mode == "skip" or len(ln) < 2 or META_LINE.match(ln):
            continue
        kind = _classify(ln)
        if mode is None and (kind == "other" or has_sections or INTRO.match(ln)):
            continue  # prose outside a requirements section
        target = nice if (mode == "nice" or NICE_INLINE.search(ln)) else must
        target.append(ln)
    for r in requirements or []:
        r = str(r).strip()
        if r and r not in must and r not in nice:
            (nice if NICE_INLINE.search(r) else must).append(r)

    def item(i, ln, pri):
        k = _classify(ln)
        terms = vocab.find_terms(ln)
        y = YEARS.search(ln)
        return {"id": f"{pri[0]}{i}", "text": ln[:240], "kind": k, "terms": terms,
                "keywords": [w for w in vocab.keywords(ln) if w not in {vocab.norm(t) for t in terms}][:8],
                "years": int(y.group(1)) if y and k == "experience" else None, "priority": pri}

    full = f"{title}\n{body}\n" + "\n".join(map(str, requirements or []))
    yrs = [int(m.group(1)) for m in YEARS.finditer(full) if int(m.group(1)) <= 30]
    loc_l = f"{location} {body}".lower()
    must_items = [item(i, ln, "must") for i, ln in enumerate(must[:14])]
    nice_items = [item(i, ln, "nice") for i, ln in enumerate(nice[:10])]
    req_text = "\n".join(must + nice) if (must or nice) else full
    skills = vocab.find_terms(req_text)
    edu = edu_level(full)
    fields = re.findall(r"(?:degree|bsc|b\.sc|hnd|bachelor'?s?|masters?)\s+(?:degree\s+)?in\s+([A-Za-z ,/&]+?)(?:[.;\n]| or related| or equivalent|$)", full, re.I)
    certs = sorted({c.upper() if len(c) <= 6 else c.title().replace("Aws", "AWS") for c in CERTS if re.search(r"\b" + re.escape(c) + r"\b", full.lower())})
    return {
        "title": title or (lines[0][:120] if lines else ""),
        "seniority": detect_seniority(title or "", body),
        "years_min": years_min if years_min is not None else (min(yrs) if yrs else None),
        "must_have": must_items, "nice_to_have": nice_items,
        "skills": skills[:30], "tools": [],
        "education": {"level": edu, "fields": [f.strip()[:80] for f in fields[:3]]},
        "certifications": certs,
        "location": {"text": location or None, "remote": bool(re.search(r"\bremote\b", loc_l)),
                     "hybrid": bool(re.search(r"\bhybrid\b", loc_l)),
                     "cities": [c for c in NG_CITIES if c in loc_l][:3]},
        "source": "heuristic",
    }


AI_SYSTEM = """You extract structured requirements from a job description. Return JSON only:
{"title":str,"seniority":"intern|entry|mid|senior|manager|director|null","years_min":int|null,
"must_have":[{"text":str,"kind":"skill|experience|education|certification|other","terms":[str],"years":int|null}],
"nice_to_have":[same],"skills":[str],"tools":[str],"education":{"level":"phd|masters|bachelors|hnd|diploma|secondary|null","fields":[str]},
"certifications":[str],"location":{"text":str|null,"remote":bool,"hybrid":bool,"cities":[str]}}
Rules: at most 12 must_have and 8 nice_to_have; each item one concrete requirement; terms are the specific skills/tools/fields
named in that item (short, lowercase). Do not invent requirements that are not in the text. Responsibilities are not requirements
unless they name a skill."""


def _clean_ai(d: dict, fallback: dict) -> dict:
    def items(lst, pri):
        out = []
        for i, it in enumerate((lst or [])[:14]):
            if not isinstance(it, dict) or not str(it.get("text") or "").strip():
                continue
            txt = str(it["text"]).strip()[:240]
            terms = [vocab.canon(str(t)) for t in (it.get("terms") or []) if str(t).strip()][:8] or vocab.find_terms(txt)
            kind = it.get("kind") if it.get("kind") in ("skill", "experience", "education", "certification", "other") else _classify(txt)
            yrs = it.get("years")
            out.append({"id": f"{pri[0]}{i}", "text": txt, "kind": kind, "terms": terms,
                        "keywords": vocab.keywords(txt)[:8], "years": int(yrs) if isinstance(yrs, (int, float)) else None, "priority": pri})
        return out
    sen = d.get("seniority") if d.get("seniority") in RANK else fallback.get("seniority")
    ym = d.get("years_min")
    edu = d.get("education") or {}
    loc = d.get("location") or {}
    must = items(d.get("must_have"), "must") or fallback["must_have"]
    return {
        "title": str(d.get("title") or fallback["title"])[:160], "seniority": sen,
        "years_min": int(ym) if isinstance(ym, (int, float)) and 0 <= ym <= 40 else fallback.get("years_min"),
        "must_have": must, "nice_to_have": items(d.get("nice_to_have"), "nice") or fallback["nice_to_have"],
        "skills": list(dict.fromkeys([vocab.canon(str(s)) for s in (d.get("skills") or []) + (d.get("tools") or [])] + fallback["skills"]))[:30],
        "tools": [vocab.canon(str(s)) for s in (d.get("tools") or [])][:15],
        "education": {"level": edu.get("level") if edu.get("level") in EDU_RANK else fallback["education"]["level"],
                      "fields": [str(f)[:80] for f in (edu.get("fields") or [])][:3] or fallback["education"]["fields"]},
        "certifications": [str(c)[:80] for c in (d.get("certifications") or [])][:8] or fallback["certifications"],
        "location": {"text": loc.get("text") or fallback["location"]["text"], "remote": bool(loc.get("remote", fallback["location"]["remote"])),
                     "hybrid": bool(loc.get("hybrid", fallback["location"]["hybrid"])),
                     "cities": [str(c).lower() for c in (loc.get("cities") or [])][:3] or fallback["location"]["cities"]},
        "source": "ai",
    }


def compose_job_text(job) -> str:
    parts = [job.title or "", job.description or ""]
    if job.requirements:
        parts.append("Requirements:\n" + "\n".join(f"- {r}" for r in job.requirements))
    if job.experience_years_min:
        parts.append(f"Minimum {job.experience_years_min} years experience")
    if job.location:
        parts.append(f"Location: {job.location}")
    return "\n".join(parts)


def cached(db: Session, h: str) -> dict | None:
    row = db.query(JdParse).filter(JdParse.jd_hash == h).first()
    return row.parsed if row else None


def _store(db: Session, h: str, parsed: dict) -> None:
    row = db.query(JdParse).filter(JdParse.jd_hash == h).first()
    if row:
        row.parsed, row.source = parsed, parsed.get("source", "heuristic")
    else:
        db.add(JdParse(jd_hash=h, parsed=parsed, source=parsed.get("source", "heuristic"), version=PARSE_VERSION))
    db.commit()


def parse_sync(db: Session, text: str, *, title: str = "", location: str = "", requirements=None, years_min=None) -> tuple[str, dict]:
    """Cached heuristic parse — used in list views so no AI call blocks a page."""
    vocab.load_catalog(db)
    h = jd_hash(f"{title}\n{text}\n{requirements}\n{location}\n{years_min}")
    hit = cached(db, h)
    if hit:
        return h, hit
    parsed = heuristic_parse(text, title, location, requirements, years_min)
    _store(db, h, parsed)
    return h, parsed


async def parse(db: Session, text: str, *, title: str = "", location: str = "", requirements=None, years_min=None,
                use_ai: bool = True) -> tuple[str, dict]:
    vocab.load_catalog(db)
    h = jd_hash(f"{title}\n{text}\n{requirements}\n{location}\n{years_min}")
    hit = cached(db, h)
    if hit and (hit.get("source") == "ai" or not use_ai):
        return h, hit
    fallback = hit or heuristic_parse(text, title, location, requirements, years_min)
    parsed = fallback
    if use_ai:
        from app.services.llm import LLMError, chat_json, llm_available
        if llm_available():
            try:
                d = await chat_json(AI_SYSTEM, f"TITLE: {title}\nLOCATION: {location}\n\n{text[:9000]}\n\n"
                                    + ("Listed requirements:\n" + "\n".join(map(str, requirements)) if requirements else ""),
                                    temperature=0.1, max_tokens=1800)
                if isinstance(d, dict):
                    parsed = _clean_ai(d, fallback)
            except LLMError as e:
                log.info("JD AI parse failed, heuristic used: %s", e)
            except Exception as e:  # noqa: BLE001
                log.warning("JD AI parse error: %s", e)
    _store(db, h, parsed)
    return h, parsed
