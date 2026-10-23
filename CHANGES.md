# Crede rebuild: changes

## Product
- **Design system**: a minimal, Grok-like UI with soft tinted icons, hover cards and text-style links. Motion respects reduced-motion. Dark mode, a PWA manifest and service worker, and a native-feeling mobile shell (top bar plus a bottom nav with a centre "create" action).
- **Documents**: the AI returns structured JSON only. A deterministic template engine renders it, and WeasyPrint makes the PDF; DOCX export is also available.
  - Six templates (Modern, Professional, Compact, Executive, Minimal, Creative), plus accent palettes, fonts, spacing and an ATS-friendly toggle.
  - The Style step has a live preview, a content editor and checks (page count, quantified bullets, summary length, order).
  - CVs are 1–2 pages. Cover letters run 250–400 words.
- **Analysis**: each JD is parsed once and cached by `jd_hash`. A deterministic matcher marks every requirement met, partial or missing, with evidence. The drill-down page also shows suggested bullets.
- **% match**: one engine everywhere (analysis, generate, opportunities, recruiter matches, candidate search).
  - Weights: must-haves 45, skills 20, experience 15, education/certs 10, location 5, verification 5.
  - The breakdown shows on hover or tap. There is no placeholder 50.
- **Dashboard charts**: profile strength over time, documents, match distribution, skill coverage against demand, and community engagement.
- **Organisations**: company, school and issuer types.
  - Claims need an official email domain AND admin approval. `ORG_DOMAIN_AUTO_APPROVE=true` lets the domain alone approve.
  - Only claimed, approved orgs can verify timeline, education and certification claims.
- **Teams two-way sync**: `TEAMS_URL` + `SUITE_SYNC_TOKEN`. Orgs created first in Crede show up in Teams, and the reverse.
- **Badges**: gray (identity) and green (identity plus issuer-verified claims).
  - Checkout uses Paystack or Monnify, depending on which keys are set.
  - With no keys, a simulated checkout records the payment as initiated and notifies admins.
  - Admins can grant or revoke badges.
- **Mail**: SMTP mailer with a DB outbox queue, an in-app notification bell and per-type email preferences. With a blank `SMTP_HOST`, mail is only logged.
- **Community** at `/feed`: posts, images, CV/letter attachments, likes, comments, reposts, saves, topics and reports.
- **Admin console** (users listed in `ADMIN_EMAILS`): claims, badges, identity, users, reports, email outbox, payments and Teams sync.
- **Recruiter hub**: jobs with requirement lines, ranked matches and candidate search.
- **Fixes**: the Skills link now reads "Add skill". Certifications suggest issuers, and education picks verifiable schools.

## Deploy
- `docker-compose.yml` has three services: `db` (postgres:16-alpine with lean settings), `api` and `web`.
  - Services use `expose`, not host ports.
  - Every setting is listed as `KEY: ${KEY:-default}`.
- **API image**: python:3.12-slim-bookworm with the WeasyPrint libraries and fonts (Inter, Lato, EB Garamond, Open Sans, Carlito, Liberation, DejaVu). It runs as non-root and has a healthcheck. Set `WEB_CONCURRENCY` for workers (default 1).
- **Web image**: Next standalone on 3001. `API_PROXY_TARGET` is a **build arg**, because Next bakes rewrites in at build time (default `http://api:8008`).
- `.env.example` documents all 63 keys.
- Images are unoptimised, so standalone mode doesn't need `sharp`.

## Tests and data
- `apps/api/scripts/seed_demo.py <api>` is idempotent. Re-runs don't duplicate posts.
  - Demo logins: admin@crede.africa, chidi@example.com and ada@paystackish.ng, all with password `CredeDemo!2026`.
- `apps/api/scripts/smoke_e2e.py <base>/backend` is stdlib only and makes 41 checks: signup → timeline → analysis → CV/letter generate → PDF/DOCX → feed → badges → admin. It cleans up its own post. Last run: 41 passed, 0 failed.

## Known issues / untested
- School verification needs the school name to match an org exactly (case-insensitive). There is no fuzzy alias matching yet.
- Real LLM calls are untested locally; only the deterministic facts-based fallback was exercised.
- Live Paystack/Monnify payments and webhooks, real SMTP delivery, Docker image builds (no Docker on the build box), live Teams sync and collab SSO mode are untested.
