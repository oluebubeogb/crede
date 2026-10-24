# Crede — fix batch (Oct 2026)

Base: `5bcd44a` (Compose: drop bundled Postgres). All work committed locally, **not pushed**.
Compose unchanged structurally: only `api` + `web`, external Coolify Postgres via `DATABASE_URL`,
external `coolify` network, `crede-api` alias.

## Fixes

| # | Fix | Commit(s) |
|---|-----|-----------|
| 1 | Grab image matches the live post card | `b7140a1` |
| 2 | External sharing + rich Open Graph | `d5208e7`, `b7140a1` |
| 3 | Soft, state-aware tints on post-card action icons | `b7140a1` |
| 4 | Rich dashboard career insights | `46b6c8d` |
| 5 | Central file upload → parse → review → apply (Career Timeline) | `19791a1` |
| 6 | Full name / username / phone read-only, synced from SSO | `920804a` |
| 7 | Verification shows a badge tier, not "100%" | `9119add` (+ tier card on dashboard in `46b6c8d`) |
| – | Bug scan: structured API errors no longer surface as "[object Object]" | `2e04895` |

### 1. Grab image = live card
- Grab renders the real `PostCard` (grab mode) in a 640px frame at 2–3× DPR, waits for images and fonts → identical to the feed card (avatar, badges, media, counts, action row).
- Crede mark kept, moved to its own footer strip so post content can't cover it.

### 2. External sharing + Open Graph
- Share sheet on every post: native Web Share on touch devices; otherwise Copy link, WhatsApp, X, LinkedIn, Facebook, Telegram, Email, Save as image.
- Public page `/p/{id}` (logged-out readable) with full OG/Twitter/article meta: title, description, author, published/modified time, canonical, site_name, `og:image` 1200×630.
- `og:image` = the post's first image (re-encoded JPEG for crawlers) **or**, if the post has no image, a generated "screenshot-style" card of the post (`/og/post/{id}`, cached).
- Middleware: members hitting `/p/{id}` → `/post/{id}`; logged-out `/post/{id}` → `/p/{id}`.
- API: `GET /api/community/public/posts/{id}`, `GET /api/community/public/posts/{id}/image.jpg` — hidden posts / private authors 404, contact never exposed, `Cache-Control: public`.
- "edited" label now uses a real `posts.edited_at` (it used to follow `updated_at`, which moved on likes/comments).

### 3. Tinted action icons
- Soft circular tints per action, deeper on hover and when active: like rose→red (liked), comment blue, repost green (reposted), share indigo, save amber (saved). Light + dark themes.

### 4. Career insights
- `GET /api/profile/insights` — deterministic, cheap: strengths/gaps scored into tiers, seniority & next step, years of experience, top skills vs. demand from open roles (MatchCache) and JDs the user tailored to, recommended certifications, profile-completeness actions with deep links.
- `POST /api/profile/insights/narrative` — optional short AI narrative (OpenAI-compatible `LLM_*`), cached per profile, regenerated at most daily and only when career facts change. Off when no LLM is configured or `INSIGHTS_AI=false`.

### 5. Central import (Career Timeline → Import)
- One drop zone at `/timeline#import` (linked from Skills and Certifications pages).
- Formats: pdf, docx, doc, odt, rtf, txt, md, csv/tsv, xlsx, json, html. LinkedIn data-export CSVs (Positions, Education, Skills, Certifications) are parsed structurally.
- Parse with the configured LLM when available, else built-in heuristics (sections, date ranges, bullets split into achievements vs responsibilities, degree/field, skills vocabulary, certificates).
- Review step: every item marked **new / update / duplicate** with what will change; select per item or per group; nothing is written until "Add N to profile".
- Apply syncs into timeline (work/education), skills, certifications, headline & summary; updates only fill blanks and merge bullets — never overwrite.
- Files are parsed in memory and discarded (never stored). Size limit `IMPORT_MAX_MB`.
- Imports **do not** send verification requests to organisations; they only link an org when the name matches exactly.
- API: `POST /api/import/parse` (multipart `file`), `POST /api/import/apply`.

### 6. Identity read-only
- Profile page shows full name, username and phone as locked fields with a "Manage in Collab Accounts" link.
- API rejects changes to `full_name`, `username`, `phone`, `phone_country_code` (400 `{message, fields, manage_url}`); unchanged values are ignored for older clients. Values are always re-synced from SSO on sign-in.

### 7. Badge tier instead of percentage
- Verification page and dashboard show the tier (Not verified yet → Gray badge → Green badge), a status line and a checklist of what's done / next. No percentage anywhere.

### Bug scan
- Login/signup used to show only string errors; structured details now go through `detailMessage` like every other call. Crawled all main pages as each demo role — no "[object Object]", "undefined" or "NaN" in rendered text.

## Env (new, with defaults; added to `.env.example`, `apps/api/.env.example`, `docker-compose.yml`)
| Var | Default | Purpose |
|-----|---------|---------|
| `INSIGHTS_AI` | `true` | Enable the optional AI narrative on insights (no-op without `LLM_*`) |
| `IMPORT_MAX_MB` | `10` | Max import file size |

AI remains OpenAI-compatible via existing `LLM_*` vars; default model `gpt-4o-mini`; small prompts / token caps.

## Migrations (additive, auto-run on boot via `_try_schema()`)
- `ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`

## Verification
- API boots clean, `/health` → database ok, schema_ready true.
- `npx tsc --noEmit` and `next build` pass (Next 14.2.35).
- Screenshots: `screenshots/fix-*.png` (outside the repo).
