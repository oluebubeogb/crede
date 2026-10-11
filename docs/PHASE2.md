# Crede Phase 2 — Talent Intelligence & Recruitment

## Auth

- **Default: `AUTH_MODE=local`** — email/password signup & login stored in Crede `users` table. JWT in `access_token` cookie.
- **Future: `AUTH_MODE=collab`** — proxy to Collab Accounts (same as Phase 1).
- **`hybrid`** — try local first, fall back to Collab.

Set `AUTH_MODE=collab` and cookie domain when reintegrating Collab Accounts.

## New domain models

| Model | Purpose |
|-------|---------|
| User | Local accounts |
| Organization | Employer company |
| OrganizationMember | Recruiter membership |
| Job | Posted roles |
| JobMatch | Ranked candidate matches |
| SavedCandidate | Shortlist |

## API routes (prefix `/api`)

- `POST /auth/signup` — local only
- `POST /auth/login` — local or Collab depending on mode
- `GET /auth/me`
- `POST /organizations` · `GET /organizations/mine`
- `POST /jobs` · `GET /jobs/org/{id}` · `PATCH /jobs/{id}`
- `GET /candidates/search` — filters: q, industry, location, min_verification, skill
- `POST /candidates/jobs/{id}/matches` — compute scores
- `GET /candidates/jobs/{id}/matches`

Matching is deterministic (experience / skills / certs / location / verification bonus). OpenAI can be layered later for richer insights without changing the contract.

## Frontend routes

- `/login` — sign in **and** sign up tabs
- `/recruiter/dashboard`
- `/recruiter/candidates`
- `/recruiter/jobs`
- `/recruiter/jobs/[id]/matches`
- `/recruiter/organizations`

Sidebar shows Professional + Recruiting sections.

## Local quick start

```bash
# API
cd apps/api
cp .env.example .env   # AUTH_MODE=local
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8008

# Web
cd apps/web
npm install
npm run dev -- -p 3001
```

Open http://localhost:3001/login → Sign up → build timeline → switch to Recruiter section.
