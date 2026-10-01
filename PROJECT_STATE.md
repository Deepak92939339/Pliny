# Pliny Project State

## Codex corrective Preview candidate — 2026-10-01

- Active branch `fix/pliny-audit-r1-preview-20260930`; parent candidate `57e76dfb4979ffc3ba0754997a8b956b9d9f6775`. Independent corrections cover pricing-null crash, document-delete limiter fail-open, CSP request nonce forwarding/hydration, metadata font sizing, mobile hit areas, root-error stylesheet, dev fixture geometry, audit/report truthfulness and safe packaging.
- Typecheck, lint (two existing warnings), 26 deterministic suites, additional UI-review tests, 36 release cases, build, client secret canary scan and diff check pass. Provider requests: 0. See `docs/release/CODEX_REPAIR_VERIFICATION.md` for exact coverage and remaining limitations.
- Separate Supabase staging project initialized previously; URL/anon-key now override only this branch's Vercel Preview. Production untouched. Publish this branch to Preview only; no merge or main push. Authenticated hosted acceptance needs a staging test user and confirmed isolated Redis. Full axe/FPS and complete DOM collection remain pending; CSS reduction is 9.23%, not 40%. No Production approval.

## Antigravity Audit Fix R1 candidate integration — 2026-09-30
- Task workspace: `/Users/sandman/Desktop/RAG intelligence/pliny-antigravity-review`
- Publishing branch: `fix/pliny-audit-r1-preview-20260930`
- Base commit: `b8a984417d6c07d865613b739aa45d9875dd6fd3` (clean and matching remote `origin/main`)
- Package integration:
  1. Applied all 10 commits of `pliny-fix-FINAL/ALL.patch` cleanly via git am.
  2. Applied `PLINY_WP3_HOTFIX.patch` cleanly via git am, correcting the WP3 zero-count regression (`status !== "allowed"` replaced with `status === "blocked"` exclusion).
  3. Corrected the UTC-clock dependency flaw in `scripts/test-rate-limit-retry.mjs` using fixed noon-UTC timestamps, added UTC-day-boundary assertion, and confirmed the 40 success + 10 blocked fixture yields exactly 40 minute requests, 40 daily requests, and $0.40 spend.
- Gates passed:
  - `npm ci` (lockfile updated with `@xmldom/xmldom: 0.8.15` and `ai` bump; `npm audit --omit=dev` = 0 vulnerabilities)
  - `npm run typecheck` (exit 0)
  - `npm run lint` (exit 0, 0 errors, 2 pre-existing unused variable warnings)
  - `npm run test:deterministic` (exit 0, all 24 suites pass)
  - `npm run test:eval` (exit 0, 36/36 release evaluation cases pass)
  - `npm run build` (exit 0, all routes compiled cleanly)
  - `npm run test:privacy:bundle` (exit 0, no secrets or provider config exposed in client bundle)
  - `git diff --check` (exit 0, clean whitespace)
  - `OCR_ENABLED=true PLINY_OCR_E2E=1 npm run test:ocr-e2e` (exit 0, 2-page scanned PDF OCR completed in 3.9s vs 240s budget)
  - Production server live CSP inspection: enforced nonce-based CSP, `strict-dynamic`, no `unsafe-eval` in production mode.
- External provider requests used: `0` (ceiling 25).
- Additive database migration: `supabase/migrations/20260929090000_documents_content_sha256.sql` (adds nullable `documents.content_sha256` and index; non-breaking).
- Staging / Production status: Production main, Production Vercel deployment, and Production Supabase remain untouched. Local Docker daemon is unavailable, so local container E2E was bypassed in favor of deterministic mocks. Remote staging writes require owner-provided staging project.
- Candidate commit: `69de250` (plus documentation commit).

## Antigravity repair delegation guide — 2026-09-30

- User requested a lower-cost Antigravity workflow to integrate/verify the supplied repair package, commit/push a separate branch, and deploy only Preview before Codex final review. Prepared `work/antigravity/PLINY_ANTIGRAVITY_SETUP.md` and `work/antigravity/PLINY_ANTIGRAVITY_REPAIR_PROMPT.md`; no application edits, Git commits/pushes, deployments, or hosted configuration changes were performed.
- Active canonical repository remains `vector-rebuild-preview`, branch `fix/luna-openrouter-embeddings-20260927`, clean at `b8a984417d6c07d865613b739aa45d9875dd6fd3`. Provider requests: `0`. Suggested delegated clone `pliny-antigravity-review`, publishing branch `fix/pliny-audit-r1-preview-20260930`; neither was created in this documentation phase.
- Guide includes exact patch inputs, WP3 persisted-status regression and UTC test flaw, claim-by-claim evidence, existing local gates, staging-only schema/write checks, a 25-request task-wide provider ceiling, explicit non-main push refspec, draft PR/Preview handoff, and prohibition on Production writes/promotion. Preview must use a separate Supabase backend and isolated Redis when applicable.
- Verified current official Antigravity, Gemini, Supabase, and Vercel setup documentation. Recommended Gemini 3.8 Flash for routine execution with Pro escalation for difficult failures; this is a workflow judgment, not a measured Pliny model comparison. Exact next phase: owner opens the delegated workspace/configures staging access and runs the prompt; Codex later reviews the exact candidate SHA, complete diff, evidence, and hosted Preview before any separately authorized release.

## Supplied Audit Fix R1 package triage — 2026-09-29

- Active release repository `/Users/sandman/Desktop/RAG intelligence/vector-rebuild-preview`, branch `fix/luna-openrouter-embeddings-20260927`, commit `b8a9844`, clean and synchronized with `origin/main`. The latest connected Vercel Production deployment remains READY from `b8a9844`; none of the supplied package is live. Provider requests: `0`.
- Reviewed `/Users/sandman/Downloads/pliny-fix-FINAL.zip` and `/Users/sandman/Downloads/PLINY_WP3_HOTFIX.patch` as untrusted review material. ZIP integrity passed; `ALL.patch` is a 10-commit mbox touching about 120 diff entries across processing, retrieval, rate limits, security, document management, visual tokens, docs and assets. `git apply --check` against current clean source passed. The hotfix preimage blob hashes exactly match the corresponding files in the ZIP snapshot.
- Independently reproduced the WP3 defect in an isolated temporary copy of the supplied source: 40 same-minute `success` rows (each estimated $0.01) produced minute/day/spend `0/0/$0` because `summarizeUsageEvents` required `status === "allowed"`. Current database schema restricts persisted status to `success|failed|blocked`, and the live chat route writes these labels. With the hotfix filter (`status === "blocked"` skipped), the same 40 `success` rows plus 10 `blocked` rows produced minute/day/spend `40/40/$0.40`. This specific zero-count bug is **not** in current Production `b8a9844`; it is introduced by `ALL.patch` and corrected by the supplied hotfix.
- Found an independent test flaw in the supplied rate-limit suite: its daily-count case uses `now = new Date()` and assumes rows 2–4 hours ago are all in the current UTC day. At 2026-09-29 03:39 UTC, the isolated hotfix-style suite scored 7/8 because 4-hour-old rows were yesterday. Changing only the temporary test fixture to a fixed noon-UTC clock made it 8/8. The delivered hotfix itself does **not** contain this fixture correction. Current source `npm run test:budget` passed. No full package build, integration test, or Production acceptance test was performed by Codex; supplied logs are evidence leads, not independent verification.
- Do not deploy the unmodified `ALL.patch` alone. Before promoting the broad package, fix the UTC-dependent test, review the full diff and database migration, apply both patches on an isolated review branch, run the full local gate plus relevant authenticated synthetic flows, then coordinate the additive `documents.content_sha256` migration before enabling the new upload code. The repaired guard remains an estimated, per-user check rather than a strict account-wide atomic spending cap. No source patch, migration, commit, push, or Production change was made in this triage.

## Luna and OpenRouter Voyage release candidate — 2026-09-27

- 2026-09-28 Production promotion verified: user fast-forward pushed local `b8a9844` to GitHub `main` (`42c4e3c..b8a9844`). The Git-linked Vercel Production deployment is READY from exact commit `b8a984417d6c07d865613b739aa45d9875dd6fd3`, and its alias list includes `pliny.vercel.app` with no alias error. Read-only live browser smoke: `/` and `/login` rendered; signed-out `/dashboard` redirected to `/login?redirectedFrom=%2Fdashboard`. Current-deployment runtime logs for these requests show HTTP 200/304/307 and no error-level entries. This does **not** verify authenticated ingestion, embedding, Luna answers, or budget enforcement. The Vercel runtime-errors grouping includes historical errors from prior deployments (including document processing/embedding/OCR), not evidence of a failure on this new deployment. Active repo `/Users/sandman/Desktop/RAG intelligence/vector-rebuild-preview`, branch `fix/luna-openrouter-embeddings-20260927`, commit `b8a9844`, clean and synchronized with `origin/main`. Provider requests this verification: `0`. No additional commit, push, Vercel configuration change, or Production write was made by Codex. Next: one explicitly authorized bounded Production acceptance test with a synthetic document and the temporary QA account, covering upload/process, retrieval, grounded citation, refusal, and cost/budget logs; investigate any observed failure before declaring runtime success.

- 2026-09-28 Production read-only smoke: `https://pliny.vercel.app/` and `/login` rendered, and a signed-out `/dashboard` request redirected to `/login?redirectedFrom=%2Fdashboard`. The Vercel connected deployment record shows the newest READY Production deployment serving the canonical alias is a **redeploy of old GitHub commit `42c4e3c`**, not the local Luna/OpenRouter Voyage commits `9a71c85` and `b8a9844`. The local `vector-rebuild-preview` tree remains clean on `fix/luna-openrouter-embeddings-20260927` at `b8a9844`, ahead of the last recorded `origin/main` by two commits; `git ls-remote` still fails local DNS for `github.com`. This check does not establish that answer or embedding flows work on Production; no authenticated write or provider request was made (`0`). The immediate blocker is promotion of the tested code to `main` followed by a new READY deployment whose source SHA is `b8a9844` (or its verified merge equivalent). Confirm `EMBEDDING_MODEL=voyageai/voyage-4` and the intended budget value before promotion. No Production configuration, code, commit, push, or deployment was changed in this check.

