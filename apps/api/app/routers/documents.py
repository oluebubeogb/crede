from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import GeneratedDocument, Profile
from app.schemas import DocumentOut, GenerateCVRequest, GenerateCVResponse, MatchingInsights
from app.services.cv_generate import analyze_job_description, jd_hash, match_profile, tailor_cv_to_job
from app.services.cv_render import write_generated_files
from app.services.storage import delete_file, read_bytes, exists

router = APIRouter(tags=["documents"])


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(profile: Annotated[Profile, Depends(get_or_create_profile)]):
    return profile.documents


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
    if not profile.timeline_entries:
        raise HTTPException(400, "Add at least one career timeline entry before generating a CV")
    insights = await analyze_job_description(body.job_description)
    insights = match_profile(profile, insights)
    # Tailor wording to this JD (LLM) — never written back to timeline
    snapshot = await tailor_cv_to_job(
        profile, insights, body.job_description, body.template
    )
    snapshot["email"] = profile.email
    title = f"{body.doc_type.upper()} — {profile.headline or profile.full_name or 'Profile'}"
    doc = GeneratedDocument(
        profile_id=profile.id,
        title=title[:255],
        doc_type=body.doc_type,
        template=body.template,
        job_description_hash=jd_hash(body.job_description),
        matching_insights=insights.model_dump(),
        content_snapshot=snapshot,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Write real PDF + DOCX to VPS disk
    try:
        pdf_key, docx_key = write_generated_files(
            profile.id, doc.id, snapshot, body.template
        )
        doc.storage_key_pdf = pdf_key
        doc.storage_key_docx = docx_key
        db.commit()
        db.refresh(doc)
    except Exception as e:
        # Generation still succeeds with snapshot; files optional
        pass

    return GenerateCVResponse(
        document_id=doc.id,
        title=doc.title,
        template=doc.template,
        matching=insights,
        preview_html=None,
        download_pdf_url=f"/api/documents/{doc.id}/download.pdf" if doc.storage_key_pdf else None,
        download_docx_url=f"/api/documents/{doc.id}/download.docx" if doc.storage_key_docx else None,
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
