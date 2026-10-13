#!/usr/bin/env python3
"""Thin wrapper — preferred entrypoint inside Docker: python -m app.seed_data"""
from app.seed_data import seed
from app.database import SessionLocal

if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
