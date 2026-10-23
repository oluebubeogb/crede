"""Payments for verification badges. Provider is picked by which env keys are set:
PAYSTACK_SECRET_KEY → Paystack; MONNIFY_API_KEY + MONNIFY_SECRET_KEY + MONNIFY_CONTRACT_CODE → Monnify; none → simulated checkout
(recorded as "initiated_no_provider" and escalated to admins, never marked paid)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Profile
from app.models_suite import Payment

logger = logging.getLogger("crede.payments")
PAYSTACK = "https://api.paystack.co"


def new_reference() -> str:
    return f"CRD-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(5).upper()}"


def _monnify_token(client: httpx.Client) -> str:
    s = get_settings()
    basic = base64.b64encode(f"{s.monnify_api_key}:{s.monnify_secret_key}".encode()).decode()
    r = client.post(f"{s.monnify_base_url.rstrip('/')}/api/v1/auth/login", headers={"Authorization": f"Basic {basic}"})
    r.raise_for_status()
    return r.json()["responseBody"]["accessToken"]


def initialize(db: Session, profile: Profile, purpose: str, amount_ngn: int, description: str, callback_url: str) -> Payment:
    s = get_settings()
    provider = s.payment_provider
    pay = Payment(profile_id=profile.id, purpose=purpose, amount_kobo=amount_ngn * 100, currency="NGN", provider=provider,
                  reference=new_reference(), status="initiated")
    try:
        with httpx.Client(timeout=20) as c:
            if provider == "paystack":
                r = c.post(f"{PAYSTACK}/transaction/initialize", headers={"Authorization": f"Bearer {s.paystack_secret_key}"},
                           json={"email": profile.email, "amount": pay.amount_kobo, "reference": pay.reference, "currency": "NGN",
                                 "callback_url": callback_url, "metadata": {"purpose": purpose, "profile_id": profile.id}})
                r.raise_for_status()
                body = r.json()
                pay.checkout_url = body["data"]["authorization_url"]
                pay.provider_payload = {"init": body.get("data")}
            elif provider == "monnify":
                tok = _monnify_token(c)
                r = c.post(f"{s.monnify_base_url.rstrip('/')}/api/v1/merchant/transactions/init-transaction",
                           headers={"Authorization": f"Bearer {tok}"},
                           json={"amount": amount_ngn, "customerName": profile.full_name or profile.email, "customerEmail": profile.email,
                                 "paymentReference": pay.reference, "paymentDescription": description, "currencyCode": "NGN",
                                 "contractCode": s.monnify_contract_code, "redirectUrl": callback_url,
                                 "paymentMethods": ["CARD", "ACCOUNT_TRANSFER", "USSD"]})
                r.raise_for_status()
                body = r.json()["responseBody"]
                pay.checkout_url = body["checkoutUrl"]
                pay.provider_payload = {"init": body, "transactionReference": body.get("transactionReference")}
            else:
                pay.status = "initiated_no_provider"
                pay.checkout_url = f"/badges/checkout/{pay.reference}"
    except httpx.HTTPError as e:
        logger.warning("payment init failed (%s): %s", provider, e)
        raise HTTPException(502, "The payment provider did not respond. Please try again in a moment.")
    db.add(pay)
    db.commit()
    db.refresh(pay)
    return pay


def verify_remote(pay: Payment) -> str:
    """Ask the provider for the latest status. Returns paid | failed | pending."""
    s = get_settings()
    try:
        with httpx.Client(timeout=20) as c:
            if pay.provider == "paystack" and s.paystack_secret_key:
                r = c.get(f"{PAYSTACK}/transaction/verify/{quote(pay.reference)}", headers={"Authorization": f"Bearer {s.paystack_secret_key}"})
                r.raise_for_status()
                d = r.json().get("data") or {}
                if d.get("status") == "success" and int(d.get("amount") or 0) >= pay.amount_kobo:
                    return "paid"
                return "failed" if d.get("status") in ("failed", "reversed") else "pending"
            if pay.provider == "monnify" and s.payment_provider == "monnify":
                tok = _monnify_token(c)
                r = c.get(f"{s.monnify_base_url.rstrip('/')}/api/v1/merchant/transactions/query",
                          params={"paymentReference": pay.reference}, headers={"Authorization": f"Bearer {tok}"})
                r.raise_for_status()
                d = r.json().get("responseBody") or {}
                if d.get("paymentStatus") == "PAID" and float(d.get("amountPaid") or 0) * 100 >= pay.amount_kobo:
                    return "paid"
                return "failed" if d.get("paymentStatus") in ("FAILED", "EXPIRED", "CANCELLED") else "pending"
    except httpx.HTTPError as e:
        logger.warning("payment verify failed: %s", e)
    return "pending"


def paystack_signature_ok(raw: bytes, signature: str | None) -> bool:
    key = get_settings().paystack_secret_key
    if not key or not signature:
        return False
    return hmac.compare_digest(hmac.new(key.encode(), raw, hashlib.sha512).hexdigest(), signature.strip().lower())


def monnify_signature_ok(raw: bytes, signature: str | None) -> bool:
    key = get_settings().monnify_secret_key
    if not key or not signature:
        return False
    return hmac.compare_digest(hmac.new(key.encode(), raw, hashlib.sha512).hexdigest(), signature.strip().lower())


def mark_paid(db: Session, pay: Payment, payload: dict | None = None) -> bool:
    """Idempotent. Returns True only on the first transition to paid."""
    if pay.status == "paid":
        return False
    pay.status, pay.paid_at = "paid", datetime.now(timezone.utc)
    pay.provider_payload = {**(pay.provider_payload or {}), "paid": payload or {}}
    db.commit()
    return True
