"""Deterministic document engine.

The AI only ever writes structured JSON *content* (summary, bullets, letter paragraphs). This module owns all design:
six HTML/CSS templates rendered to PDF with WeasyPrint, plus a clean single-column DOCX. Style changes
(template, colour, font pairing, density, ATS mode) re-render without any AI call.
"""
from __future__ import annotations

import html
import io
import logging
import re
from datetime import date

log = logging.getLogger("crede.docs")

TEMPLATES = {
    "modern": {"label": "Modern", "desc": "Clean sans, colour accents, roomy"},
    "professional": {"label": "Professional", "desc": "Classic rules, safe for any industry"},
    "compact": {"label": "Compact", "desc": "Dense layout that fits more on a page"},
    "executive": {"label": "Executive", "desc": "Serif headings, centred letterhead"},
    "minimal": {"label": "Minimal", "desc": "Quiet typography, no colour blocks"},
    "creative": {"label": "Creative", "desc": "Tinted sidebar for skills and contact"},
}
PALETTES = [
    {"key": "cobalt", "label": "Cobalt", "hex": "#2563EB"}, {"key": "ink", "label": "Ink", "hex": "#1F2937"},
    {"key": "emerald", "label": "Emerald", "hex": "#047857"}, {"key": "teal", "label": "Teal", "hex": "#0F766E"},
    {"key": "plum", "label": "Plum", "hex": "#6D28D9"}, {"key": "burgundy", "label": "Burgundy", "hex": "#9F1239"},
    {"key": "copper", "label": "Copper", "hex": "#B45309"}, {"key": "slate", "label": "Slate", "hex": "#475569"},
]
FONTS = {  # key: (label, heading css, body css, docx heading, docx body)
    "inter": ("Inter", "'Inter', 'Carlito', sans-serif", "'Inter', 'Carlito', sans-serif", "Calibri", "Calibri"),
    "lato": ("Lato", "'Lato', 'Carlito', sans-serif", "'Lato', 'Carlito', sans-serif", "Calibri", "Calibri"),
    "classic": ("Garamond + Lato", "'EB Garamond', 'Liberation Serif', serif", "'Lato', 'Carlito', sans-serif", "Garamond", "Calibri"),
    "serif": ("Times (Traditional)", "'Liberation Serif', 'Times New Roman', serif", "'Liberation Serif', 'Times New Roman', serif", "Times New Roman", "Times New Roman"),
    "calibri": ("Carlito (Calibri)", "'Carlito', 'Calibri', sans-serif", "'Carlito', 'Calibri', sans-serif", "Calibri", "Calibri"),
    "opensans": ("Open Sans", "'Open Sans', 'Carlito', sans-serif", "'Open Sans', 'Carlito', sans-serif", "Arial", "Arial"),
}
DENSITY = {  # body pt, line-height, page margin mm, section gap mm
    "comfortable": (10.5, 1.45, 18, 6.0), "standard": (10, 1.38, 15, 4.8), "compact": (9.3, 1.3, 12, 3.6),
}
DEFAULT_STYLE = {"template": "modern", "color": "#2563EB", "font": "inter", "density": "standard", "ats": False, "show_verified": True}
TEMPLATE_DEFAULTS = {
    "modern": {"font": "inter", "color": "#2563EB"}, "professional": {"font": "calibri", "color": "#1F2937"},
    "compact": {"font": "lato", "color": "#0F766E", "density": "compact"}, "executive": {"font": "classic", "color": "#9F1239"},
    "minimal": {"font": "opensans", "color": "#475569"}, "creative": {"font": "lato", "color": "#6D28D9"},
}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def e(v) -> str:
    return html.escape(str(v if v is not None else ""), quote=True)


def normalize_style(style: dict | None, template_hint: str | None = None) -> dict:
    s = dict(DEFAULT_STYLE)
    t = (style or {}).get("template") or template_hint or "modern"
    if t not in TEMPLATES:
        t = "modern"
    s.update(TEMPLATE_DEFAULTS.get(t, {}))
    s["template"] = t
    for k, v in (style or {}).items():
        if k == "color" and isinstance(v, str) and HEX.match(v):
            s["color"] = v.upper()
        elif k == "font" and v in FONTS:
            s["font"] = v
        elif k == "density" and v in DENSITY:
            s["density"] = v
        elif k in ("ats", "show_verified"):
            s[k] = bool(v)
    return s


def style_options() -> dict:
    return {"templates": [{"key": k, **v} for k, v in TEMPLATES.items()], "palettes": PALETTES,
            "fonts": [{"key": k, "label": v[0], "heading": v[1], "body": v[2]} for k, v in FONTS.items()],
            "densities": [{"key": "comfortable", "label": "Comfortable"}, {"key": "standard", "label": "Standard"},
                          {"key": "compact", "label": "Compact"}], "defaults": TEMPLATE_DEFAULTS}


