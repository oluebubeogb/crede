# Crede — Phase 1

**Verified Professional Identity Platform**  
Domain: `crede.collab.name.ng` · API: `api-crede.collab.name.ng`

Crede is **not** a CV builder. Users maintain a single **Career Timeline** (source of truth).  
CVs, cover letters, and bios are generated from that timeline. Verification builds trust.

Auth is **Collab Accounts SSO only** (`accounts.collab.name.ng`). No local passwords.

---

## Phase 1 scope

| Area | Status |
|------|--------|
| Collab Accounts SSO | ✅ |
| Onboarding wizard | ✅ |
| Career Timeline (CRUD + drawer) | ✅ |
| Skills & Certifications | ✅ |
| Verification score + document upload | ✅ |
| AI-assisted CV generation (job paste → match → PDF/DOCX) | ✅ stubs |
| Documents library | ✅ |
| Public profile `/u/[username]` | ✅ |
| Dashboard, Settings | ✅ |
| Admin (Filament-style notes) | 📋 docs |
| Recruiter portal | Phase 2 |

---

## Stack (Phase 1)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 (App Router) · Tailwind · design system (Inter, soft cards) |
| API | FastAPI (same family as Collab Accounts for cookie SSO) |
| DB | PostgreSQL |
| Cache/Queue | Redis (optional) |
| Storage | MinIO / S3-compatible (verification docs + generated files) |
| AI | OpenAI API — job analysis, skill extraction, CV tailoring only |
| Identity | Collab Accounts JWT + shared `.collab.name.ng` cookies |

> Production target can swap the API for Laravel 12 + Filament admin without changing the product contract; models and routes mirror that shape.

---

## Monorepo layout

```
crede-phase1/
├── apps/
│   ├── api/          # FastAPI — timeline, verification, generate, documents
│   └── web/          # Next.js — UI matching Complete UI/UX Blueprint
├── docs/             # Product + admin notes
├── docker-compose.yml
└── README.md
```

---

## Prerequisites

- Node 20+
- Python 3.12+
- PostgreSQL 16
- Running **Collab Accounts** with `crede` product (`default=True`) — use the accompanying `collab-accounts-crede` zip

---

## Quick start (local)

### 1. Collab Accounts

```bash
# From collab-accounts-crede/
docker compose up -d
# Ensure PRODUCTS includes crede (default=True)
# CORS includes http://localhost:3001
```

### 2. Crede API

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL, ACCOUNTS_URL, SECRET_KEY (same family as accounts), OPENAI_API_KEY
uvicorn app.main:app --reload --port 8008
```

### 3. Crede Web

```bash
cd apps/web
npm install
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8008
# NEXT_PUBLIC_ACCOUNTS_URL=http://localhost:1997
npm run dev -- -p 3001
```

Open http://localhost:3001 → **Continue with Collab Account**.

Existing Collab users receive `crede` product access automatically on next `/auth/me` (backfill).

---

## Design system (from blueprint)

| Token | Light | Dark |
|-------|-------|------|
| Background | `#FFFFFF` | `#09090B` |
| Surface | `#F8FAFC` | `#18181B` |
| Border | `#E2E8F0` | `#27272A` |
| Primary text | `#0F172A` | `#FAFAFA` |
| Secondary | `#64748B` | `#A1A1AA` |
| Accent | `#2563EB` | `#3B82F6` |

Font: **Inter**. Cards: 16px radius, soft borders, no heavy shadows. Buttons: 44px height, 12px radius. Sidebar: 280px.

Feel: Linear / Notion / Vercel / Stripe — not Canva or traditional job boards.

---

## Core product rule

```
Career Timeline
  → Verification
  → CV Generation
  → Public Profile
  → (Phase 2) Recruiter Search & Job Matching
```

Store **raw facts only**. Never persist AI prose as source of truth.

---

## Domains (production)

| Host | Role |
|------|------|
| `accounts.collab.name.ng` | Identity |
| `crede.collab.name.ng` | Web app |
| `api-crede.collab.name.ng` | API |

Cookie domain: `.collab.name.ng`

---

## License

Private — Collab suite.
