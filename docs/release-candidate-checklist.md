# Pliny Release-Candidate Checklist

## Current state

- Release branch: `release-candidate/reliability-repair-20260906`, based on `66cdd48c4278d60784ee6a4b7507a02acdce40c3`.
- The reviewed release candidate is captured in one local commit; no push, deployment, Production write, remote Supabase access, or persisted provider configuration change was made.
- The remediation scope is limited to retrieval, complete-passage context selection, citation validation, report labels, bounded history, portable ingestion fixtures, local migration bootstrap, MIME normalization, local generated-artifact lint exclusion, holdout coverage, and provider smoke validation.

## Verified locally

- All 16 provider-free regression and privacy test commands pass, including the synthetic holdout and valid/invalid PDF/DOCX coverage.
- Lint, TypeScript typecheck, and the optimized Next.js production build pass.
- A synthetic live-provider smoke test confirmed a 1,024-dimensional Voyage embedding and an Anthropic text response without database writes.
- Fresh local Supabase applied all six migrations and passed `59/59` synthetic database acceptance assertions.
- The local-only database-backed E2E harness passed with providers disabled: synthetic authentication, Storage upload, PDF/DOCX/TXT processing, scoped retrieval, privacy-minimised processing, safe unsupported-question refusal, history, report label, and workspace rendering all completed and cleaned up their synthetic user.
- Generated PDF and DOCX ingestion succeeds locally; wrong-signature PDF input returns `400` and truncated PDF input returns the user-safe `422` validation error.

## Required before deployment

- If shared staging is required, identify a Supabase project that is explicitly non-Production and confirm its ownership, RLS configuration, and storage boundary.
- Apply the existing migration set to that staging target through the approved release process; do not test against a Production project.
- Use a newly created synthetic staging user and workspace to test PDF and DOCX upload, processing, scoped retrieval, grounded citations, reports, history pagination, privacy-minimised processing, conflicting evidence, and an unsupported question.
- Capture only sanitized request counts, status codes, and assertion results. Stop provider testing after authentication failure, repeated rate limits, or unexpected cost.
- Confirm browser-based workspace rendering when an approved browser automation surface is available; local server-rendered HTTP validation passed, but no browser surface was available in this environment.
- Review the final Git diff for secrets, local paths, generated files, debug output, unintended provider changes, and unrelated UI changes.
- Obtain explicit approval before creating a deployment or changing a Production environment.

## Final release review

- The complete candidate diff was reviewed against `66cdd48c4278d60784ee6a4b7507a02acdce40c3` before the local commit.
- Changed and newly tracked files contain no credentials, personal absolute paths, generated caches, added dependencies, runtime provider substitutions, or release-blocking debug output.
- Supabase's committed `config.toml` contains local service configuration and standard environment placeholders only; `.temp` and `.branches` remain ignored.
- The case study and project state distinguish mocked holdout results, earlier bounded provider smoke evidence, local database-backed verification, and unresolved Production observations.

## Rollback plan

- Keep the current stable deployment available until the staged release passes its synthetic acceptance checks.
- If a release regression appears, route traffic back to the last stable deployment using the approved hosting workflow; do not delete user data or attempt destructive database rollback.
- Preserve forward-only database migrations. Investigate and ship a corrective migration only after reproducing the issue in staging.
- Record the release identifier, observed failure, rollback timestamp, and affected synthetic test case in `PROJECT_STATE.md` before retrying.

## Preview assurance result — 2026-09-09

- [x] Created and verified one isolated non-Production Supabase Preview project; Production `vector` remained untouched.
- [x] Applied the six migrations through normal `supabase db push`; `--include-all` was not used.
- [x] Configured all application variables as Vercel Preview-only and deployed the release candidate to a `READY` Preview.
- [x] Passed the provider-free deterministic gate, frozen 36-case evaluation, lint, typecheck, Vercel production build and browser-bundle secret scan.
- [x] Passed local pgTAP `59/59`, database-backed E2E, 50-way retrieval concurrency, metadata edges and the ten-minute 20-client provider-mocked soak.
- [x] Passed real-browser synthetic PDF/DOCX/TXT ingestion, grounded answers, refusals, contradictions, prompt injection, citations, Source Inspector, privacy mode, tenant isolation, persistence, export, mobile layout and bounded three-client live concurrency.
- [x] Retained genuine screenshots, sanitized results, a self-contained HTML dossier, provenance, evidence index, hash manifest and ZIP outside the repository.
- [ ] Reproduce successful hosted public signup using an approved disposable mailbox; reserved synthetic addresses were rejected or throttled.
- [ ] Resolve the mismatch between the Git origin and the Vercel-linked repository, then push this exact branch and observe the provider-free pull-request workflow.
- [ ] Prove Production schema/grant equivalence read-only and independently review a safe migration-ledger repair or forward-only reconciliation. Never execute the foundational baseline against Production.
- [ ] Obtain separate Production authorization only after the remaining gates close.

### Recommendation

**NOT READY for Production.** The evidence supports **release readiness within the tested scope**, but it does not close the signup, repository-linkage or Production migration-equivalence gates.

After the authoritative GitHub repository is confirmed and the workflow passes on this exact commit, an owner must open **Repository Settings → Branches → Add branch protection rule**, target `main`, enable **Require status checks to pass before merging**, select **Preview quality gate / deterministic-quality**, and save the rule. Do not add provider secrets to ordinary or forked pull-request jobs; live-provider evaluation remains manual and bounded.
