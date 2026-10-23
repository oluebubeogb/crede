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


def _safe(relative_key: str) -> Path:
    """Resolve a key under STORAGE_ROOT, refusing path traversal."""
    root = _root().resolve()
    path = (root / relative_key).resolve()
    if root != path and root not in path.parents:
        raise ValueError("invalid storage key")
    return path


def save_bytes(relative_key: str, data: bytes) -> str:
    """Write bytes to STORAGE_ROOT/relative_key. Returns the relative key."""
    ensure_dirs()
    path = _safe(relative_key)
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
    path = _safe(relative_key)
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


# ── Public media (community images). Local disk by default; S3-compatible optional ──
import datetime as _dt
import hashlib as _hl
import hmac as _hmac
from urllib.parse import quote as _quote

import httpx as _httpx


def _s3_on() -> bool:
    return settings.storage_backend.lower() == "s3" and bool(settings.s3_endpoint_url and settings.s3_bucket and settings.s3_access_key)


def _s3_request(method: str, key: str, data: bytes = b"", content_type: str = "application/octet-stream"):
    """Minimal AWS SigV4 (path-style) — enough for PUT/GET/DELETE on R2, B2, MinIO, AWS."""
    endpoint = settings.s3_endpoint_url.rstrip("/")
    host = endpoint.split("://", 1)[-1]
    region = settings.s3_region or "us-east-1"
    now = _dt.datetime.utcnow()
    amz_date, datestamp = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    canonical_uri = "/" + _quote(settings.s3_bucket) + "/" + _quote(key)
    payload_hash = _hl.sha256(data).hexdigest()
    headers = {"host": host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    if method == "PUT":
        headers["content-type"] = content_type
    signed = ";".join(sorted(headers))
    canonical = "\n".join([method, canonical_uri, "", "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), signed, payload_hash])
    scope = f"{datestamp}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, _hl.sha256(canonical.encode()).hexdigest()])

    def _h(k, m):
        return _hmac.new(k, m.encode(), _hl.sha256).digest()
    k = _h(_h(_h(_h(("AWS4" + settings.s3_secret_key).encode(), datestamp), region), "s3"), "aws4_request")
    sig = _hmac.new(k, to_sign.encode(), _hl.sha256).hexdigest()
    headers["Authorization"] = f"AWS4-HMAC-SHA256 Credential={settings.s3_access_key}/{scope}, SignedHeaders={signed}, Signature={sig}"
    r = _httpx.request(method, endpoint + canonical_uri, headers=headers, content=data or None, timeout=30)
    if r.status_code >= 300 and not (method == "DELETE" and r.status_code == 404):
        raise RuntimeError(f"S3 {method} {r.status_code}: {r.text[:200]}")
    return r


def save_public(key: str, data: bytes, content_type: str = "image/webp") -> str:
    if _s3_on():
        _s3_request("PUT", key, data, content_type)
        return key
    return save_bytes(key, data)


def read_public(key: str) -> bytes:
    if _s3_on():
        return _s3_request("GET", key).content
    return read_bytes(key)


def delete_public(key: Optional[str]) -> None:
    if not key:
        return
    try:
        if _s3_on():
            _s3_request("DELETE", key)
        else:
            delete_file(key)
    except Exception:
        pass


def public_url(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if _s3_on() and settings.s3_public_base_url:
        return settings.s3_public_base_url.rstrip("/") + "/" + key
    return "/backend/api/media/" + key
