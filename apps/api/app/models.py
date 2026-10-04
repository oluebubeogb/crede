"""
Crede Phase 1 domain models.

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


class Profile(Base):
    """One profile per Collab Accounts user (collab_user_id)."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    collab_user_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    headline: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    years_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_score: Mapped[int] = mapped_column(Integer, default=0)
    profile_completion: Mapped[int] = mapped_column(Integer, default=0)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
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