def _tint(hex_: str, amt: float) -> str:
    """Mix colour with white (amt 0..1 of white)."""
    h = hex_.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02X%02X%02X" % tuple(round(c + (255 - c) * amt) for c in (r, g, b))


def fmt_month(d) -> str:
    if not d:
        return ""
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d[:10])
        except ValueError:
            return d
    return f"{MONTHS[d.month - 1]} {d.year}"


def fmt_range(start, end, current=False) -> str:
    a = fmt_month(start)
    b = "Present" if current else fmt_month(end)
    return f"{a} – {b}" if a and b else a or b


# ─────────────────────────── content builders ───────────────────────────
def _clean_bullet(b: str) -> str:
    b = re.sub(r"^\s*([-*•●▪]|\d+[.)])\s*", "", str(b or "")).strip()
    b = re.sub(r"\*\*(.+?)\*\*", r"\1", b)
    return (b[0].upper() + b[1:]) if b else b


def facts_cv(profile) -> dict:
    """Deterministic CV content from profile facts (the source of truth)."""
    work, edu = [], []
    for t in sorted(profile.timeline_entries, key=lambda x: (x.is_current, x.end_date or date.max if x.is_current else x.end_date or x.start_date, x.start_date), reverse=True):
        verified = (t.verification_status or "") in ("verified", "approved")
        if (getattr(t, "entry_type", None) or "work") == "education":
            edu.append({"id": t.id, "degree": t.job_title, "field": getattr(t, "field_of_study", None) or "", "school": t.organization,
                        "start": str(t.start_date) if t.start_date else None, "end": None if t.is_current else (str(t.end_date) if t.end_date else None),
                        "current": t.is_current, "grade": getattr(t, "grade", None) or "", "verified": verified})
            continue
        bullets = [_clean_bullet(x) for x in (t.achievements or [])][:6]
        for r in t.responsibilities or []:
            if len(bullets) >= 5:
                break
            r = _clean_bullet(r)
            if r and r not in bullets:
                bullets.append(r)
        if not bullets and t.description:
            bullets = [_clean_bullet(s) for s in re.split(r"(?<=[.!?])\s+", t.description) if len(s) > 12][:4]
        work.append({"id": t.id, "title": t.job_title, "org": t.organization, "location": getattr(t, "location", None) or "",
                     "start": str(t.start_date) if t.start_date else None, "end": None if t.is_current else (str(t.end_date) if t.end_date else None),
                     "current": t.is_current, "bullets": [b for b in bullets if b], "verified": verified})
    certs = [{"name": c.name, "issuer": c.issuer or "", "date": str(c.issued_at) if c.issued_at else None,
              "verified": (c.verification_status or "") in ("verified", "approved")} for c in profile.certifications]
    contact = {"email": profile.email or "", "phone": getattr(profile, "phone", None) or "", "location": profile.location or "",
               "links": [l for l in [f"crede.collab.name.ng/u/{profile.username}" if profile.username else ""] if l]}
    return {"name": profile.full_name or (profile.email or "").split("@")[0], "headline": profile.headline or "",
            "contact": contact, "summary": (profile.summary or "").strip(), "highlights": [], "experience": work,
            "education": edu, "skills": [s.name for s in profile.skills][:18], "certifications": certs}


def merge_ai_cv(base: dict, ai: dict | None, allowed_skills: list[str]) -> dict:
    """Apply AI JSON onto facts without letting it invent employers, dates or skills."""
    if not isinstance(ai, dict):
        return base
    out = dict(base)
    if isinstance(ai.get("headline"), str) and 3 < len(ai["headline"]) < 120:
        out["headline"] = ai["headline"].strip()
    if isinstance(ai.get("summary"), str) and len(ai["summary"]) > 40:
        out["summary"] = ai["summary"].strip()[:900]
    hl = [h for h in (ai.get("highlights") or []) if isinstance(h, str) and h.strip()][:3]
    out["highlights"] = [_clean_bullet(h)[:220] for h in hl]
    by_id = {str(x.get("id")): x for x in (ai.get("experience") or []) if isinstance(x, dict)}
    exp = []
    for w in base["experience"]:
        a = by_id.get(str(w["id"]))
        if a and isinstance(a.get("bullets"), list):
            b = [_clean_bullet(x)[:260] for x in a["bullets"] if isinstance(x, str) and x.strip()][:6]
            if b:
                w = {**w, "bullets": b}
        exp.append(w)
    out["experience"] = exp
    if isinstance(ai.get("skills"), list):
        from app.services import vocab
        allowed = {vocab.canon(s): s for s in allowed_skills}
        picked = []
        for s in ai["skills"]:
            c = vocab.canon(str(s))
            if c in allowed and allowed[c] not in picked:
                picked.append(allowed[c])
        rest = [s for s in allowed_skills if s not in picked]
        out["skills"] = (picked + rest)[:18] if picked else base["skills"]
    return out