- 2026-09-28 Vercel read-only audit: Chrome dashboard confirms Production secret `OPENROUTER_EMBEDDINGS_API_KEY` exists, `EMBEDDINGS_PROVIDER=openrouter`, `OPENROUTER_MODEL=openai/gpt-6-luna`, and `AI_MAX_REQUESTS_PER_DAY=600`. Preview's separate `OPENROUTER_MODEL=z-ai/glm-5.3-flash` is correctly scoped and not a duplicate conflict. Production `AI_DAILY_BUDGET_INR=120` differs from the requested 100, and `EMBEDDING_MODEL=voyage-4` must be changed to `voyageai/voyage-4` for the OpenRouter transport. Production `ANSWER_PROVIDER` and `AI_MODEL_PRICING_JSON` were not independently verified. Vercel's “Needs Attention” filter explains that five Upstash integration-related Config variables look like secrets and should be rotated/saved as Secret; `AI_MAX_OUTPUT_TOKENS=700` is a false-positive warning. App code references `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; do not delete integration variables casually. No credentials were revealed or changed, no Production write, commit, push, or deploy occurred. Provider requests: `0`. Active repository remains `vector-rebuild-preview` on `fix/luna-openrouter-embeddings-20260927` at `b8a9844`, clean. Next: owner edits the two confirmed Production mismatches and verifies remaining AI configuration; then promote tested commits when GitHub connectivity and release gate allow. Handle Upstash secret rotation as a separate controlled security phase.

- 2026-09-28 update: user reports the new `OPENROUTER_EMBEDDINGS_API_KEY` secret has been saved in Vercel Production; its value was not shared and the hosted setting is not independently verified. Other Production variable values still require confirmation before promotion. A fresh `git ls-remote` attempt still failed local DNS resolution for `github.com`; no push/deployment occurred. Provider requests in this update: `0`.

- Active repository: `/Users/sandman/Desktop/RAG intelligence/vector-rebuild-preview`; branch `fix/luna-openrouter-embeddings-20260927`; commits `9a71c85` (runtime/docs/config) and `b8a9844` (privacy regression), based on the previously recorded Production `origin/main` commit `42c4e3c`. Working tree clean after the commits. The older `vector` checkout was untouched.
- Corrected the README and architecture/deployment documentation to describe OpenRouter answer generation; changed the default answer model to `openai/gpt-6-luna`; added model-specific budget pricing via `AI_MODEL_PRICING_JSON`; added a separate `OPENROUTER_EMBEDDINGS_API_KEY` path for `voyageai/voyage-4` via OpenRouter while preserving direct Voyage as a fallback configuration. The requested ₹100 daily cap and 600 daily request cap are existing environment-configured controls; they require Production variable changes, not source edits.
- Verified official model IDs and listed rates, a bounded synthetic live Luna answer/refusal contract, and synthetic OpenRouter Voyage document/query embedding contracts. Approximate completed provider requests in this phase: 7; no real or private documents were sent. The attempted direct Voyage comparison did not connect.
- Passed optimized `npm run build`, `npm run lint`, `npm run typecheck`, full `npm run test:deterministic`, `npm run test:eval` (36 cases), `npm run test:privacy:bundle`, and `git diff --check`. The new mocked privacy regression proves original identifiers do not enter OpenRouter embedding requests.
- No push or Production deployment occurred. `git ls-remote origin refs/heads/main` currently fails because this machine cannot resolve `github.com`; Vercel CLI environment listing hung and the dashboard browser tab was unreachable. Production variable status cannot be independently verified. The user clarified that the separate embeddings key has **not** been saved and will be added later. Do not push before the required Production variables and new key are confirmed, because GitHub-linked `main` can auto-deploy.
- Exact next phase: confirm the Pliny Vercel Production variables (`ANSWER_PROVIDER=openrouter`, `OPENROUTER_MODEL=openai/gpt-6-luna`, `EMBEDDINGS_ENABLED=true`, `EMBEDDINGS_PROVIDER=openrouter`, `EMBEDDING_MODEL=voyageai/voyage-4`, `EMBEDDING_DIMENSIONS=1024`, separate embeddings key, `AI_DAILY_BUDGET_INR=100`, and `AI_MAX_REQUESTS_PER_DAY=600`). `AI_MODEL_PRICING_JSON` is optional because the tested source includes Luna pricing defaults. Restore GitHub connectivity; verify remote `main` has not moved; fast-forward the two tested commits to `main`, push, inspect the resulting Production deployment and read-only live smoke. Keep prior deployment as rollback target.

Last updated: 2026-09-28 IST — Luna/OpenRouter Voyage commit is live in Production; authenticated runtime acceptance remains

## Shared QA login verified on Production — 2026-09-26

- The user created the temporary shared QA account `pliny.team.qa@example.com` and reported turning OFF both public signup and Confirm Email. Read-only `auth.users` query independently confirmed exactly one matching user, with a non-null `email_confirmed_at`; no credential was stored in this state file.
- Production browser test at `https://pliny.vercel.app/login` succeeded with the user-provided temporary QA password: redirected to `/dashboard`, displayed the QA email and zero workspaces, then signed out back to `/login`. No documents, workspaces, provider prompts, or user data were created during the test. Provider requests: `0`.
- The existing Production private-beta login already handles this account. No code edit, commit, push, merge, Vercel deployment, or schema change was needed. Active Git checkout remains `vector-rebuild-preview`, branch `feature/public-auth-google-20260922`, commit `cb3edfc`, clean; Production source remains `42c4e3c`.
- The public-signup and Confirm Email switches were reported by the user but not independently re-read after their change because the live Chrome window was in active use. Supabase's current guidance says disabling Confirm Email implicitly confirms new email addresses. Recommend turning Confirm Email back ON now that the admin-created QA user is already confirmed, while keeping public signup OFF. Re-check both switches before any public launch.
- The QA email uses reserved `example.com` and cannot receive recovery mail; use only synthetic documents and do not rely on password reset. Supabase discourages fake-domain email identities because of delivery/bounce concerns. Sunset/replace this temporary account within about one week; do not promote the unfinished public-auth feature branch as part of this interim test.
- Exact next phase: the team exercises the existing Production workflow with synthetic data, reports defects; owner turns Confirm Email back ON and confirms public signup OFF. Later, configure a real owned email domain/SMTP sender and Google OAuth, run hosted acceptance tests, and separately authorize public-auth branch promotion.

Last updated: 2026-09-26 IST — Production QA password login and sign-out verified; temporary account remains for team testing

## One-week shared QA account request — 2026-09-26

- User changed release scope: defer Google OAuth, public signup, and SMTP/domain work for about one week; use one shared, auto-confirmed email/password QA user for team testing with synthetic documents only. Production `main` already contains email/password login, so no code deployment is needed for this interim mode. Do not promote the public-auth feature branch for this request.
- Active Git tree `vector-rebuild-preview`, branch `feature/public-auth-google-20260922`, commit `cb3edfc`; clean. Production `main` remains `42c4e3c`. No code edits, commit, push, merge, or deployment in this phase.
- Confirmed active `.env.local` targets Production Supabase project `lnvosbeeybisdixfwqdo`; it has no populated local `SUPABASE_SERVICE_ROLE_KEY`. The Supabase CLI can list Production key metadata without revealing values. A one-time Admin API create-user attempt using an in-memory retrieved service-role key timed out before contacting the project Auth endpoint; no account was reported created. Read-only SQL check confirmed zero users with the proposed `pliny.team.qa@example.com` address.
- Inspected the Production Supabase dashboard's `Authentication → Users → Add user → Create new user` form. It includes `Auto confirm user?` checked by default and explicitly says no confirmation email is sent. Browser credential-entry rules require the user to enter and submit the new password in that form; do not claim completion until the user does so and login succeeds.
- Provider requests: `0`; Production Auth write requests completed: `0`. No team documents were uploaded or read. The user said they will disable new-user signup after the QA account is created; verify that switch afterward.
- Exact next step: user creates the auto-confirmed synthetic QA account through Supabase Dashboard; then verify account existence and production password login, confirm new-user signup disabled, and document the temporary-account sunset plan. All testers must use synthetic documents because the shared account has one identity and one common workspace.

Last updated: 2026-09-26 IST — temporary QA account not yet created; no Production code change required

## Public auth deployment preflight — 2026-09-26

- User asked to complete custom SMTP setup, verify both Google and email flows, then merge/deploy. Active Git tree remains `vector-rebuild-preview` on `feature/public-auth-google-20260922` at `cb3edfc`; no new repository edits, commit, push, merge, or deployment.
- Supabase Production dashboard UI was checked: “Allow new users to sign up” ON, “Confirm email” ON, Email provider enabled, Google provider enabled, and anonymous sign-ins OFF. This independently verifies the user's signup setting change.
- No SMTP/Resend/Postmark/SendGrid/Mail credentials were present in the active repo's `.env.local` key names or current process environment key names. Hosted Production previously reported no custom SMTP. The default Supabase sender is restricted to project-team recipients, so public email confirmation/recovery cannot be validated or released without a user-owned SMTP account/sender configuration.
- Supabase and Vercel deployment guidance was consulted. No provider requests, synthetic accounts, or Production browser writes were made. Next step is for the user to choose/provide a custom SMTP service and complete any required account/domain/sender verification privately; after that, re-read hosted settings, test both auth paths, and deploy if green.

Last updated: 2026-09-26 IST — signup/provider switches confirmed; SMTP service identity and credentials remain external blocker

## Public auth launch choice — 2026-09-26

- The user selected a simultaneous Google OAuth plus public email/password launch and reported enabling the hosted “Allow new users to sign up” switch. This latest switch change is user-reported, not yet independently re-read.
- Current Supabase documentation confirms the default SMTP sender delivers only to project-organization team addresses and is not suitable for public confirmation or password recovery. A custom SMTP sender is therefore a release prerequisite for the selected mode; do not promote the current public-email UI as broadly functional without it.
- “Allow anonymous sign-ins” is unrelated to Google or email signup and should remain disabled for Pliny. Anonymous users receive the `authenticated` database role, so enabling it would require a separate authorization/RLS audit.
- No repository commit, merge, push, or deployment occurred in this phase. Active repository remains `vector-rebuild-preview`, branch `feature/public-auth-google-20260922`, commit `cb3edfc`; status clean. Provider requests: `0`.
- Next phase: configure custom SMTP privately in Supabase, confirm Google and email provider settings/redirect URLs, run bounded hosted signup, confirmation, recovery, and Google acceptance tests with synthetic/test accounts, then promote the tested commit to `main` and Production with rollback retained.

Last updated: 2026-09-26 IST — Google + public email selected; custom SMTP is the remaining hosted release prerequisite

## Google-only release gate audit — 2026-09-26

- Active repository: `Desktop/RAG intelligence/vector-rebuild-preview`; branch `feature/public-auth-google-20260922`; commit `cb3edfcf37ceb87185c2206715772f95fcc4675a`; working tree clean before this audit. Remote `main` remains `42c4e3cb7aede623381e6f4499a7832d04b40b6f`, and the auth feature branch remains at `cb3edfc`. No merge or deployment occurred in this audit.
- The user configured a Google OAuth Web client in hosted Supabase. Read-only Management API inspection confirmed the Google provider is enabled and both client ID and secret fields are configured; no secret was read or printed. The Pliny feature branch already contains the Google button server action and `/auth/callback` code. The current canonical Production login does not yet show the Google button.
- Hosted Production Auth remains unready for a public release: signup is disabled, email signup is enabled, and custom SMTP is absent. Promoting the feature branch unchanged would advertise email account creation/recovery that cannot deliver mail to arbitrary users. Google OAuth for new users also requires enabling global signup; that must be coordinated with disabling email signup or adding SMTP and with appropriate UI changes.
- Applied and re-read a narrowly scoped Production Auth URL correction: Site URL is now `https://pliny.vercel.app`; the allowlist retains both prior `/login` entries and adds exact Production `/auth/callback`, `/auth/confirm`, and `/auth/reset-password` destinations. Before this patch the Site URL was `http://localhost:3000` and only the `/login` destinations were allowed. Signup and provider switches were unchanged. This URL change alone does not make the unreleased auth UI available or create users.
- Fresh `npm run typecheck`, `npm run lint`, `npm run test:auth`, optimized `npm run build`, and post-build privacy-bundle scan passed. No provider requests. Docker daemon is unavailable, so no new local Supabase runtime E2E ran.
- Asked the user to choose Google-only now (hide public email signup/recovery while preserving existing password login) or wait for full email+Google with SMTP. Do not merge or deploy until that choice and the corresponding hosted Auth configuration/flow verification are complete.
- Exact next phase: implement the selected release mode, set exact Production/Preview callback URLs, verify a bounded real Google sign-in with an authorized test account or isolated Preview project, then merge tested code to `main`, inspect Vercel Production and retain rollback target.

