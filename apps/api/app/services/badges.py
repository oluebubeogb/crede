"""Verification badges: none | gray (identity confirmed) | green (identity + key issuer-verified claims)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Profile
from app.models_suite import BadgeRequest, Payment
from app.services import payments
from app.services.completion import badge_eligibility
from app.services.notify import notify, notify_admins

LEVELS = ("gray", "green")
RANK = {"none": 0, "gray": 1, "green": 2}


def price(level: str) -> int:
    s = get_settings()
    return s.badge_price_green_ngn if level == "green" else s.badge_price_gray_ngn


def request_out(r: BadgeRequest, db: Session) -> dict:
    pay = db.get(Payment, r.payment_id) if r.payment_id else None
    p = db.get(Profile, r.profile_id)
    return {"id": r.id, "level": r.level, "status": r.status, "eligible_at_request": r.eligible_at_request, "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "decided_at": r.decided_at.isoformat() if r.decided_at else None,
            "payment": {"reference": pay.reference, "status": pay.status, "provider": pay.provider, "amount_ngn": pay.amount_kobo // 100,
                        "checkout_url": pay.checkout_url} if pay else None,
            "profile": {"id": p.id, "name": p.full_name, "email": p.email, "username": p.username, "badge_level": p.badge_level,
                        "identity_verified": bool(p.identity_verified)} if p else None,
            "eligibility_now": badge_eligibility(p)[r.level] if p else None}


def start(db: Session, profile: Profile, level: str, app_url: str) -> dict:
    if level not in LEVELS:
        raise HTTPException(400, "level must be gray or green")
    if RANK.get(profile.badge_level or "none", 0) >= RANK[level]:
        raise HTTPException(400, f"You already have the {profile.badge_level} badge")
    elig = badge_eligibility(profile)[level]
    if not elig["eligible"]:
        raise HTTPException(400, {"message": "Not eligible yet", "missing": elig["missing"]})
    open_req = db.query(BadgeRequest).filter(BadgeRequest.profile_id == profile.id, BadgeRequest.level == level,
                                             BadgeRequest.status.in_(("awaiting_payment", "pending_review"))).first()
    if open_req and open_req.status == "pending_review":
        raise HTTPException(400, "Your request is already with our team for review")
    pay = payments.initialize(db, profile, f"badge_{level}", price(level), f"Crede {level} verification badge",
                              f"{app_url.rstrip('/')}/badges/return")
    req = open_req or BadgeRequest(profile_id=profile.id, level=level)
    req.status, req.payment_id, req.eligible_at_request = "awaiting_payment", pay.id, True
    if not open_req:
        db.add(req)
    db.commit()
    db.refresh(req)
    return {"request": request_out(req, db), "provider": pay.provider, "reference": pay.reference, "checkout_url": pay.checkout_url,
            "amount_ngn": pay.amount_kobo // 100, "simulated": pay.provider == "none"}


def _to_review(db: Session, pay: Payment, simulated: bool) -> BadgeRequest | None:
    req = db.query(BadgeRequest).filter(BadgeRequest.payment_id == pay.id).first()
    if not req or req.status not in ("awaiting_payment",):
        return req
    req.status = "pending_review"
    if simulated:
        req.note = "Payment initiated (no provider configured)"
    db.commit()
    p = db.get(Profile, req.profile_id)
    label = "initiated (no provider configured)" if simulated else "paid"
    notify_admins(db, "badge_admin", f"Badge request: {p.full_name or p.email} ({req.level})",
                  f"Payment {label} · ref {pay.reference}", link="/admin?tab=badges", email_template="badge_admin",
                  email_ctx={"requester": p.full_name or p.email, "level": req.level, "payment_status": label, "provider": pay.provider,
                             "reference": pay.reference, "eligible": badge_eligibility(p)[req.level]["eligible"]})
    notify(db, p, "badge", "Badge request received", "We'll review it shortly.", link="/verification",
           email_template="badge_result", email_ctx={"status": "pending_review", "level": req.level})
    return req


def simulate_confirm(db: Session, profile: Profile, reference: str) -> dict:
    pay = db.query(Payment).filter(Payment.reference == reference, Payment.profile_id == profile.id).first()
    if not pay:
        raise HTTPException(404, "Checkout not found")
    if pay.provider != "none":
        raise HTTPException(400, "This checkout is handled by the payment provider")
    pay.provider_payload = {**(pay.provider_payload or {}), "simulated_confirm_at": datetime.now(timezone.utc).isoformat()}
    db.commit()
    req = _to_review(db, pay, simulated=True)
    return {"status": "initiated_no_provider", "request": request_out(req, db) if req else None,
            "message": "Payment initiated. No payment provider is configured yet, so our team has been notified to complete your badge."}


def on_paid(db: Session, pay: Payment, payload: dict | None = None) -> None:
    if payments.mark_paid(db, pay, payload):
        _to_review(db, pay, simulated=False)


def refresh_status(db: Session, profile: Profile, reference: str) -> dict:
    pay = db.query(Payment).filter(Payment.reference == reference, Payment.profile_id == profile.id).first()
    if not pay:
        raise HTTPException(404, "Payment not found")
    if pay.provider in ("paystack", "monnify") and pay.status == "initiated":
        st = payments.verify_remote(pay)
        if st == "paid":
            on_paid(db, pay, {"via": "verify"})
        elif st == "failed":
            pay.status = "failed"
            db.commit()
    req = db.query(BadgeRequest).filter(BadgeRequest.payment_id == pay.id).first()
    return {"reference": pay.reference, "status": pay.status, "provider": pay.provider, "amount_ngn": pay.amount_kobo // 100,
            "purpose": pay.purpose, "request": request_out(req, db) if req else None}


def decide(db: Session, admin: Profile, profile: Profile, action: str, level: str | None = None, note: str | None = None,
           request: BadgeRequest | None = None) -> Profile:
    now = datetime.now(timezone.utc)
    if action == "grant":
        lvl = level or (request.level if request else None)
        if lvl not in LEVELS:
            raise HTTPException(400, "level must be gray or green")
        profile.badge_level, profile.badge_granted_at = lvl, now
        if lvl in ("gray", "green") and not profile.identity_verified:
            profile.identity_verified = True  # granting implies the admin confirmed identity
        status = "granted"
    elif action == "revoke":
        profile.badge_level, profile.badge_granted_at = "none", None
        status = "revoked"
    elif action == "reject":
        status = "rejected"
    else:
        raise HTTPException(400, "action must be grant, revoke or reject")
    if request:
        request.status, request.note, request.decided_at, request.decided_by_profile_id = status, note or request.note, now, admin.id
    db.commit()
    notify(db, profile, "badge", {"granted": "Your badge is live", "revoked": "Your badge was removed",
                                  "rejected": "Badge request declined"}[status], note or "", link="/verification",
           actor_id=admin.id, email_template="badge_result", email_ctx={"status": status, "level": level or (request.level if request else ""), "note": note})
    db.refresh(profile)
    return profile
