"""Crede v3 tables: orgs/claims, verification requests, badges & payments, notifications, mail outbox,
community, analysis caches. New columns on existing tables are added by main._try_schema()."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _ts():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class OrgClaim(Base):
    """Someone asks to manage an org on Crede. Domain check + platform admin approval (unless ORG_DOMAIN_AUTO_APPROVE)."""
    __tablename__ = "org_claims"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    method: Mapped[str] = mapped_column(String(16), default="domain")  # domain | manual
    work_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    code_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    code_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # pending_email | pending_admin | approved | rejected
    status: Mapped[str] = mapped_column(String(24), default="pending_email", index=True)
    admin_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by_profile_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class VerificationRequest(Base):
    """A claim (timeline entry or certification) sent to an approved org for issuer verification."""
    __tablename__ = "verification_requests"
    __table_args__ = (UniqueConstraint("subject_type", "subject_id", "organization_id", name="uq_vr_subject_org"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    subject_type: Mapped[str] = mapped_column(String(24))  # timeline | certification
    subject_id: Mapped[int] = mapped_column(Integer)
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|approved|rejected|cancelled
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by_profile_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class ProfileFile(Base):
    """Files a user uploaded as evidence (degree, certificate, ID, payslip...). Text is extracted for analysis."""
    __tablename__ = "profile_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(32), default="evidence")  # evidence|identity|cv
    subject_type: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    subject_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    text_excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()


class BadgeRequest(Base):
    __tablename__ = "badge_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    level: Mapped[str] = mapped_column(String(8))  # gray | green
    # awaiting_payment | pending_review | granted | rejected | revoked | cancelled
    status: Mapped[str] = mapped_column(String(24), default="awaiting_payment", index=True)
    payment_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    eligible_at_request: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by_profile_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))  # badge_gray | badge_green
    amount_kobo: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="NGN")
    provider: Mapped[str] = mapped_column(String(16))  # paystack | monnify | none
    reference: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # initiated | initiated_no_provider | paid | failed | abandoned
    status: Mapped[str] = mapped_column(String(24), default="initiated", index=True)
    checkout_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    provider_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_profile_unread", "profile_id", "read_at"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    actor_profile_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class EmailOutbox(Base):
    __tablename__ = "email_outbox"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    to_email: Mapped[str] = mapped_column(String(320), index=True)
    subject: Mapped[str] = mapped_column(String(300))
    html: Mapped[str] = mapped_column(Text)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    template: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|sent|failed|logged
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    images: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # [{key,w,h}]
    topics: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="text")  # text | document | job | repost
    document_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    repost_of_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    share_options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {show_contact: false}
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    share_count: Mapped[int] = mapped_column(Integer, default=0)
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Set only when the author edits text/topics (updated_at also moves on likes/comments/shares)
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Comment(Base):
    __tablename__ = "post_comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()


class PostReaction(Base):
    """like | save on posts; like on comments (target_type)."""
    __tablename__ = "post_reactions"
    __table_args__ = (UniqueConstraint("target_type", "target_id", "profile_id", "kind", name="uq_reaction"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_type: Mapped[str] = mapped_column(String(12), default="post")  # post | comment
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # like | save
    created_at: Mapped[datetime] = _ts()


class ContentReport(Base):
    __tablename__ = "content_reports"
    __table_args__ = (UniqueConstraint("target_type", "target_id", "reporter_profile_id", name="uq_report_once"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_type: Mapped[str] = mapped_column(String(12))  # post | comment
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    reporter_profile_id: Mapped[int] = mapped_column(Integer, index=True)
    reason: Mapped[str] = mapped_column(String(40), default="other")
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | actioned | dismissed
    created_at: Mapped[datetime] = _ts()


class JdParse(Base):
    """Parsed job description cache (by jd_hash)."""
    __tablename__ = "jd_parses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jd_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    parsed: Mapped[dict] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String(16), default="heuristic")  # ai | heuristic
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = _ts()


class MatchCache(Base):
    __tablename__ = "match_cache"
    __table_args__ = (UniqueConstraint("profile_id", "target_key", name="uq_match_cache"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    target_key: Mapped[str] = mapped_column(String(80))  # job:12 | jd:<hash>
    fingerprint: Mapped[str] = mapped_column(String(64))
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # None => insufficient data
    result: Mapped[dict] = mapped_column(JSONB)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProfileSnapshot(Base):
    """One row per profile per day, for the profile-strength-over-time chart."""
    __tablename__ = "profile_snapshots"
    __table_args__ = (UniqueConstraint("profile_id", "day", name="uq_profile_snapshot_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    completion: Mapped[int] = mapped_column(Integer, default=0)
    claims_total: Mapped[int] = mapped_column(Integer, default=0)
    claims_verified: Mapped[int] = mapped_column(Integer, default=0)
    claims_issuer: Mapped[int] = mapped_column(Integer, default=0)


class AppState(Base):
    """Tiny key/value store (e.g. Teams sync cursor)."""
    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
