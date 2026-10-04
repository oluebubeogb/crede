from fastapi import APIRouter, HTTPException, Response

from app.auth import LoginBody, accounts_login, clear_access_cookie, set_access_cookie
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(body: LoginBody, response: Response):
    """Same pattern as Collab Teams: proxy login to Accounts, set access_token cookie."""
    result, err = await accounts_login(body.email, body.password)
    if err:
        raise HTTPException(status_code=401, detail=err)
    token = result.get("access_token")
    user = result.get("user") or {}
    if not token:
        raise HTTPException(status_code=500, detail="Accounts returned incomplete response")
    set_access_cookie(response, token)
    refresh = result.get("refresh_token")
    if refresh:
        s = get_settings()
        kwargs = dict(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=s.cookie_secure,
            samesite=s.cookie_samesite,
            path="/",
            max_age=60 * 60 * 24 * 30,
        )
        if s.cookie_domain:
            kwargs["domain"] = s.cookie_domain
        response.set_cookie(**kwargs)
    return {
        "ok": True,
        "user": {
            "id": str(user.get("id")),
            "email": user.get("email"),
            "display_name": user.get("display_name"),
            "products": user.get("products") or [],
        },
    }


@router.post("/logout")
async def logout(response: Response):
    clear_access_cookie(response)
    return {"ok": True}
