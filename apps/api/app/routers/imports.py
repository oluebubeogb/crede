"""Central career import: upload once (CV, LinkedIn export, notes…), review, apply everywhere."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.config import get_settings
from app.database import get_db
from app.models import Profile
from app.services import import_parse
from app.services.completion import refresh_scores

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/parse")
async def parse_file(file: Annotated[UploadFile, File()], profile: Annotated[Profile, Depends(get_or_create_profile)]):
    limit = max(1, get_settings().import_max_mb) * 1024 * 1024
    ext = import_parse.ext_of(file.filename or "")
    if ext not in import_parse.SUPPORTED:
        raise HTTPException(415, {"message": "Unsupported file type. Use PDF, DOCX, DOC, ODT, RTF, TXT, MD, CSV, XLSX, JSON or HTML.",
                                  "supported": sorted(import_parse.SUPPORTED)})
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, {"message": f"File is too large (max {limit // (1024 * 1024)} MB)"})
    if not data:
        raise HTTPException(400, {"message": "That file is empty"})
    try:
        text, rows = import_parse.extract(data, ext)
    except ValueError as e:
        raise HTTPException(422, {"message": str(e)})
    except Exception:  # noqa: BLE001
        raise HTTPException(422, {"message": "We couldn't read that file. Try another format (PDF, DOCX or TXT work best)."})
    del data  # parsed in memory only; nothing is stored
    raw = (import_parse.from_rows(rows) if rows else None) or await import_parse.ai_parse(text) or import_parse.heuristic(text)
    prop = import_parse.build_proposal(profile, raw)
    prop["source"] = {"filename": (file.filename or "")[:200], "type": ext, "chars": len(text), "parser": raw.get("parser", "heuristic")}
    if not any(prop[k] for k in ("work", "education", "skills", "certifications")) and not prop["headline"] and not prop["summary"]:
        prop["empty"] = True
    return prop


class ApplyIn(BaseModel):
    headline: str | None = None
    summary: str | None = None
    work: list[dict[str, Any]] = []
    education: list[dict[str, Any]] = []
    skills: list[Any] = []
    certifications: list[dict[str, Any]] = []


@router.post("/apply")
def apply_import(body: ApplyIn, profile: Annotated[Profile, Depends(get_or_create_profile)], db: Annotated[Session, Depends(get_db)]):
    if sum(len(x) for x in (body.work, body.education, body.skills, body.certifications)) > 200:
        raise HTTPException(400, {"message": "Too many items in one import"})
    done = import_parse.apply(db, profile, body.model_dump())
    refresh_scores(db, profile)
    return done
