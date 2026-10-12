import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, engine
from app.routers import (
    auth_routes,
    certifications,
    documents,
    profile,
    skills,
    timeline,
    verification,
    organizations,
    jobs,
    candidates,
    opportunities,
)
from app.services.storage import ensure_dirs

settings = get_settings()
logger = logging.getLogger("crede")
logging.basicConfig(level=logging.INFO)


def _ensure_schema() -> None:
    """create_all + light migrations for Phase 2 columns."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT data_type, is_nullable FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'profiles'
                  AND column_name = 'collab_user_id'
                """
            )
        ).fetchone()
        if row:
            if row[0] in ("integer", "bigint", "smallint"):
                conn.execute(text("ALTER TABLE profiles ALTER COLUMN collab_user_id DROP DEFAULT"))
                conn.execute(
                    text(
                        "ALTER TABLE profiles ALTER COLUMN collab_user_id TYPE VARCHAR(64) USING collab_user_id::text"
                    )
                )
            if row[1] == "NO":
                conn.execute(text("ALTER TABLE profiles ALTER COLUMN collab_user_id DROP NOT NULL"))

        exists = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'external_id'
                """
            )
        ).fetchone()
        if not exists:
            conn.execute(text("ALTER TABLE profiles ADD COLUMN external_id VARCHAR(80)"))
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_profiles_external_id ON profiles (external_id)")
            )


def _wait_for_db(retries: int = 15, delay: float = 2.0) -> None:
    """Retry DB connect so Coolify/compose race does not crash-loop forever."""
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection OK (attempt %s)", attempt)
            return
        except Exception as e:
            last_err = e
            logger.warning(
                "Database not ready (attempt %s/%s): %s: %s",
                attempt,
                retries,
                type(e).__name__,
                e,
            )
            time.sleep(delay)
    raise RuntimeError(f"Could not connect to DATABASE_URL after {retries} attempts: {last_err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Crede API starting auth_mode=%s storage_root=%s",
        settings.auth_mode,
        settings.storage_root,
    )
    _wait_for_db()
    _ensure_schema()
    try:
        ensure_dirs()
        logger.info("Storage ready at %s", settings.storage_root)
    except Exception as e:
        logger.warning("Storage ensure_dirs failed (non-fatal): %s", e)
    yield
    logger.info("Crede API shutting down")


app = FastAPI(
    title="Crede API",
    description="Verified professional identity — Phase 1 + Phase 2. VPS storage, real CV files, opportunities.",
    version="2.1.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["https://crede.collab.name.ng"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(timeline.router, prefix="/api")
app.include_router(skills.router, prefix="/api")
app.include_router(certifications.router, prefix="/api")
app.include_router(verification.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(organizations.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(candidates.router, prefix="/api")
app.include_router(opportunities.router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.get("/health")
def health():
    db_ok = False
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_error = f"{type(e).__name__}: {e}"
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "crede-api",
        "phase": 2,
        "auth_mode": settings.auth_mode,
        "storage": "vps",
        "database": "ok" if db_ok else "error",
        "database_error": db_error,
    }
