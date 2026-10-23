"""Documents: background generate, paginated list, bulk delete, edit draft."""

from __future__ import annotations

import logging
import re
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import SessionLocal, get_db
from app.models import GeneratedDocument, GenerationHistory, Profile
from app.schemas import DocumentOut, GenerateCVRequest, GenerateCVResponse, MatchingInsights
from app.services.cv_generate import generate_content, jd_hash
from app.services import doc_engine
from app.services import jd_parse as jdp
from app.services import matcher
from app.services.storage import delete_file, read_bytes, exists, save_bytes

logger = logging.getLogger("crede.documents")
router = APIRouter(tags=["documents"])


# ─── helpers ────────────────────────────────────────────────────────────────

def _strip_md_markers(s: str) -> str:
    """Remove common markdown/heading markers so titles aren't '# Role' or '* Company'."""
    if not s:
        return s
    s = s.strip()
    # Leading heading / list markers: # ## ###, *, -, •, numbered lists
    s = re.sub(r"^[\s#*_•\-]+", "", s)
    s = re.sub(r"^\d+[\.\)]\s*", "", s)
    # Trailing emphasis
    s = re.sub(r"[\s*_#]+$", "", s)
    # Inline bold/italic leftovers around whole phrase
    s = re.sub(r"^\*{1,2}(.+?)\*{1,2}$", r"\1", s)
    s = re.sub(r"^_{1,2}(.+?)_{1,2}$", r"\1", s)
    # Collapse internal runs of # or * used as decoration
    s = re.sub(r"[#*]{2,}", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _extract_job_meta(jd: str) -> tuple[Optional[str], Optional[str]]:
    """Best-effort job title + organization from a pasted JD (markdown-aware)."""
    text = (jd or "").strip()
    title = None
    org = None
    patterns_title = [
        r"(?i)(?:job\s*title|position|role|vacancy)\s*[:\-]\s*(.+)",
        r"(?i)^#{1,6}\s*(.+)$",  # markdown heading as title candidate
        r"(?i)^title\s*[:\-]\s*(.+)",
    ]
    patterns_org = [
        r"(?i)(?:company|organization|organisation|employer)\s*[:\-]\s*(.+)",
        r"(?i)^(?:at|@)\s+([A-Z][\w\s&.-]{2,60})",
    ]
    for pat in patterns_title:
        m = re.search(pat, text, re.M)
        if m:
            candidate = _strip_md_markers(m.group(1).strip().split("\n")[0])[:120]
            # Skip pure marker noise or very short leftovers
            if candidate and len(candidate) >= 3 and not re.match(r"^[\W_]+$", candidate):
                title = candidate
                break
    if not title:
        m = re.search(r"(?i)\b(?:hiring|looking for|seeking|recruiting)\s+(?:an?\s+)?([A-Z][\w/&()\- ]{3,70}?)(?:\s+(?:to|who|in|at|for|with)\b|[.,\n])", text)
        if m:
            title = m.group(1).strip()[:120]
    if not title:
        # "Senior Backend Engineer at Moniepoint, Lagos." as the opening sentence
        first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        m = re.match(r"^([A-Z][\w/&()\- ]{2,70}?)\s+(?:at|@|-|–|—|\|)\s+([A-Z][\w&.\- ]{1,60}?)(?:\s*[,.(|]|\s+in\s|$)", _strip_md_markers(first))
        if m and len(m.group(1).split()) <= 8:
            title = m.group(1).strip()
            org = org or m.group(2).strip()
    if not title:
        # only the very first line, and only if it looks like a title (not a bullet/requirement/heading)
        first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        line = _strip_md_markers(first)
        low = line.lower()
        if (3 <= len(line) <= 80 and len(line.split()) <= 10 and not re.match(r"^\s*([-*•]|\d+[.)])", first)
                and not line.endswith(":") and not re.search(r"\d+\s*\+?\s*(years?|yrs)", low)
                and not low.startswith(("we ", "we're", "about", "the ", "responsibilities", "requirements", "qualifications", "our "))):
            title = line[:120]
    for pat in ([] if org else patterns_org):
        m = re.search(pat, text, re.M)
        if m:
            candidate = _strip_md_markers(m.group(1).strip().split("\n")[0])[:120]
            if candidate and len(candidate) >= 2:
                org = candidate
                break
    return title, org


def _doc_title(doc_type: str, job_title: Optional[str], name: Optional[str]) -> str:
    kind = {"cv": "CV", "cover_letter": "Cover letter", "bio": "Bio"}.get(doc_type, doc_type.upper())
    parts = [kind]
    if job_title:
        parts.append(job_title)
    elif name:
        parts.append(name)
    return " — ".join(parts)[:255]


def _safe_filename(*parts: str) -> str:
    raw = " - ".join(p for p in parts if p)
    raw = re.sub(r"[^\w\s\-+.]", "", raw)
    raw = re.sub(r"\s+", " ", raw).strip() or "crede-document"
    return raw[:120]


def _doc_out(doc: GeneratedDocument) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "template": doc.template,
        "created_at": doc.created_at,
        "storage_key_pdf": doc.storage_key_pdf,
        "storage_key_docx": doc.storage_key_docx,
        "status": getattr(doc, "status", None) or "ready",
        "target_job_title": getattr(doc, "target_job_title", None),
        "target_organization": getattr(doc, "target_organization", None),
        "error_message": getattr(doc, "error_message", None),
    }