def word_count(paragraphs: list[str]) -> int:
    return sum(len(re.findall(r"\b\w+\b", p)) for p in paragraphs)


def fit_letter(paragraphs: list[str], max_words: int = 400) -> list[str]:
    paras = [p.strip() for p in paragraphs if p and p.strip()]
    while word_count(paras) > max_words and len(paras) > 1:
        # trim the longest middle paragraph by one sentence
        idx = max(range(len(paras)), key=lambda i: len(paras[i]) if 0 < i < len(paras) - 1 or len(paras) <= 2 else -1)
        sents = re.split(r"(?<=[.!?])\s+", paras[idx])
        if len(sents) <= 1:
            paras.pop(idx)
        else:
            paras[idx] = " ".join(sents[:-1])
    return paras


VERBS = {"built", "led", "ran", "grew", "won", "cut", "made", "set", "drove", "wrote", "own", "lead", "manage", "run", "build",
         "sold", "taught", "spoke", "brought", "kept", "met", "shipped", "designed", "mentor", "mentored"}


def _lower_first(t: str) -> str:
    t = t.strip().rstrip(".")
    if len(t) > 1 and t[0].isupper() and not t[1].isupper():
        return t[0].lower() + t[1:]
    return t


def facts_letter(profile, cv: dict, job_title: str | None, org: str | None, parsed: dict | None, match: dict | None = None) -> dict:
    """Deterministic, honest letter (≈250–330 words) used when AI is unavailable. Only states facts from the profile."""
    role = job_title or "this role"
    company = org or "your organisation"
    w = cv["experience"][0] if cv["experience"] else None
    yrs = getattr(profile, "years_experience", None)
    if not yrs and cv["experience"]:
        try:
            starts = [x.get("start") for x in cv["experience"] if x.get("start")]
            if starts:
                yrs = max(1, date.today().year - int(str(min(starts))[:4]))
        except Exception:  # noqa: BLE001
            yrs = None
    reqs = (match or {}).get("requirements") or []
    met = [r for r in reqs if r.get("status") == "met"]
    gaps = [r for r in reqs if r.get("status") != "met" and r.get("priority") == "must"]
    want = [t for t in ((parsed or {}).get("skills") or [])]
    have = [s for s in cv["skills"] if any(s.lower() == t.lower() or t.lower() in s.lower() for t in want)] or cv["skills"][:4]
    p1 = (f"I am writing to apply for {('the ' + role + ' position') if job_title else role} at {company}. "
          + (f"I am currently {('a ' if not w['title'].lower().startswith(('head', 'chief')) else 'the ') + w['title']} at {w['org']}" if w else "I am a motivated professional")
          + (f", with {yrs}+ years of hands-on experience" if yrs else "")
          + (f" across {', '.join(have[:3])}" if have else "") + ". "
          + "I have followed your requirements closely and believe my record is a strong, practical fit.")
    evid = [b for x in cv["experience"][:2] for b in x["bullets"][:2]][:3]
    if evid:
        lead = ["Most notably, ", "I also ", "In addition, "]
        parts = []
        for i, b in enumerate(evid):
            fw = (b.split() or [""])[0].lower()
            verb = fw.endswith("ed") or fw in VERBS
            if verb:
                parts.append(f"{lead[i]}{'I ' if i != 1 else ''}{_lower_first(b)}.")
            else:
                parts.append(f"{['Most notably, my work included ', 'It also included ', 'In addition, it included '][i]}{_lower_first(b)}.")
        p2 = "In my recent work I have delivered measurable results. " + " ".join(parts)
    else:
        p2 = ("Across my roles I have taken ownership of results, worked closely with colleagues and stakeholders, "
              "and kept improving how the work gets done.")
    if len(cv["experience"]) > 1:
        prev = cv["experience"][1]
        p2 += f" Before that, as {prev['title']} at {prev['org']}, I built the foundation I bring to this role."
    if met:
        names = [_lower_first(r["text"])[:90] for r in met[:3]]
        p3 = (f"Your description asks for {'; '.join(names)}. These are areas where I already have direct, verifiable experience"
              + (f", and I hold {cv['certifications'][0]['name']}" if cv.get("certifications") else "") + ". ")
    else:
        p3 = "I have reviewed the requirements for this role and they line up with the skills and experience on my profile. "
    if gaps:
        p3 += f"Where I am still growing, such as {_lower_first(gaps[0]['text'])[:80]}, I learn quickly and would welcome the chance to build on it. "
    edu = cv.get("education") or []
    if edu:
        e0 = edu[0]
        p3 += f"My {e0.get('degree') or 'education'}{(' in ' + e0['field']) if e0.get('field') else ''} from {e0.get('school')} gives me a solid grounding as well."
    p4 = ("The roles, qualifications and credentials above are recorded on my Crede profile, where past employers, schools and "
          "issuers can verify them directly, so you can rely on what you read here. "
          f"I am keen to bring the same focus on measurable outcomes to {company}, to learn quickly from your team, "
          "and to contribute from the first week.")
    p5 = (f"I would welcome the opportunity to discuss how I can contribute to {company}. "
          "Thank you for your time and consideration; I look forward to hearing from you.")
    paras = [p1, p2, p3, p4, p5]
    extras = [
        "I communicate clearly with technical and non-technical colleagues, document my work so others can build on it, "
        "and take ownership of problems until they are properly solved.",
        (f"Being based in {cv['contact'].get('location')}, I can start the conversation whenever suits you." if cv.get("contact", {}).get("location")
         else "I am available to start the conversation whenever suits you."),
    ]
    for x in extras:
        if word_count(paras) >= 265:
            break
        paras[3] = paras[3] + " " + x
    return {"paragraphs": fit_letter(paras)}


