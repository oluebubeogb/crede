#!/usr/bin/env python3
"""
Seed realistic career data for existing Collab users.

c1@mova.cms … c5@mova.cms are already Collab Accounts users. This script does
NOT create local User rows, passwords, names, usernames, or phone numbers —
those stay owned by Collab. It only upserts Profile rows (matched by email)
plus timeline, skills, certifications, verification items, sample documents,
and optional orgs/jobs for recruiter testing.

On first Collab login, get_or_create_profile matches by email and sets
external_id / collab fields without overwriting identity from Accounts.

Usage (inside API container or apps/api with DATABASE_URL set):
  python -m app.seed_data
  # or: python seed_data.py
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
from app.models import (
    Profile,
    TimelineEntry,
    Skill,
    Certification,
    VerificationItem,
    GeneratedDocument,
    Organization,
    Job,
)
from app.services.completion import refresh_scores


def upsert_profile_by_email(
    db: Session,
    email: str,
    *,
    headline: str,
    industry: str,
    location: str,
    country: str,
    years: int,
    summary: str,
) -> Profile:
    """Upsert profile career fields only. Never set name/username/phone/password."""
    email = email.lower().strip()
    profile = db.query(Profile).filter(Profile.email == email).first()
    if not profile:
        profile = Profile(email=email)
        db.add(profile)

    # Career / product fields only — leave identity to Collab
    profile.email = email
    profile.headline = headline
    profile.industry = industry
    profile.location = location
    profile.country = country
    profile.years_experience = years
    profile.summary = summary
    profile.is_public = True
    profile.onboarding_completed = True
    # Do not touch: full_name, username, phone, phone_country_code, avatar_url,
    # external_id, collab_user_id (set on Collab login)
    db.flush()
    return profile


def clear_profile_children(db: Session, profile: Profile) -> None:
    for model in (TimelineEntry, Skill, Certification, VerificationItem, GeneratedDocument):
        db.query(model).filter(model.profile_id == profile.id).delete(synchronize_session=False)
    db.flush()


def add_timeline(db: Session, profile_id: int, entries: list[dict]) -> None:
    for i, e in enumerate(entries):
        db.add(
            TimelineEntry(
                profile_id=profile_id,
                job_title=e["job_title"],
                organization=e["organization"],
                industry=e.get("industry"),
                employment_type=e.get("employment_type", "full_time"),
                start_date=e["start_date"],
                end_date=e.get("end_date"),
                is_current=e.get("is_current", False),
                description=e.get("description"),
                responsibilities=e.get("responsibilities"),
                achievements=e.get("achievements"),
                team_size=e.get("team_size"),
                verification_status=e.get("verification_status", "unverified"),
                sort_order=i,
            )
        )


def add_skills(db: Session, profile_id: int, skills: list[tuple[str, str, str, bool]]) -> None:
    for name, category, proficiency, verified in skills:
        db.add(
            Skill(
                profile_id=profile_id,
                name=name,
                category=category,
                proficiency=proficiency,
                verified=verified,
            )
        )


def add_certs(db: Session, profile_id: int, certs: list[dict]) -> None:
    for c in certs:
        db.add(
            Certification(
                profile_id=profile_id,
                name=c["name"],
                issuer=c.get("issuer"),
                issued_at=c.get("issued_at"),
                expires_at=c.get("expires_at"),
                credential_id=c.get("credential_id"),
                verification_status=c.get("verification_status", "unverified"),
            )
        )


def add_verifications(db: Session, profile_id: int, items: list[dict]) -> None:
    for v in items:
        db.add(
            VerificationItem(
                profile_id=profile_id,
                kind=v["kind"],
                status=v["status"],
                points=v.get("points", 0),
                notes=v.get("notes"),
                reviewed_at=datetime.now(timezone.utc) if v["status"] == "approved" else None,
            )
        )


def seed(db: Session) -> None:
    Base.metadata.create_all(bind=engine)

    # ── c1: Senior software engineer, high verification ──────────────────────
    p1 = upsert_profile_by_email(
        db,
        "c1@mova.cms",
        headline="Senior Software Engineer · Distributed Systems",
        industry="Technology",
        location="Lagos, Nigeria",
        country="Nigeria",
        years=9,
        summary=(
            "Backend engineer focused on high-throughput APIs and reliability. "
            "Previously scaled payment services handling 50k+ TPS. Passionate about "
            "mentoring and open-source observability tools."
        ),
    )
    clear_profile_children(db, p1)
    add_timeline(
        db,
        p1.id,
        [
            {
                "job_title": "Senior Software Engineer",
                "organization": "Flutterwave",
                "industry": "Fintech",
                "start_date": date(2021, 3, 1),
                "is_current": True,
                "description": "Lead engineer on settlement and ledger services.",
                "responsibilities": [
                    "Own settlement pipeline and reconciliation jobs",
                    "Mentor 4 mid-level engineers",
                    "Drive on-call rotations and SLOs",
                ],
                "achievements": [
                    "Reduced settlement lag from 4h to 12 minutes",
                    "Introduced OpenTelemetry across 18 services",
                ],
                "team_size": 12,
                "verification_status": "verified",
            },
            {
                "job_title": "Software Engineer",
                "organization": "Paystack",
                "industry": "Fintech",
                "start_date": date(2018, 6, 1),
                "end_date": date(2021, 2, 28),
                "description": "Built merchant APIs and webhook infrastructure.",
                "responsibilities": [
                    "Designed idempotent webhook delivery",
                    "Improved API p99 latency by 40%",
                ],
                "achievements": ["Shipped bulk transfers v2 used by 3k merchants"],
                "team_size": 8,
                "verification_status": "verified",
            },
            {
                "job_title": "Junior Backend Developer",
                "organization": "Andela",
                "industry": "Technology",
                "start_date": date(2016, 1, 15),
                "end_date": date(2018, 5, 30),
                "description": "Full-stack delivery for client projects across Africa.",
                "verification_status": "unverified",
            },
        ],
    )
    add_skills(
        db,
        p1.id,
        [
            ("Python", "technical", "expert", True),
            ("Go", "technical", "intermediate", True),
            ("PostgreSQL", "technical", "expert", True),
            ("Kubernetes", "technical", "intermediate", False),
            ("System Design", "technical", "expert", True),
            ("Team Leadership", "leadership", "intermediate", False),
            ("Payments", "industry", "expert", True),
        ],
    )
    add_certs(
        db,
        p1.id,
        [
            {
                "name": "AWS Solutions Architect – Associate",
                "issuer": "Amazon Web Services",
                "issued_at": date(2022, 4, 12),
                "expires_at": date(2025, 4, 12),
                "credential_id": "AWS-SAA-8821",
                "verification_status": "verified",
            },
            {
                "name": "CKA – Certified Kubernetes Administrator",
                "issuer": "CNCF",
                "issued_at": date(2023, 9, 1),
                "credential_id": "CKA-44102",
                "verification_status": "verified",
            },
        ],
    )
    add_verifications(
        db,
        p1.id,
        [
            {"kind": "email", "status": "approved", "points": 10},
            {"kind": "phone", "status": "approved", "points": 10},
            {"kind": "degree", "status": "approved", "points": 20, "notes": "B.Sc Computer Science"},
            {"kind": "certification", "status": "approved", "points": 20},
            {"kind": "employment", "status": "approved", "points": 30},
            {"kind": "organization", "status": "pending", "points": 0},
        ],
    )
    db.add(
        GeneratedDocument(
            profile_id=p1.id,
            title="Senior Backend CV",
            doc_type="cv",
            template="professional",
            content_snapshot={"note": "seed snapshot"},
        )
    )

    # ── c2: Product manager, mid verification ────────────────────────────────
    p2 = upsert_profile_by_email(
        db,
        "c2@mova.cms",
        headline="Product Manager · B2B SaaS & Fintech",
        industry="Product",
        location="Abuja, Nigeria",
        country="Nigeria",
        years=6,
        summary=(
            "Product manager with a track record of 0→1 launches in payments and "
            "SME tools. Strong discovery practice and stakeholder alignment across "
            "engineering, compliance, and commercial teams."
        ),
    )
    clear_profile_children(db, p2)
    add_timeline(
        db,
        p2.id,
        [
            {
                "job_title": "Senior Product Manager",
                "organization": "Interswitch",
                "industry": "Fintech",
                "start_date": date(2022, 1, 10),
                "is_current": True,
                "description": "Owns SME lending and merchant analytics products.",
                "responsibilities": [
                    "Roadmap for merchant dashboard",
                    "Partner with risk and compliance on KYC flows",
                ],
                "achievements": [
                    "Grew active merchants using analytics by 2.4x in 18 months",
                    "Cut onboarding time from 5 days to 48 hours",
                ],
                "team_size": 15,
                "verification_status": "verified",
            },
            {
                "job_title": "Product Manager",
                "organization": "Kuda Bank",
                "industry": "Banking",
                "start_date": date(2019, 8, 1),
                "end_date": date(2021, 12, 20),
                "description": "Consumer savings and bills payment experiences.",
                "achievements": ["Launched bill payments that hit 1M transactions/month"],
                "verification_status": "unverified",
            },
            {
                "job_title": "Business Analyst",
                "organization": "Paga",
                "industry": "Fintech",
                "start_date": date(2017, 3, 1),
                "end_date": date(2019, 7, 31),
                "employment_type": "full_time",
                "verification_status": "unverified",
            },
        ],
    )
    add_skills(
        db,
        p2.id,
        [
            ("Product Strategy", "leadership", "expert", True),
            ("User Research", "technical", "expert", False),
            ("SQL", "technical", "intermediate", False),
            ("Roadmapping", "leadership", "expert", True),
            ("Agile / Scrum", "leadership", "intermediate", True),
            ("Fintech Regulation", "industry", "intermediate", False),
        ],
    )
    add_certs(
        db,
        p2.id,
        [
            {
                "name": "Pragmatic Product Management",
                "issuer": "Pragmatic Institute",
                "issued_at": date(2021, 6, 15),
                "verification_status": "verified",
            },
        ],
    )
    add_verifications(
        db,
        p2.id,
        [
            {"kind": "email", "status": "approved", "points": 10},
            {"kind": "phone", "status": "approved", "points": 10},
            {"kind": "degree", "status": "submitted", "points": 0, "notes": "MBA – pending review"},
            {"kind": "certification", "status": "approved", "points": 20},
            {"kind": "employment", "status": "submitted", "points": 0},
            {"kind": "organization", "status": "pending", "points": 0},
        ],
    )

    # ── c3: Data scientist, lower verification ───────────────────────────────
    p3 = upsert_profile_by_email(
        db,
        "c3@mova.cms",
        headline="Data Scientist · ML for Credit & Fraud",
        industry="Data Science",
        location="Kano, Nigeria",
        country="Nigeria",
        years=4,
        summary=(
            "Applied ML for credit scoring and fraud detection. Comfortable from "
            "feature pipelines to model monitoring in production."
        ),
    )
    clear_profile_children(db, p3)
    add_timeline(
        db,
        p3.id,
        [
            {
                "job_title": "Data Scientist",
                "organization": "Carbon",
                "industry": "Fintech",
                "start_date": date(2022, 5, 1),
                "is_current": True,
                "description": "Credit risk models and fraud rules engine.",
                "responsibilities": [
                    "Build and monitor scorecards",
                    "Feature store ownership for lending domain",
                ],
                "achievements": ["Improved approval rate 8% at same default rate"],
                "team_size": 6,
                "verification_status": "unverified",
            },
            {
                "job_title": "Junior Data Analyst",
                "organization": "MTN Nigeria",
                "industry": "Telecom",
                "start_date": date(2020, 2, 1),
                "end_date": date(2022, 4, 15),
                "description": "Customer churn and network quality analytics.",
                "verification_status": "unverified",
            },
        ],
    )
    add_skills(
        db,
        p3.id,
        [
            ("Python", "technical", "expert", False),
            ("scikit-learn", "technical", "expert", False),
            ("SQL", "technical", "expert", True),
            ("Feature Engineering", "technical", "intermediate", False),
            ("A/B Testing", "technical", "intermediate", False),
            ("Credit Risk", "industry", "intermediate", False),
        ],
    )
    add_certs(
        db,
        p3.id,
        [
            {
                "name": "Google Data Analytics Professional Certificate",
                "issuer": "Google / Coursera",
                "issued_at": date(2021, 11, 20),
                "verification_status": "unverified",
            },
        ],
    )
    add_verifications(
        db,
        p3.id,
        [
            {"kind": "email", "status": "approved", "points": 10},
            {"kind": "phone", "status": "pending", "points": 0},
            {"kind": "degree", "status": "pending", "points": 0},
            {"kind": "certification", "status": "submitted", "points": 0},
            {"kind": "employment", "status": "pending", "points": 0},
            {"kind": "organization", "status": "pending", "points": 0},
        ],
    )

    # ── c4: UX designer, mixed ───────────────────────────────────────────────
    p4 = upsert_profile_by_email(
        db,
        "c4@mova.cms",
        headline="Senior Product Designer · Mobile & Design Systems",
        industry="Design",
        location="Ibadan, Nigeria",
        country="Nigeria",
        years=7,
        summary=(
            "Product designer specializing in mobile-first experiences and design "
            "systems for African markets. Led redesigns that improved conversion "
            "and accessibility scores."
        ),
    )
    clear_profile_children(db, p4)
    add_timeline(
        db,
        p4.id,
        [
            {
                "job_title": "Senior Product Designer",
                "organization": "PiggyVest",
                "industry": "Fintech",
                "start_date": date(2021, 9, 1),
                "is_current": True,
                "description": "Design system and savings product UX.",
                "responsibilities": [
                    "Own design system components used by 3 product squads",
                    "Run usability tests with 20+ participants per quarter",
                ],
                "achievements": [
                    "Redesign increased savings goal completion by 22%",
                    "WCAG AA compliance across core flows",
                ],
                "team_size": 5,
                "verification_status": "verified",
            },
            {
                "job_title": "Product Designer",
                "organization": "Hotels.ng",
                "industry": "Travel",
                "start_date": date(2018, 4, 1),
                "end_date": date(2021, 8, 15),
                "description": "Booking and discovery experiences.",
                "verification_status": "unverified",
            },
            {
                "job_title": "UI Designer",
                "organization": "Freelance",
                "industry": "Design",
                "employment_type": "contract",
                "start_date": date(2016, 1, 1),
                "end_date": date(2018, 3, 31),
                "description": "Brand and product UI for startups.",
                "verification_status": "unverified",
            },
        ],
    )
    add_skills(
        db,
        p4.id,
        [
            ("Figma", "technical", "expert", True),
            ("Design Systems", "technical", "expert", True),
            ("User Research", "technical", "intermediate", False),
            ("Prototyping", "technical", "expert", True),
            ("Accessibility", "technical", "intermediate", True),
            ("Stakeholder Management", "leadership", "intermediate", False),
        ],
    )
    add_certs(
        db,
        p4.id,
        [
            {
                "name": "Google UX Design Professional Certificate",
                "issuer": "Google / Coursera",
                "issued_at": date(2020, 8, 10),
                "verification_status": "verified",
            },
            {
                "name": "Interaction Design Foundation – UI Design",
                "issuer": "IDF",
                "issued_at": date(2019, 3, 5),
                "verification_status": "unverified",
            },
        ],
    )
    add_verifications(
        db,
        p4.id,
        [
            {"kind": "email", "status": "approved", "points": 10},
            {"kind": "phone", "status": "approved", "points": 10},
            {"kind": "degree", "status": "approved", "points": 20, "notes": "B.A Fine Arts"},
            {"kind": "certification", "status": "approved", "points": 20},
            {"kind": "employment", "status": "rejected", "points": 0, "notes": "Document unclear"},
            {"kind": "organization", "status": "pending", "points": 0},
        ],
    )

    # ── c5: People ops, high verification ────────────────────────────────────
    p5 = upsert_profile_by_email(
        db,
        "c5@mova.cms",
        headline="People Operations Lead · Talent & Culture",
        industry="Human Resources",
        location="Port Harcourt, Nigeria",
        country="Nigeria",
        years=8,
        summary=(
            "People ops leader who has built hiring systems for high-growth startups. "
            "Experienced in performance frameworks, employer branding, and DEI programs."
        ),
    )
    clear_profile_children(db, p5)
    add_timeline(
        db,
        p5.id,
        [
            {
                "job_title": "Head of People",
                "organization": "SeamlessHR",
                "industry": "HR Tech",
                "start_date": date(2020, 11, 1),
                "is_current": True,
                "description": "People strategy for a 200+ person SaaS company.",
                "responsibilities": [
                    "Hiring plan and talent brand",
                    "Performance and compensation frameworks",
                ],
                "achievements": [
                    "Reduced time-to-hire from 45 to 28 days",
                    "Rolled out structured leveling across engineering and product",
                ],
                "team_size": 9,
                "verification_status": "verified",
            },
            {
                "job_title": "HR Business Partner",
                "organization": "Jumia",
                "industry": "E-commerce",
                "start_date": date(2017, 5, 1),
                "end_date": date(2020, 10, 31),
                "description": "Partnered with logistics and marketplace leadership.",
                "verification_status": "unverified",
            },
            {
                "job_title": "Recruitment Specialist",
                "organization": "Workforce Group",
                "industry": "Staffing",
                "start_date": date(2015, 2, 1),
                "end_date": date(2017, 4, 30),
                "verification_status": "unverified",
            },
        ],
    )
    add_skills(
        db,
        p5.id,
        [
            ("Talent Acquisition", "industry", "expert", True),
            ("Performance Management", "leadership", "expert", True),
            ("Employer Branding", "industry", "intermediate", False),
            ("Compensation Design", "industry", "intermediate", False),
            ("Conflict Resolution", "leadership", "intermediate", True),
            ("HRIS", "technical", "intermediate", False),
        ],
    )
    add_certs(
        db,
        p5.id,
        [
            {
                "name": "SHRM-CP",
                "issuer": "SHRM",
                "issued_at": date(2019, 7, 1),
                "expires_at": date(2025, 7, 1),
                "credential_id": "SHRM-CP-99821",
                "verification_status": "verified",
            },
        ],
    )
    add_verifications(
        db,
        p5.id,
        [
            {"kind": "email", "status": "approved", "points": 10},
            {"kind": "phone", "status": "approved", "points": 10},
            {"kind": "degree", "status": "approved", "points": 20},
            {"kind": "certification", "status": "approved", "points": 20},
            {"kind": "employment", "status": "approved", "points": 30},
            {"kind": "organization", "status": "submitted", "points": 0},
        ],
    )

    # Refresh scores
    for p in (p1, p2, p3, p4, p5):
        db.refresh(p)
        _ = p.timeline_entries
        _ = p.skills
        _ = p.certifications
        _ = p.verifications
        refresh_scores(db, p)

    # ── Orgs + jobs (no local recruiter user) ────────────────────────────────
    org1 = db.query(Organization).filter(Organization.slug == "nova-fintech").first()
    if not org1:
        org1 = Organization(
            name="Nova Fintech",
            slug="nova-fintech",
            website="https://novafintech.example",
            industry="Fintech",
            location="Lagos, Nigeria",
            description="Digital payments and lending for SMEs across West Africa.",
            verification_status="verified",
        )
        db.add(org1)
        db.flush()
    else:
        org1.verification_status = "verified"

    org2 = db.query(Organization).filter(Organization.slug == "horizon-health").first()
    if not org2:
        org2 = Organization(
            name="Horizon Health",
            slug="horizon-health",
            website="https://horizonhealth.example",
            industry="Healthcare",
            location="Abuja, Nigeria",
            description="Telemedicine and clinic operations platform.",
            verification_status="pending",
        )
        db.add(org2)
        db.flush()

    def ensure_job(org: Organization, title: str, **kwargs) -> Job:
        existing = (
            db.query(Job)
            .filter(Job.organization_id == org.id, Job.title == title)
            .first()
        )
        if existing:
            for k, v in kwargs.items():
                setattr(existing, k, v)
            existing.status = kwargs.get("status", "open")
            return existing
        job = Job(
            organization_id=org.id,
            title=title,
            status=kwargs.pop("status", "open"),
            **kwargs,
        )
        db.add(job)
        return job

    ensure_job(
        org1,
        "Senior Backend Engineer",
        department="Engineering",
        location="Lagos (Hybrid)",
        employment_type="full_time",
        salary_min=8_000_000,
        salary_max=14_000_000,
        salary_currency="NGN",
        description=(
            "Build settlement and ledger services for our SME lending product. "
            "Strong Python/Go and systems experience required."
        ),
        requirements=[
            "5+ years backend experience",
            "Python or Go",
            "PostgreSQL at scale",
            "Payments or fintech preferred",
        ],
        experience_years_min=5,
        deadline=date(2026, 12, 31),
    )
    ensure_job(
        org1,
        "Product Manager – Merchant Tools",
        department="Product",
        location="Lagos / Remote Nigeria",
        employment_type="full_time",
        salary_min=6_000_000,
        salary_max=10_000_000,
        salary_currency="NGN",
        description="Own the merchant dashboard and analytics roadmap.",
        requirements=["3+ years PM experience", "B2B SaaS or fintech", "Strong discovery practice"],
        experience_years_min=3,
        deadline=date(2026, 11, 15),
    )
    ensure_job(
        org2,
        "Product Designer (Mobile)",
        department="Design",
        location="Abuja (Hybrid)",
        employment_type="full_time",
        salary_min=5_000_000,
        salary_max=9_000_000,
        salary_currency="NGN",
        description="Design patient and clinician mobile experiences.",
        requirements=["Portfolio with mobile apps", "Design systems experience", "Healthcare a plus"],
        experience_years_min=4,
        deadline=date(2026, 10, 30),
    )
    ensure_job(
        org2,
        "People Operations Specialist",
        department="People",
        location="Abuja",
        employment_type="full_time",
        salary_min=4_000_000,
        salary_max=7_000_000,
        salary_currency="NGN",
        description="Support hiring and employee lifecycle for a growing health-tech team.",
        requirements=["3+ years HR/People ops", "Experience with high-growth startups"],
        experience_years_min=3,
        status="open",
    )

    db.commit()

    print("Seed complete (Collab-safe).")
    print("  Profiles keyed by email only — no local User / password / name / username / phone.")
    print("  Professionals:")
    for email, score in [
        ("c1@mova.cms", p1.verification_score),
        ("c2@mova.cms", p2.verification_score),
        ("c3@mova.cms", p3.verification_score),
        ("c4@mova.cms", p4.verification_score),
        ("c5@mova.cms", p5.verification_score),
    ]:
        print(f"    {email} (verification ≈ {score}%)")
    print("  Orgs: Nova Fintech (verified), Horizon Health (pending) + open jobs")
    print("  Log in via Collab with those emails; profile links by email and fills external_id.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