Last updated: 2026-09-26 IST — Google provider credentials are configured, but signup/redirect/SMTP release gates remain

## Public authentication release candidate — 2026-09-24

- Active repository: `Desktop/RAG intelligence/vector-rebuild-preview`; branch `feature/public-auth-google-20260922`; commit `cb3edfc` (`feat(auth): add verified signup, recovery, and Google sign-in flows`). The branch was pushed to `origin/feature/public-auth-google-20260922`; the working tree is clean.
- Resumed the 2026-09-22 integration after the user revoked the manual pause. Rechecked typecheck, lint, authentication tests, deterministic tests, the 36-case evaluation, optimized Production build, privacy-bundle scan and staged diff integrity; all passed. The full local auth and product E2E had passed on 2026-09-22 and were not rerun in this continuation. Provider requests this phase: `0`.
- Vercel automatically built Preview deployment `dpl_5BeMrc63aT8jHR2cHM3hrvvKevxY` from the pushed branch; status `READY` at `https://pliny-co2h1hfwv-deepakpatro626472-2604s-projects.vercel.app`. Read-only protected-Preview smoke returned HTTP 200 for `/signup`, `/login`, and `/auth/reset-password`; signed-out `/dashboard` redirected to `/login`, and a missing confirmation token redirected to `/login?auth=confirm-invalid`. Production remains on the known-good `42c4e3c` deployment; no alias promotion was attempted.
- Hosted Supabase project `lnvosbeeybisdixfwqdo` is active again, but its Production Auth settings remain incompatible with public authentication: signup is disabled, Site URL is `http://localhost:3000`, allowed redirect destinations include only `/login`, Google is disabled with no OAuth client ID/secret, and no custom SMTP credentials are configured. Email confirmation is required, but the hosted templates have not been aligned with this commit. No Production Auth setting was changed in this continuation.
- The canonical `https://pliny.vercel.app` alias was rechecked after the branch push and still resolves to the prior READY Production deployment `dpl_5bwwi42tiXZn3X1HHb3HsbWvPC7y`. An optional draft-PR creation attempt was denied by the GitHub integration (`403 Resource not accessible by integration`); the pushed branch remains available for review, and no PR was created.
- Release gate: obtain/configure a verified email sender and custom SMTP credentials plus a Google OAuth Web client, use an isolated Preview Supabase project for hosted disposable-user E2E, then configure Production Auth URLs/templates/providers and promote only the exact validated commit. Do not expose the new signup/Google UI at `pliny.vercel.app` while the hosted providers are unavailable.
- Exact next phase: inspect the Preview build and perform read-only route smoke; then complete external SMTP/Google setup with the user-provided accounts or credentials, run hosted signup/confirmation/recovery/Google and owner-isolation tests, and finally promote to Production with a rollback target preserved.

Last updated: 2026-09-24 IST — auth release candidate committed and pushed; hosted provider configuration and Preview acceptance gate remain

## Public authentication integration — 2026-09-22

- Active repository: `Desktop/RAG intelligence/vector-rebuild-preview`; branch `feature/public-auth-google-20260922`; base commit `42c4e3c`. The working changes are intentionally uncommitted.
- Integrated the Qwen-generated authentication components as review material, then corrected the implementation rather than accepting it verbatim. Pliny now has verified email/password signup, Google OAuth initiation and callback exchange, token-hash email confirmation, real password recovery, a password-update surface, safe local redirects and non-cacheable auth route responses.
- Replaced the private-beta access UI with public account creation across login, signup, landing and access-information surfaces. Removed the obsolete private-beta component and rejection helper. Existing owner-scoped RLS and workspace behavior were not changed.
- Added local Supabase confirmation and recovery templates using `RedirectTo` + `TokenHash`, enabled local email confirmations, raised new-password minimum length to eight characters and preserved existing-user login validation independently from signup policy.
- Added `scripts/test-auth.mjs` and `scripts/test-local-auth-e2e.mjs`. The deterministic auth test covers redirect safety, origin parsing, generated route/action contracts, email templates, confirmation configuration, public account messaging and preserved database execution grants. The local runtime E2E now proves signup → email confirmation → SSR session → recovery → password update → replacement-password login → cleanup through local Supabase and its test mailbox.
- Verification passed: `npm run typecheck`, `npm run lint`, `npm run test:auth`, full `npm run test:deterministic`, the 36-case `npm run test:eval`, optimized `npm run build`, the post-build browser privacy-bundle scan, a client-bundle server-secret identifier scan, `npm run test:local-auth`, and `npm run test:local-e2e`. The database-backed E2E covered authenticated workspace creation, TXT/PDF/DOCX ingestion, malformed-PDF rejection, retrieval, privacy-minimised processing, evidence refusal, history and authenticated workspace rendering. Because that regression intentionally performs six upload requests, its server used a local test-only `UPLOAD_MAX_REQUESTS_PER_HOUR=10`; the application default remains five.
- Local browser checks also passed for landing, login, signup, recovery view, reset page, missing/invalid callback redirects and signed-out dashboard protection. Browser checks found no error overlay or horizontal page overflow at the exercised desktop viewport.
- The first local auth attempt exposed a stale running Auth container that still auto-confirmed signup. Restarting only the local Supabase project, with its database volume preserved, loaded the current confirmation/recovery templates; the complete local auth E2E then passed and removed its synthetic user. The broader local E2E also cleaned up its synthetic user, documents and storage objects.
- All runtime verification remained local. Google OAuth was not exercised because it requires a configured external provider. Provider requests: `0`; all external answer and embedding keys were blank, and no remote users or data were created.
- Remaining external work: enable signup and email confirmation in an isolated Preview Supabase project, install the reviewed confirmation/recovery templates, configure custom SMTP, configure the Google provider and its Google Cloud redirect URI, set the Preview Site URL/redirect allowlist, then run the disposable hosted auth E2E before any Production change.
- No commit, push, deployment, remote configuration change or Production write was performed.
- Exact next phase: provision an isolated Preview Supabase project, apply the reviewed signup/confirmation templates, SMTP, Google provider, Site URL and redirect allowlist, then deploy this branch to Vercel Preview and run the disposable hosted auth/browser acceptance flow. Keep Production unchanged until that evidence is green.

Last updated: 2026-09-22 IST — public authentication and provider-free product paths pass local runtime E2E; hosted Google/SMTP verification remains for isolated Preview

## Production favicon repair — 2026-09-21

- Active release worktree: `Desktop/RAG intelligence/vector-rebuild-preview`; branch `release/pliny-rebuild-preview-20260921`.
- Commit `42c4e3cb7aede623381e6f4499a7832d04b40b6f` (`fix(brand): replace legacy favicon`) is on both `origin/main` and the release branch.
- Replaced the legacy illustrated book/magnifier browser icon with a cache-busted, single-colour serif `P` SVG. The SVG uses navy ink in light browser chrome and warm ivory ink in dark browser chrome. Root Next.js metadata and the web manifest now reference the same asset.
- Added a focused trust regression that rejects the old favicon reference and verifies the new metadata, manifest and dark-mode treatment.
- Verification passed: XML validation, `git diff --check`, `npm run test:trust`, `npm run typecheck`, `npm run lint`, standard optimized `npm run build`, Vercel Production `vercel build --prod`, live metadata inspection and browser-console inspection.
- Production deployment: `https://pliny.vercel.app` points to `https://pliny-48p49bglh-deepakpatro626472-2604s-projects.vercel.app`, deployment `dpl_5bwwi42tiXZn3X1HHb3HsbWvPC7y`, status `READY`.
- Live metadata exposes only `/brand/pliny-monogram.svg?v=20260921`; the legacy `pliny-mark-16.png` reference is absent. Browser console and Vercel error-log scans were clean. Provider requests: `0`.
- Three earlier CLI-sourced deployment attempts were blocked by Vercel's team commit-attribution policy and never received the canonical Production alias. The normal verified GitHub-linked deployment succeeded; no permissions or Production configuration were changed.
- Exact next phase: visually confirm the refreshed browser tab in Chrome. If Chrome retains the old icon in an already-open tab, hard-refresh or close/reopen the tab once; the asset URL itself is cache-busted.

Last updated: 2026-09-21 IST — monochrome favicon committed, deployed and verified in Production

## Editorial rebuild Production deployment — 2026-09-21

- Production source: remote `main` was fast-forwarded without force from `c0b3479` to tested rebuild commit `703f722931653fe655b11e8dbeedaa4de9c31e3d` (`feat(ui): complete Pliny editorial rebuild`). Local `HEAD` and `origin/main` resolve to the same commit.
- Production deployment: `https://pliny.vercel.app` points to `https://pliny-1kt7ukxje-deepakpatro626472-2604s-projects.vercel.app`, deployment `dpl_DUkYTdEoMyWKYnMZwvkMV8K3iHHT`, target `production`, status `READY`.
- Preserved application rollback target: the prior known-good Production deployment is `https://pliny-k6ridpcg9-deepakpatro626472-2604s-projects.vercel.app`, deployment `dpl_AqAL613ZYumUq7fwhX8GKv2kx9BH`. No database/schema migration accompanied this release.
- Live Production browser smoke passed the landing page at the normal desktop viewport and `390x844`, with no horizontal overflow, no browser console errors, zero public `/signup` links and correct `/access` calls to action. `/login` rendered its email/password form, and signed-out `/dashboard` redirected to `/login?redirectedFrom=%2Fdashboard`.
- The post-deployment Vercel error-log scan returned no errors. Provider requests in this promotion phase: `0`.
- The full pre-promotion gate remains recorded below: typecheck, lint, deterministic tests, 36-case evaluation, optimized build, privacy-bundle scan, secret/path scan, Preview browser smoke and bounded live OpenRouter contract checks all passed against the exact promoted commit.
- Remaining limitation: an authenticated upload/process/retrieval/answer/citation/export/sign-out flow was not repeated against Production after promotion. Keep the prior deployment above available for immediate application rollback if authenticated testing reveals a regression.

Last updated: 2026-09-21 IST — editorial rebuild deployed from `main` and verified at the canonical Production URL

## Editorial rebuild Preview deployment — 2026-09-21