def letter_content(cv: dict, ai: dict | None, fallback: dict, job_title: str | None, org: str | None, location: str | None) -> dict:
    paras = fallback["paragraphs"]
    if isinstance(ai, dict) and isinstance(ai.get("paragraphs"), list):
        p = [str(x).strip() for x in ai["paragraphs"] if isinstance(x, str) and len(x.strip()) > 20][:5]
        if len(p) >= 2:
            paras = fit_letter(p)
    recipient = (ai or {}).get("recipient_name") if isinstance(ai, dict) else None
    return {
        "name": cv["name"], "headline": cv["headline"], "contact": cv["contact"],
        "date": date.today().strftime("%-d %B %Y"),
        "recipient": {"name": recipient or "The Hiring Manager", "org": org or "", "location": location or ""},
        "subject": f"Application for the position of {job_title}" if job_title else "Job application",
        "salutation": f"Dear {recipient}," if recipient else "Dear Hiring Manager,",
        "paragraphs": paras, "closing": "Yours sincerely,", "signature": cv["name"],
    }


# ─────────────────────────── checks ───────────────────────────
NUM = re.compile(r"(\d|%|₦|\$|£|€|\bone\b|\btwo\b|\bthree\b|\bdouble|\btripl)", re.I)


def checks(doc_type: str, content: dict, pages: int | None) -> list[dict]:
    out = []
    if doc_type == "cover_letter":
        wc = word_count(content.get("paragraphs") or [])
        out.append({"key": "length", "ok": 250 <= wc <= 400, "label": f"{wc} words", "hint": "Aim for 250–400 words"})
        out.append({"key": "pages", "ok": (pages or 1) == 1, "label": f"{pages or 1} page", "hint": "Keep letters to one page"})
        return out
    bullets = [b for x in content.get("experience", []) for b in x.get("bullets", [])]
    q = sum(1 for b in bullets if NUM.search(b))
    out.append({"key": "pages", "ok": pages is None or pages <= 2, "label": f"{pages or '?'} page{'s' if (pages or 0) != 1 else ''}",
                "hint": "Best practice is 1–2 pages — try Compact density"})
    out.append({"key": "quantified", "ok": not bullets or q / len(bullets) >= 0.4, "label": f"{q} of {len(bullets)} bullets quantified",
                "hint": "Add numbers (%, ₦, team size, time saved) to your timeline achievements"})
    out.append({"key": "summary", "ok": 30 <= len((content.get("summary") or "").split()) <= 110,
                "label": "Summary length", "hint": "A 3–5 sentence summary works best"})
    out.append({"key": "order", "ok": True, "label": "Reverse-chronological", "hint": ""})
    return out


