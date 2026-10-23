from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.auth import (
    LoginBody,
    SignupBody,
    accounts_login,
    clear_access_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    set_access_cookie,
    verify_password,
    AuthUser,
)
from app.config import get_settings
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/signup")
async def signup(body: SignupBody, response: Response, db: Session = Depends(get_db)):
    """Local signup — creates User + returns session cookie. Used when AUTH_MODE=local."""
    if settings.auth_mode == "collab":
        raise HTTPException(status_code=400, detail="Signup is handled by Collab Accounts")
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role="professional",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(f"local:{user.id}", extra={"email": user.email, "role": user.role})
    set_access_cookie(response, token)
    return {
        "ok": True,
        "user": {
            "id": f"local:{user.id}",
            "email": user.email,
            "display_name": user.full_name,
            "role": user.role,
            "source": "local",
        },
    }


def _after_login() -> None:
    try:
        from app.services.teams_sync import maybe_sync_soon
        maybe_sync_soon()
    except Exception:  # noqa: BLE001
        pass


@router.post("/login")
async def login(body: LoginBody, response: Response, db: Session = Depends(get_db)):
    """
    Local login when AUTH_MODE=local|hybrid.
    Collab proxy when AUTH_MODE=collab|hybrid and local fails / not found.
    """
    email = body.email.lower()

    # Try local first
    if settings.auth_mode in ("local", "hybrid"):
        user = db.query(User).filter(User.email == email).first()
        if user and verify_password(body.password, user.password_hash):
            if not user.is_active:
                raise HTTPException(status_code=403, detail="Account disabled")
            token = create_access_token(f"local:{user.id}", extra={"email": user.email, "role": user.role})
            set_access_cookie(response, token)
            _after_login()
            return {
                "ok": True,
                "user": {
                    "id": f"local:{user.id}",
                    "email": user.email,
                    "display_name": user.full_name,
                    "role": user.role,
                    "source": "local",
                },
            }
        if settings.auth_mode == "local":
            raise HTTPException(status_code=401, detail="Invalid email or password")

    # Collab path
    if settings.auth_mode in ("collab", "hybrid"):
        result, err = await accounts_login(body.email, body.password)
        if err:
            raise HTTPException(status_code=401, detail=err)
        token = result.get("access_token")
        user_data = result.get("user") or {}
        if not token:
            raise HTTPException(status_code=500, detail="Accounts returned incomplete response")
        set_access_cookie(response, token)
        refresh = result.get("refresh_token")
        if refresh:
            kwargs = dict(
                key="refresh_token",
                value=refresh,
                httponly=True,
                secure=settings.cookie_secure,
                samesite=settings.cookie_samesite,
                path="/",
                max_age=60 * 60 * 24 * 30,
            )
            if settings.cookie_domain:
                kwargs["domain"] = settings.cookie_domain
            response.set_cookie(**kwargs)
        _after_login()
        return {
            "ok": True,
            "user": {
                "id": f"collab:{user_data.get('id')}",
                "email": user_data.get("email"),
                "display_name": user_data.get("display_name"),
                "products": user_data.get("products") or [],
                "source": "collab",
            },
        }

    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/logout")
async def logout(response: Response):
    clear_access_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(response: Response, auth: AuthUser = Depends(get_current_user)):
    """Return current user and slide the session cookie forward so active users stay signed in."""
    if auth.source == "local" and auth.id.startswith("local:"):
        token = create_access_token(
            auth.id,
            extra={"email": auth.email, "role": auth.role or "professional"},
        )
        set_access_cookie(response, token)
    return {
        "id": auth.id,
        "email": auth.email,
        "display_name": auth.full_name,
        "role": auth.role,
        "source": auth.source,
    }