def _content_of(doc: GeneratedDocument) -> tuple[dict, bool]:
    snap = doc.content_snapshot or {}
    if snap.get("v") == 3 and isinstance(snap.get("content"), dict):
        return snap["content"], False
    return doc_engine.legacy_markdown_content(snap.get("markdown") or ""), True


def _html_for(doc: GeneratedDocument, style: dict, screen: bool) -> str:
    content, legacy = _content_of(doc)
    if legacy:
        return doc_engine.render_legacy_html(content, style, screen)
    return doc_engine.render_html(doc.doc_type, content, style, screen)


def render_and_store(db: Session, doc: GeneratedDocument) -> None:
    """Render saved content + style to PDF and DOCX on disk (no AI)."""
    snap = dict(doc.content_snapshot or {})
    style = doc_engine.normalize_style(snap.get("style"), doc.template)
    content, legacy = _content_of(doc)
    pdf, pages = doc_engine.render_pdf(_html_for(doc, style, False))
    docx = doc_engine.render_docx(doc.doc_type if not legacy else "cv", content, style)
    doc.storage_key_pdf = save_bytes(f"generated/{doc.profile_id}/{doc.id}.pdf", pdf)
    doc.storage_key_docx = save_bytes(f"generated/{doc.profile_id}/{doc.id}.docx", docx)
    snap["style"], snap["pages"] = style, pages
    snap["checks"] = doc_engine.checks(doc.doc_type, content, pages) if not legacy else []
    doc.template = style["template"]
    doc.content_snapshot = snap
    db.commit()


async def analyze_jd(db: Session, profile: Profile, jd: str, use_ai: bool = True) -> dict:
    """Parse once (cached by jd_hash) and run the unified matcher."""
    job_title, org = _extract_job_meta(jd)
    h, parsed = await jdp.parse(db, jd, title=job_title or "", use_ai=use_ai)
    result = matcher.match_cached(db, profile, f"jd:{h[:40]}", parsed, h)
    reqs = result.get("requirements") or []
    return {
        **result, "jd_hash": h,
        "parsed": {k: parsed.get(k) for k in ("title", "seniority", "years_min", "skills", "tools", "education", "certifications", "location", "source")},
        "strengths": [r["text"] for r in reqs if r["status"] == "met"][:8],
        "gaps": [r["text"] for r in reqs if r["status"] == "missing"][:8],
    }