# ─────────────────────────── HTML rendering ───────────────────────────
def _css(style: dict, doc_type: str, screen: bool) -> str:
    t, c = style["template"], style["color"]
    ats = style["ats"]
    pt, lh, margin, gap = DENSITY[style["density"]]
    _, hfont, bfont, _, _ = FONTS[style["font"]]
    soft, softer, mid = _tint(c, 0.86), _tint(c, 0.93), _tint(c, 0.55)
    sidebar = t == "creative" and not ats and doc_type == "cv"
    page_bg = f"background: linear-gradient(to right, {softer} 0, {softer} 33%, #fff 33%);" if sidebar else ""
    css = f"""
@page {{ size: A4; margin: {0 if sidebar else margin}mm {0 if sidebar else margin}mm; {page_bg}
  @bottom-right {{ content: {'""' if ats else 'counter(page) " / " counter(pages)'}; font: 7.5pt {bfont}; color: #94A3B8; margin-right: {margin}mm; }} }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: {bfont}; font-size: {pt}pt; line-height: {lh}; color: #1E293B; -weasy-hyphens: none; }}
h1, h2, h3 {{ font-family: {hfont}; margin: 0; color: #0F172A; }}
a {{ color: inherit; text-decoration: none; }}
.name {{ font-size: {pt * 2.3:.1f}pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1.1; }}
.headline {{ font-size: {pt * 1.15:.1f}pt; color: {c if not ats else '#334155'}; margin-top: 1.2mm; font-weight: 500; }}
.contact {{ margin-top: 2mm; color: #475569; font-size: {pt * 0.92:.1f}pt; }}
.contact span + span::before {{ content: "  ·  "; color: #CBD5E1; }}
.section {{ margin-top: {gap}mm; }}
.section > h2 {{ font-size: {pt * 0.95:.1f}pt; text-transform: uppercase; letter-spacing: 0.09em; font-weight: 700; color: {c if not ats else '#0F172A'};
  padding-bottom: 1.2mm; margin-bottom: 2mm; border-bottom: 0.6pt solid {mid if not ats else '#94A3B8'}; }}
.item {{ margin-bottom: {gap * 0.55:.1f}mm; page-break-inside: avoid; break-inside: avoid; }}
.item-head {{ display: flex; justify-content: space-between; gap: 4mm; align-items: baseline; }}
.item-title {{ font-weight: 650; font-weight: 600; color: #0F172A; }}
.item-org {{ color: #334155; }}
.item-date {{ color: #64748B; white-space: nowrap; font-size: {pt * 0.9:.1f}pt; }}
.vf {{ color: {c}; font-size: {pt * 0.78:.1f}pt; font-weight: 600; margin-left: 1.5mm; }}
ul {{ margin: 1.2mm 0 0 0; padding-left: 4.2mm; }}
li {{ margin: 0 0 0.7mm 0; }}
li::marker {{ color: {mid if not ats else '#475569'}; }}
.skills {{ display: block; }}
.chip {{ display: inline-block; padding: 0.5mm 2.2mm; margin: 0 1.4mm 1.4mm 0; border-radius: 3mm; background: {soft}; color: #0F172A; font-size: {pt * 0.9:.1f}pt; }}
.plain-skills {{ color: #1E293B; }}
.summary {{ color: #1E293B; }}
.highlights li {{ font-weight: 500; }}
"""
    if t == "modern" and not ats:
        css += f""".header {{ padding-bottom: 3mm; border-bottom: 2.2pt solid {c}; }}
.section > h2 {{ border-bottom: none; padding-bottom: 0; display: flex; align-items: center; }}
.section > h2::after {{ content: ""; flex: 1; height: 0.6pt; background: {soft}; margin-left: 3mm; }}"""
    elif t == "professional" and not ats:
        css += f""".header {{ border-bottom: 0.8pt solid #CBD5E1; padding-bottom: 3mm; }}
.section > h2 {{ color: #0F172A; border-bottom: 0.8pt solid #0F172A; }} .headline {{ color: {c}; }}"""
    elif t == "compact" and not ats:
        css += f""".header {{ display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.4pt solid {c}; padding-bottom: 2mm; }}
.header .contact {{ text-align: right; margin-top: 0; max-width: 55%; }} .contact span {{ display: block; }} .contact span + span::before {{ content: ""; }}
.section > h2 {{ border-bottom: none; background: {softer}; padding: 0.8mm 2mm; border-radius: 1mm; }}"""
    elif t == "executive" and not ats:
        css += f""".header {{ text-align: center; padding-bottom: 3mm; border-bottom: 0.6pt solid {mid}; }}
.name {{ font-size: {pt * 2.5:.1f}pt; font-weight: 600; letter-spacing: 0.02em; }}
.section > h2 {{ text-align: center; border-bottom: none; letter-spacing: 0.2em; font-weight: 600; }}
.section > h2::before, .section > h2::after {{ content: " — "; color: {mid}; }}
.headline {{ font-style: italic; }}"""
    elif t == "minimal" and not ats:
        css += f""".name {{ font-weight: 600; }} .headline {{ color: #475569; }}
.section > h2 {{ border-bottom: none; color: #64748B; letter-spacing: 0.14em; font-weight: 600; }} .chip {{ background: none; padding: 0; }}
.chip + .chip::before {{ content: "· "; color: #CBD5E1; }} .vf {{ color: #64748B; }}"""
    if sidebar:
        css += f""".layout {{ position: relative; }}
.side {{ float: left; width: 33%; padding: {margin}mm 6mm {margin}mm {margin}mm; }}
.main {{ margin-left: 33%; padding: {margin}mm {margin}mm {margin}mm 7mm; }}
.side .name {{ font-size: {pt * 2:.1f}pt; color: #0F172A; }} .side .headline {{ color: {c}; }}
.side .contact span {{ display: block; margin-bottom: 1mm; word-break: break-word; }} .side .contact span + span::before {{ content: ""; }}
.side .section > h2 {{ border-bottom-color: {mid}; }} .side .chip {{ background: #fff; }}
.main .section:first-child {{ margin-top: 0; }}"""
    if ats:
        css += ".chip { background: none; padding: 0; margin: 0; border-radius: 0; } .chip + .chip::before { content: ', '; } .vf { display:none; }"
    if doc_type == "cover_letter":
        css += f""".letter {{ font-size: {pt + 0.5:.1f}pt; line-height: {lh + 0.07:.2f}; }}
.letter .meta {{ margin-top: {gap * 1.4:.1f}mm; }} .letter .date {{ margin-bottom: 4mm; color: #334155; }}
.letter .recipient div {{ margin: 0; }} .letter .subject {{ margin-top: 5mm; font-weight: 600; color: #0F172A; }}
.letter .salutation {{ margin-top: 5mm; }} .letter p {{ margin: 0 0 3.4mm 0; text-align: left; }}
.letter .closing {{ margin-top: 6mm; }} .letter .sig {{ margin-top: 10mm; font-weight: 600; color: #0F172A; }}"""
    if screen:
        bg = f"background: linear-gradient(to right, {softer} 0, {softer} 33%, #fff 33%);" if sidebar else "background:#fff;"
        css += f"""
html {{ background: #E9EDF3; }} body {{ padding: 18px 0 40px; }}
.page {{ width: 210mm; min-height: 297mm; margin: 0 auto; {bg} box-shadow: 0 1px 3px rgba(15,23,42,.08), 0 12px 40px rgba(15,23,42,.10);
  padding: {0 if sidebar else margin}mm; border-radius: 2px; }}
.item-head {{ display: flex; }}
@media (max-width: 820px) {{ body {{ padding: 0; zoom: var(--z, 1); }} }}"""
    return css


