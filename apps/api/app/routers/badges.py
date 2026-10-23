"""Badge checkout (Paystack | Monnify | simulated) and provider webhooks (signature-verified)."""
from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.config import get_settings
from app.database import get_db
from app.models import Profile
from app.models_suite import Payment
from app.services import badges, payments
from app.services.completion import badge_eligibility

logger = logging.getLogger("crede.badges")
router = APIRouter(tags=["badges"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]


class StartIn(BaseModel):
    level: str


@router.get("/badges")
def badge_info(profile: Prof):
    s = get_settings()
    return {"level": profile.badge_level or "none", "eligibility": badge_eligibility(profile), "provider": s.payment_provider,
            "prices": {"gray": s.badge_price_gray_ngn, "green": s.badge_price_green_ngn}, "currency": "NGN",
            "levels": [
                {"key": "gray", "name": "Gray badge", "desc": "Identity confirmed by Crede."},
                {"key": "green", "name": "Green badge", "desc": "Identity confirmed plus key claims verified by employers, schools or issuers."},
            ]}


@router.post("/badges/checkout")
def start_checkout(body: StartIn, request: Request, profile: Prof, db: DB):
    app_url = get_settings().app_url or str(request.base_url)
    return badges.start(db, profile, body.level, app_url)


@router.get("/badges/payments/{reference}")
def payment_status(reference: str, profile: Prof, db: DB):
    return badges.refresh_status(db, profile, reference)


@router.post("/badges/payments/{reference}/simulate")
def simulate(reference: str, profile: Prof, db: DB):
    """No provider keys configured: record the initiated payment and hand the request to admins."""
    return badges.simulate_confirm(db, profile, reference)


def _by_ref(db: Session, ref: str | None) -> Payment | None:
    return db.query(Payment).filter(Payment.reference == ref).first() if ref else None


@router.post("/payments/webhook/paystack")
async def paystack_webhook(request: Request, db: DB):
    raw = await request.body()
    if not payments.paystack_signature_ok(raw, request.headers.get("x-paystack-signature")):
        raise HTTPException(401, "Invalid signature")
    evt = json.loads(raw or b"{}")
    data = evt.get("data") or {}
    pay = _by_ref(db, data.get("reference"))
    if pay and evt.get("event") == "charge.success" and int(data.get("amount") or 0) >= pay.amount_kobo:
        badges.on_paid(db, pay, {"event": evt.get("event"), "id": data.get("id")})
    elif pay and evt.get("event") in ("charge.failed",):
        pay.status = "failed"
        db.commit()
    return {"ok": True}


@router.post("/payments/webhook/monnify")
async def monnify_webhook(request: Request, db: DB):
    raw = await request.body()
    if not payments.monnify_signature_ok(raw, request.headers.get("monnify-signature")):
        raise HTTPException(401, "Invalid signature")
    evt = json.loads(raw or b"{}")
    data = evt.get("eventData") or {}
    pay = _by_ref(db, data.get("paymentReference"))
    if pay and evt.get("eventType") == "SUCCESSFUL_TRANSACTION" and data.get("paymentStatus") == "PAID" \
            and float(data.get("amountPaid") or 0) * 100 >= pay.amount_kobo:
        badges.on_paid(db, pay, {"event": evt.get("eventType"), "transactionReference": data.get("transactionReference")})
    return {"ok": True}
