# Crede — Phase 1 + Phase 2

**Verified Professional Identity Platform**

Crede is **not** a CV builder. Users maintain a single **Career Timeline** (source of truth).  
CVs, cover letters, and bios are generated from that timeline. Verification builds trust.  
Phase 2 adds VPS document storage, real PDF/DOCX generation, opportunities matching, and recruiter pilot loops.

See `docs/CREDE_BLUEPRINT.txt` for the full product + technical source of truth.

---

## Phase 2 status (this package)

| Milestone | Status |
|-----------|--------|
| M1 — VPS storage + verification upload/admin approve | ✅ |
| M2 — Real PDF + DOCX on VPS | ✅ |
| M3 — Redis + Meilisearch (wired in compose; search falls back to SQL) | ✅ scaffold |
| M4 — Opportunities + recruiter pilot | ✅ |
| M5 — Onboarding / mobile / settings polish | Partial (empty states + core UX) |
| M6 — Commercial backlog | Backlog |

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 · Tailwind · Inter |
| API | FastAPI |
| DB | PostgreSQL |
| Files | VPS disk under `STORAGE_ROOT` (`/data/crede`) — **not MinIO** |
| Cache / queue | Redis |
| Search | Meilisearch (SQL fallback) |
| Auth | Local JWT (default) or Collab Accounts SSO |
| AI | OpenAI — job analysis / CV tailoring only |

---

## Quick start (local)

### API

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# AUTH_MODE=local, DATABASE_URL, SECRET_KEY, STORAGE_ROOT=./data/crede
mkdir -p ./data/crede
uvicorn app.main:app --reload --port 8008
```

### Web

```bash
cd apps/web
npm install
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8008
npm run dev -- -p 3001
```

Open http://localhost:3001 → **Sign up** → build timeline → Generate CV → download PDF/DOCX.

Unauthenticated visits to `/dashboard`, `/generate`, and other app routes redirect to `/login` (homepage, `/login`, `/for-recruiters`, and public profiles `/u/...` stay public).

### Seed test users

With the API venv active and `DATABASE_URL` set:

```bash
# Local (from apps/api):
python -m app.seed_data

# Inside the running API container:
python -m app.seed_data
```

Attaches career data to existing Collab accounts `c1@mova.cms` … `c5@mova.cms` (matched by email only — no local passwords, names, usernames, or phones). Includes timelines, skills, certifications, varied verification scores, plus sample orgs and open jobs. Log in via Collab; profile links on first login.

### Docker (API + Redis + Meili)

```bash
export DATABASE_URL=postgresql://...
docker compose up --build
```

---

## Core product rule

```
Career Timeline
  → Verification
  → CV Generation
  → Public Profile
  → Recruiter Search & Job Matching
```

Store **raw facts only**. Never persist AI prose as source of truth.

Design: Linear / Notion / Vercel / Stripe — soft cards, 16px radius, Inter, accent `#2563EB`.