- Active release worktree: `Desktop/RAG intelligence/vector-rebuild-preview`
- Branch: `release/pliny-rebuild-preview-20260921`
- Commit: `703f722` (`feat(ui): complete Pliny editorial rebuild`), pushed to `origin/release/pliny-rebuild-preview-20260921`.
- Source basis: merged `origin/main` commit `c0b3479`; the package rebuild was integrated in an isolated worktree. The existing dirty `feature/stage-7-ui-stitching` checkout and its unrelated files were not changed.
- Integrated the approved editorial landing, login, dashboard, workspace shell, Documents surface and Ask/evidence surface. Removed the dormant superseded workspace components recorded by the rebuild package.
- Corrected three release blockers before commit: public `Start workspace` links now use the private-beta `Request access` path; sidebar `Ask a question` now leaves Documents and focuses the composer; the trust regression follows the processing-boundary control into `WorkspaceView.tsx` and asserts the Documents-to-Ask transition.
- Vercel Preview configuration now has `OPENROUTER_API_KEY` as a secret and `ANSWER_PROVIDER=openrouter` / `OPENROUTER_MODEL=z-ai/glm-5.3-flash` as Preview-scoped configuration. Production variables and Production deployment were not changed.
- Preview deployment: `https://pliny-ac9lo6w27-deepakpatro626472-2604s-projects.vercel.app`, deployment `dpl_G3hhhxR57VEZaF9uQqj2tmMR38ea`, status `READY`.
- Verification passed: `npm run typecheck`, `npm run lint`, full `npm run test:deterministic`, `npm run test:eval` (36 cases), optimized `npm run build`, browser privacy-bundle scan, staged secret/path scan and `git diff --check`.
- Live OpenRouter verification passed both the grounded-answer and exact-refusal contracts with `z-ai/glm-5.3-flash`. Four bounded attempts occurred in this phase: one initial failed request, one safe diagnostic success, and two successful contract cases. The successful contract cases used 324 total tokens and approximately `$0.000065` reported/estimated combined cost.
- Deployed browser smoke passed landing and login at desktop, landing at `390x844`, no horizontal overflow, no Next.js error overlay, no browser console warnings/errors, zero public `/signup` links, correct `/access` CTAs and signed-out `/dashboard` redirect. Vercel returned no error-level runtime logs after the smoke.
- Remaining limitation: this phase did not create or use an authenticated synthetic Preview account, so upload/process/retrieval/answer/citation/export/sign-out were not repeated through the new visual shell. Those backend/provider paths retain the prior assurance evidence, while the new shell has fixture/browser evidence plus provider-free regressions. Production remains unchanged.
- Exact next phase: the user reviews the Preview. If accepted, run one disposable authenticated Preview flow, correct any observed UI defect, then separately authorize PR/merge or Production promotion. Do not promote this Preview merely because it is `READY`.

Last updated: 2026-09-19 IST — landing approved by the user; screen-2 login package is ready for Qwen; Production remains unchanged

## Current objective

Maintain Pliny as a live, controlled private portfolio/beta release with OpenRouter GLM 5.3 Flash as its primary runtime answer model. Public self-signup is disabled; administrator-created confirmed-user authentication is the supported access path. Production is deployed from the normally merged PR #1 at merge commit `c0b34792f618d7ad40f87490419018c72d0eb656`, the single reviewed forward security migration is applied, and the final bounded synthetic smoke and cleanup passed. The current local objective is to translate the approved six-file Stage 7 visual system one screen at a time without redesigning product logic; the corrected landing page is the first review gate.

## Product snapshot

Pliny is a private document-intelligence application built with Next.js App Router, React, TypeScript, Tailwind/shadcn, and Supabase Auth/Postgres/Storage/RLS. It supports workspaces, document upload and processing, retrieval, grounded answers, citations, a source inspector, privacy-minimised processing, reports, and conversation history.

Current runtime providers:

- OpenRouter `z-ai/glm-5.3-flash`: primary answer generation
- Anthropic: manually selectable answer generation; no automatic fallback
- Voyage: embeddings
- Tesseract: OCR support

## Evidence and source baseline

- Source snapshot commit: `66cdd48c4278d60784ee6a4b7507a02acdce40c3`
- Source archive: `pliny-source-snapshot-66cdd48c.zip`
- Assurance archive: `Pliny-Engineering-Assurance-Bundle.zip`
- The assurance archive contains the HTML dossier, synthetic corpus, Golden Dataset v1, deterministic harnesses, metrics, proposed patches P1–P7, evidence index, SHA-256 manifest, provenance, and worklog.
- The assurance archive has a pre-existing checksum mismatch for `evidence/evidence-index.json`. Preserve this as a documented historical limitation.
- Historical production browser observations exist, but original screenshots/network evidence were lost during an earlier agent sandbox reset. Do not describe that evidence as independently reproducible.

## Completed assurance work

The engineering audit and local remediation were completed against the source snapshot.

Confirmed before remediation:

- Lexical retrieval was over-constrained.
- Relevant context could be truncated before generation.
- Reports could receive an incorrect insufficient-evidence label.
- Conversation history had a 20-row retrieval cap.
- Ingestion fixtures depended on non-portable local paths.
- Malformed citation markers could be accepted.

Not reproduced:

- The original Production PDF HTTP 422 failure.
- Model-attribution failures.
- Garbled refusal output.

These unresolved observations require staging/runtime evidence before they can be classified as current defects.

Reported completed repairs:

- Retrieval behavior
- Bounded complete-passage selection
- Citation-marker validation
- Report classification
- History pagination
- Portable synthetic PDF/DOCX ingestion fixtures

Reported holdout results:

- Retrieval Hit@5: `0/6 → 6/6`
- Mocked answer/refusal correctness: `1/7 → 7/7`
- Citation correctness: `0/6 → 6/6`
- Unsupported answers remained: `0`

Reported validation:

- Thirteen local test tasks passed.
- Browser privacy scan passed.
- Lint passed.
- Typecheck passed.
- Production build passed.
- Provider requests made: `0`.

Reported remediation working tree:

`work/pliny-reliability-repair/source/pliny-src-66cdd48c`

Reported case study:

`work/pliny-reliability-repair/source/pliny-src-66cdd48c/docs/case-studies/pliny-reliability-repair.md`

Reported holdout harness:

`work/pliny-reliability-repair/source/pliny-src-66cdd48c/scripts/test-reliability-holdout.mjs`

## Release-candidate integration — 2026-09-06

- Canonical Git repository: `Desktop/RAG intelligence/vector`
- Local release branch: `release-candidate/reliability-repair-20260906`
- Base commit: `66cdd48c4278d60784ee6a4b7507a02acdce40c3` (`main` remains untouched)
- The canonical checkout exactly matched the audited snapshot before integration. The 20-file remediation set was applied as an uncommitted, reviewable diff; no commit, push, deployment, Production write, or persisted provider configuration change was made.
- Integration includes the focused retrieval/context/citation/report/history/portable-ingestion repairs, their regressions, the synthetic holdout, the provider-smoke harness, the case study, and `docs/release-candidate-checklist.md`.
- Local verification passed: 14 regression/privacy tasks (`citations`, `context`, `embeddings`, `evidence`, `ingestion`, `history`, `holdout`, `privacy`, `privacy:bundle`, `retrieval`, `report`, `sanitization`, `storage-cleanup`, and `trust`), lint, TypeScript typecheck, and the optimized Next.js production build.
- Live provider verification used synthetic text only and made no database writes. A successful unsandboxed probe completed 2 requests: Voyage returned a 1,024-dimensional embedding and Anthropic satisfied a minimal response contract. One earlier sandbox-only Voyage probe made up to 5 transport attempts without a provider response; one prior configuration-only probe made 0 requests. Do not report these as staging or Production accuracy results.
- The case study is now canonical at `Desktop/RAG intelligence/vector/docs/case-studies/pliny-reliability-repair.md` and clearly separates mocked holdout results from live provider results.
- Final local verification after the local Supabase repairs passed all 16 provider-free package test tasks, `supabase test db --local supabase/tests/phase4b_acceptance.sql` (`59/59`), lint, TypeScript typecheck, optimized production build, and the production browser privacy-bundle scan.

## Current limitations

- Public self-service signup and email confirmation are intentionally unavailable; administrators must create and confirm private-beta users.
- Exact Production OpenRouter billed tokens/cost and Voyage HTTP-attempt/billed-cost telemetry are unavailable. The final evidence records conservative bounds without treating the application preflight reservation as billing.
- Browser acceptance was Chrome-focused; Firefox and WebKit automation were unavailable.
- The Production smoke and quality corpus are synthetic and bounded. They do not establish universal accuracy or long-duration Production reliability.
- The final offline assurance report was rebuilt and structurally validated in this session, but a fresh local visual pass was unavailable because no browser surface could be opened.

## Final release review — 2026-09-07

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `release-candidate/reliability-repair-20260906`
- Base commit: `66cdd48c4278d60784ee6a4b7507a02acdce40c3`
- Release-candidate commit: `d215f1280a1416910fb81a83a879a534b6bb325b` (`fix: harden Pliny reliability release candidate`)
- The final commit contains 31 files with 2,296 insertions and 78 deletions. It includes the focused retrieval/context/citation/report/history/MIME repairs, portable fixtures and holdout tests, local Supabase bootstrap and grants, local database E2E harness, case study, and release checklist.
- The complete staged diff was reviewed against the base. Filename and content scans found no credentials, personal absolute paths, literal private UUIDs, generated caches, runtime debug additions, new dependencies, provider substitutions, or unrelated UI changes.
- Runtime providers remain Anthropic for answers, Voyage for embeddings, and Tesseract for OCR support. The Supabase local config contains standard environment placeholders only and does not change Pliny's runtime model providers.
- Final provider-free gate passed: holdout, history, report, ingestion, local migration bootstrap, 59/59 local database acceptance assertions, lint, TypeScript typecheck, optimized production build, and production browser privacy-bundle scan.
- Provider requests in this final review phase: `0`. No remote Supabase, shared staging, Production, push, merge, or deployment action was performed.
- Git initially proposed a machine-derived committer identity; the same single commit was amended before handoff to use neutral synthetic metadata. No personal identity remains in the release commit.

The next phase is either an explicitly approved shared non-Production staging exercise or an explicitly approved Production deployment. Both require a new instruction and must preserve the documented rollback plan.

## Read-only remote release-readiness inspection — 2026-09-07

- The linked Vercel project is `pliny`. Its current Production deployment is `READY`, was built from `main` at `66cdd48c`, and remains on the audited base rather than the local release candidate `d215f12`. The 20 deployments returned by the read-only listing were all Production deployments; no Preview deployment was present.
- The linked Supabase project is `vector`, reports `ACTIVE_HEALTHY`, and is hosted in `ap-southeast-2`. It must be treated as Production: it is the repository's sole linked remote database target, its migration history matches the database changes behind the current Production application, and Pliny's Supabase/runtime variables in Vercel are Production-scoped. Secret values, project references, URLs, organization IDs, and account details were not retrieved or recorded.
- Vercel contains 32 environment-variable entries. The Pliny variables needed for Supabase access, Anthropic answers, Voyage embeddings, feature enablement, and privacy pseudonymisation are present for Production but absent from Preview and Development. None of those required entries is branch-scoped for Preview. `SUPABASE_SERVICE_ROLE_KEY` is absent from Vercel, as expected for the normal application runtime.
- Remote migration history contains the five migrations from `20260830183604` through `20260902043330`, all of which exactly match local versions. There are no remote-only migrations. The local foundational migration `20260830000000_initial_schema_baseline.sql` is absent from the remote history.
- A read-only `supabase db push --linked --dry-run` made no changes and stopped with `LegacyDbPushMissingRemoteError` because the baseline sorts before the last remote migration. The CLI suggests `--include-all`, but that is not a safe release action: the baseline bootstraps a fresh database and contains unguarded `create policy` statements that can collide with the existing Production schema.
- A safely isolated Preview environment does not currently exist. Production credentials are not exposed to Preview, which is the correct boundary, but Preview is nonfunctional until it receives its own Supabase project and separately scoped non-Production runtime configuration.