async def _run_generate_job(doc_id: int, profile_id: int, jd: str, doc_type: str, template: str) -> None:
    """Background worker — own DB session; not bound to request lifetime."""
    db = SessionLocal()
    try:
        doc = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if not doc or not profile:
            return
        doc.status = "processing"
        db.commit()
        _ = profile.timeline_entries, profile.skills, profile.certifications
        try:
            analysis = await analyze_jd(db, profile, jd)
        except Exception as e:  # noqa: BLE001
            logger.warning("analysis during generate failed: %s", e)
            analysis = {}
        h = analysis.get("jd_hash")
        parsed = jdp.cached(db, h) if h else None
        if doc.history_id and analysis:
            hist = db.query(GenerationHistory).filter(GenerationHistory.id == doc.history_id).first()
            if hist:
                hist.analysis = analysis
        if doc_type == "bio":
            from app.services.cv_generate import generate_document_markdown
            snapshot = await generate_document_markdown(profile, jd, "bio", template)
        else:
            snapshot = await generate_content(profile, jd, doc_type, parsed, analysis, doc.target_job_title, doc.target_organization)
        snapshot["style"] = doc_engine.normalize_style({"template": template}, template)
        doc.title = _doc_title(doc_type, doc.target_job_title, profile.full_name or profile.email)
        doc.matching_insights = {"score": analysis.get("score"), "label": analysis.get("label"), "counts": analysis.get("counts"),
                                 "missing": analysis.get("gaps"), "strengths": analysis.get("strengths")}
        doc.content_snapshot = snapshot
        db.commit()
        try:
            render_and_store(db, doc)
        except Exception as e:  # noqa: BLE001
            logger.warning("File render failed for doc %s: %s", doc_id, e)
        doc.status = "ready"
        doc.error_message = None
        db.commit()
    except Exception as e:
        logger.exception("Background generate failed doc_id=%s", doc_id)
        try:
            db.rollback()
            doc = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


# ─── schemas ────────────────────────────────────────────────────────────────

class DocumentDetail(BaseModel):
    id: int
    title: str
    doc_type: str
    template: str
    created_at: object
    storage_key_pdf: Optional[str] = None
    storage_key_docx: Optional[str] = None
    status: str = "ready"
    target_job_title: Optional[str] = None
    target_organization: Optional[str] = None
    error_message: Optional[str] = None
    content_snapshot: Optional[dict] = None
    matching_insights: Optional[dict] = None
    markdown: Optional[str] = None
    style: Optional[dict] = None
    pages: Optional[int] = None
    checks: list = []
    content: Optional[dict] = None
    legacy: bool = False
    history_id: Optional[int] = None


class DocumentUpdate(BaseModel):
    markdown: Optional[str] = None
    content: Optional[dict] = None
    title: Optional[str] = None


class StyleIn(BaseModel):
    template: Optional[str] = None
    color: Optional[str] = None
    font: Optional[str] = None
    density: Optional[str] = None
    ats: Optional[bool] = None
    show_verified: Optional[bool] = None


class AnalysisIn(BaseModel):
    job_description: str = Field(..., min_length=20, max_length=30000)
    save: bool = True


