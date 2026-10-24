import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, engine
from app import models_suite  # noqa: F401  (register v3 tables)
from app.routers import (
    auth_routes,
    imports,
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
    community,
    badges,
    notifications,
    admin,
)
from app.services.storage import ensure_dirs
from app.services.occupations_import import import_all as import_occupations
from app.services.skills_import import import_all as import_skills
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
        
            for col, ddl in [
                ("status", "ALTER TABLE generated_documents ADD COLUMN status VARCHAR(32) DEFAULT 'ready'"),
                ("target_job_title", "ALTER TABLE generated_documents ADD COLUMN target_job_title VARCHAR(255)"),
                ("target_organization", "ALTER TABLE generated_documents ADD COLUMN target_organization VARCHAR(255)"),
                ("error_message", "ALTER TABLE generated_documents ADD COLUMN error_message TEXT"),
                ("history_id", "ALTER TABLE generated_documents ADD COLUMN history_id INTEGER"),
            ]:
                has = conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_schema='public' AND table_name='generated_documents' AND column_name=:c"
                    ),
                    {"c": col},
                ).fetchone()
                if not has:
                    conn.execute(text(ddl))
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_generated_documents_history_id "
                        "ON generated_documents (history_id)"
                    )
                )
            except Exception:
                pass

            # Skills: date acquired / started
            has_skill_date = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='skills' AND column_name='acquired_at'"
                )
            ).fetchone()
            if not has_skill_date:
                conn.execute(text("ALTER TABLE skills ADD COLUMN acquired_at DATE"))

            # ── v3 columns (idempotent) ─────────────────────────────────────
            for ddl in [
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_level VARCHAR(8) DEFAULT 'none'",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_granted_at TIMESTAMPTZ",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS facts_version INTEGER DEFAULT 0",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(16) DEFAULT 'work'",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS organization_id INTEGER",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS field_of_study VARCHAR(255)",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS grade VARCHAR(64)",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS location VARCHAR(120)",
                "ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS document_key VARCHAR(512)",
                "ALTER TABLE certifications ADD COLUMN IF NOT EXISTS issuer_org_id INTEGER",
                "ALTER TABLE certifications ADD COLUMN IF NOT EXISTS credential_url VARCHAR(512)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_type VARCHAR(16) DEFAULT 'company'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS claim_status VARCHAR(16) DEFAULT 'unclaimed'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by_profile_id INTEGER",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'crede'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS teams_slug VARCHAR(120)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ",
                "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS profile_id INTEGER",
                "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'crede'",
                "ALTER TABLE organization_members ALTER COLUMN user_id DROP NOT NULL",
                "CREATE INDEX IF NOT EXISTS ix_timeline_entries_org ON timeline_entries (organization_id)",
                "CREATE INDEX IF NOT EXISTS ix_org_members_profile ON organization_members (profile_id)",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_org_member_profile ON organization_members (organization_id, profile_id) WHERE profile_id IS NOT NULL",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_org_source_external ON organizations (source, external_id) WHERE external_id IS NOT NULL",
                "CREATE INDEX IF NOT EXISTS ix_organizations_name_lower ON organizations (lower(name))",
                # Post "edited" flag no longer derived from updated_at (which moves on likes/comments)
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ",
            ]:
                conn.execute(text(ddl))
            # Legacy members (local User.id) → profile_id
            conn.execute(text(
                "UPDATE organization_members m SET profile_id = p.id FROM profiles p "
                "WHERE m.profile_id IS NULL AND m.user_id IS NOT NULL AND p.external_id = 'local:' || m.user_id::text"
            ))

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
                result = import_occupations(db)
                logger.info("Occupations import: %s", result)
                sresult = import_skills(db)
                logger.info("Skills catalog import: %s", sresult)
            finally:
                db.close()
        except Exception as e:
            logger.warning("Occupations import skipped: %s", e)

    tasks = []
    if ok:
        tasks.append(asyncio.create_task(_mail_loop()))
        tasks.append(asyncio.create_task(_teams_loop()))
    yield
    for t in tasks:
        t.cancel()
    logger.info("Crede API shutting down")


async def _mail_loop():
    """Drain the email outbox (SMTP or log-only) with retries. One tiny loop — no extra worker container."""
    from app.services.mailer import process_outbox
    await asyncio.sleep(5)
    while True:
        try:
            def _run():
                db = SessionLocal()
                try:
                    return process_outbox(db)
                finally:
                    db.close()
            await asyncio.to_thread(_run)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("mail loop: %s", e)
        await asyncio.sleep(max(5, settings.mail_worker_interval_seconds))


async def _teams_loop():
    from app.services.teams_sync import sync_all
    if not settings.teams_sync_enabled:
        logger.info("Teams sync disabled (set TEAMS_URL + SUITE_SYNC_TOKEN)")
        return
    await asyncio.sleep(20)
    while True:
        try:
            await asyncio.to_thread(sync_all)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("teams loop: %s", e)
        await asyncio.sleep(max(5, settings.teams_sync_interval_minutes) * 60)


app = FastAPI(
    title="Crede API",
    description="Verified professional identity — Phase 1 + Phase 2.",
    version="3.0.0",
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
app.include_router(community.public_router, prefix="/api")
app.include_router(community.router, prefix="/api")
app.include_router(badges.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(imports.router, prefix="/api")


@app.get("/api/media/{key:path}")
def media(key: str):
    """Public, compressed community/avatar images (local disk or S3)."""
    from fastapi import HTTPException
    from fastapi.responses import Response
    from app.services.storage import read_public
    if not key.startswith(("posts/", "avatars/")) or ".." in key:
        raise HTTPException(404, "Not found")
    try:
        data = read_public(key)
    except Exception:
        raise HTTPException(404, "Not found")
    return Response(data, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/config")
def public_config():
    s = get_settings()
    return {"payment_provider": s.payment_provider, "badge_prices": {"gray": s.badge_price_gray_ngn, "green": s.badge_price_green_ngn},
            "ai": _llm_ok(), "teams_url": s.teams_url or None, "max_image_mb": s.max_image_mb,
            "org_domain_auto_approve": s.org_domain_auto_approve}


def _llm_ok() -> bool:
    from app.services.llm import llm_available
    return llm_available()


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
        "available": _llm_ok(),
        "secondary": {"enabled": s.llm_secondary_enabled, "provider": s.llm_secondary_provider or None,
                      "model": s.llm_secondary_model or None, "base_url": s.llm_secondary_base_url or None},
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
    if not _llm_ok():
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
        "version": "3.0.0",
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