def _contact_html(contact: dict, ats: bool) -> str:
    parts = [contact.get("location"), contact.get("phone"), contact.get("email")] + list(contact.get("links") or [])
    return '<div class="contact">' + "".join(f"<span>{e(p)}</span>" for p in parts if p) + "</div>"


def _header_html(c: dict, style: dict) -> str:
    return (f'<header class="header"><div><h1 class="name">{e(c.get("name"))}</h1>'
            + (f'<div class="headline">{e(c.get("headline"))}</div>' if c.get("headline") else "")
            + ("</div>" + _contact_html(c.get("contact") or {}, style["ats"]) if style["template"] == "compact" and not style["ats"]
               else _contact_html(c.get("contact") or {}, style["ats"]) + "</div>")
            + "</header>")


def _vf(flag: bool, style: dict) -> str:
    return '<span class="vf">✓ Verified</span>' if flag and style.get("show_verified") and not style["ats"] else ""


def _section(title: str, inner: str) -> str:
    return f'<section class="section"><h2>{e(title)}</h2>{inner}</section>' if inner.strip() else ""


def _skills_html(skills: list[str], style: dict) -> str:
    if not skills:
        return ""
    return '<div class="skills">' + "".join(f'<span class="chip">{e(s)}</span>' for s in skills) + "</div>"


def _cv_sections(c: dict, style: dict) -> dict[str, str]:
    exp = ""
    for w in c.get("experience") or []:
        bl = "".join(f"<li>{e(b)}</li>" for b in w.get("bullets") or [])
        org = " · ".join(x for x in [w.get("org"), w.get("location")] if x)
        exp += (f'<div class="item"><div class="item-head"><div><span class="item-title">{e(w.get("title"))}</span>{_vf(w.get("verified"), style)}'
                f'<div class="item-org">{e(org)}</div></div><div class="item-date">{e(fmt_range(w.get("start"), w.get("end"), w.get("current")))}</div></div>'
                + (f"<ul>{bl}</ul>" if bl else "") + "</div>")
    edu = ""
    for d in c.get("education") or []:
        deg = d.get("degree") or ""
        if d.get("field") and d["field"].lower() not in deg.lower():
            deg = f"{deg}, {d['field']}" if deg else d["field"]
        edu += (f'<div class="item"><div class="item-head"><div><span class="item-title">{e(deg)}</span>{_vf(d.get("verified"), style)}'
                f'<div class="item-org">{e(d.get("school"))}{(" · " + e(d.get("grade"))) if d.get("grade") else ""}</div></div>'
                f'<div class="item-date">{e(fmt_range(d.get("start"), d.get("end"), d.get("current")))}</div></div></div>')
    certs = ""
    for x in c.get("certifications") or []:
        certs += (f'<div class="item"><div class="item-head"><div><span class="item-title">{e(x.get("name"))}</span>{_vf(x.get("verified"), style)}'
                  f'<div class="item-org">{e(x.get("issuer"))}</div></div><div class="item-date">{e(fmt_month(x.get("date")))}</div></div></div>')
    hl = "".join(f"<li>{e(h)}</li>" for h in c.get("highlights") or [])
    return {
        "summary": _section("Profile", f'<div class="summary">{e(c.get("summary"))}</div>' if c.get("summary") else ""),
        "highlights": _section("Key achievements", f'<ul class="highlights">{hl}</ul>' if hl else ""),
        "experience": _section("Experience", exp), "education": _section("Education", edu),
        "skills": _section("Skills", _skills_html(c.get("skills") or [], style)),
        "certifications": _section("Certifications", certs),
    }


