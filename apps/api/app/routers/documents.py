from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import GeneratedDocument, Profile
from app.schemas import DocumentOut, GenerateCVRequest, GenerateCVResponse, MatchingInsights
from app.services.cv_generate import analyze_job_description, build_cv_snapshot, jd_hash, match_profile

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
    snapshot = build_cv_snapshot(profile, insights, body.template)
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
    # PDF/DOCX rendering can be queued; return insights + id for client preview
    return GenerateCVResponse(
        document_id=doc.id,
        title=doc.title,
        template=doc.template,
        matching=insights,
        preview_html=None,
        download_pdf_url=None,
        download_docx_url=None,
    )
