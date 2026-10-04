from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, engine
from app.routers import auth_routes, certifications, documents, profile, skills, timeline, verification

settings = get_settings()


def _ensure_schema() -> None:
    """create_all does not alter existing columns — force UUID-safe collab_user_id."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT data_type FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'profiles'
                  AND column_name = 'collab_user_id'
                """
            )
        ).fetchone()
        if row and row[0] in ("integer", "bigint", "smallint"):
            conn.execute(text("ALTER TABLE profiles ALTER COLUMN collab_user_id DROP DEFAULT"))
            conn.execute(
                text(
                    "ALTER TABLE profiles ALTER COLUMN collab_user_id TYPE VARCHAR(64) USING collab_user_id::text"
                )
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_schema()
    yield


app = FastAPI(
    title="Crede API",
    description="Verified professional identity — Phase 1. Auth via Collab Accounts SSO (Teams pattern).",
    version="1.0.1",
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


@app.get("/health")
def health():
    return {"status": "ok", "service": "crede-api", "phase": 1}
