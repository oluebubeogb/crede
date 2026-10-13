"""
Scan data/jobs_curation/ for xlsx/xls/csv and upsert into occupations table.

Header matching is flexible (case-insensitive synonyms). Any new file dropped
in the folder is picked up on import — no hardcoded filenames.
"""

from __future__ import annotations

import csv
import logging
import re
from pathlib import Path
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Occupation

logger = logging.getLogger("crede.occupations")

# Resolve relative to apps/api package root (parent of app/)
API_ROOT = Path(__file__).resolve().parents[2]
CURATION_DIR = API_ROOT / "data" / "jobs_curation"

TITLE_KEYS = {
    "title en", "title", "job title", "occupation", "role", "position",
    "job role", "occupation title", "preferred label", "label",
}
CODE_KEYS = {"isco 08 code", "isco code", "isco", "code", "onet code", "occupation code"}
LEVEL_KEYS = {"level", "skill level", "isco level"}
DEF_KEYS = {"definition", "description", "job description", "summary", "overview"}
TASK_KEYS = {
    "tasks include", "tasks", "responsibilities", "duties", "key responsibilities",
    "main tasks", "work activities",
}
ALIAS_KEYS = {
    "included occupations", "aliases", "also known as", "alternative titles",
    "alternate titles", "synonyms", "examples",
}
NOTES_KEYS = {"notes", "note", "comments"}
SKILL_KEYS = {"skills", "suggested skills", "competencies", "key skills"}


def _norm_header(h: Any) -> str:
    return re.sub(r"\s+", " ", str(h or "").strip().lower())


def _norm_title(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "").strip().lower())


def _pick(row: dict[str, Any], keys: set[str]) -> Optional[str]:
    for k, v in row.items():
        if _norm_header(k) in keys and v is not None and str(v).strip():
            return str(v).strip()
    return None


def _split_list(text: Optional[str]) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[\n;|]|(?:,\s*(?=[A-Z\-]))", text)
    # also split on " - " bullet-like for included occupations
    out: list[str] = []
    for p in parts:
        p = p.strip().lstrip("-•* ").strip()
        if p and len(p) < 200:
            out.append(p)
    return out[:40]


def _row_to_record(row: dict[str, Any], source_file: str) -> Optional[dict[str, Any]]:
    title = _pick(row, TITLE_KEYS)
    if not title:
        return None
    known = TITLE_KEYS | CODE_KEYS | LEVEL_KEYS | DEF_KEYS | TASK_KEYS | ALIAS_KEYS | NOTES_KEYS | SKILL_KEYS
    extra = {
        _norm_header(k): (None if v is None else str(v)[:2000])
        for k, v in row.items()
        if _norm_header(k) not in known and v is not None and str(v).strip()
    }
    aliases = _split_list(_pick(row, ALIAS_KEYS))
    skills = _split_list(_pick(row, SKILL_KEYS))
    return {
        "title": title[:255],
        "title_normalized": _norm_title(title)[:255],
        "isco_code": (_pick(row, CODE_KEYS) or "")[:32] or None,
        "level": (_pick(row, LEVEL_KEYS) or "")[:16] or None,
        "definition": _pick(row, DEF_KEYS),
        "tasks": _pick(row, TASK_KEYS),
        "aliases": aliases or None,
        "skills_suggested": skills or None,
        "extra": extra or None,
        "source_file": source_file[:255],
        "is_active": True,
    }


def _iter_xlsx(path: Path) -> Iterable[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    for sheet in wb.worksheets:
        rows = sheet.iter_rows(values_only=True)
        try:
            headers = next(rows)
        except StopIteration:
            continue
        headers = [str(h) if h is not None else f"col{i}" for i, h in enumerate(headers)]
        for row in rows:
            if not row or all(c is None or str(c).strip() == "" for c in row):
                continue
            yield dict(zip(headers, row))
    wb.close()


def _iter_csv(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield row


def discover_files(directory: Path | None = None) -> list[Path]:
    d = directory or CURATION_DIR
    if not d.is_dir():
        return []
    files: list[Path] = []
    for p in sorted(d.iterdir()):
        if p.name.startswith(".") or p.name.upper() == "README.MD":
            continue
        if p.suffix.lower() in (".xlsx", ".xls", ".csv"):
            files.append(p)
    return files


def import_file(db: Session, path: Path) -> int:
    if path.suffix.lower() in (".xlsx", ".xls"):
        rows = _iter_xlsx(path)
    elif path.suffix.lower() == ".csv":
        rows = _iter_csv(path)
    else:
        return 0

    count = 0
    for raw in rows:
        rec = _row_to_record(raw, path.name)
        if not rec:
            continue
        existing = (
            db.query(Occupation)
            .filter(
                Occupation.title_normalized == rec["title_normalized"],
                Occupation.isco_code == rec.get("isco_code"),
            )
            .first()
        )
        if not existing:
            existing = (
                db.query(Occupation)
                .filter(Occupation.title_normalized == rec["title_normalized"])
                .first()
            )
        if existing:
            for k, v in rec.items():
                setattr(existing, k, v)
        else:
            db.add(Occupation(**rec))
        count += 1
        if count % 200 == 0:
            db.flush()
    db.commit()
    logger.info("Imported %s rows from %s", count, path.name)
    return count


def import_all(db: Session, directory: Path | None = None) -> dict[str, Any]:
    files = discover_files(directory)
    results = {}
    total = 0
    for f in files:
        try:
            n = import_file(db, f)
            results[f.name] = n
            total += n
        except Exception as e:
            logger.exception("Failed to import %s", f)
            results[f.name] = f"error: {e}"
    return {"files": results, "total_rows": total, "folder": str(directory or CURATION_DIR)}
