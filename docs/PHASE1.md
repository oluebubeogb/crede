# Crede Phase 1 — Implementation notes

## Product contract

- Identity: Collab Accounts only (`crede` product, `default=True`).
- Source of truth: `timeline_entries` (raw facts).
- Outputs: generated documents derived from timeline + job analysis.
- Verification score: email 10 + phone 10 + cert/degree 20 + employment 30 + organization 30 ≤ 100.

## Admin (Filament path)

When migrating API to Laravel 12:

1. Mirror models: Profile, TimelineEntry, Skill, Certification, VerificationItem, GeneratedDocument.
2. Filament resources for document review & verification approval.
3. Industry taxonomy + job library as seed tables.
4. Keep the same REST shapes under `/api/*` so the Next.js app stays unchanged.

## SSO flow

1. User hits crede.collab.name.ng → Login → accounts.collab.name.ng.
2. Accounts sets `access_token` / `refresh_token` on `.collab.name.ng`.
3. Crede API validates via `GET {ACCOUNTS_URL}/auth/me` (Bearer or cookie).
4. `ensure_default_products` on Accounts grants `crede` to existing users automatically.

## AI cost control

- Only call OpenAI for job description analysis.
- Matching against timeline is local.
- Templates are structured fills (PDF/DOCX), not free-form LLM CVs.