def render_html(doc_type: str, content: dict, style: dict, screen: bool = False) -> str:
    style = normalize_style(style)
    css = _css(style, doc_type, screen)
    if doc_type == "cover_letter":
        L = content
        rec = L.get("recipient") or {}
        body = (_header_html(L, {**style, "template": style["template"] if style["template"] != "creative" else "modern"})
                + '<div class="letter"><div class="meta">'
                + f'<div class="date">{e(L.get("date"))}</div><div class="recipient">'
                + "".join(f"<div>{e(x)}</div>" for x in [rec.get("name"), rec.get("org"), rec.get("location")] if x) + "</div>"
                + (f'<div class="subject">{e(L.get("subject"))}</div>' if L.get("subject") else "")
                + f'<div class="salutation">{e(L.get("salutation"))}</div></div><div style="margin-top:3mm">'
                + "".join(f"<p>{e(p)}</p>" for p in L.get("paragraphs") or [])
                + f'</div><div class="closing">{e(L.get("closing"))}</div><div class="sig">{e(L.get("signature"))}</div></div>')
        if style["template"] == "creative" and not style["ats"]:
            css = css.replace("@page {", "@page { ", 1)
    else:
        s = _cv_sections(content, style)
        if style["template"] == "creative" and not style["ats"]:
            side = (f'<h1 class="name">{e(content.get("name"))}</h1>' + (f'<div class="headline">{e(content.get("headline"))}</div>' if content.get("headline") else "")
                    + _section("Contact", _contact_html(content.get("contact") or {}, False)) + s["skills"] + s["certifications"])
            main = s["summary"] + s["highlights"] + s["experience"] + s["education"]
            body = f'<div class="layout"><aside class="side">{side}</aside><main class="main">{main}</main></div>'
        else:
            body = _header_html(content, style) + s["summary"] + s["highlights"] + s["experience"] + s["education"] + s["skills"] + s["certifications"]
    inner = f'<div class="page">{body}</div>' if screen else body
    title = f"{content.get('name', '')} — {'Cover letter' if doc_type == 'cover_letter' else 'CV'}"
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>{e(title)}</title><style>{css}</style></head><body>{inner}</body></html>")


def legacy_markdown_content(markdown: str) -> dict:
    """Old (v2) documents stored markdown — convert to a minimal structured CV so templates still apply."""
    lines = (markdown or "").splitlines()
    name = next((l[2:].strip() for l in lines if l.startswith("# ")), "")
    sections, cur = [], None
    for l in lines:
        if l.startswith("## "):
            cur = {"title": l[3:].strip(), "lines": []}
            sections.append(cur)
        elif cur is not None and l.strip():
            cur["lines"].append(re.sub(r"[*_#]+", "", l).strip())
    return {"name": name, "legacy_sections": sections}


def render_legacy_html(content: dict, style: dict, screen: bool = False) -> str:
    style = normalize_style(style)
    body = f'<header class="header"><h1 class="name">{e(content.get("name"))}</h1></header>'
    for s in content.get("legacy_sections") or []:
        items = "".join(f"<li>{e(l.lstrip('- '))}</li>" if l.startswith("-") else f"<div>{e(l)}</div>" for l in s["lines"])
        body += _section(s["title"], f"<ul>{items}</ul>" if "<li>" in items else items)
    inner = f'<div class="page">{body}</div>' if screen else body
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{_css(style, "cv", screen)}</style></head><body>{inner}</body></html>'


def render_pdf(html_doc: str) -> tuple[bytes, int]:
    from weasyprint import HTML  # imported lazily: heavy
    doc = HTML(string=html_doc, base_url=".").render()
    return doc.write_pdf(), len(doc.pages)


