# Pliny public authentication rollout

This runbook moves Pliny from administrator-created private-beta accounts to verified email/password signup and Google sign-in. Application deployment and Supabase Auth configuration are separate changes. Validate the complete flow in an isolated Preview project before changing Production.

## 1. Isolated Preview prerequisites

- Use a dedicated non-Production Supabase project.
- Configure Vercel Preview with that project's `NEXT_PUBLIC_SUPABASE_URL` and public anon/publishable key.
- Do not expose or add a Supabase service-role key to the browser or normal Vercel application runtime.
- Apply Pliny's reviewed database migrations and ownership/RLS policies to the Preview database.

## 2. Supabase URL configuration

Set the Preview Site URL to the canonical Vercel Preview origin. Add these exact application destinations to the redirect allowlist:

- `{APP_ORIGIN}/auth/callback`
- `{APP_ORIGIN}/auth/confirm`
- `{APP_ORIGIN}/auth/reset-password`

Do not use an unrestricted wildcard for Production.

## 3. Email/password authentication

- Enable email signup.
- Require email confirmation.
- Set the minimum new-password length to at least eight characters.
- Install the confirmation template from `supabase/templates/confirmation.html`.
- Install the recovery template from `supabase/templates/recovery.html`.
- Keep the templates' `RedirectTo` and `TokenHash` parameters intact. The `/auth/confirm` route verifies the token hash and writes the SSR session cookie before redirecting to the dashboard or password-update page.

## 4. Production email delivery

- Configure a custom SMTP provider; Supabase's default sender is not a Production delivery service.
- Use a sender domain with SPF and DKIM, and publish an appropriate DMARC policy.
- Disable click tracking for authentication emails because link rewriting can break verification URLs.
- Enable password-changed security notifications.
- Confirm the configured token lifetime before changing any expiry copy in the interface.

## 5. Google OAuth

In Google Cloud:

- Configure the OAuth consent screen and the minimum `openid`, `email` and `profile` scopes.
- Create a Web OAuth client.
- Add `{SUPABASE_PROJECT_URL}/auth/v1/callback` as an authorized redirect URI.

In Supabase:

- Enable the Google provider.
- Store the Google client ID and client secret in Supabase Auth settings, never in frontend source.
- Confirm that a Google identity using the same verified email follows the intended account-linking behavior before Production rollout.

## 6. Abuse and cost controls

- Review Supabase signup, sign-in, recovery and token-verification rate limits.
- Enable Turnstile or hCaptcha before broad public promotion if automated signup becomes material.
- Keep Pliny's AI request and daily-budget guards enabled and monitor spend after opening signup.
- Do not treat authentication alone as authorization; owner-scoped RLS remains mandatory.

## 7. Acceptance gate

Use a disposable synthetic address and synthetic documents only. Verify:

1. Email signup creates an unconfirmed user and no authenticated workspace session.
2. The confirmation email reaches the test mailbox and `/auth/confirm` establishes an SSR cookie session.
3. Existing email/password accounts still sign in.
4. Google sign-in returns through `/auth/callback` and persists after refresh.
5. Unknown and known recovery addresses receive indistinguishable browser responses.
6. The recovery email establishes a recovery session and permits one password update.
7. Expired, modified and reused links fail safely without exposing tokens.
8. `/dashboard` and `/collection/*` remain protected while signed out.
9. A new user can create only owner-scoped resources; another user cannot read them.
10. Logout clears the session.

For local infrastructure, run `npm run test:local-auth` with the local application, Supabase and test mailbox running. Then repeat the browser flow against the isolated Vercel Preview.

## 8. Production promotion and rollback

- Promote only the exact Preview-tested commit.
- Apply the reviewed Auth settings and templates to Production immediately before or with the application promotion.
- Preserve the current known-good Production deployment for application rollback.
- If authentication misbehaves, disable new signup and the Google provider, restore the preserved deployment, and leave existing database ownership/RLS policies intact.
