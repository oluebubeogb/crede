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
    occupations,
)
from app.services.storage import ensure_dirs
from app.services.occupations_import import import_all
from app.database import SessionLocal

settings = get_settings()
logger = logging.getLogger("crede")
logging.basicConfig(level=logging.INFO)

# Set True only after a successful schema pass this process
_schema_ready = False
_db_last_error: str | None = None


def _try_schema() -> bool:
    """Attempt create_all + light migrations. Returns True on success."""
    global _schema_ready, _db_last_error
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
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
                            "ALTER TABLE profiles ALTER COLUMN collab_user_id TYPE VARCHAR(64) "
                            "USING collab_user_id::text"
                        )
                    )
                if row[1] == "NO":
                    conn.execute(text("ALTER TABLE profiles ALTER COLUMN collab_user_id DROP NOT NULL"))

            exists = conn.execute(
                text(
                    """
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'profiles'
                      AND column_name = 'external_id'
                    """
                )
            ).fetchone()
            if not exists:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN external_id VARCHAR(80)"))
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_profiles_external_id "
                        "ON profiles (external_id)"
                    )
                )
            # Phase 2 profile extras (phone / country / preferences)
            for col, ddl in [
                ("country", "ALTER TABLE profiles ADD COLUMN country VARCHAR(80)"),
                ("phone", "ALTER TABLE profiles ADD COLUMN phone VARCHAR(32)"),
                ("phone_country_code", "ALTER TABLE profiles ADD COLUMN phone_country_code VARCHAR(8)"),
                ("preferences", "ALTER TABLE profiles ADD COLUMN preferences JSONB"),
            ]:
                has = conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_schema='public' AND table_name='profiles' AND column_name=:c"
                    ),
                    {"c": col},
                ).fetchone()
                if not has:
                    conn.execute(text(ddl))
        _schema_ready = True
        _db_last_error = None
        logger.info("Database schema ready")
        return True
    except Exception as e:
        _schema_ready = False
        _db_last_error = f"{type(e).__name__}: {e}"
        logger.error("Database/schema failed: %s", _db_last_error)
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    NEVER raise here — Coolify treats process exit as restart loop → Cloudflare 502.
    Retry DB a few times, then stay up so /health answers.
    """
    logger.info(
        "Crede API starting auth_mode=%s storage_root=%s",
        settings.auth_mode,
        settings.storage_root,
    )
    ok = False
    for attempt in range(1, 8):
        if _try_schema():
            ok = True
            break
        logger.warning("DB not ready (attempt %s/7), retrying in 2s…", attempt)
        time.sleep(2)
    if not ok:
        logger.error(
            "Starting WITHOUT database. Fix DATABASE_URL and redeploy. Last error: %s",
            _db_last_error,
        )

    try:
        ensure_dirs()
        logger.info("Storage ready at %s", settings.storage_root)
    except Exception as e:
        logger.warning("Storage ensure_dirs failed (non-fatal): %s", e)

    if ok:
        try:
            db = SessionLocal()
            try:
                result = import_all(db)
                logger.info("Occupations import: %s", result)
            finally:
                db.close()
        except Exception as e:
            logger.warning("Occupations import skipped: %s", e)

    yield
    logger.info("Crede API shutting down")


app = FastAPI(
    title="Crede API",
    description="Verified professional identity — Phase 1 + Phase 2.",
    version="2.1.2",
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
app.include_router(occupations.router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )




@app.get("/api/debug/llm")
def debug_llm_config():
    """Inspect LLM configuration (no secrets). Use to verify Coolify env vars landed."""
    s = get_settings()
    return {
        "provider": s.llm_provider,
        "enabled": s.llm_enabled,
        "model": s.llm_model or None,
        "base_url": s.llm_base_url or None,
        "api_key_set": bool(s.llm_api_key),
        "api_key_prefix": (s.llm_api_key[:6] + "…") if s.llm_api_key and len(s.llm_api_key) > 6 else None,
        "timeout_seconds": s.llm_timeout_seconds,
        "max_tokens": s.llm_max_tokens,
        "legacy_openai_key_set": bool(s.openai_api_key),
        "hint": (
            "LLM is ready for live calls"
            if s.llm_enabled
            else "Set LLM_PROVIDER + LLM_API_KEY (or OPENAI_API_KEY) in Coolify and redeploy"
        ),
    }


@app.post("/api/debug/llm/test")
async def debug_llm_test():
    """
    Live ping: ask the configured model for a tiny JSON response.
    Confirms API key, base URL, and model work end-to-end.
    """
    from app.services.llm import chat_json, LLMError

    s = get_settings()
    if not s.llm_enabled:
        return {
            "ok": False,
            "error": "LLM disabled — set LLM_PROVIDER and LLM_API_KEY (or OPENAI_API_KEY)",
            "config": {
                "provider": s.llm_provider,
                "api_key_set": bool(s.llm_api_key),
                "model": s.llm_model,
            },
        }
    try:
        data = await chat_json(
            system='Return JSON only: {"ok": true, "echo": "crede"}',
            user="ping",
            temperature=0,
        )
        return {
            "ok": True,
            "provider": s.llm_provider,
            "model": s.llm_model,
            "response": data,
            "message": "LLM key and endpoint are working",
        }
    except LLMError as e:
        return {
            "ok": False,
            "provider": s.llm_provider,
            "model": s.llm_model,
            "base_url": s.llm_base_url or None,
            "error": str(e),
            "message": "LLM call failed — check key, base URL, model id, and provider billing",
        }
    except Exception as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "message": "Unexpected error calling LLM",
        }


@app.get("/health")
def health():
    db_ok = False
    db_error = _db_last_error
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
        if not _schema_ready:
            _try_schema()
    except Exception as e:
        db_error = f"{type(e).__name__}: {e}"
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "crede-api",
        "phase": 2,
        "version": "2.1.2",
        "auth_mode": settings.auth_mode,
        "storage": "vps",
        "database": "ok" if db_ok else "error",
        "schema_ready": _schema_ready,
        "database_error": db_error,
        "llm": {
            "provider": settings.llm_provider,
            "enabled": settings.llm_enabled,
            "model": settings.llm_model or None,
            "base_url_set": bool(settings.llm_base_url),
            "api_key_set": bool(settings.llm_api_key),
        },
    }