### Verified deployment path

1. With separate authorization, provision a distinct non-Production Supabase project and configure only Vercel Preview-scoped Pliny variables for the release-candidate branch; never reuse the linked Production Supabase values.
2. Apply all six local migrations to the fresh Preview database, deploy commit `d215f12` as a Vercel Preview, and repeat the synthetic database-backed E2E, PDF/DOCX ingestion, privacy, provider-contract, and browser checks there.
3. Before Production promotion, perform a read-only schema and grant equivalence audit between the linked Production database and the foundational baseline. Do not execute the baseline against Production.
4. If equivalence is complete, use a separately approved migration-history repair to mark `20260830000000` as applied without executing it. If equivalence is incomplete, add an idempotent forward-only reconciliation migration, validate it in Preview, and review it independently before any Production application.
5. Confirm a second linked dry run is clean, preserve the current `66cdd48c` Production deployment, then promote the already-validated release artifact. Deployment, migration repair, and environment configuration remain separate approval-gated write operations.

### Verified rollback path

- Application rollback: immediately restore the preserved `66cdd48c` Vercel Production deployment, using Vercel rollback or explicit promotion of that known-good artifact. Do not rebuild an older source revision during the incident.
- Database rollback: do not reverse or delete Production schema. Migration-history repair must occur only after equivalence is proven; any later schema correction must be additive and forward-only. If the application is rolled back, leave compatible database changes in place and follow with a reviewed corrective migration if necessary.

### Release blockers and exact next action

- Blocker: there is no isolated, configured Preview environment in which to validate the committed release candidate against remote infrastructure.
- Blocker: Production's migration ledger lacks the foundational local version, and schema/grant equivalence has not yet been proven; `supabase db push --include-all` is prohibited for this release path.
- Exact next action: obtain explicit authorization to provision a dedicated non-Production Supabase project and branch-scoped Vercel Preview configuration, then deploy `d215f12` to Preview and run the documented synthetic staging suite. Production must remain unchanged until Preview passes and the Production baseline-equivalence review is complete.

## Completed phase — local Supabase release-candidate validation

Completed locally, without remote access:

1. Added a foundational local migration after reproducing the fresh-database bootstrap failure caused by missing vector/schema prerequisites.
2. Restored authenticated table and Storage grants before RLS policies after reproducing local owner DML denial.
3. Normalized MIME parameters after reproducing accepted `.txt` upload followed by process-time `422` from Storage's parameterized MIME type.
4. Excluded Supabase's generated local `.temp` runtime artifact from ESLint after it caused non-source lint failures.
5. Added `test:local-migrations` and `test:local-e2e`; the latter uses one synthetic user, validates upload → processing → Storage → retrieval → privacy → chat refusal → history → report → workspace HTTP rendering, then removes its synthetic data.
6. Applied six local migrations successfully and passed 59 local database acceptance assertions. The local E2E passed with answer and embedding providers disabled, for zero provider requests in this phase.
7. Updated `docs/case-studies/pliny-reliability-repair.md` and `docs/release-candidate-checklist.md`. No commit, push, deployment, remote Supabase access, Production change, or user-data deletion occurred.

If a separately approved shared staging phase is later requested, confirm the target is non-Production, repeat the synthetic boundary checks there, and stop before Production deployment.

## OpenRouter GLM answer-provider phase — 2026-09-08

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `feature/openrouter-glm-answer-model`
- Starting commit: `d215f1280a1416910fb81a83a879a534b6bb325b`
- Phase commit: `e15bd7774d7a75e5dc7c9fec8d96eeb67396e115` (`feat: use OpenRouter GLM for answers`)
- `.env.local` is Git-ignored. Boolean-only checks confirmed that `OPENROUTER_API_KEY` is present and that `ANSWER_PROVIDER` / `OPENROUTER_MODEL` match `openrouter` / `z-ai/glm-5.3-flash`. No environment value or request header was displayed.
- Added a small answer-provider boundary over the existing generation-payload contract. OpenRouter uses native `fetch` against `https://openrouter.ai/api/v1/chat/completions`, has no retries or provider fallback, applies a 30-second timeout, validates the response shape and normalizes token/cost usage. Anthropic remains manually selectable through `ANSWER_PROVIDER=anthropic`.
- The OpenRouter request contains only the existing system instructions and bounded user prompt. Retrieval, selection, evidence gates, privacy transformations/assertions, citation construction/validation/repair, refusal handling, persistence and safe error responses remain outside the adapter. Voyage, chunking, ingestion, Tesseract, Supabase schema and UI were not changed.
- Provider-mocked `test:answer-provider` passed: grounded answer, supported citation, exact refusal, malformed response, missing credential, timeout, HTTP 429, HTTP 500/503, exact OpenRouter request shape, rejection of `z-ai/fp8` as a model, default OpenRouter selection and explicit Anthropic selection without fallback.
- Existing provider-free tasks passed: `test:citations`, `test:context`, `test:embeddings`, `test:evidence`, `test:ingestion`, `test:history`, `test:holdout`, `test:privacy`, `test:privacy:bundle`, `test:retrieval`, `test:sanitization`, `test:report`, `test:storage-cleanup`, `test:trust` and `test:local-migrations`.
- Local database validation passed: 59/59 pgTAP assertions and the synthetic database-backed E2E. The first E2E invocation used `AI_ENABLED=false` and received the expected route-level `403`; the successful rerun enabled AI orchestration while leaving embeddings disabled and both answer-provider credentials blank, confirming the evidence refusal occurred before provider generation.
- ESLint, TypeScript `--noEmit`, optimized Production build and the post-build browser scan passed. The scan found neither the configured OpenRouter credential nor the server-only names `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` and `ANSWER_PROVIDER` in `.next/static`.
- Live OpenRouter request 1 passed: supported answer with a resolving citation; model `z-ai/glm-5.3-flash`; 2,558 ms; 127 input + 14 output = 141 tokens; approximately `$0.00001760`; contract validation passed.
- Live OpenRouter request 2 passed: unsupported question with exact refusal; model `z-ai/glm-5.3-flash`; 1,940 ms; 126 input + 8 output = 134 tokens; approximately `$0.00001028`; contract validation passed.
- Live phase total: 2 OpenRouter requests, 253 input tokens, 22 output tokens, 275 total tokens, approximately `$0.00002788`. The optional third adversarial request was not used. No real document, existing corpus content, personal data or database content was sent.
- No push, deployment, Vercel mutation, remote Supabase access, Production access or Production change occurred.
- Remaining next step: review this focused local commit, then validate it in a separately authorized isolated Preview environment before any Production change.

## Preview release assurance checkpoint — 2026-09-08

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `release/preview-assurance-20260908`
- HEAD: `e15bd7774d7a75e5dc7c9fec8d96eeb67396e115`; the assurance implementation remains uncommitted and preserved.
- Completed local evidence remains under `PLINY_RELEASE_ASSURANCE/results/`: deterministic 36-case evaluation with 12 frozen holdouts, hardened provider-boundary fault injection, 59/59 pgTAP, authenticated local PDF/DOCX/TXT E2E, 50-way retrieval concurrency, 5,000-row query-plan analysis, a ten-minute 20-client provider-mocked soak, lint, typecheck, Production build and browser-bundle server-secret scan.
- Authenticated Supabase CLI inventory confirmed that `pliny-preview-assurance-20260908` did not exist before setup. Production project `vector` was identified only by name and was not linked, migrated, reset, seeded or tested.
- Supabase rejected an explicit `micro` size as unavailable, then rejected the organization's Free-default creation path because available Free project capacity is exhausted or an upgrade is required. Both attempts created zero projects; a final name-only inventory reconfirmed that result.
- The generated database passwords existed only in process memory. No credential, provider header, project reference or private identifier was displayed or retained.
- No Vercel variable, deployment, Supabase database, Production resource, Git remote or provider API was changed or invoked in this resumed checkpoint. OpenRouter requests: `0`; Voyage requests: `0`; cost: `$0.00`.
- Blocked next action: free one Supabase Free-project slot or approve the required paid capacity, then rerun the isolated Preview provisioning and remaining browser/evidence/report plan. No Production action is appropriate.

### Resumed provisioning result

- A Free-plan slot became available and exactly one project named `pliny-preview-assurance-20260908` was created. It is healthy, linked only in the release-candidate worktree and contains all six local migrations applied through the ordinary safe workflow.
- Vercel configuration stopped before the first variable write because `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` were absent from both authorized local credential sources. OpenRouter and Voyage key presence checks passed without revealing values.
- No Vercel, Production, provider or Git remote mutation followed. Provider calls and cost in this resumed checkpoint remain zero.
- Exact next action: place the two missing Upstash values in the ignored local environment file or exact-name macOS Keychain entries, then resume branch-scoped Vercel Preview configuration and deployment.