class DocumentListOut(BaseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int
    pages: int


class BulkDeleteIn(BaseModel):
    ids: list[int] = Field(..., min_length=1)



class GenerateAccepted(BaseModel):
    document_id: int
    title: str
    status: str
    message: str
    poll_url: str
    history_id: Optional[int] = None


class AnalysisPayload(BaseModel):
    score: Optional[int] = None
    strengths: list[str] = []
    gaps: list[str] = []


class HistoryCreate(BaseModel):
    job_description: str = Field(..., min_length=20)
    analysis: Optional[AnalysisPayload] = None


class HistoryOut(BaseModel):
    id: int
    title: str
    organization: Optional[str] = None
    job_description_excerpt: str
    analysis: Optional[dict] = None
    created_at: object
    updated_at: object
    document_count: int = 0
    has_cv: bool = False
    has_cover_letter: bool = False


class HistoryDetail(BaseModel):
    id: int
    title: str
    organization: Optional[str] = None
    job_description: str
    analysis: Optional[dict] = None
    created_at: object
    updated_at: object
    documents: list[dict] = []


def _history_out(h: GenerationHistory, docs: list | None = None) -> dict:
    docs = docs if docs is not None else (h.documents or [])
    excerpt = (h.job_description or "")[:180].replace("\n", " ").strip()
    if len(h.job_description or "") > 180:
        excerpt += "…"
    return {
        "id": h.id,
        "title": h.title,
        "organization": h.organization,
        "job_description_excerpt": excerpt,
        "analysis": h.analysis,
        "created_at": h.created_at,
        "updated_at": h.updated_at,
        "document_count": len(docs),
        "has_cv": any(d.doc_type == "cv" for d in docs),
        "has_cover_letter": any(d.doc_type == "cover_letter" for d in docs),
    }


def _get_or_create_history(
    db: Session,
    profile: Profile,
    job_description: str,
    analysis: Optional[dict] = None,
) -> GenerationHistory:
    """Find existing history by JD hash for this profile, or create a new one."""
    hsh = jd_hash(job_description)
    existing = (
        db.query(GenerationHistory)
        .filter(
            GenerationHistory.profile_id == profile.id,
            GenerationHistory.job_description_hash == hsh,
        )
        .order_by(GenerationHistory.created_at.desc())
        .first()
    )
    job_title, org = _extract_job_meta(job_description)
    if job_title:
        title = job_title
    elif job_description.strip():
        first = _strip_md_markers(job_description.strip().splitlines()[0])[:80]
        title = first if first else "Untitled JD"
    else:
        title = "Untitled JD"
    if existing:
        if analysis is not None:
            existing.analysis = analysis
        existing.job_description = job_description
        existing.title = title
        existing.organization = org
        if analysis is not None:
            existing.analysis = analysis
        db.commit()
        db.refresh(existing)
        return existing
    hist = GenerationHistory(
        profile_id=profile.id,
        job_description=job_description,
        job_description_hash=hsh,
        title=title,
        organization=org,
        analysis=analysis,
    )
    db.add(hist)
    db.commit()
    db.refresh(hist)
    return hist


# ─── routes ─────────────────────────────────────────────────────────────────

@router.get("/documents")
def list_documents(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    doc_type: Optional[str] = None,
):
    q = db.query(GeneratedDocument).filter(GeneratedDocument.profile_id == profile.id)
    if doc_type:
        q = q.filter(GeneratedDocument.doc_type == doc_type)
    total = q.count()
    rows = (
        q.order_by(GeneratedDocument.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": [_doc_out(d) for d in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.get("/documents/style-options")
def get_style_options():
    return doc_engine.style_options()


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
def get_document(
    doc_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Not found")
    snap = doc.content_snapshot or {}
    base = _doc_out(doc)
    return DocumentDetail(
        **base,
        content_snapshot=snap,
        matching_insights=doc.matching_insights,
        markdown=snap.get("markdown"),
        style=doc_engine.normalize_style(snap.get("style"), doc.template),
        pages=snap.get("pages"),
        checks=snap.get("checks") or [],
        content=snap.get("content") if snap.get("v") == 3 else None,
        legacy=snap.get("v") != 3,
        history_id=getattr(doc, "history_id", None),
    )


@router.patch("/documents/{doc_id}", response_model=DocumentDetail)
def update_document(
    doc_id: int,
    body: DocumentUpdate,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Not found")
    if (doc.status or "") in ("pending", "processing"):
        raise HTTPException(409, "Document is still generating")
    snap = dict(doc.content_snapshot or {})
    if body.content is not None and snap.get("v") == 3:
        # user edits structured content directly (still rendered by the template engine)
        merged = dict(snap.get("content") or {})
        for k, v in body.content.items():
            if k in ("name", "headline", "summary", "highlights", "experience", "education", "skills", "certifications",
                     "contact", "paragraphs", "salutation", "subject", "recipient", "closing", "signature", "date"):
                merged[k] = v
        snap["content"] = merged
    elif body.markdown is not None:
        snap["markdown"] = body.markdown
    snap["user_edited"] = True
    doc.content_snapshot = snap
    if body.title:
        doc.title = body.title[:255]
    db.commit()
    db.refresh(doc)
    try:
        render_and_store(db, doc)
    except Exception as e:  # noqa: BLE001
        logger.warning("re-render failed: %s", e)
    return get_document(doc_id, profile, db)


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Not found")
    delete_file(doc.storage_key_pdf)
    delete_file(doc.storage_key_docx)
    db.delete(doc)
    db.commit()


@router.post("/documents/bulk-delete")
def bulk_delete(
    body: BulkDeleteIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(GeneratedDocument)
        .filter(
            GeneratedDocument.profile_id == profile.id,
            GeneratedDocument.id.in_(body.ids),
        )
        .all()
    )
    n = 0
    for doc in rows:
        delete_file(doc.storage_key_pdf)
        delete_file(doc.storage_key_docx)
        db.delete(doc)
        n += 1
    db.commit()
    return {"deleted": n}


@router.post("/generate", response_model=GenerateAccepted)
async def generate_cv(
    body: GenerateCVRequest,
    background_tasks: BackgroundTasks,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Accept generation and run LLM in the background.
    Auto-saves the JD into GenerationHistory and links the document.
    Pass history_id to attach to an existing history entry (e.g. from History detail).
    Client should poll GET /api/documents/{id} until status is ready|failed.
    """
    if not profile.timeline_entries and body.doc_type != "bio":
        raise HTTPException(400, "Add at least one career timeline entry before generating")

    history: Optional[GenerationHistory] = None
    jd = (body.job_description or "").strip()

    if body.history_id:
        history = (
            db.query(GenerationHistory)
            .filter(
                GenerationHistory.id == body.history_id,
                GenerationHistory.profile_id == profile.id,
            )
            .first()
        )
        if not history:
            raise HTTPException(404, "History entry not found")
        # Prefer explicit JD from body; otherwise use the saved one
        if not jd:
            jd = history.job_description or ""
        elif jd and jd != history.job_description:
            # Keep history JD as source of truth when mapping from history page
            # but allow regenerate with same content
            pass

    if len(jd) < 20:
        raise HTTPException(400, "Job description is required (paste one or open a history entry)")

    job_title, org = _extract_job_meta(jd)
    title = _doc_title(body.doc_type or "cv", job_title, profile.full_name or profile.email)

    analysis = None
    if history:
        # Refresh analysis / meta on the existing entry
        if not history.analysis:
            history.analysis = analysis
        if job_title:
            history.title = job_title
        if org:
            history.organization = org
        db.commit()
        db.refresh(history)
    else:
        history = _get_or_create_history(db, profile, jd, analysis=analysis)

    doc = GeneratedDocument(
        profile_id=profile.id,
        history_id=history.id,
        title=title,
        doc_type=body.doc_type or "cv",
        template=body.template or "professional",
        job_description_hash=jd_hash(jd),
        status="pending",
        target_job_title=job_title,
        target_organization=org,
        content_snapshot={"status": "pending", "job_description_preview": jd[:500]},
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(
        _run_generate_job,
        doc.id,
        profile.id,
        jd,
        body.doc_type or "cv",
        body.template or "professional",
    )

    return GenerateAccepted(
        document_id=doc.id,
        title=doc.title,
        status="pending",
        message="Generation started. Poll the document until status is ready.",
        poll_url=f"/api/documents/{doc.id}",
        history_id=history.id,
    )


@router.get("/documents/{doc_id}/download.pdf")
def download_pdf(
    doc_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    if (not doc.storage_key_pdf or not exists(doc.storage_key_pdf)) and doc.status == "ready":
        render_and_store(db, doc)
    if not doc.storage_key_pdf or not exists(doc.storage_key_pdf):
        raise HTTPException(404, "PDF not found — still generating or failed")
    data = read_bytes(doc.storage_key_pdf)
    fname = _safe_filename(
        doc.doc_type.upper() if doc.doc_type else "CV",
        doc.target_job_title or "",
        profile.full_name or "",
    ) + ".pdf"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/documents/{doc_id}/download.docx")
def download_docx(
    doc_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    if (not doc.storage_key_docx or not exists(doc.storage_key_docx)) and doc.status == "ready":
        render_and_store(db, doc)
    if not doc.storage_key_docx or not exists(doc.storage_key_docx):
        raise HTTPException(404, "DOCX not found — still generating or failed")
    data = read_bytes(doc.storage_key_docx)
    fname = _safe_filename(
        doc.doc_type.upper() if doc.doc_type else "CV",
        doc.target_job_title or "",
        profile.full_name or "",
    ) + ".docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )



# ─── Generation History ──────────────────────────────────────────────────────

@router.post("/history", response_model=HistoryDetail)
async def create_or_update_history(
    body: HistoryCreate,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Save (or update by JD hash) a job-description processing session.
    Called when the user analyzes a JD or before generation.
    """
    analysis = await analyze_jd(db, profile, body.job_description)
    hist = _get_or_create_history(db, profile, body.job_description, analysis=analysis)
    docs = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.history_id == hist.id, GeneratedDocument.profile_id == profile.id)
        .order_by(GeneratedDocument.created_at.desc())
        .all()
    )
    return HistoryDetail(
        id=hist.id,
        title=hist.title,
        organization=hist.organization,
        job_description=hist.job_description,
        analysis=hist.analysis,
        created_at=hist.created_at,
        updated_at=hist.updated_at,
        documents=[_doc_out(d) for d in docs],
    )


@router.post("/history/{history_id}/analyze", response_model=HistoryDetail)
async def analyze_history(
    history_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """Recompute and save match analysis for an existing history entry."""
    hist = (
        db.query(GenerationHistory)
        .filter(GenerationHistory.id == history_id, GenerationHistory.profile_id == profile.id)
        .first()
    )
    if not hist:
        raise HTTPException(404, "History entry not found")
    hist.analysis = await analyze_jd(db, profile, hist.job_description or "")
    job_title, org = _extract_job_meta(hist.job_description or "")
    if job_title:
        hist.title = job_title
    if org:
        hist.organization = org
    db.commit()
    db.refresh(hist)
    docs = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.history_id == hist.id, GeneratedDocument.profile_id == profile.id)
        .order_by(GeneratedDocument.created_at.desc())
        .all()
    )
    return HistoryDetail(
        id=hist.id,
        title=hist.title,
        organization=hist.organization,
        job_description=hist.job_description,
        analysis=hist.analysis,
        created_at=hist.created_at,
        updated_at=hist.updated_at,
        documents=[_doc_out(d) for d in docs],
    )


@router.get("/history")
def list_history(
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    q = db.query(GenerationHistory).filter(GenerationHistory.profile_id == profile.id)
    total = q.count()
    items = (
        q.order_by(GenerationHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    out = []
    for h in items:
        docs = (
            db.query(GeneratedDocument)
            .filter(GeneratedDocument.history_id == h.id)
            .all()
        )
        out.append(_history_out(h, docs))
    pages = max(1, (total + page_size - 1) // page_size)
    return {"items": out, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.get("/history/{history_id}", response_model=HistoryDetail)
def get_history(
    history_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    hist = (
        db.query(GenerationHistory)
        .filter(GenerationHistory.id == history_id, GenerationHistory.profile_id == profile.id)
        .first()
    )
    if not hist:
        raise HTTPException(404, "History entry not found")
    docs = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.history_id == hist.id, GeneratedDocument.profile_id == profile.id)
        .order_by(GeneratedDocument.created_at.desc())
        .all()
    )
    return HistoryDetail(
        id=hist.id,
        title=hist.title,
        organization=hist.organization,
        job_description=hist.job_description,
        analysis=hist.analysis,
        created_at=hist.created_at,
        updated_at=hist.updated_at,
        documents=[_doc_out(d) for d in docs],
    )


@router.delete("/history/{history_id}")
def delete_history(
    history_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Delete a history entry and all associated generated documents + stored files.
    Client should trigger downloads before calling this.
    """
    hist = (
        db.query(GenerationHistory)
        .filter(GenerationHistory.id == history_id, GenerationHistory.profile_id == profile.id)
        .first()
    )
    if not hist:
        raise HTTPException(404, "History entry not found")
    docs = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.history_id == hist.id, GeneratedDocument.profile_id == profile.id)
        .all()
    )
    for doc in docs:
        if doc.storage_key_pdf:
            try:
                delete_file(doc.storage_key_pdf)
            except Exception:
                pass
        if doc.storage_key_docx:
            try:
                delete_file(doc.storage_key_docx)
            except Exception:
                pass
        db.delete(doc)
    db.delete(hist)
    db.commit()
    return {"ok": True, "deleted_documents": len(docs)}


# ─── v3: analysis, style step, live preview ─────────────────────────────────

@router.post("/analysis")
async def run_analysis(
    body: AnalysisIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """Parse the JD once (AI or heuristic, cached) and match it against the profile. Saves to history."""
    result = await analyze_jd(db, profile, body.job_description)
    hist_id = None
    if body.save:
        hist = _get_or_create_history(db, profile, body.job_description, analysis=result)
        hist_id = hist.id
    return {**result, "history_id": hist_id}


def _owned_doc(db: Session, profile: Profile, doc_id: int) -> GeneratedDocument:
    doc = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id).first()
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.get("/documents/{doc_id}/preview", response_class=HTMLResponse)
def preview_document(
    doc_id: int,
    request: Request,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    """Live preview HTML. Query params (template, color, font, density, ats) override the saved style without saving."""
    doc = _owned_doc(db, profile, doc_id)
    saved = (doc.content_snapshot or {}).get("style") or {}
    q = request.query_params
    override = {k: q.get(k) for k in ("template", "color", "font", "density") if q.get(k)}
    for k in ("ats", "show_verified"):
        if q.get(k) is not None:
            override[k] = q.get(k) in ("1", "true", "yes")
    style = doc_engine.normalize_style({**saved, **override}, doc.template)
    if override.get("template") and not any(k in override for k in ("color", "font", "density")) and q.get("keep") != "1":
        style = doc_engine.normalize_style({"template": override["template"], "ats": style["ats"], "show_verified": style["show_verified"]})
    return HTMLResponse(_html_for(doc, style, True), headers={"Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN"})


@router.post("/documents/{doc_id}/style")
def save_document_style(
    doc_id: int,
    body: StyleIn,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    doc = _owned_doc(db, profile, doc_id)
    if (doc.status or "") in ("pending", "processing"):
        raise HTTPException(409, "Document is still generating")
    snap = dict(doc.content_snapshot or {})
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch.get("color") and not doc_engine.HEX.match(patch["color"]):
        raise HTTPException(422, "Colour must be a hex value like #2563EB")
    snap["style"] = doc_engine.normalize_style({**(snap.get("style") or {}), **patch}, doc.template)
    doc.content_snapshot = snap
    db.commit()
    render_and_store(db, doc)
    db.refresh(doc)
    return get_document(doc_id, profile, db)
