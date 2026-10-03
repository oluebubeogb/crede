from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    headline: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    years_experience: Optional[int] = None
    summary: Optional[str] = None
    is_public: Optional[bool] = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    collab_user_id: int
    email: str
    full_name: Optional[str] = None
    username: Optional[str] = None
    headline: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    years_experience: Optional[int] = None
    summary: Optional[str] = None
    onboarding_completed: bool
    verification_score: int
    profile_completion: int
    is_public: bool
    created_at: datetime


class TimelineEntryIn(BaseModel):
    job_title: str
    organization: str
    industry: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    is_current: bool = False
    description: Optional[str] = None
    responsibilities: Optional[list[str]] = None
    achievements: Optional[list[str]] = None
    projects: Optional[list[str]] = None
    team_size: Optional[int] = None
    budget_managed: Optional[str] = None


class TimelineEntryOut(TimelineEntryIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verification_status: str
    created_at: datetime


class SkillIn(BaseModel):
    name: str
    category: str = "technical"
    proficiency: Optional[str] = None


class SkillOut(SkillIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verified: bool


class CertificationIn(BaseModel):
    name: str
    issuer: Optional[str] = None
    issued_at: Optional[date] = None
    expires_at: Optional[date] = None
    credential_id: Optional[str] = None


class CertificationOut(CertificationIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verification_status: str
    document_key: Optional[str] = None


class VerificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    status: str
    points: int
    document_key: Optional[str] = None
    notes: Optional[str] = None


class GenerateCVRequest(BaseModel):
    job_description: str = Field(..., min_length=40)
    template: str = "professional"  # modern|executive|professional|minimal
    doc_type: str = "cv"  # cv|cover_letter|bio


class MatchingInsights(BaseModel):
    required_skills: list[str] = []
    missing_skills: list[str] = []
    suggested_experiences: list[str] = []
    keywords: list[str] = []


class GenerateCVResponse(BaseModel):
    document_id: int
    title: str
    template: str
    matching: MatchingInsights
    preview_html: Optional[str] = None
    download_pdf_url: Optional[str] = None
    download_docx_url: Optional[str] = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    doc_type: str
    template: str
    created_at: datetime
    storage_key_pdf: Optional[str] = None
    storage_key_docx: Optional[str] = None


class DashboardOut(BaseModel):
    profile: ProfileOut
    timeline_count: int
    verified_docs: int
    generated_cvs: int
    recommended_actions: list[str]
