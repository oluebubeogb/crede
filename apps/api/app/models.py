"""
Crede domain models — Phase 1 + Phase 2.

Career Timeline is the source of truth.
Raw facts only — never store AI-generated text as canonical data.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VerificationLevel(str, enum.Enum):
    unverified = "unverified"  # 0
    email = "email"  # 10
    phone = "phone"  # 10
    certification = "certification"  # 20
    employment = "employment"  # 30
    organization = "organization"  # 30


VERIFICATION_POINTS = {
    VerificationLevel.email: 10,
    VerificationLevel.phone: 10,
    VerificationLevel.certification: 20,
    VerificationLevel.employment: 30,
    VerificationLevel.organization: 30,
}


# ─── Local auth (Phase 2 testing; Collab reintegration later) ────────────────

class User(Base):
    """Local Crede account. When AUTH_MODE=collab this table is unused."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="professional")  # professional|recruiter|admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    collab_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Profile(Base):
    """One profile per identity (local user or Collab user)."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # external_id = "local:123" or "collab:uuid"
    external_id: Mapped[Optional[str]] = mapped_column(String(80), unique=True, index=True, nullable=True)
    # legacy Collab key (kept for migration)
    collab_user_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    headline: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    phone_country_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)  # e.g. +234
    years_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_score: Mapped[int] = mapped_column(Integer, default=0)
    profile_completion: Mapped[int] = mapped_column(Integer, default=0)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    preferences: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # settings tabs
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    timeline_entries: Mapped[list["TimelineEntry"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan", order_by="desc(TimelineEntry.start_date)"
    )
    skills: Mapped[list["Skill"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    certifications: Mapped[list["Certification"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    verifications: Mapped[list["VerificationItem"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    documents: Mapped[list["GeneratedDocument"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class TimelineEntry(Base):
    """Career timeline entry — source of truth for CVs and matching."""

    __tablename__ = "timeline_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    job_title: Mapped[str] = mapped_column(String(255))
    organization: Mapped[str] = mapped_column(String(255))
    industry: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsibilities: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    achievements: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    projects: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    team_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    budget_managed: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="unverified")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    profile: Mapped["Profile"] = relationship(back_populates="timeline_entries")


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("profile_id", "name", name="uq_profile_skill"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(64), default="technical")  # technical|leadership|industry
    proficiency: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # beginner|intermediate|expert
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="skills")


class Certification(Base):
    __tablename__ = "certifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    issuer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    issued_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expires_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    credential_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    document_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="certifications")


class VerificationItem(Base):
    """Trust center items: email, phone, degree, certification, employment, organization."""

    __tablename__ = "verification_items"
    __table_args__ = (UniqueConstraint("profile_id", "kind", name="uq_profile_verification_kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(64))  # email|phone|degree|certification|employment|organization
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|submitted|approved|rejected
    document_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="verifications")


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    doc_type: Mapped[str] = mapped_column(String(32))  # cv|cover_letter|bio
    template: Mapped[str] = mapped_column(String(64), default="professional")
    job_description_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    matching_insights: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    storage_key_pdf: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    storage_key_docx: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="documents")


# ─── Phase 2: Organizations, Jobs, Matching ─────────────────────────────────

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cac_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="unverified")  # unverified|pending|verified
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # local User.id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    members: Mapped[list["OrganizationMember"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["Job"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # local User.id
    role: Mapped[str] = mapped_column(String(32), default="recruiter")  # owner|admin|recruiter
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="members")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    department: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # full_time|part_time|contract
    salary_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str] = mapped_column(String(8), default="NGN")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requirements: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    experience_years_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft|open|closed|archived
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="jobs")
    matches: Mapped[list["JobMatch"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobMatch(Base):
    """AI / rule-based match between a job and a professional profile."""

    __tablename__ = "job_matches"
    __table_args__ = (UniqueConstraint("job_id", "profile_id", name="uq_job_profile_match"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    experience_score: Mapped[float] = mapped_column(Float, default=0.0)
    skill_score: Mapped[float] = mapped_column(Float, default=0.0)
    certification_score: Mapped[float] = mapped_column(Float, default=0.0)
    location_score: Mapped[float] = mapped_column(Float, default=0.0)
    verification_bonus: Mapped[float] = mapped_column(Float, default=0.0)
    insights: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="suggested")  # suggested|saved|contacted|applied
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["Job"] = relationship(back_populates="matches")
    profile: Mapped["Profile"] = relationship()


class SavedCandidate(Base):
    __tablename__ = "saved_candidates"
    __table_args__ = (UniqueConstraint("organization_id", "profile_id", name="uq_org_saved_profile"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    saved_by_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
