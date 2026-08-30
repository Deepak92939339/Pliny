# Deployment Checklist

Pliny AI is not production-verified until these checks are complete.

## Supabase

- Set Supabase Auth Site URL to the production domain.
- Add localhost redirect URLs for development.
- Add Vercel preview redirect URLs.
- Add the production redirect URL.
- Run `src/lib/supabase/schema.sql`.
- Run `src/lib/supabase/rls-verification.sql`.
- Confirm the `documents` Storage bucket is private.
- Manual Storage RLS test: User A uploads a PDF.
- Manual Storage RLS test: User B must not list User A's storage prefix.
- Manual Storage RLS test: User B must not download User A's storage object.
- Manual Storage RLS test: unauthenticated requests must not list private bucket contents.

## Secrets

- Never commit `.env.local`.
- Rotate any key that was pasted into a public or shared place.
- Run gitleaks or trufflehog before making the repository public.

Manual action required:
Enable GitHub Push Protection:
GitHub repository -> Settings -> Code security and analysis -> Secret protection / Push protection.

Purpose:
Prevent accidental secret commits at push time instead of only detecting leaks after they happen.

## Production Rate Limits

- Create an Upstash Redis database.
- Set `UPSTASH_REDIS_REST_URL`.
- Set `UPSTASH_REDIS_REST_TOKEN`.
- Confirm production chat/upload/process routes block safely if rate-limit configuration is missing.

## Security Headers

- Deploy with report-only CSP first.
- Review CSP reports for required domains.
- Tighten `script-src` and `style-src` after confirming Next.js runtime requirements.
- Move CSP from report-only to enforced only after preview testing.

## Verification

- Login works.
- Project creation works.
- Server-side PDF upload works.
- PDF processing works for selectable-text PDFs.
- OCR fallback is bounded and does not run for normal readable PDFs.
- Questions return cited answers.
- Citations open Source Inspector.
- Chat messages are persisted.
- AI usage events are logged.
