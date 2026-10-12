"""
VPS local disk storage for Crede.

Layout under STORAGE_ROOT (default /data/crede):
  verifications/{profile_id}/{kind}/{filename}
  certifications/{profile_id}/{filename}
  generated/{profile_id}/{doc_id}.pdf
  generated/{profile_id}/{doc_id}.docx
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO, Optional

from app.config import get_settings

settings = get_settings()


def _root() -> Path:
    root = Path(settings.storage_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def ensure_dirs() -> None:
    root = _root()
    for sub in ("verifications", "certifications", "generated"):
        (root / sub).mkdir(parents=True, exist_ok=True)


def save_bytes(relative_key: str, data: bytes) -> str:
    """Write bytes to STORAGE_ROOT/relative_key. Returns the relative key."""
    ensure_dirs()
    path = _root() / relative_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return relative_key


def save_upload(relative_dir: str, filename: str, fileobj: BinaryIO) -> str:
    """Save an uploaded file. Returns relative key."""
    ensure_dirs()
    safe_name = os.path.basename(filename).replace(" ", "_")
    if not safe_name:
        safe_name = f"upload_{uuid.uuid4().hex[:8]}"
    relative_key = f"{relative_dir.rstrip('/')}/{safe_name}"
    path = _root() / relative_key
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as out:
        shutil.copyfileobj(fileobj, out)
    return relative_key


def read_bytes(relative_key: str) -> bytes:
    path = _root() / relative_key
    if not path.is_file():
        raise FileNotFoundError(relative_key)
    return path.read_bytes()


def delete_file(relative_key: Optional[str]) -> None:
    if not relative_key:
        return
    path = _root() / relative_key
    if path.is_file():
        path.unlink()


def absolute_path(relative_key: str) -> Path:
    return _root() / relative_key


def exists(relative_key: Optional[str]) -> bool:
    if not relative_key:
        return False
    return (_root() / relative_key).is_file()
