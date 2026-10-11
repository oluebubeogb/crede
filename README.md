# Crede — Phase 1 + Phase 2

**Verified Professional Identity Platform**

Crede is **not** a CV builder. Users maintain a single **Career Timeline** (source of truth).  
CVs, cover letters, and bios are generated from that timeline. Verification builds trust.  
Phase 2 adds a recruiter portal: organizations, jobs, candidate search, and matching.

---

## Auth (testing-first)

| Mode | Env | Behaviour |
|------|-----|-----------|
| **local** (default) | `AUTH_MODE=local` | Email/password signup & login inside Crede. No Collab dependency. |
| collab | `AUTH_MODE=collab` | Proxy to Collab Accounts SSO (Phase 1 behaviour). |
| hybrid | `AUTH_MODE=hybrid` | Local first, then Collab. |

To reintegrate Collab later: set `AUTH_MODE=collab`, restore `COOKIE_DOMAIN=.collab.name.ng`, and point `ACCOUNTS_URL` at the accounts service.

---

## Scope

| Area | Status |
|------|--------|
| Local signup / signin | ✅ |
| Collab SSO (switchable) | ✅ ready |
| Onboarding, Timeline, Skills, Certs | ✅ |
| Verification score + uploads | ✅ |
| AI CV generation | ✅ stubs |
| Documents library | ✅ |
| Public profile `/u/[username]` | ✅ |
| Recruiter orgs / jobs | ✅ |
| Candidate search | ✅ |
| Job ↔ candidate matching | ✅ |

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 · Tailwind · Inter |
| API | FastAPI |
| DB | PostgreSQL |
| Auth | Local JWT (default) or Collab Accounts |
| AI | OpenAI — job analysis / CV tailoring only |

---

## Quick start (local, no Collab)

### API

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# AUTH_MODE=local, DATABASE_URL, SECRET_KEY
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

Open http://localhost:3001 → **Sign up** → build timeline → use **Recruiting** in the sidebar.

---

## Design system

Feel: Linear / Notion / Vercel / Stripe — soft cards, 16px radius, Inter, accent `#2563EB`.

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

See `docs/PHASE1.md` and `docs/PHASE2.md`.