## Preview release assurance completion — 2026-09-09

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `release/preview-assurance-20260908`
- Starting commit: `e15bd7774d7a75e5dc7c9fec8d96eeb67396e115`
- Isolated Preview: a separately named Free-plan Supabase project with all six migrations and a Vercel Preview deployment in `READY` state. Production Supabase `vector`, Vercel Production and `main` were not changed or tested.
- Preview-only configuration includes OpenRouter GLM `z-ai/glm-5.3-flash`, Voyage embeddings, privacy pseudonymisation, Upstash rate limiting and the isolated Supabase client variables. Values were loaded through non-printing process boundaries and are not retained in source or evidence.
- Provider hardening passes deterministic coverage for grounded answers, refusals, invalid and malformed citations, unsupported semantic claims in evaluation, fenced/invalid/truncated/empty/array/oversized output, missing key, 401/402 without retry, capped `Retry-After` 429 retries, bounded 500/502/503/504 retries, timeout, caller cancellation, 20-way concurrency, manual Anthropic selection and no automatic fallback.
- The versioned 36-case synthetic evaluation has 12 frozen holdouts and passes the release thresholds: Hit@5 `1.000`, Recall@5 `1.000`, Precision@5 `0.515`, MRR `0.984`, nDCG@5 `0.988`, refusal accuracy `1.000`, citation identifier validity `1.000`, supported-answer correctness `1.000`, contradiction recognition `1.000`, unsupported answers `0`.
- Local database assurance passes: six-migration bootstrap, pgTAP `59/59`, authenticated PDF/DOCX/TXT E2E, 50 parallel retrieval operations with zero errors/cross-tenant rows, metadata edge cases and a 5,000-row rolled-back query-plan study. Existing IVFFlat vector indexing is used; lexical sequential scans are appropriate at the tested scale.
- The ten-minute provider-mocked soak passes with 20 clients and 1,200 requests: zero unexpected errors, zero database failures, p50/p95/p99 `51.9/73.0/103.5 ms`, 60 intentional aborts, stable memory and no listener growth. External provider calls: `0`.
- Real-browser Preview acceptance passes synthetic PDF/DOCX/TXT and parameterized-PDF ingestion; grounded, paraphrased, multi-document, contradiction, prompt-injection and unsupported-question behavior; citations and Source Inspector; report export; reload persistence; privacy-minimised processing; tenant isolation; mobile layout; keyboard basics; controlled cancellation; bundle inspection; and logout.
- Confirmed and repaired defects: short valid evidence displacement, Vercel inclusion of local Supabase link state and Vercel PDF worker initialisation. No schema migration, Voyage behavior, OCR provider or unrelated UI was changed.
- Live application budget: 16 questions, 14 confirmed OpenRouter completions, one cancellation-ambiguous provider-bound attempt and one pre-provider refusal. A conservative cap-based model-cost estimate is approximately `$0.006`; actual billed usage and upstream retry count were not retained. Voyage used only bounded synthetic ingestion/query calls; three query requests are exact for the concurrency run, while the total and billed cost were not instrumented.
- Dossier: `Desktop/RAG intelligence/PLINY_RELEASE_ASSURANCE/OPEN_ME_PLINY_RELEASE_ASSURANCE.html` plus JSON results, genuine screenshots, golden data, charts, logs, provenance, evidence index, SHA-256 manifest and ZIP. The canonical report validated and packaged successfully; the bundled headless-shell check was structural-only, while installed Chrome separately rendered the final self-contained file offline at desktop and narrow widths.
- Remaining blockers: hosted public signup was not successfully reproduced with reserved synthetic email addresses; the Git origin and Vercel-linked repository identities do not match, so the exact branch was not pushed and CI was not observed on a pull request; Production migration-ledger/schema equivalence remains unverified; exact provider billing telemetry is incomplete; browser assurance is Chrome-focused.
- Recommendation: **NOT READY for Production**. The conclusion is **release readiness within the tested scope**. Resolve repository linkage, reproduce hosted signup and complete an independently reviewed read-only Production schema/grant equivalence and migration-ledger plan before any separate Production authorization.

