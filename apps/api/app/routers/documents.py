"""Documents: background generate, paginated list, bulk delete, edit draft."""

from __future__ import annotations

import logging
import re
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import SessionLocal, get_db
from app.models import GeneratedDocument, Profile
from app.schemas import DocumentOut, GenerateCVRequest, GenerateCVResponse, MatchingInsights
from app.services.cv_generate import generate_document_markdown, jd_hash
from app.services.cv_render import write_generated_files
from app.services.storage import delete_file, read_bytes, exists

logger = logging.getLogger("crede.documents")
router = APIRouter(tags=["documents"])


# ─── helpers ────────────────────────────────────────────────────────────────

def _extract_job_meta(jd: str) -> tuple[Optional[str], Optional[str]]:
    """Best-effort job title + organization from a pasted JD."""
    text = (jd or "").strip()
    title = None
    org = None
    patterns_title = [
        r"(?i)(?:job\s*title|position|role|vacancy)\s*[:\-]\s*(.+)",
        r"(?i)^title\s*[:\-]\s*(.+)",
    ]
    patterns_org = [
        r"(?i)(?:company|organization|organisation|employer)\s*[:\-]\s*(.+)",
        r"(?i)^(?:at|@)\s+([A-Z][\w\s&.-]{2,60})",
    ]
    for pat in patterns_title:
        m = re.search(pat, text, re.M)
        if m:
            title = m.group(1).strip().split("\n")[0][:120]
            break
    if not title:
        # first non-empty line if short enough
        for line in text.splitlines():
            line = line.strip()
            if 8 <= len(line) <= 80 and not line.lower().startswith(("we are", "about", "the ")):
                title = line[:120]
                break
    for pat in patterns_org:
        m = re.search(pat, text, re.M)
        if m:
            org = m.group(1).strip().split("\n")[0][:120]
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

        # Ensure relationships loaded
        _ = profile.timeline_entries
        _ = profile.skills
        _ = profile.certifications

        snapshot = await generate_document_markdown(profile, jd, doc_type=doc_type, template=template)
        insights = snapshot.get("matching") or {}
        job_title = doc.target_job_title
        name = profile.full_name or profile.email
        doc.title = _doc_title(doc_type, job_title, name)
        doc.matching_insights = insights
        doc.content_snapshot = snapshot
        doc.status = "ready"
        doc.error_message = None
        db.commit()
        db.refresh(doc)

        try:
            pdf_key, docx_key = write_generated_files(profile.id, doc.id, snapshot, template)
            doc.storage_key_pdf = pdf_key
            doc.storage_key_docx = docx_key
            db.commit()
        except Exception as e:
            logger.warning("File render failed for doc %s: %s", doc_id, e)
    except Exception as e:
        logger.exception("Background generate failed doc_id=%s", doc_id)
        try:
            doc = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = str(e)[:500]
                # still store a heuristic snapshot if possible
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


class DocumentUpdate(BaseModel):
    markdown: str = Field(..., min_length=1)
    title: Optional[str] = None


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
    snap["markdown"] = body.markdown
    snap["user_edited"] = True
    doc.content_snapshot = snap
    if body.title:
        doc.title = body.title[:255]
    db.commit()
    db.refresh(doc)
    try:
        pdf_key, docx_key = write_generated_files(
            profile.id, doc.id, snap, doc.template or "professional"
        )
        doc.storage_key_pdf = pdf_key
        doc.storage_key_docx = docx_key
        db.commit()
        db.refresh(doc)
    except Exception:
        pass
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
    Client should poll GET /api/documents/{id} until status is ready|failed.
    """
    if not profile.timeline_entries and body.doc_type != "bio":
        raise HTTPException(400, "Add at least one career timeline entry before generating")

    job_title, org = _extract_job_meta(body.job_description)
    # Allow client override via optional future fields; for now extract from JD
    title = _doc_title(body.doc_type or "cv", job_title, profile.full_name or profile.email)

    doc = GeneratedDocument(
        profile_id=profile.id,
        title=title,
        doc_type=body.doc_type or "cv",
        template=body.template or "professional",
        job_description_hash=jd_hash(body.job_description),
        status="pending",
        target_job_title=job_title,
        target_organization=org,
        content_snapshot={"status": "pending", "job_description_preview": body.job_description[:500]},
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(
        _run_generate_job,
        doc.id,
        profile.id,
        body.job_description,
        body.doc_type or "cv",
        body.template or "professional",
    )

    return GenerateAccepted(
        document_id=doc.id,
        title=doc.title,
        status="pending",
        message="Generation started. Poll the document until status is ready.",
        poll_url=f"/api/documents/{doc.id}",
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
    if not doc or not doc.storage_key_pdf or not exists(doc.storage_key_pdf):
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
    if not doc or not doc.storage_key_docx or not exists(doc.storage_key_docx):
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
