from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.database import get_db
from app.models import Profile, VerificationItem
from app.schemas import VerificationOut
from app.services.completion import refresh_scores
from app.services.storage import save_upload, read_bytes, exists, delete_file

router = APIRouter(prefix="/verification", tags=["verification"])

KINDS = ("email", "phone", "degree", "certification", "employment", "organization")
POINTS = {
    "email": 10,
    "phone": 10,
    "degree": 20,
    "certification": 20,
    "employment": 30,
    "organization": 30,
}


@router.get("", response_model=list[VerificationOut])
def list_items(profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    existing = {v.kind for v in profile.verifications}
    for kind in KINDS:
        if kind not in existing:
            db.add(VerificationItem(profile_id=profile.id, kind=kind, status="pending", points=0))
    db.commit()
    db.refresh(profile)
    return profile.verifications


@router.post("/{kind}/submit", response_model=VerificationOut)
async def submit(
    kind: str,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if kind not in KINDS:
        raise HTTPException(400, "Invalid kind")
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == kind)
        .first()
    )
    if not item:
        item = VerificationItem(profile_id=profile.id, kind=kind)
        db.add(item)
    item.status = "submitted"
    item.notes = notes
    if file and file.filename:
        if item.document_key:
            delete_file(item.document_key)
        rel_dir = f"verifications/{profile.id}/{kind}"
        key = save_upload(rel_dir, file.filename, file.file)
        item.document_key = key
    db.commit()
    db.refresh(item)
    return item


@router.post("/{kind}/upload", response_model=VerificationOut)
async def upload(
    kind: str,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
):
    if kind not in KINDS:
        raise HTTPException(400, "Invalid kind")
    if not file.filename:
        raise HTTPException(400, "No file")
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == kind)
        .first()
    )
    if not item:
        item = VerificationItem(profile_id=profile.id, kind=kind)
        db.add(item)
    if item.document_key:
        delete_file(item.document_key)
    rel_dir = f"verifications/{profile.id}/{kind}"
    key = save_upload(rel_dir, file.filename, file.file)
    item.document_key = key
    item.status = "submitted"
    if notes:
        item.notes = notes
    db.commit()
    db.refresh(item)
    return item


@router.get("/files/{item_id}")
def download_own_file(
    item_id: int,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.id == item_id, VerificationItem.profile_id == profile.id)
        .first()
    )
    if not item or not item.document_key or not exists(item.document_key):
        raise HTTPException(404, "File not found")
    data = read_bytes(item.document_key)
    filename = item.document_key.split("/")[-1]
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/pending", response_model=list[VerificationOut])
def admin_pending(
    db: Annotated[Session, Depends(get_db)],
    profile: Annotated[Profile, Depends(get_or_create_profile)],
):
    items = (
        db.query(VerificationItem)
        .filter(VerificationItem.status == "submitted")
        .order_by(VerificationItem.created_at.desc())
        .limit(100)
        .all()
    )
    return items


@router.post("/admin/{item_id}/approve", response_model=VerificationOut)
def admin_approve(
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    profile: Annotated[Profile, Depends(get_or_create_profile)],
):
    item = db.query(VerificationItem).filter(VerificationItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    item.status = "approved"
    item.points = POINTS.get(item.kind, 0)
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    target = db.query(Profile).filter(Profile.id == item.profile_id).first()
    if target:
        refresh_scores(db, target)
    db.refresh(item)
    return item


@router.post("/admin/{item_id}/reject", response_model=VerificationOut)
def admin_reject(
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    notes: Optional[str] = Form(None),
):
    item = db.query(VerificationItem).filter(VerificationItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    item.status = "rejected"
    item.points = 0
    item.reviewed_at = datetime.now(timezone.utc)
    if notes:
        item.notes = notes
    db.commit()
    target = db.query(Profile).filter(Profile.id == item.profile_id).first()
    if target:
        refresh_scores(db, target)
    db.refresh(item)
    return item


@router.post("/{kind}/approve", response_model=VerificationOut)
def approve_self_stub(
    kind: str,
    profile: Annotated[Profile, Depends(get_or_create_profile)],
    db: Annotated[Session, Depends(get_db)],
):
    item = (
        db.query(VerificationItem)
        .filter(VerificationItem.profile_id == profile.id, VerificationItem.kind == kind)
        .first()
    )
    if not item:
        raise HTTPException(404, "Not found")
    item.status = "approved"
    item.points = POINTS.get(kind, 0)
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    refresh_scores(db, profile)
    db.refresh(item)
    return item
