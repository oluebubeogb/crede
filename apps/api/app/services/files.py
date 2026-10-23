"""Evidence uploads (with text extraction for analysis) and compressed public images."""
from __future__ import annotations

import io
import logging
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import Profile
from app.models_suite import ProfileFile
from app.services.storage import save_bytes, save_public

logger = logging.getLogger("crede.files")
MAX_EVIDENCE = 8 * 1024 * 1024
MAX_IMAGE = 12 * 1024 * 1024
EVIDENCE_EXT = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "txt": "text/plain"}


def _ext(name: str) -> str:
    return (name or "").rsplit(".", 1)[-1].lower() if "." in (name or "") else ""


async def _read_limited(up: UploadFile, limit: int) -> bytes:
    data = await up.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is too large (max {limit // (1024 * 1024)} MB)")
    if not data:
        raise HTTPException(400, "Empty file")
    return data


def extract_text(data: bytes, ext: str) -> str | None:
    try:
        if ext == "pdf":
            from pypdf import PdfReader
            r = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in r.pages[:6])[:6000].strip() or None
        if ext == "docx":
            import docx
            d = docx.Document(io.BytesIO(data))
            return "\n".join(p.text for p in d.paragraphs)[:6000].strip() or None
        if ext == "txt":
            return data.decode("utf-8", "ignore")[:6000].strip() or None
    except Exception as e:  # noqa: BLE001
        logger.info("text extraction failed: %s", e)
    return None


async def save_evidence(db: Session, profile: Profile, up: UploadFile, kind: str = "evidence",
                        subject_type: str | None = None, subject_id: int | None = None) -> ProfileFile:
    ext = _ext(up.filename or "")
    if ext not in EVIDENCE_EXT:
        raise HTTPException(415, "Upload a PDF, image (JPG/PNG/WebP), DOCX or TXT")
    data = await _read_limited(up, MAX_EVIDENCE)
    if ext == "pdf" and not data.startswith(b"%PDF"):
        raise HTTPException(415, "That file is not a valid PDF")
    key = save_bytes(f"evidence/{profile.id}/{uuid.uuid4().hex[:12]}.{ext}", data)
    f = ProfileFile(profile_id=profile.id, storage_key=key, filename=(up.filename or f"file.{ext}")[:255], mime=EVIDENCE_EXT[ext],
                    size=len(data), kind=kind, subject_type=subject_type, subject_id=subject_id, text_excerpt=extract_text(data, ext))
    db.add(f)
    db.flush()
    return f


def compress_image(data: bytes, max_side: int = 1600, quality: int = 80) -> tuple[bytes, int, int]:
    from PIL import Image, ImageOps
    try:
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im)
    except Exception:
        raise HTTPException(415, "That file is not an image we can read")
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    im.thumbnail((max_side, max_side))
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, method=4)
    return out.getvalue(), im.width, im.height


async def save_image(profile: Profile, up: UploadFile, folder: str = "posts", max_side: int = 1600) -> dict:
    raw = await _read_limited(up, MAX_IMAGE)
    data, w, h = compress_image(raw, max_side)
    key = f"{folder}/{profile.id}/{uuid.uuid4().hex[:16]}.webp"
    save_public(key, data, "image/webp")
    from app.services.storage import public_url
    return {"key": key, "w": w, "h": h, "url": public_url(key), "size": len(data)}