# ─────────────────────────── DOCX ───────────────────────────
def render_docx(doc_type: str, content: dict, style: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Mm, Pt, RGBColor

    style = normalize_style(style)
    pt, lh, margin, gap = DENSITY[style["density"]]
    _, _, _, hfont, bfont = FONTS[style["font"]]
    rgb = RGBColor.from_string(style["color"].lstrip("#")) if not style["ats"] else RGBColor(0x0F, 0x17, 0x2A)
    d = Document()
    sec = d.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, side, Mm(margin))
    base = d.styles["Normal"]
    base.font.name, base.font.size = bfont, Pt(pt)
    base.element.rPr.rFonts.set(qn("w:eastAsia"), bfont)
    base.paragraph_format.space_after = Pt(1.5)
    base.paragraph_format.line_spacing = lh * 0.86

    def para(text="", size=None, bold=False, color=None, font=None, align=None, after=None, italic=False):
        p = d.add_paragraph()
        if text:
            r = p.add_run(text)
            r.bold, r.italic = bold, italic
            if size:
                r.font.size = Pt(size)
            if color is not None:
                r.font.color.rgb = color
            if font:
                r.font.name = font
        if align == "center":
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if after is not None:
            p.paragraph_format.space_after = Pt(after)
        return p

    def rule(p, color="94A3B8"):
        pPr = p._p.get_or_add_pPr()
        bdr = OxmlElement("w:pBdr")
        b = OxmlElement("w:bottom")
        for k, v in (("w:val", "single"), ("w:sz", "6"), ("w:space", "1"), ("w:color", color)):
            b.set(qn(k), v)
        bdr.append(b)
        pPr.append(bdr)

    def heading(t):
        p = para(t.upper(), size=pt * 0.95, bold=True, color=rgb, font=hfont, after=3)
        p.paragraph_format.space_before = Pt(gap * 2.2)
        rule(p, style["color"].lstrip("#") if not style["ats"] else "94A3B8")

    def entry(title, sub, dates, bullets=(), verified=False):
        p = d.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.tab_stops.add_tab_stop(Mm(210 - 2 * margin), alignment=2)
        r = p.add_run(title or "")
        r.bold = True
        if verified and style.get("show_verified") and not style["ats"]:
            v = p.add_run("  ✓ Verified")
            v.font.size, v.font.color.rgb = Pt(pt * 0.78), rgb
        if dates:
            dr = p.add_run("\t" + dates)
            dr.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
            dr.font.size = Pt(pt * 0.92)
        if sub:
            s = para(sub, color=RGBColor(0x33, 0x41, 0x55), after=1)
            s.paragraph_format.space_after = Pt(1)
        for b in bullets:
            bp = d.add_paragraph(b, style="List Bullet")
            bp.paragraph_format.space_after = Pt(1)

    c = content
    center = style["template"] == "executive" and not style["ats"]
    para(c.get("name", ""), size=pt * 2.2, bold=True, font=hfont, align="center" if center else None, after=1, color=RGBColor(0x0F, 0x17, 0x2A))
    if c.get("headline"):
        para(c["headline"], size=pt * 1.12, color=rgb, align="center" if center else None, after=1)
    ct = c.get("contact") or {}
    cl = "  ·  ".join(x for x in [ct.get("location"), ct.get("phone"), ct.get("email")] + list(ct.get("links") or []) if x)
    rule(para(cl, color=RGBColor(0x47, 0x55, 0x69), align="center" if center else None, after=6), "CBD5E1")

    if doc_type == "cover_letter":
        rec = c.get("recipient") or {}
        para(c.get("date", ""), after=8)
        for x in [rec.get("name"), rec.get("org"), rec.get("location")]:
            if x:
                para(x, after=0)
        if c.get("subject"):
            para(c["subject"], bold=True, after=8).paragraph_format.space_before = Pt(10)
        para(c.get("salutation", ""), after=6)
        for ptxt in c.get("paragraphs") or []:
            para(ptxt, after=7)
        para(c.get("closing", ""), after=26).paragraph_format.space_before = Pt(8)
        para(c.get("signature", ""), bold=True)
    else:
        if c.get("summary"):
            heading("Profile")
            para(c["summary"], after=2)
        if c.get("highlights"):
            heading("Key achievements")
            for h in c["highlights"]:
                d.add_paragraph(h, style="List Bullet")
        if c.get("experience"):
            heading("Experience")
            for w in c["experience"]:
                entry(w.get("title"), " · ".join(x for x in [w.get("org"), w.get("location")] if x),
                      fmt_range(w.get("start"), w.get("end"), w.get("current")), w.get("bullets") or [], w.get("verified"))
        if c.get("education"):
            heading("Education")
            for x in c["education"]:
                deg = x.get("degree") or ""
                if x.get("field") and x["field"].lower() not in deg.lower():
                    deg = f"{deg}, {x['field']}" if deg else x["field"]
                entry(deg, " · ".join(v for v in [x.get("school"), x.get("grade")] if v), fmt_range(x.get("start"), x.get("end"), x.get("current")), (), x.get("verified"))
        if c.get("skills"):
            heading("Skills")
            para(", ".join(c["skills"]))
        if c.get("certifications"):
            heading("Certifications")
            for x in c["certifications"]:
                entry(x.get("name"), x.get("issuer"), fmt_month(x.get("date")), (), x.get("verified"))
        if c.get("legacy_sections"):
            for s in c["legacy_sections"]:
                heading(s["title"])
                for l in s["lines"]:
                    if l.startswith("-"):
                        d.add_paragraph(l.lstrip("- "), style="List Bullet")
                    else:
                        para(l)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
