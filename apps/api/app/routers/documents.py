from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import GeneratedDocument, Profile
from app.schemas import DocumentOut, GenerateCVRequest, GenerateCVResponse, MatchingInsights
from app.services.cv_generate import generate_document_markdown, jd_hash
from app.services.cv_render import write_generated_files
from app.services.storage import delete_file, read_bytes, exists

router = APIRouter(tags=["documents"])


class DocumentDetail(DocumentOut):
    content_snapshot: Optional[dict] = None
    matching_insights: Optional[dict] = None
    markdown: Optional[str] = None


class DocumentUpdate(BaseModel):
    markdown: str = Field(..., min_length=1)
    title: Optional[str] = None


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile.documents


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
    return DocumentDetail(
        id=doc.id,
        title=doc.title,
        doc_type=doc.doc_type,
        template=doc.template,
        created_at=doc.created_at,
        storage_key_pdf=doc.storage_key_pdf,
        storage_key_docx=doc.storage_key_docx,
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
    """Edit markdown draft in-browser; re-render PDF/DOCX without calling the LLM."""
    doc = (
        db.query(GeneratedDocument)
        .filter(GeneratedDocument.id == doc_id, GeneratedDocument.profile_id == profile.id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Not found")
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


@router.post("/generate", response_model=GenerateCVResponse)
async def generate_cv(
    body: GenerateCVRequest,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    if not profile.timeline_entries and body.doc_type != "bio":
        raise HTTPException(400, "Add at least one career timeline entry before generating")

    snapshot = await generate_document_markdown(
        profile,
        body.job_description,
        doc_type=body.doc_type or "cv",
        template=body.template or "professional",
    )
    insights = MatchingInsights(**(snapshot.get("matching") or {}))
    title = f"{(body.doc_type or 'cv').upper()} — {profile.headline or profile.full_name or 'Profile'}"
    doc = GeneratedDocument(
        profile_id=profile.id,
        title=title[:255],
        doc_type=body.doc_type or "cv",
        template=body.template or "professional",
        job_description_hash=jd_hash(body.job_description),
        matching_insights=insights.model_dump(),
        content_snapshot=snapshot,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        pdf_key, docx_key = write_generated_files(
            profile.id, doc.id, snapshot, body.template or "professional"
        )
        doc.storage_key_pdf = pdf_key
        doc.storage_key_docx = docx_key
        db.commit()
        db.refresh(doc)
    except Exception:
        pass

    return GenerateCVResponse(
        document_id=doc.id,
        title=doc.title,
        template=doc.template,
        matching=insights,
        preview_html=None,
        download_pdf_url=f"/api/documents/{doc.id}/download.pdf" if doc.storage_key_pdf else None,
        download_docx_url=f"/api/documents/{doc.id}/download.docx" if doc.storage_key_docx else None,
        tailored=bool(snapshot.get("tailored")),
        tailor_mode=snapshot.get("tailor_mode"),
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
        raise HTTPException(404, "PDF not found")
    data = read_bytes(doc.storage_key_pdf)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="crede-{doc_id}.pdf"'},
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
        raise HTTPException(404, "DOCX not found")
    data = read_bytes(doc.storage_key_docx)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="crede-{doc_id}.docx"'},
    )