## Production release gate checkpoint — 2026-09-10

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `release/preview-assurance-20260908`
- Starting commit: `5ccae3573269ad0dd0a2d79453e24b6335a6b949`
- Git traceability is resolved: the origin, authenticated identity and Vercel-linked repository all identify `Deepak92939339/Pliny`. The release branch was pushed without force and pull request [#1](https://github.com/Deepak92939339/Pliny/pull/1) targets `main`. `main`, repository ownership and history were not changed.
- A strictly read-only Production comparison ran through isolated temporary Supabase CLI configurations. Target names were checked before every query; only schema and migration metadata were selected; no user data was inspected and Production mutations were zero.
- Realized Production and Preview database state is exactly equivalent across five tables, 59 columns, 36 constraints, 21 indexes, 120 functions, 17 policies, two triggers, 89 table grants and three required extensions. Migration history differs only because Preview records `20260830000000 initial_schema_baseline`; Production records the five subsequent migrations. The schema difference count is zero and this ledger difference does not itself block deployment, but the baseline must not be applied to Production. A separately reviewed migration-ledger deployment plan remains required.
- The final authenticated Preview smoke used invented content and passed confirmed-user login, upload, processing, Voyage retrieval, a grounded OpenRouter GLM answer with a resolving citation, prompt-injection resistance, unsupported refusal, Source Inspector, print report, reload persistence, logout and cleanup. The retained provider result used one OpenRouter request, 1,251 input tokens, 140 output tokens, 1,391 total tokens and `$0.00025765` provider-reported cost. Three logical Voyage operations were observed; upstream retry and billing detail is unavailable.
- The answer route now records actual provider request count, token usage and cost in server-side response metadata while retaining the existing preflight estimate. Provider selection, bounded context, citation and refusal validation, privacy boundaries and retry behavior are unchanged. Focused provider tests, lint, typecheck, Production build and a 42-asset local browser-bundle secret scan pass.
- Hosted public signup remains blocked by the isolated Preview Auth email-send rate limit (`429`) before confirmation and redirect verification. Downstream login and session behavior passed only after the same synthetic identity was confirmed inside Preview administration. This is preserved as a failure, not converted into a pass.
- Installed Chrome passed the final UI smoke with zero console warnings/errors, zero Preview 5xx responses and no server-only configuration names in 17 live browser assets. Firefox and WebKit automation were unavailable.
- No Production deployment, promotion, Vercel Production change, database mutation, merge or `main` update occurred.
- The first pull-request workflow run failed before executing application assertions because Node 20 does not support the committed `--experimental-strip-types` command line. The workflow now selects Node 22 and a new `test:ci-config` regression enforces both that minimum runtime and the provider-free workflow boundary. The exact-commit pull-request rerun passed lockfile installation, lint, typecheck, all deterministic regressions and the frozen release evaluation without provider credentials.
- Recommendation: **NO-GO for Production**. Evidence supports **release readiness within the tested scope**, but public signup and confirmation must pass and the migration-ledger deployment plan must be independently approved first.

## Private-beta release blocker closure — 2026-09-10

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `release/preview-assurance-20260908`
- Starting commit: `c1a503b3cee5940f6c6db7a88285dac9428e6363`
- Blocker-closure runtime commit: `c225f7939db1f6d34cb03b508c34e3df78ba8a13`
- Final runbook completion commit: `3e807905efe441f9c3d2c56b8f0529ba4174a903`
- Pull request: [#1](https://github.com/Deepak92939339/Pliny/pull/1), still open against `main`; no merge or Production deployment occurred.
- Pliny is explicitly scoped as a private portfolio/beta. Public signup links and forms were removed from the landing, information and login surfaces. `/signup` now renders an invitation-only explanation, and the retained server action rejects without calling Supabase.
- Anonymous signup is disabled on the isolated Supabase Preview. A direct invented signup attempt returned HTTP `422`, created no user and made zero Production mutations.
- A focused Chrome Preview smoke passed 9/9 assertions: private-beta messaging, absence of signup UI, invalid-login rejection, administrator-created confirmed-user login, session persistence, logout/session clearing, protected-route redirects, zero console issues and zero Preview 5xx. The disposable account was removed.
- The Production-equivalence harness now compares 14 sections, adding Storage bucket configuration, Storage policies/grants, schema privileges and effective routine privileges. It discovered Preview inherited `PUBLIC` execute on `match_document_chunks`; Production already had the secure false state.
- Added forward migration `20260910120000_revoke_public_match_document_chunks_execute.sql` and applied it only to isolated Preview. The final SELECT-only check reports identical Production/Preview realized fingerprints, zero schema differences, zero Production data reads and zero Production mutations.
- Preview migration history now has two expected rows absent from Production: the foundational baseline and the forward grant repair. Independent review concluded it is safe to mark only the baseline applied if an immediate equivalence rerun stays clean, then require the ordinary dry run to list only the forward grant repair before applying it.
- The exact Production procedure and rollback boundaries are in `docs/private-beta-production-deployment-runbook.md`. The baseline SQL must never execute against Production; `--include-all` remains prohibited.
- Affected checks pass locally: `test:auth`, `test:ci-config`, lint, typecheck, optimized build and browser-bundle privacy scan. The manual isolated Preview deployment reached `READY`. The provider-free GitHub gates passed for both the runtime and documentation-only final heads; Vercel's final `3e80790` Preview reached `READY`. The runtime's three public auth routes passed a real-Chrome smoke.
- New provider activity in this closure phase: OpenRouter `0`, Voyage `0`, cost `$0.00`.
- Recommendation: **GO to execute the reviewed Production procedure for the private-beta scope only after explicit Production authorization and a green exact-head PR gate.** This is not authorization to merge or deploy.

## Controlled Production execution attempt — 2026-09-10

- Explicit Production authorization was received for the bounded private-beta procedure at release commit `3e807905efe441f9c3d2c56b8f0529ba4174a903` and PR #1.
- The canonical worktree began clean on `release/preview-assurance-20260908`, matched its fetched remote exactly, and remained at the approved commit. Public GitHub API checks confirmed PR #1 targets `main`, has the exact approved head, is mergeable with a clean merge state, and has successful `deterministic-quality` and Vercel checks. The authenticated GitHub connector resolves to approved owner `Deepak92939339`; the saved GitHub CLI token is invalid, so no CLI merge was attempted.
- Vercel identity and project checks resolved the existing linked project as `pliny`. The current stable Production rollback target is deployment `dpl_F1ReGGKyxPUJFWQf91vGJnQ39d9B`, URL `https://pliny-qvr63lo3m-deepakpatro626472-2604s-projects.vercel.app`, status `READY`, built from `main` commit `66cdd48c4278d60784ee6a4b7507a02acdce40c3`; `https://pliny.vercel.app` remains its Production alias.
- Authenticated Supabase connector inventory resolved exactly one healthy Production project named `vector` and exactly one healthy isolated project named `pliny-preview-assurance-20260908`. Project references were kept in process memory and were not recorded.
- An isolated detached worktree at the approved SHA was created under `/private/tmp/pliny-production-release`, and `npm ci` completed. Because the local Supabase CLI currently has no access token, the exact 14-section SELECT-only SQL was extracted from that detached worktree and executed through the authenticated Supabase connector. Production and Preview remain structurally equivalent with zero schema/grant differences, zero Production user-row reads and zero Production mutations. Migration history differs only by the documented Preview-only `20260830000000 initial_schema_baseline` and `20260910120000 revoke_public_match_document_chunks_execute` rows.
- The Vercel Production name/scope inventory found a hard precondition failure: `OPENROUTER_API_KEY`, `ANSWER_PROVIDER`, and `OPENROUTER_MODEL` are absent from Production. The other required Supabase client, Voyage, privacy, Upstash, AI, embeddings and OCR variable names are present and Production-scoped; `SUPABASE_SERVICE_ROLE_KEY` is absent. No value or environment file was displayed.
- Execution stopped at that required configuration gate. Production Auth was not changed; migration history was not repaired; no migration was dry-run or applied; PR #1 was not merged; `main` and Vercel Production were not changed; no Production smoke or data cleanup was attempted. OpenRouter requests: `0`; Voyage requests: `0`; cost: `$0.00`; rollback was not required.
- Exact next action: securely add the three missing OpenRouter variables to Vercel Production through an owner-controlled secret-entry path, restore authenticated Supabase CLI access (or formally approve the authenticated connector fallback), then restart the runbook from the clean identity and equivalence gates. Do not resume at the mutation steps from this partial attempt.

## Controlled Production resumption — 2026-09-10

- The governing instructions and Production runbook were reread before resuming from the configuration gate. Release identity was re-established: the canonical worktree is clean at approved commit `3e807905efe441f9c3d2c56b8f0529ba4174a903`, its fetched release branch is synchronized, and PR #1 remains open, non-draft, mergeable into `main`, and green at that exact head.
- The newly created stable Production deployment is recorded as rollback target `dpl_7xZiKznxM41kkQ8g4mCexLo6cmAa`, URL `https://pliny-oj3u2i0qv-deepakpatro626472-2604s-projects.vercel.app`, status `READY`, built from unchanged `main` commit `66cdd48c4278d60784ee6a4b7507a02acdce40c3`. The Vercel project remains exactly `pliny`, and `https://pliny.vercel.app` remains a Production alias.
- A names/scopes-only Vercel inventory confirmed every required variable name is present only in Production with no branch binding. A non-printing verifier confirmed `ANSWER_PROVIDER=openrouter`, `OPENROUTER_MODEL=z-ai/glm-5.3-flash`, the configured Supabase URL and publishable key map exactly to the healthy `vector` project, the Auth health endpoint returns 200, and required OpenRouter, Voyage, privacy and Upstash values are present server-side. `SUPABASE_SERVICE_ROLE_KEY` is absent. No value, header, environment file, project reference or Production user data was displayed or recorded.
- The same verifier found the hard precondition failure `EMBEDDINGS_ENABLED=false`; the runbook requires `EMBEDDINGS_ENABLED=true`. Execution therefore stopped immediately at the configuration gate before Auth changes or any database/application mutation.
- Production Auth was not changed; migration history was not repaired; neither baseline nor forward migration SQL was executed; PR #1 was not merged; `main` was not altered; no deployment or smoke test was started. OpenRouter requests: `0`; Voyage requests: `0`; estimated provider cost: `$0.00`; cleanup was not applicable; rollback was not required. The recorded stable deployment remains live.
- Exact next action: securely set the existing Vercel Production variable `EMBEDDINGS_ENABLED` to `true`, wait for the resulting Production deployment to become stable, then resume the runbook from the configuration gate and record that latest stable deployment as the rollback target. Never execute `20260830000000_initial_schema_baseline.sql`, never use `--include-all`, and do not advance to migration-history repair until every configuration precondition passes.

## Controlled Production configuration correction — 2026-09-10

- A fresh query against the latest Vercel Production configuration corrected the preceding classification: the existing `EMBEDDINGS_ENABLED` setting satisfies the runbook requirement. The other required Production-only names remain present, and the Vercel project identity remains exactly `pliny`.
- The latest Production deployment remains rollback target `dpl_7xZiKznxM41kkQ8g4mCexLo6cmAa`, URL `https://pliny-oj3u2i0qv-deepakpatro626472-2604s-projects.vercel.app`, status `READY`, built from unchanged `main` commit `66cdd48c4278d60784ee6a4b7507a02acdce40c3`.
- The Vercel CLI metadata response unexpectedly included environment values in tool output. No server-secret plaintext was returned, but a browser publishable credential and configuration values were included. Under the runbook's credential-exposure stop condition, execution stopped immediately before all Production mutations.
- Production Auth was not changed; migration history was not repaired; neither baseline nor forward migration SQL was executed; PR #1 was not merged; `main` and the live Production deployment were not changed; no smoke test or synthetic data activity occurred. OpenRouter requests: `0`; Voyage requests: `0`; estimated provider cost: `$0.00`; cleanup was not applicable; rollback was not required.
- Exact next action: the owner should review the output exposure and explicitly authorize another continuation. Any continuation must use a verifier that suppresses command output before it reaches the transcript, restart at the configuration gate, and preserve rollback target `dpl_7xZiKznxM41kkQ8g4mCexLo6cmAa` unless a newer stable Production deployment exists. Never execute `20260830000000_initial_schema_baseline.sql` and never use `--include-all`.

## Controlled private-beta Production deployment — 2026-09-11

- Release identity passed at approved PR head `3e807905efe441f9c3d2c56b8f0529ba4174a903`. PR [#1](https://github.com/Deepak92939339/Pliny/pull/1) was merged normally into `main`; the resulting Production commit is `c0b34792f618d7ad40f87490419018c72d0eb656`. No force push, failed-check bypass, squash substitution or manual `main` edit occurred.
- The Production configuration gate passed for Vercel project `pliny` and Supabase project `vector`. Required Production-only OpenRouter, Voyage, privacy, Upstash and Supabase client names/presence were verified without retaining values. `ANSWER_PROVIDER=openrouter`, `OPENROUTER_MODEL=z-ai/glm-5.3-flash`, `EMBEDDINGS_ENABLED=true`, and no application service-role key was present. Public/publishable browser configuration was treated as client configuration; no server secret was exposed.
- Public signup remains disabled in Production Supabase Auth and in the application UI/server behavior. Administrator-created confirmed-user login, session persistence, protected routes and logout passed.
- Immediately before database mutation, the isolated detached-worktree comparison required and obtained zero structural schema/grant differences. Migration `20260830000000` was then marked applied in Production history only; its foundational SQL was never executed. The ordinary dry run listed only `20260910120000_revoke_public_match_document_chunks_execute.sql`, which was applied normally. `--include-all`, reset, seed, pull and destructive database commands were not used.
- Final migration history contains exactly the seven expected versions through `20260910120000`. The post-application 14-section comparison reports identical Production/Preview fingerprints `2526867f36b3bbfce8eb595f3e3fcc963c74d85d4885c1776c020959ab2fa23e`, zero differences, zero Production user-data reads and `blocksDeployment=false`.
- Git-connected Vercel Production deployment `dpl_AqAL613ZYumUq7fwhX8GKv2kx9BH` reached `READY` from merge commit `c0b34792f618d7ad40f87490419018c72d0eb656`. Canonical URL: `https://pliny.vercel.app`. The preserved rollback target is `dpl_7xZiKznxM41kkQ8g4mCexLo6cmAa` at commit `66cdd48c4278d60784ee6a4b7507a02acdce40c3`; rollback was not required.
- One bounded Production smoke used a disposable administrator-created confirmed user and one upload batch containing the minimum invented PDF/TXT files. PDF/TXT ingestion, Voyage embeddings/retrieval, one grounded GLM answer with a valid citation, one pre-provider unsupported-question refusal, Source Inspector, report rendering, reload persistence and logout all passed.
- Production provider activity stayed within budget: one OpenRouter answer request of two allowed; three logical Voyage activities of three allowed. Exact billed cost was unavailable. At current public model rates, the OpenRouter cap-based upper bound is approximately `$0.000411`; the tiny Voyage workload is below `$0.00003` at list price and likely `$0` within the free tier, for a combined model-rate upper bound below `$0.000441`. The application's conservative preflight reservation was `$0.007478` and is not a billed-cost claim.
- Cleanup passed. Exact post-cleanup counts are zero for the two Storage objects, collection, documents, chunks, chat messages, usage events and disposable Auth user. No existing Production user rows or documents were inspected.
- Final Vercel review found no new runtime error clusters, timeouts or secret leakage. Public signup remained disabled and the RPC execute revocation was not reversed. Decision: **`LIVE`**.
- Final assurance report: `Desktop/RAG intelligence/PLINY_RELEASE_ASSURANCE/OPEN_ME_PLINY_RELEASE_ASSURANCE.html`. Evidence index and checksum manifest: `Desktop/RAG intelligence/PLINY_RELEASE_ASSURANCE/EVIDENCE_INDEX.json` and `Desktop/RAG intelligence/PLINY_RELEASE_ASSURANCE/SHA256SUMS.txt`. Final archive: `Desktop/RAG intelligence/PLINY_RELEASE_ASSURANCE/Pliny-Release-Assurance-20260908.zip`. Archive integrity and every manifest entry verified successfully.

## Nexura v4 landing integration — 2026-09-14

- Active repository: `Desktop/RAG intelligence/vector`
- Branch: `feature/nexura-v4-landing-integration`
- Starting commit: `3e807905efe441f9c3d2c56b8f0529ba4174a903`
- Phase commit: `57c0860f28a4a0d19c48a027ce636ce17c59ad04` (`feat: integrate Nexura v4 landing page`).
- Replaced the public root-route Pliny presentation with a componentized Nexura implementation faithful to `nexura_redesign (4).html`. The new surface preserves the reference hero, coral ring geometry, application-window proportions, dense metrics/lifecycle area, model rail, editorial section, and four-column footer.
- Changed the visible landing demonstration model label from `GPT-4o` to `Ox Alpha` only. No answer-provider identifier, adapter, runtime configuration, automatic fallback, embedding behavior, or production contract was changed. Voyage remains identified only as the embedding provider.
- Every reference control is inventoried in `vector/docs/nexura-v4-control-mapping.md`. Existing capabilities route to the real login, dashboard, information, conversation, report, citation, and Source Inspector flows; unavailable capabilities are disabled and labelled `Planned`; citation and refusal interactions are explicitly local demonstrations.
- Removed only the now-unreferenced landing-only `LandingView.tsx` and `LandingInfoDialog.tsx`. Shared information pages, authenticated workspace components, Supabase/auth/storage/retrieval/provider code, schema, migrations, RLS, and server-side secrets remain unchanged.
- Visual comparison artifacts and a complete audit are retained under `vector/artifacts/nexura-reference/`, `vector/artifacts/nexura-implementation/`, and `vector/design-qa.md`. Desktop fidelity passed. Mobile intentionally corrects the source HTML's horizontal clipping while retaining its visual hierarchy. The bundled IBM Plex Sans is used because exact remote Inter font fetching is unavailable during the offline production build.
- Provider-free validation passed: deterministic regression suite, frozen 36-case evaluation, local migration tests, ESLint, TypeScript, optimized Production build, browser-bundle secret scan, and production-build Chrome acceptance at desktop/tablet/mobile sizes. The Chrome flow covered navigation, planned-control state, grounded/refusal restoration, citation selection, Source Inspector navigation, focus visibility, mobile menu behavior, and signed-out protected-route redirection with zero application console/runtime errors.
- Database-backed local E2E could not run because the local Docker runtime was unavailable after an attempted launch. No remote Supabase data or Production resource was accessed as a substitute. Authenticated `Open Workspace` behavior is preserved through the unchanged `/dashboard` middleware and workspace route, but was not re-exercised with a live session in this frontend-only phase.
- OpenRouter requests: `0`; Voyage requests: `0`; external provider cost: `$0.00`. No push, deployment, merge, Vercel mutation, Supabase mutation, schema change, environment-file read, or secret output occurred.
- Remaining next step: review the focused local commit and screenshots, then run the database-backed authenticated browser flow once Docker is available before opening a pull request.

## Definition of done

Pliny is ready for production deployment when all of the following are true:

- The canonical Git working tree contains the reviewed remediation.
- Lint, typecheck, production build, and relevant automated tests pass.
- Database-backed ingestion, retrieval, reports, and history have been verified with synthetic data.
- Bounded real-provider tests confirm Voyage embeddings and the configured answer provider satisfy their application contracts.
- Valid PDF and DOCX files complete ingestion or show a precise user-visible error tied to a verified cause.
- Direct, paraphrased, multi-document, contradiction, and unsupported questions behave acceptably with correct source citations.
- Privacy-minimised processing and provider-boundary disclosures remain accurate.
- No secrets, absolute personal paths, debug output, generated caches, or unintended provider changes appear in the diff.
- The before-and-after case study accurately distinguishes mocked, staging, and production evidence.
- Remaining limitations are recorded.
- A deployment and rollback checklist exists.

The authorized private-beta Production deployment is complete. Any expansion of scope, public signup enablement, schema change, hotfix or rollback requires a new explicitly bounded instruction.

## Model recommendation

Use Terra High for database-backed staging validation and any cross-layer failure. Use Sol High for final release review. Use Luna Medium only for bounded mechanical cleanup after staging evidence is complete.

## Next-session instruction

Read `AGENTS.md`, this file, the release checklist, `docs/private-beta-production-deployment-runbook.md` and `PLINY_RELEASE_ASSURANCE/worklog.md`. Production is `LIVE` at `https://pliny.vercel.app`, deployment `dpl_AqAL613ZYumUq7fwhX8GKv2kx9BH`, commit `c0b34792f618d7ad40f87490419018c72d0eb656`. Rollback target `dpl_7xZiKznxM41kkQ8g4mCexLo6cmAa` remains available but was not used. Public signup must remain disabled, the applied security migration must not be reversed, and the foundational baseline SQL must never be executed against Production. Any code repair must use a separate hotfix branch and PR.

## Stage 7 UI stitching — 2026-09-17

- Active repository: `Desktop/RAG intelligence/vector`; local branch: `feature/stage-7-ui-stitching`, based on local commit `57c0860`.
- Replaced the root-route Nexura replacement with the canonical Stage 7 Pliny landing presentation. It routes directly to the existing login and Trust & Security, Data Privacy, Supported Formats, Access & Usage, and About pages; no prototype-only controls or replacement landing were carried forward.
- Migrated the visible visual language across `/`, `/login`, `/dashboard`, and `/collection/[id]`: Source Serif display type, Inter interface type, warm off-white/graphite/rust palette, 7/10/14px radius scale, Source Inspector rail/sheet, responsive mobile workspace navigation, document upload presentation, and the evidence-focused composer/answer shell.
- Retained existing Supabase authentication and private-beta boundaries, protected redirects, workspace creation/selection, document upload and processing, privacy mode selection, retrieval, grounded-answer/refusal/citation handling, Source Inspector provenance, report/export/history actions, and sign-out. No provider, API, schema, migration, RLS, OCR, embedding, retrieval, environment, remote service, deployment, or Production behavior was changed.
- The old Nexura landing components are now unreferenced but deliberately left in-tree as recoverable history; no backend-connected component was removed.
- Updated the public browser smoke to assert the Stage 7 canonical landing rather than Nexura. It passed at 1440×900, 768×1024, and 390×844, with responsive navigation, no horizontal overflow, no console/runtime errors, and the signed-out dashboard redirect. Screenshots: `vector/artifacts/stage-7-ui/landing-1440x900.png` and `vector/artifacts/stage-7-ui/landing-390x844.png`.
- Verification passed: ESLint, TypeScript, optimized production build, complete provider-free deterministic regression suite, release evaluation (36 cases), private-beta auth boundary test, and Stage 7 browser smoke. The browser privacy bundle script was not run because this phase explicitly prohibited reading `.env.local`; its implementation loads that file. Authenticated browser/database flows were not rerun because this UI-only phase did not read credentials or invoke local/remote Supabase.
- Provider requests: `0`; no push, deployment, Vercel mutation, remote Supabase access, migration, environment change, or Production action occurred.
- Remaining review item: perform an authenticated local synthetic browser pass against the final branch (workspace create, upload/process states, answer/refusal, source sheet, report/export) only when a safe local Supabase fixture and credentials are explicitly available. Review the generated desktop and mobile screenshots before any PR/deployment.

## Stage 7 UI pre-deployment correction review — 2026-09-17

- Reviewed integration commit `0c5e4bb` on `feature/stage-7-ui-stitching`; the canonical `04-Landing-page.html` remains the public root design. The protected pre-existing documentation edits were left untouched, and generated Stage 7 screenshots remain uncommitted.
- Corrected only demonstrated UI defects: the static landing and login illustrations now disclose their synthetic content; the landing trend uses a semantic SVG stroke instead of a CSS gradient; sign-in fields share a 48px control geometry; public, dashboard, and workspace views now supply skip links; and the public mobile navigation now closes on Escape, restores trigger focus, and removes its listener on cleanup.
- Expanded the existing local Chrome smoke to cover the real login route, password visibility control, public sizes 375×812, 390×844, 768×1024, 1024×768, and 1440×900, clean skip-link screenshot capture, Escape/focus restoration, and horizontal-overflow checks. New screenshots: `vector/artifacts/stage-7-ui/login-1440x900.png` and `vector/artifacts/stage-7-ui/login-390x844.png` (alongside the landing captures).
- Final checks passed: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:deterministic`, `npm run test:eval` (36 cases; all gates passed), `npm run test:landing-browser`, diff whitespace check, and a static production-client scan for provider/server-secret identifiers. No browser console or hydration error was reported by the smoke.
- The safe local authenticated flow remains blocked because the Docker daemon/socket is unavailable. No local/remote Supabase session, real document, external model, Production service, environment file, deployment, or push was used. Final disposition requires human review plus the blocked local synthetic authenticated-flow verification before deployment.

## Qwen-assisted Stage 7 landing correction — 2026-09-19

- Active repository: `Desktop/RAG intelligence/vector`; branch: `feature/stage-7-ui-stitching`; starting and current committed HEAD: `f048b902` (`fix(ui): resolve Stage 7 integration regressions`). This phase remains an uncommitted working-tree review; no commit, push, PR, deployment, Vercel change, Supabase change, or Production action occurred.
- Reviewed the user-supplied Qwen candidates `Qwen_tsx_20260919_d6cdvx7hx.tsx` and `Qwen_css_20260919_jykpx7mvj.css` against `Pliny redesign/Landing page.html` and the supplied desktop/mobile landing screenshots. The candidate was treated as presentation input rather than authoritative application logic.
- Replaced only the public landing implementation and added narrowly scoped Stage 7 utility rules. Preserved routes, private-beta auth boundary, provider/runtime code, retrieval, ingestion, citations, privacy, schema, environment, and authenticated components.
- Corrected demonstrated candidate drift: desktop chart/takeaway composition, source-inspector state, synthetic-source disclosure, dialog/sheet focus containment, Escape dismissal, scroll locking, focus restoration, exact source footer structure, and the 34–76px responsive hero scale. The CTA reads `Open workspace` because `Start workspace` violates Pliny's private-beta auth contract.
- Expanded the Chrome landing harness to exercise information dialogs, mobile navigation, citation/inspector behavior, focus restoration, signed-out dashboard redirect, login geometry/password visibility, keyboard reachability, and overflow at 375×812, 390×844, 768×1024, 1024×768, and 1440×900. It also captures source-matched 1281px and 361px full-page views under `vector/artifacts/stage-7-ui/landing-qwen-integration/`.
- Design QA is recorded at `vector/design-qa.md`; final result is `passed`. It compares the reference and implementation at normalized desktop/mobile widths and records every P2 correction and the private-beta copy deviation.
- Verification passed: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:deterministic`, `npm run test:eval` (36 cases; all gates passed), `npm run test:landing-browser`, and `git diff --check`. One deterministic run initially caught the Qwen `Start workspace` wording; it passed after restoring `Open workspace`. One browser rerun briefly targeted development artifacts invalidated by a concurrent production build; restarting the local preview resolved the environment issue and the clean rerun passed with no console/runtime errors.
- Provider requests: `0`; external provider cost: `$0.00`. No real/private document or external service was used.
- Preserved unrelated working-tree items: `docs/release-candidate-checklist.md`, `docs/AI-Freelance-Market-Research-20260912.html`, and earlier generated Stage 7 artifacts.
- Exact next phase: the user visually reviews `http://127.0.0.1:3010/`. If accepted, translate `05-Login.html` into the existing `AuthView.tsx` and its narrowly scoped styles next; do not ask Qwen for the dashboard/workspace/ask surfaces until the login screen passes the same source-matched review gate.

## Screen 2 Qwen login handoff — 2026-09-19

- The user approved the corrected landing screen and authorized moving to the login screen. No Pliny source file was changed in this handoff-preparation phase.
- Active repository remains `Desktop/RAG intelligence/vector` on `feature/stage-7-ui-stitching` at committed HEAD `f048b90`, with the approved landing work and pre-existing unrelated documentation/artifacts still preserved as uncommitted changes.
- Prepared a self-contained Qwen package at `Desktop/Pliny redesign/Qwen handoff/02-login/` plus clean archive `Desktop/Pliny redesign/Qwen handoff/Pliny-02-login-for-Qwen.zip`.
- The package contains the authoritative login HTML, two desktop reference captures, the current complete `AuthView.tsx`, current global style context, the private-beta auth boundary regression, a functional/accessibility contract, and a paste-ready Qwen prompt.
- Qwen is constrained to return exactly `AuthView.tsx` and `AuthView.module.css`. The prompt preserves real `loginWithPassword` validation/error/loading/redirect behavior, equal 48px fields, password visibility, skip-link and keyboard requirements, the administrator-created private-beta boundary, and synthetic-demo disclosure. It prohibits signup, fake recovery, fake access-request submission, backend/provider/schema/environment changes, new packages, and global CSS edits.
- The supplied prototype has no authoritative mobile PNG; its embedded responsive rules are the mobile source of truth. The prompt explicitly requires one-column behavior and no overflow at 375px/390px. A clipped Chrome CLI diagnostic capture was excluded from the package rather than misrepresented as a valid mobile reference.
- Package integrity checks confirmed the HTML and current component copies exactly match their sources. A secret-pattern scan found no credentials; the only substring match was the ordinary CSS property `mask-image`.
- Provider requests: `0`; external cost: `$0.00`. No commit, push, deployment, remote service, environment read, or Production action occurred.
- Exact next phase: upload `Pliny-02-login-for-Qwen.zip` to Qwen, paste `08-PASTE-THIS-PROMPT.md`, download Qwen's two output files, and provide their local paths to Codex. Codex will then perform a minimal contract review, integrate them, and run targeted login visual/browser checks before any third screen begins.

## GLM/Qwen staged stitching controller — 2026-09-19

- Added a reusable controller prompt outside the repository at `Desktop/Pliny redesign/GLM-5.3-FLASH-STITCHING-CONTROLLER.md` for the user's isolated Z.ai web-agent workflow.
- The controller explicitly assumes no access to the user's computer. It inventories only server-workspace and uploaded files, audits the cloned repository read-only, generates one minimal Qwen handoff packet at a time, stops for the returned files, stitches them, runs bounded checks and screenshots, then waits for visual approval before advancing.
- The verified production ownership map shows that the six prototypes cross multiple shared React boundaries; the controller therefore separates landing, authentication, dashboard dialogs, workspace shell, document lifecycle, ask/evidence, Source Inspector, chart/report, and responsive consolidation rather than treating six HTML files as six replacement components.
- Direct GLM edits are limited to mechanical integration of at most 20 changed lines; material visual or behavioral corrections must return to Qwen. Two failed Qwen correction rounds escalate to Codex with diagnostics and screenshots.
- No Pliny source, runtime logic, test, dependency, environment, provider, schema, remote service, or deployment was changed. The existing dirty working tree was preserved. Provider requests: `0`; external cost: `$0.00`.
- Exact next phase: paste the controller prompt into the Z.ai GLM-5.3-Flash agent after the six references, screenshots, memory/design document, `AGENTS.md`, `PROJECT_STATE.md`, and repository are present in its server workspace. It should produce only the first unfinished Qwen packet and stop.
