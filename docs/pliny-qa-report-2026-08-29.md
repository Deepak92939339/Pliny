# Pliny AI QA report — 2026-08-29

## Scope and test method

- Product under test: Pliny AI, local production build from commit `64a878b`.
- Browser: headed Playwright CLI using the installed Chrome channel. Playwright was the explicitly approved browser fallback for this run; the in-app Browser was not used.
- Desktop viewport: 1440 × 1024. Mobile viewport: 390 × 844.
- Authentication: dedicated demo account was used without recording its password. Temporary Playwright state was stored at `/tmp/pliny-qa-auth.json` with mode 0600 and is removed after this run.
- No APIs, retrieval logic, schemas, migrations, RLS policies, ingestion, document scoping, or deployment configuration were changed.

## Evidence

Desktop and mobile captures:

- Landing/demo composition: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-final-landing-1440.png`
- Authenticated dashboard: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-final-dashboard-1440.png`
- Authenticated dashboard mobile: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-final-dashboard-mobile-390.png`
- Login: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-login-1440.png`
- Earlier mobile regression capture: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-dashboard-mobile.png`
- Corrected mobile capture: `/Users/sandman/Desktop/RAG intelligence/pliny-qa-dashboard-mobile-fixed.png`

The static landing demo is the only populated answer/chart/source composition available in this environment. The authenticated workspace could not be populated because the configured Supabase account returned a workspace read/insert failure; no fabricated workspace or document data was introduced.

The rejected purple redesign reference remains recoverable at `/Users/sandman/Desktop/RAG intelligence/vector-redesign-backup-2026-08-28/vector-ui-target.png`; it was not treated as the visual target for this Pliny restoration.

## Visual review

The available surfaces were inspected at 1440 × 1024 and compared against the restored pre-redesign direction:

- Three-column demo proportions: balanced left register, flexible paper answer area, and readable source column.
- Typography: editorial serif display/headings with restrained sans-serif controls and readable body text.
- Colour: warm off-white/paper surfaces, rust accent, Oxford/ink text, fine neutral borders; no purple redesign tokens remain.
- Spacing/alignment: consistent header, content margins, source rows, chart and process strip alignment.
- Borders/radii/shadows: one-pixel borders, restrained radii and low-elevation shadows; no glass or oversized cards.
- Source readability: filenames, locations, excerpts and source count are legible in the static demo.
- Chart styling: grounded rust line chart with readable labels and no decorative analytics.
- Composer: not present in the static marketing demo and therefore not visually verified in a live workspace.
- Content density/copy/icons: restrained density, Pliny/pliny.ai copy, and existing icon library usage are consistent.
- Responsive overflow: fixed; mobile dashboard now has no horizontal overflow (`scrollWidth === innerWidth === 390`).

## Interaction results

| Interaction | Result | Notes |
| --- | --- | --- |
| Login with dedicated account | PASS | Redirected to `/dashboard`; session persisted in temporary state. |
| Sign out and re-login | PASS | Verified during this run; no credential material was logged. |
| Workspace navigation/logo | PASS | Pliny dashboard link and landing auth links resolve to the expected routes. |
| New workspace dialog open/cancel | PASS | Dialog opens with accessible name/description fields and closes cleanly. |
| Create QA workspace | BLOCKED | Supabase collections insert/read returned the app's safe “Unable to save/load workspaces” state. |
| Upload and processing | BLOCKED | No workspace target was available; `Claude.pdf` was not uploaded. |
| Source/document selection | NOT TESTABLE | No authenticated workspace was available; no fake selection controls were added. |
| Query composer | NOT TESTABLE | Requires a populated authenticated workspace. |
| Citation → evidence/source inspector | NOT TESTABLE | Requires real chat citations and retrieved passages. |
| Chart in a live answer | NOT TESTABLE | Static demo chart rendered; live grounded chart requires workspace data. |
| Transcript export/report export | NOT TESTABLE | Requires a real analysis record. |
| Mobile evidence sheet | NOT TESTABLE | Requires a populated workspace; no evidence sheet was fabricated. |
| Unauthenticated `/api/chat` | PASS | Returned 401. |
| Unauthenticated `/api/search-chunks` | PASS | Returned 401. |
| Unauthenticated `/api/documents/upload` | PASS | Returned 401. |
| Safe invalid workspace route | PASS | Rendered the existing “Unable to load workspace” state without a crash. |

## Console and runtime results

- Playwright browser console errors/warnings: none on landing, login, dashboard, mobile dashboard, and invalid workspace route.
- Playwright page errors: none.
- The deliberate unauthenticated upload probe produced a server-side Next body-size warning before authentication rejection; it did not reach storage and is not a browser runtime error.
- `supabase status` could not run because Docker is unavailable in this environment; this prevented local Supabase inspection.

## Findings and fixes

### P2 fixed

- Mobile dashboard retained a 272px desktop rail below the mobile breakpoint, clipping the main content. `DashboardView` now hides the rail below `md`; the corrected capture shows a usable 390px layout with no horizontal overflow.

### P0/P1 visual findings

- None observed on the available authenticated and static surfaces.

### Blocking non-visual finding

- **P1 external dependency:** the configured Supabase project did not return collections for the authenticated demo user and rejected workspace creation. This blocks live upload, ingestion, retrieval, citation, chart, evidence-panel, report/export, filename-scoping, and end-to-end RAG verification. It was not bypassed because doing so would violate the no-schema/config/no-fake-data constraints.

## Focused blocker diagnosis — 2026-08-29 continuation

This continuation investigated only the workspace/collection boundary. No demo credentials were printed, logged, stored, or sent outside the local Pliny application. The in-app Browser was unavailable in this environment (`agent.browsers.list()` returned no browsers), so the authorized Playwright sign-in and authenticated retry could not be performed in this continuation.

### Runtime evidence

Using the configured public Supabase key without a user session, the same PostgREST project returned:

| Request | Status | Sanitized response |
| --- | --- | --- |
| `GET /rest/v1/collections?select=id,user_id&limit=1` | `404` | `{"code":"PGRST205","details":null,"hint":null,"message":"Could not find the table 'public.collections' in the schema cache"}` |
| `GET /rest/v1/documents?select=id&limit=1` | `404` | `{"code":"PGRST205","details":null,"hint":null,"message":"Could not find the table 'public.documents' in the schema cache"}` |
| `GET /auth/v1/settings` | `200` | Email authentication settings returned successfully. |

The application call sites map directly to these endpoints:

- `getCollectionsForUser` calls `from("collections").select(...).eq("user_id", userId).order(...)` in `src/lib/collections/queries.ts`.
- `createCollection` calls `from("collections").insert({ user_id: user.id, name, description })` in `src/lib/collections/actions.ts`.
- The intended sanitized request forms are `GET /rest/v1/collections?select=...&user_id=eq.<user-id>&order=created_at.desc` and `POST /rest/v1/collections` with `user_id=<authenticated-user-id>`, a validated name, and a nullable description. No insert payload was captured from an authenticated Playwright retry because the browser surface was unavailable.

### Root cause

The live configured project is missing `public.collections` and `public.documents` from the PostgREST schema cache. The repository contains no Supabase migration for the foundational schema; `README.md` instead requires manually running `src/lib/supabase/schema.sql`, while the only existing manual migration covers later `document_chunks` metadata. The source schema expects `collections.user_id` to reference `auth.users(id)` and defines both authenticated owner policies:

- SELECT: `(select auth.uid()) = user_id`
- INSERT: `with check ((select auth.uid()) = user_id)`

The insert payload supplies `user.id`, and the policies do not depend on profiles, memberships, teams, or any other ownership row. The `PGRST205` response occurs before policy evaluation, so this is a remote schema/migration-state failure—not a collection naming mismatch, missing ownership value, broken RLS expression, or swallowed application error. The available evidence cannot distinguish a physically absent table from a table created but not loaded into PostgREST’s schema cache; the proposed migration handles both idempotently and sends `notify pgrst, 'reload schema'`.

### Proposed fix and workflow status

- Proposed only: `supabase/manual-migrations/2026-08-29-proposed-foundational-schema.sql` reproduces the reviewed foundational schema, keeps RLS enabled, grants table access to `authenticated` only, and preserves owner checks. It does not use `using (true)`, disable RLS, expose a service-role key, or alter browser authentication.
- Remote application: **approval required**. This continuation did not apply SQL remotely.
- Regression evidence: the pre-fix `PGRST205` response was reproduced for both required relations; post-fix authenticated SELECT/INSERT regression checks remain pending approval and a usable Playwright browser.
- Workspace SELECT: **BLOCKED** by `404 PGRST205` on the live PostgREST relation.
- Workspace INSERT: **BLOCKED**; no authenticated Playwright retry was possible, and the same missing live relation is the target of the insert action.
- `Claude.pdf` upload/processing, chat, citations, evidence, chart/report, export, and mobile evidence sheet: **BLOCKED** pending approved remote schema repair and authenticated browser access.

### Security follow-up

- `npm audit --omit=dev --audit-level=high` reports 16 vulnerabilities (11 high, 3 moderate, 2 low), including advisories affecting Next.js, sharp, ws, Hono, and xlsx. Remediation was not applied because the available Next fix is outside the declared dependency range and dependency changes are outside this focused pass.

## Validation history

1. Restored pre-redesign warm editorial UI and applied Pliny branding.
2. Captured desktop landing/login/dashboard and baseline mobile dashboard.
3. Identified the mobile rail overflow as P2 and hid the rail below `md`.
4. Rebuilt the production app, restarted the local server, and recaptured desktop/mobile evidence.
5. Rechecked interactions, API auth guards, dimensions, console/page errors, and visual surfaces.

## Automated checks

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 automated; live Supabase/Voyage/Anthropic workflow not run)
- `npm run test:citations` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS

## Authenticated terminal Playwright QA continuation — 2026-08-30

### Scope and method

- Product: local Pliny app in `/Users/sandman/Desktop/RAG intelligence/vector`.
- Browser: terminal-launched Playwright 1.55.0 with `headless: true`, using `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Viewport: 1440 × 1024. The run did not reach the mobile gate after the embedding smoke test failed.
- Authentication: normal Pliny login form with the authorized demo account. No credentials were printed, persisted in the repository, or included in this report.
- The in-app Browser/iab connector, browser attachment, CDP attachment, and manual interaction were not used.
- Temporary credentials/auth state and generated credential-bearing screenshots were deleted after the blocked run. No screenshot is linked here because authenticated captures visibly included the account email and were purged rather than retained.

### Preflight and database ownership checks

| Check | Result | Evidence |
| --- | --- | --- |
| Local Chrome executable | PASS | Required executable exists and launches through Playwright. |
| Local Pliny server | PASS | `http://127.0.0.1:3000` responded HTTP 200. |
| `VOYAGE_API_KEY` present | PASS | Presence checked without printing the value. |
| Configured Voyage model | PASS | `voyage-4`, confirmed from `src/lib/embeddings/embedText.ts`. |
| Authenticated `collections` SELECT | PASS | Owner-scoped client query completed; 0 existing rows were visible. |
| Authenticated `collections` INSERT | PASS | Disposable owner-scoped row inserted. |
| Ownership visibility | PASS | Returned rows were owner-only; query for another owner returned 0 rows. |
| Disposable collection deletion | PASS | Deleted with the authenticated client; no service-role key was used. |

### Minimal embedding smoke test

1. **Launch and sign in — PASS.** Playwright launched the specified local Chrome binary headlessly and the normal login form redirected to `/dashboard`.
2. **Create disposable workspace — PASS.** A temporary workspace was created with the authenticated client.
3. **Upload `Claude.pdf` — PASS after focused fixes.** The 14 MB file passed the 16 MB Next request-body limit and the 15 MB PDF validator; `/api/documents/upload` returned HTTP 200.
4. **Storage and extraction — PASS.** The process request downloaded the private storage object, extracted with OCR, and reported 16 pages and 10 chunks.
5. **Voyage provider — BLOCKED.** The first embedding smoke test reached Voyage and received HTTP 429 on the fourth chunk request. The sanitized application error was: `Embedding provider request failed with status 429.` No retry, provider switch, or key exposure was performed. The provider response body was not exposed by the application.
6. **Vector verification — FAIL/GATE.** The server log reported `embeddedCount: 3` and `skippedCount: 7`; the authenticated `document_chunks` check found 3 of 10 rows with vector(1024) embeddings. The smoke gate therefore failed.
7. **Ready-state integrity — FIXED, not rerun against Voyage after the 429.** Before the patch, the application incorrectly marked this partially embedded document `ready`. `process-document` now aborts on an embedding failure so the document is marked `failed` with a safe retry message instead of accepting partial embeddings.

### Focused fixes applied

- `next.config.ts`: configured `experimental.middlewareClientMaxBodySize: "16mb"` so the documented 15 MB upload limit is reachable.
- `src/lib/document-processing/plugins/pdf.ts`: aligned the PDF validator from 10 MB to the documented 15 MB limit.
- `src/app/api/process-document/route.ts`: abort processing when embeddings fail instead of inserting partial vectors and marking the document ready.

### Full workflow status

The smoke-test gate failed on the single allowed Voyage 429, so the following were not run in this continuation: five answerable questions, exact evidence/citation verification, insufficient-evidence question, second-document and cross-document retrieval, source inspector, charts, reports, exports, 390 × 844 responsive checks, and final browser console/request capture. No success is claimed for those steps.

### Validation after changes

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 automated)
- `npm run test:citations` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

## Authoritative production sign-off — 2026-08-31

This section is authoritative and supersedes every earlier `Final result`, `Continuation result`, and historical blocker in this report. Earlier sections remain as historical evidence of the issues that were diagnosed and remediated.

### Deployment

- Production URL: `https://pliny.vercel.app`
- Deployment: `dpl_G28qQ33CEusCSAnQWXiSbozBYrPf`
- Status: **READY**
- Deployed commit: `b6e876072604137f5b3a0093365fb52745acdae4`
- Source: GitHub `Deepak92939339/Pliny`, branch `main`; Vercel project `pliny` on team `deepakpatro626472-2604s-projects`.
- Build completed successfully in Vercel. No Vercel 5xx runtime errors were found; observed production API failures were expected 429 budget/provider-limit responses.

### Production environment configuration

The following names are present in Vercel Production scope. `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are stored as sensitive variables; all other listed values are plain configuration or publishable Supabase configuration.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `AI_ENABLED`, `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_STRONG_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_CHUNKS`, `AI_MAX_CHARS_PER_CHUNK`, `AI_MAX_REQUESTS_PER_MINUTE`, `AI_MAX_REQUESTS_PER_DAY`, `AI_DAILY_BUDGET_INR`, `EMBEDDINGS_ENABLED`, `EMBEDDINGS_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_BATCH_SIZE`, `EMBEDDING_MAX_CHUNKS_PER_DOCUMENT`, `EMBEDDING_QUERY_MAX_CHARS`, `OCR_ENABLED`, `OCR_MAX_PAGES`, `UPLOAD_MAX_REQUESTS_PER_HOUR`, and `PROCESS_MAX_REQUESTS_PER_HOUR` are Production-only.

- AI generation is enabled; the configured default/strong models are `claude-haiku-4-5` and `claude-sonnet-4-6`.
- Voyage embeddings are enabled with provider `voyage`, model `voyage-4`, dimension `1024`, and batch size `10`.
- `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_OIDC_TOKEN`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` were not added. The first two are intentionally excluded; the Upstash pair is absent from `.env.local` and therefore remains a production configuration gap for upload/process rate limiting.

### Supabase production posture

- Project: `lnvosbeeybisdixfwqdo` (`vector`), status `ACTIVE_HEALTHY`.
- `collections`, `documents`, `document_chunks`, `chat_messages`, and `ai_usage_events` exist with RLS enabled.
- Owner-scoped and parent-scoped authenticated policies remain effective; no unconditional `using (true)` policy was introduced.
- Anonymous REST probes returned zero rows for all five application tables; anonymous Storage listing returned zero objects.
- The `documents` Storage bucket is private.
- `document_chunks.embedding` remains `vector(1024)` and the `vector` extension is installed.
- `match_document_chunks` is security invoker, executable by `authenticated`, and no longer executable by `anon`.
- Existing ready data is intact: `Claude.pdf` has 10/10 embedded chunks and `pliny-qa-expenses.csv` has 1/1 embedded chunk.
- Password login and `auth.getUser()` succeeded with the authorized demo account. Supabase management CLI authentication was not available in this runner, so the Auth Site URL and redirect allow-list were not independently updated or confirmed. The exact required production callback is `https://pliny.vercel.app/login`; the required development callback is `http://localhost:3000/login`.

### Automated validation

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS, 14/14 offline evaluations
- `npm run test:citations` — PASS
- `npm run test:embeddings` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

### Production functional QA

- Public landing page at desktop and mobile sizes — PASS; expected warm editorial Pliny interface rendered, with no horizontal overflow and zero public-page console errors.
- Login, dashboard, workspace navigation, workspace composer, Claude.pdf visibility/readiness, CSV visibility, Source Inspector evidence, print report opening, mobile workspace no-overflow, and mobile source sheet — PASS.
- The focused production browser check found zero console errors and zero page errors. Two failed browser requests were navigational route requests observed during page transitions; the corresponding Vercel runtime entries were HTTP 200, with no production 5xx cluster.
- New grounded-answer, unsupported-question, cross-document, and post-fix CSV chart requests were blocked by the existing AI daily guard: the demo user has 25 AI usage events today while Production is configured for a 20-request daily cap. This history was not deleted and the cap was not weakened. The current run therefore makes no new success claim for those model-backed gates.
- Markdown download passed and the print report opened. Clipboard report-copy confirmation was not treated as a functional pass because the headless browser clipboard permission did not confirm the UI state.

### Chart regression

**NOT RUN in the final production pass.** The authorized one-request CSV chart gate was blocked before provider invocation by the configured daily AI cap. No chart regression success is claimed for this post-fix deployment.

### npm audit triage

`npm audit --omit=dev` reports 16 production-tree vulnerabilities: 11 high, 3 moderate, and 2 low. The two direct high-severity packages are `next` and `xlsx`; both are reachable production dependencies, with `xlsx` used in spreadsheet ingestion. High-severity transitive findings include `sharp`, `ws`, `hono`, `fast-uri`, `ip-address`, `js-yaml`, `nanoid`, `postcss`, and `brace-expansion`. No `npm audit fix --force` was run and no unbounded dependency upgrade was introduced; remediation needs a separately tested dependency pass.

### Remaining conditions

1. Configure and verify Supabase Auth Site URL/redirect allow-list through a valid Supabase management session.
2. Provide the existing Upstash production URL/token if upload/process rate limiting is required in this deployment; the application currently fails closed without them.
3. After the AI daily window resets or an approved QA budget is available, run the single authorized CSV chart-generation request and resume the blocked grounded/unsupported/cross-document chat assertions.
4. Remediate and regression-test the direct high-severity `next` and `xlsx` advisories.

### Final verdict

**CONDITIONAL** — Pliny is deployed and reachable at the canonical production URL with a successful build, authenticated workspace access, intact Supabase RLS/Storage/vector posture, and green automated validation. Full production RAG sign-off remains conditional on Auth redirect configuration, Upstash rate-limit configuration, the post-fix live chart request, and dependency-audit remediation.

## Authenticated functional QA continuation — 2026-08-30

### Passed workflows

- Normal login succeeded through Pliny's hydrated form; the application reached `/dashboard`.
- Application-context Supabase verification passed: `auth.getUser` HTTP 200 and owner-scoped collections HTTP 200.
- Workspace reconciliation found the exact QA workspace ID `b949b060-38b7-42a2-a9c7-5e317676e0ed`; no second workspace was created.
- Claude.pdf was already `ready` with 10/10 persisted chunks and 10/10 non-null embeddings. The existing vector contract remained `vector(1024)`.
- The grounded Claude.pdf question returned HTTP 200, four sources, and four citations resolving to non-empty Claude.pdf evidence. Existing route logic selected `claude-sonnet-4-6` because four retrieved chunks meets the explicit strong-model threshold; the separate one-source CSV-scoped question selected the configured `claude-haiku-4-5` default.
- Source Inspector opened on desktop and showed the cited Claude.pdf passage with page context.
- Report/export checks passed: two Markdown downloads completed, report Markdown copy reported success, and the print report opened.
- The deliberately unsupported CEO-birthday question returned HTTP 200 with `insufficient_evidence` and zero citations.
- A second disposable CSV document reached `ready`; document-scoped retrieval returned one resolving citation, and the cross-document query returned a cited response.
- Desktop captures at 1440 × 1024 and mobile captures at 390 × 844 were saved outside the repository and inspected. Mobile layout had no horizontal overflow; the mobile source sheet opened successfully.
- Browser console errors: 0. The runner observed two failed `/dashboard` GET requests associated with normal dashboard refresh/navigation; no `/api/chat` 500 occurred in this continuation.

### Reproducible application defects fixed

- A chart question containing `csv` was previously misclassified as a document-existence query because the existence heuristic matched an unrelated article (`a ... csv`). The predicate now requires the file-kind token immediately after the quantifier.
- A content question such as “What does Claude do when working with long documents?” was previously misclassified as inventory because the inventory heuristic matched any `what ... documents` phrase. Inventory matching now requires an explicit inventory form such as “what documents have I uploaded?” or “show my files.”
- The fixes preserve the existing warm editorial UI and do not change schema, providers, or embedding dimensions.

### Remaining limits and categorized verdict

- **External API limitations:** none in the previously authorized direct Anthropic smoke test; it returned HTTP 200 on `claude-haiku-4-5`. No new CSV content was sent to Anthropic after the initial functional run because the explicit provider authorization covered the Claude.pdf excerpts only.
- **QA-harness defects:** the cookie-backed application-session verifier and workspace reconciliation timing were corrected. The final provider-free mobile check passed.
- **Application QA limits:** the first five-question set included two prompts that the Claude.pdf corpus did not support and one pre-fix inventory misclassification; these were recorded as evidence behavior, not claimed as five successful grounded answers. The chart response was captured before the heuristic fix and was not live-regressed against Anthropic after the fix.
- **Remaining blockers:** final live chart-generation confirmation requires an explicitly authorized provider request containing the CSV excerpts. No authentication, database, embedding, citation, export, or responsive blocker remains from this run.
- **Deployment readiness:** **conditional, not final sign-off**. Core authenticated RAG, citation, source inspection, insufficient-evidence, multi-file, export, and responsive flows passed; chart-generation regression is pending a permitted post-fix Anthropic request.

### Validation after functional QA and fixes

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 automated; live suite remains separately labeled)
- `npm run test:citations` — PASS
- `npm run test:embeddings` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS
- `npm audit --omit=dev --audit-level=high` — 16 vulnerabilities reported (11 high, 3 moderate, 2 low); no dependency changes made.

### Final result

**BLOCKED at the authorized Voyage embedding smoke-test gate by HTTP 429.** Database ownership checks, headless local Chrome launch, normal-form authentication, workspace creation, 14 MB storage upload, OCR extraction, and chunk creation passed. The required all-chunks vector(1024) condition did not pass because Voyage accepted only 3 of 10 embedding requests before rate limiting. The temporary workspace and credential-bearing screenshots were removed.

### Continuation result

**BLOCKED — authenticated QA could not start because no supported browser instance was available.** The migration was not repeated or altered, and the local application remains ready for the authenticated workflow once browser access is restored.
- `npm run build` — PASS
- `git diff --check` — PASS
- `npm audit --omit=dev --audit-level=high` — 16 vulnerabilities reported; no fixes applied

## FINAL AUTHORITATIVE CLOSING SIGN-OFF — 2026-08-31

This closing section supersedes every earlier section in this historical report, including sections appearing above it with `BLOCKED`, `NOT RUN`, or stale deployment/configuration conclusions.

- Production: `https://pliny.vercel.app` returned HTTP 200. Final verified application deployment is `dpl_4rxJbYw7zqdae2KSPHofKs4ffT7P`, **READY**, deployed from commit `80ee5ffe73669fb70a042629f850dccf3b655674` on GitHub `main`.
- Vercel Production variables: all application variables in the current `.env.local.example` contract are present in Production, including `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; provider secrets are sensitive and Upstash integration variables are encrypted. Upstash names are server-only and absent from the browser bundle. The temporary `AI_MAX_REQUESTS_PER_DAY=30` QA override was restored to 20; the INR budget was unchanged.
- Supabase: project `lnvosbeeybisdixfwqdo` is healthy; Auth Site URL and the exact production/local login redirects are configured as externally supplied; RLS, owner scoping, private `documents` Storage, authenticated access, and `vector(1024)` remain intact.
- Automated validation: lint, TypeScript, offline eval 14/14, citations, embeddings, sanitization, report, ingestion, build, and diff-check all passed. `npm audit --omit=dev` remains non-zero only for 7 high, 3 moderate, and 2 low residual transitive findings; direct Next/xlsx/PostCSS paths were remediated and no force fix was run.
- Production QA: login/session/workspace, Claude.pdf 10/10 readiness, Source Inspector evidence, desktop/mobile layout, no horizontal overflow, Markdown export, print report, Upstash limiter, and final-deployment runtime error inspection passed. Deliberate limiter probes generated expected 429 browser console messages; no page errors or final-deployment error/fatal runtime logs were found.
- Authorized live provider checks: grounded Claude.pdf **PASS**; unsupported request **FAIL** because it did not return `insufficient_evidence`; original cross-document request **FAIL** because its saved citation set covered only the CSV, although the multi-document scope fix is deployed in `80ee5ff`; CSV chart **PASS** with rendered chart and resolving CSV citation. Exactly four provider requests were used; no fifth request is claimed.

### Final verdict

**CONDITIONAL** — deployment and infrastructure hardening are complete, but READY is not claimed because two authorized live provider checks did not pass and residual transitive npm-audit findings remain. Further provider-backed verification requires new explicit authorization.

## Pliny v1.1 ingestion/retrieval hardening — 2026-08-31

### Bounded migration-memory resolution

- The first remote migration attempt failed while adding the stored generated `document_chunks.lexical_search` column: PostgreSQL reported `memory required: 41 MB` against the project default `maintenance_work_mem: 32 MB`.
- Catalog inspection confirmed the existing vector index is valid IVFFLAT (`document_chunks_embedding_idx`), not HNSW. The failure occurred during materialization of the generated `tsvector` across the existing chunk table; PostgreSQL had to maintain table indexes during that rewrite. The IVFFLAT index was not dropped or rebuilt.
- A rolled-back transaction-local capability test accepted `SET LOCAL maintenance_work_mem = '64MB'`, and `SHOW maintenance_work_mem` returned `64MB`. No persistent database configuration was changed.
- The pending migration was amended only to set this bounded transaction-local value before the memory-intensive operation. The linked dry run showed exactly one pending migration, and the one authorized retry applied successfully.

### Remote migration and security verification

- Applied migration: `20260831090000_pliny_v1_1_ingestion_retrieval_hardening.sql`.
- Migration history contains `20260830183604`, `20260830214649`, and `20260831090000` both locally and remotely.
- `documents.processing_stage` is required with the reviewed stage constraint and `uploading` default; `processing_started_at` exists; `document_chunks.lexical_search` is a stored generated `tsvector`.
- `document_chunks_lexical_search_idx` exists as a valid, ready GIN index. The existing `document_chunks_embedding_idx` remains valid IVFFLAT, and `document_chunks.embedding` remains `vector(1024)`.
- `public.match_document_chunks_lexical(text, uuid, uuid, uuid, integer)` is `STABLE`, security-invoker, fixed to `search_path=public`, and returns the reviewed ranked table. Its PostgreSQL full-text algorithm is `websearch_to_tsquery('simple', ...)` plus bounded `ts_rank_cd`; it is documented as lexical ranking, not BM25.
- The lexical RPC is executable by `authenticated` only; anonymous and PUBLIC execution are denied. An anonymous role call was rejected with permission denied. An authenticated role without a JWT returned zero rows, and the function body enforces `match_user_id = auth.uid()` plus the document owner predicate. Existing documents and document-chunk RLS policies remain enabled and owner-scoped.
- Security advisor warnings are pre-existing configuration findings for the public `vector` extension and disabled leaked-password protection; no v1.1 security regression was reported. The performance advisor reported no issues.

### Provider-free validation

- Focused ingestion regression tests — PASS.
- Focused retrieval regression tests — PASS.
- `npm run lint` — PASS.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS.
- No Voyage, Anthropic, OpenAI, Z.AI or other provider request was made, and no fixture was uploaded or transmitted.

### Release status

- v1.1 migration application and remote database verification — **PASS**.
- Live ingestion status — **pending explicit document/provider authorization**.
- Production deployment ID: `dpl_BAs4aCUnrhnRP5n6L9qBjJS4j7FM` (**READY**).
- Deployed commit: `c039cfd4d89714f43e285867f192b40996f42f2c` (`Harden ingestion and hybrid retrieval`).
- `https://pliny.vercel.app` — HTTP 200; `/login` — HTTP 200; unauthenticated `POST /api/search-chunks` — HTTP 401.
- Production guards remain `AI_MAX_REQUESTS_PER_DAY=20` and `AI_DAILY_BUDGET_INR=30`; no environment variables were changed by this release.
- Deployment-scoped logs contain no 5xx or fatal entries. The single error-level entry is the expected server log from the deliberate unauthenticated 401 protection probe; it contains no document or credential material.

## FINAL TARGETED VERIFICATION — 2026-08-31

This is the latest authoritative result and supersedes all earlier conclusions in this historical report, including the prior invalid cross-document harness result. No broad QA, dependency remediation, build, or previously passed test was rerun for this targeted gate.

- Owner-scoped preflight passed before the provider request. The exact collection selected by database ID was `b949b060-38b7-42a2-a9c7-5e317676e0ed`; `Claude.pdf` was document `82df6968-7c4e-4f45-823b-222b820bad6f` with 10/10 embedded chunks, and `pliny-qa-expenses.csv` was document `64d87665-1801-43d7-af39-5e125c66c98b` with 1/1 embedded chunk. Both were ready, owner-scoped, and dimension 1024.
- The preflight daily event count was 32. `AI_MAX_REQUESTS_PER_DAY` was temporarily raised to 33 only; `AI_DAILY_BUDGET_INR` was not changed. The temporary-cap deployment was `dpl_7qXF2kRiQsewhSnC9MBca6EvjjGR`, **READY**, on commit `a20deaef74b72df2c542ee8d3d1e0ae4e49b8121`.
- Exactly one additional authenticated production provider request was sent with the exact collection and document scope. It returned HTTP 200 and `answered`, but the application response contained only the `pliny-qa-expenses.csv` citation. No Claude.pdf citation or Claude document ID was returned, so the required two-document evidence gate failed. The failure boundary is retrieval/citation coverage between the selected-document request and the grounded answer; it is not an authentication, HTTP, deployment, or provider-availability failure. No additional provider request was made.
- The request cap was restored to 20 without changing the INR budget. Final production deployment `dpl_6LpcCU6hzKWfxmLcA9PyfrQkymTB` is **READY**, aliases `https://pliny.vercel.app`, and is deployed from commit `a20deaef74b72df2c542ee8d3d1e0ae4e49b8121` on GitHub `main`.
- Final production returned HTTP 200. The final deployment had no error/fatal runtime logs, and no runtime error clusters were found in the inspected window.

### Final verdict

**CONDITIONAL** — the exact owner/document preflight, cap restoration, final deployment, HTTP health, and runtime error checks passed. The single authorized cross-document request failed because Claude.pdf evidence was absent from the grounded citation set. READY is not claimed, and no further provider request was made.

## FINAL TARGETED SIGN-OFF — 2026-08-31

This is the final authoritative section and supersedes all earlier sections, including the previous closing sign-off above. Historical results remain only as audit history.

- Final production deployment: `dpl_7SvYM6BJ9zjD3D6idwpBasVEcboz`, **READY**, commit `0d5a1b0ec2d5700765f74a221bd8eb2914278eac`; `https://pliny.vercel.app` returned HTTP 200.
- General evidence sufficiency is now enforced before provider invocation using bounded source count/size, meaningful lexical or semantic retrieval quality, and post-response citation validity. Regression tests cover unsupported facts, weak overlap, misleading filenames, supported paraphrases, invalid citations, and two-document coverage.
- The temporary `AI_MAX_REQUESTS_PER_DAY` cap was set only to `N+2` (`N=30`, cap 32) for the authorized window, then restored to 20. The INR budget was not changed.
- `npm audit --omit=dev` is clean: zero reachable production findings. The full-tree audit has 9 dev/build-toolchain-only findings (5 high, 2 moderate, 2 low), isolated to tooling such as `shadcn`/ESLint and excluded from the production dependency tree. No `npm audit fix --force` was run.
- `supabase/.temp/` is now ignored as local generated state; its contents were not committed.
- Final offline validation passed: lint, TypeScript, eval 14/14, citations, embeddings, evidence, retrieval, ingestion, sanitization, report, build, production audit, and diff-check.
- Exactly two additional live requests were issued. Unsupported request **PASS**: HTTP 200, `insufficient_evidence`, zero citations. Cross-document request **UNVERIFIED**: the runner selected an empty collection whose historical chat text mentioned both filenames, so the application correctly returned insufficient evidence; this is not valid two-document evidence and no third provider request was made.

### Final verdict

**CONDITIONAL** — the unsupported gate and production audit are resolved, but READY cannot be claimed because the authorized cross-document request was invalidated by collection-selection harness error and therefore did not verify resolving evidence from both required documents. A new explicit provider authorization is required for that one live check.

## Final result

**BLOCKED — focused diagnosis found the live Supabase foundational schema missing from the PostgREST schema cache (`PGRST205` for `collections` and `documents`).** The smallest safe fix is the proposed owner-scoped migration in `supabase/manual-migrations/2026-08-29-proposed-foundational-schema.sql`; it requires explicit approval before remote application. Authenticated SELECT/INSERT and the `Claude.pdf` workflow remain unverified in this continuation because the required browser surface was unavailable.

## Authenticated QA continuation — 2026-08-29

The user reports that the foundational migration has since been applied and that `public.collections`, `public.documents`, `public.document_chunks`, and the PostgREST schema reload are complete. This continuation did not independently verify those claims because the required browser surface was unavailable.

- Local Pliny server: started successfully on `http://localhost:3000`, then stopped after browser discovery failed.
- Browser availability: no connected browser instances were exposed by the required browser-control runtime.
- Authenticated collections SELECT: **NOT RUN**.
- Authenticated collections INSERT: **NOT RUN**.
- `Claude.pdf` upload, ingestion, extraction, chunking, embeddings, retrieval, citations, evidence, multi-file, charts, reports, exports, desktop/mobile QA, and isolation checks: **NOT RUN**.
- No demo credentials were used outside the required browser surface. No remote SQL or schema change was performed.

### Continuation validation

## FINAL AUTHORITATIVE PRODUCTION SIGN-OFF — 2026-08-31

This section is the final authority for this report and supersedes all historical blockers, intermediate verdicts, and earlier deployment/configuration statements above. Historical evidence is retained for traceability; it does not describe the current production state.

### Current production deployment

- Canonical URL: `https://pliny.vercel.app` — HTTP 200 after the final cap-restored deployment.
- Latest verified application deployment: `dpl_4rxJbYw7zqdae2KSPHofKs4ffT7P` — **READY**.
- Deployed application commit: `80ee5ffe73669fb70a042629f850dccf3b655674` (`Preserve explicit multi-document retrieval scope`).
- Source: GitHub `Deepak92939339/Pliny`, `main`; Vercel project `pliny` on team `deepakpatro626472-2604s-projects`.
- Vercel build logs show Next.js `15.5.24` compiling, type-checking, generating pages, and finalizing successfully.

### Dependency and security remediation

- Upgraded Next.js and `eslint-config-next` to the compatible patched maintenance release `15.5.24`; no major-version jump was made.
- Removed the vulnerable direct `xlsx` dependency. `.xlsx` support remains through maintained `read-excel-file`; legacy `.xls` and macro-enabled `.xlsm` uploads are rejected with a clear message.
- Added spreadsheet-ingestion regression coverage (`npm run test:ingestion`) covering multi-sheet parsing, row locations, invalid extensions/MIME, and malformed input.
- Pinned the reachable PostCSS transitive path to `8.5.26` through the package override.
- `npm audit --omit=dev` now reports 12 residual transitive production-tree findings: 7 high, 3 moderate, and 2 low; no critical finding, and the direct `next`, `xlsx`, and PostCSS paths are remediated. `npm audit fix --force` was not run. The remaining findings are recorded as a residual dependency risk, not silently ignored.

### Vercel Production environment

All application configuration below is scoped to `production`. Secret-bearing provider keys are stored as sensitive variables; the Upstash integration variables are encrypted. No values are recorded in this report.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `AI_ENABLED`, `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_STRONG_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_CHUNKS`, `AI_MAX_CHARS_PER_CHUNK`, `AI_MAX_REQUESTS_PER_MINUTE`, `AI_MAX_REQUESTS_PER_DAY`, `AI_DAILY_BUDGET_INR`, `EMBEDDINGS_ENABLED`, `EMBEDDINGS_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_BATCH_SIZE`, `EMBEDDING_MAX_CHUNKS_PER_DOCUMENT`, `EMBEDDING_QUERY_MAX_CHARS`, `OCR_ENABLED`, `OCR_MAX_PAGES`, `UPLOAD_MAX_REQUESTS_PER_HOUR`, `PROCESS_MAX_REQUESTS_PER_HOUR`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` are present in Production.

The Upstash integration also supplies encrypted Production variables `UPSTASH_REDIS_REST_KV_REST_API_READ_ONLY_TOKEN`, `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_KV_REST_API_URL`, `UPSTASH_REDIS_REST_KV_URL`, and `UPSTASH_REDIS_REST_REDIS_URL`. Application code explicitly reads only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; both aliases were corrected to the HTTPS REST endpoint/token pair. A direct REST ping succeeded without exposing the values. The variables are referenced only by server-side rate-limit code, and no Upstash name appeared in the browser bundle.

AI generation, Voyage embeddings, `voyage-4`, 1024-dimensional vectors, configured Haiku/Sonnet routing, batching, bounded retries, upload/process limits, and existing cost controls are enabled. `AI_MAX_REQUESTS_PER_DAY` was temporarily raised to 30 only for the authorized live QA window, then restored to 20; `AI_DAILY_BUDGET_INR` was not changed. `SUPABASE_SERVICE_ROLE_KEY` and `VERCEL_OIDC_TOKEN` were not added.

### Supabase production posture

- Project `lnvosbeeybisdixfwqdo` (`vector`) remains healthy and unchanged.
- The user-provided external configuration is applied: Auth Site URL `https://pliny.vercel.app`, with redirects `https://pliny.vercel.app/login` and `http://localhost:3000/login`. The application uses `/login` for its password callback route.
- `collections`, `documents`, `document_chunks`, `chat_messages`, and `ai_usage_events` exist with RLS enabled. Owner/parent-scoped policies remain effective; no unconditional policy was introduced.
- The `documents` Storage bucket remains private. Anonymous table/storage probes remain denied/empty, authenticated owner access works, and existing user data is intact.
- `document_chunks.embedding` remains `vector(1024)`. `match_document_chunks` remains security-invoker and is not executable by `anon`.
- Existing readiness remains intact: `Claude.pdf` is 10/10 embedded and `pliny-qa-expenses.csv` is 1/1 embedded.

### Automated validation

All required checks passed on the validated worktree and deployment source:

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 offline evaluations)
- `npm run test:citations` — PASS
- `npm run test:embeddings` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run test:ingestion` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS
- `npm audit --omit=dev` — expected non-zero exit with the residual findings listed above; no force fix was run.

### Production QA

- Desktop landing/login/dashboard/workspace at 1440 × 1024 — PASS.
- Password login, `/dashboard` redirect, reload session persistence, and Supabase-backed workspace access — PASS.
- Upstash-backed process limiter — PASS: the bounded probe returned `400,400,400,400,400,429` before the final deployment and `429` responses after the limiter key was saturated; no Redis `503` occurred after the alias correction.
- Claude.pdf readiness and 10/10 vector verification — PASS.
- Source Inspector with non-empty cited evidence — PASS on the populated QA workspace; mobile source-sheet surface also opened.
- Markdown export and print report — PASS. Report-copy controls were present; clipboard confirmation is not treated as an independent pass in headless Chrome.
- Mobile 390 × 844 layout — PASS; no horizontal overflow and no page errors.
- Browser console/failed requests — the only final-run console errors were the expected browser messages for deliberate `429 /api/process-document` limiter probes. No page errors occurred. Final-deployment Vercel runtime logs contain no error/fatal entries. Historical Redis URL errors belong to the superseded deployment and are not present in the final deployment logs.

### Exactly four authorized live provider checks

The four authorized production requests were issued without recording provider payloads or complete document contents:

1. Grounded Claude.pdf question — **PASS**: HTTP 200; four resolving Claude.pdf citations and non-empty evidence.
2. Unsupported question — **FAIL**: HTTP 200, but the persisted response mentioned the unsupported birthday subject, included one CSV citation, and did not return `insufficient_evidence`.
3. Cross-document request — **FAIL on the original live response**: HTTP 200, but the persisted citation set contained only the CSV document. The explicit multi-document scope/retrieval-coverage fix is deployed in `80ee5ff`; no fifth provider request was made because authorization was exactly four requests.
4. Post-fix CSV chart request — **PASS**: HTTP 200; chart rendered and the CSV citation resolved to non-empty source evidence.

### Final verdict

**CONDITIONAL** — the dependency hardening, final deployment, Auth configuration, Upstash limiter, automated suite, authentication/session flow, storage/RLS/vector posture, source inspection, exports, responsive layout, and two of the four authorized live provider checks pass. READY cannot be claimed because the authorized unsupported and original cross-document live checks did not pass, and the production audit still has residual transitive findings. The cross-document fix is deployed and the cap is restored to 20; further provider-backed verification requires new explicit authorization.

- `git diff --check` — PASS
- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npm run eval` — PASS (14/14 automated; live workflow not run)
- `npm run test:citations` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS

## Current authoritative result — 2026-08-30

The authenticated terminal Playwright run documented above supersedes the earlier browser-availability and pre-migration blockers in this historical report. The current run reached the authorized Voyage provider, then stopped exactly once at the provider's HTTP 429 embedding limit; no full RAG workflow success is claimed.

## Embedding strategy remediation and QA continuation — 2026-08-30

### Diagnosis

- Contract retained: Voyage `voyage-4`, `document_chunks.embedding vector(1024)`, and `output_dimension: 1024`.
- Before remediation, a 10-chunk document made 10 HTTP requests: batch size 1, sequential concurrency 1, no retry, and no `Retry-After` handling.
- Each successful response mutated a chunk row in memory, then a later failure could leave partial rows to be inserted. The previous run confirmed 3/10 vectors before HTTP 429 and the document was incorrectly marked ready before the focused abort fix.
- The existing backfill contract already used a conservative default batch size of 10 and a maximum of 25; the live processor now follows that same ceiling.

### Remediation

- Added shared batched Voyage requests in `src/lib/embeddings/embedBatch.ts`.
- Default `EMBEDDING_BATCH_SIZE=10`, clamped to 1–25; a 10-chunk document uses one request. Batches are processed sequentially with concurrency 1 and preserve indexed provider ordering.
- Responses are rejected unless the vector count exactly equals the input count and every vector contains exactly 1024 numeric values.
- Added bounded retries for 408, 429, 5xx, and network failures: five total attempts maximum, `Retry-After` honored when present, otherwise exponential backoff with jitter, and each delay capped at 30 seconds. 400, 401, 402, and 403 are not retried.
- Provider failure details retain only a short sanitized body/status/retry hint; document text, API keys, and authorization headers are not logged.
- `prepareChunkRowsWithEmbeddings` validates the complete result before assigning vectors. The process route inserts no chunks until the complete batch set is valid; failed processing remains retryable, and the existing old-chunk deletion is retained for idempotent reprocessing.
- Updated `scripts/backfill-embeddings.mjs` to use the same shared batched/retry implementation without changing Supabase schema or vector dimensions.

### Automated coverage

`npm run test:embeddings` passes coverage for successful batching, one request for 10 chunks, output ordering, wrong count, wrong dimension, invalid indexes, 429 recovery, `Retry-After`, transient 5xx, network failure, exhausted retries, non-retryable 401, partial-result rejection, and repeat document preparation without duplicate chunk indexes.

### Post-remediation live gate

- Local Chrome exists at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and launches through terminal Playwright headlessly at 1440 × 1024. The local Next server also bound successfully to `127.0.0.1:3000` after the required 60-second cooldown.
- The post-remediation runner could not establish the authorized authenticated session from the available prior-session credential source, so it stopped before workspace creation and before any new Voyage request. This is not a Voyage status or provider credential result; no post-remediation 429 was observed.
- No new authenticated screenshots, auth state, credentials, API keys, authorization headers, or document text were persisted. Temporary QA artifacts were removed.
- The post-remediation retrieval, citation, insufficient-evidence, multi-file, report/chart, export, and responsive UI gates remain pending an authenticated terminal run.

### Validation

- `npm run test:embeddings` — PASS
- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 automated)
- `npm run test:citations` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

### Current authoritative result

**Implementation remediation complete; authenticated live reprocessing and the remaining UI QA gates are pending a directly available authorized credential source.** No provider or schema change was made, and no commit or push was performed.

## Authentication diagnosis continuation — 2026-08-30

The exact temporary credential file was used without printing or persisting its contents. Direct Supabase authentication is verified:

- Password authentication: **HTTP 200, AUTHENTICATED**.
- `auth.getUser()`: **HTTP 200, AUTHENTICATED; demo-user session verified**.
- Owner-scoped `collections` SELECT: **HTTP 200, PASS**.
- Owner-scoped `collections` INSERT: **HTTP 201, PASS; owner match verified**.
- Reading the inserted collection: **HTTP 200, PASS**.
- Ownership visibility check: **HTTP 200, PASS; no cross-owner row visible**.
- Deleting the exact disposable collection: **HTTP 200, PASS**.
- No service-role, SQL Editor, RLS bypass, Browser/iab connector, CDP attachment, or manual interaction was used.

The application-stage attempt did not begin because the detached local server process was reaped before Playwright navigation, producing `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/login`. Chrome/Playwright launch was not the failing stage, and no Voyage request was made. The exact credential file was deleted after this failed attempt as required.

The remaining application-authentication, live document, retrieval, citation, report/export, and responsive gates require the exact temporary credential file to be recreated before the terminal runner can continue.

## Supervised lifecycle attempt — 2026-08-30

- The supplied temporary credential file was read without printing its contents and was injected only into the Playwright runner environment. The supervised shell trap deleted that exact file and the temporary runner after the attempt.
- The local server was started in the same active shell as the runner, with its PID captured immediately and output passed through a sanitizing FIFO. The captured server process exited with status **1**.
- Readiness result: **FAIL**, HTTP status **000**, after **60** polling attempts.
- Sanitized server error: `listen EPERM: operation not permitted 127.0.0.1:3000`.
- Playwright error: **not reached**; the runner was not launched because readiness failed. No Voyage request was made.
- A separate credential-free escalated bind probe using the same local Next command reached **HTTP 200** on `/login` in 3 attempts and exited cleanly, showing the EPERM is sandbox permission-related rather than a Pliny route failure.
- No authenticated screenshots, auth state, API keys, authorization headers, credentials, or document text were persisted. The full live UI workflow remains pending a fresh temporary credential file and an escalated supervised shell launch.

## User-managed server Playwright attempt — 2026-08-30

- The requested `curl -I http://127.0.0.1:3000/login` returned **HTTP 200** under escalated localhost permission. The user-managed server was not started, restarted, supervised, or terminated.
- The first default-sandbox HEAD check returned connection refused; this was resolved by the authorized narrow localhost permission.
- The temporary Playwright runner reached its bootstrap but exited before launching Chrome with: `TypeError: Cannot read properties of undefined (reading 'launch')`. The temporary package was CommonJS-shaped and exposed `chromium` under its default export; this runner import issue is now identified for correction.
- No login, Voyage request, document reset, or live QA workflow ran in this attempt. The exact temporary credential file was deleted by the cleanup trap, and the temporary package directory was removed. No browser authentication state was written.

## Anthropic model and chat gate diagnosis — 2026-08-30

### Configuration and route evidence

- `AI_ENABLED=true` is present in the local configuration; its value was checked without exposing environment contents.
- `src/lib/ai/modelRouter.ts` reads `ANTHROPIC_DEFAULT_MODEL` and `ANTHROPIC_STRONG_MODEL`; no `ANTHROPIC_MODEL` variable was added or used.
- The configured default resolves to `claude-haiku-4-5`; the strong fallback is `claude-sonnet-4-6`.
- Existing routing explicitly selects the strong model when a question retrieves four or more chunks, matches a harder-question keyword, or exceeds 220 characters. The ordinary Claude.pdf question does not match a harder-question keyword, but the repository's existing four-chunk rule may select the strong model; the live response metadata was not reached in this attempt.
- The route's 500 paths were traced: ownership/document retrieval, budget checks, user-message persistence, the Anthropic request/catch, citation-correction request, and assistant-message persistence each have distinct guarded paths. The prior browser evidence only established `500 /api/chat`; it did not expose a server-side stage because the user-managed server logs were not available to the runner.

### Direct provider smoke test

- The configured default-model smoke request used prompt `Reply with exactly OK`, `max_tokens: 8`, and no PDF context.
- Result: **HTTP 200**, exact response `OK`, resolved model `claude-haiku-4-5`.
- No request body, retrieved excerpts, API key, authorization header, or provider response body was logged.

### Authenticated chat retry gate

- Playwright package resolution was independently repaired and validated using CommonJS `createRequire`; `chromium.launch` was available and local Chrome was present.
- The authenticated runner did not reach the login form or read the credential file because `page.goto` failed first with `net::ERR_CONNECTION_REFUSED` at `http://127.0.0.1:3000/login`.
- Independent readiness check: `curl -I --max-time 10 http://127.0.0.1:3000/login` exited **7** with `curl: (7) Failed to connect to 127.0.0.1 port 3000 after 0 ms: Couldn't connect to server`.
- No authenticated `/api/chat` retry, additional Voyage request, credential-bearing screenshot, or browser auth state was produced. The persistent credential file remains untouched for the user-managed retry.

### Categorized verdict

- **Passed workflows:** source-level AI configuration diagnosis; direct Haiku provider smoke test; prior authenticated Supabase/RLS checks; prior Claude.pdf upload, extraction, batched embedding, 10/10 vector(1024), and ready-state evidence.
- **Application defects:** no new application defect was established in this gate. The prior `/api/chat` 500 remains unresolved at server-stage granularity because the server was unavailable for the authorized retry.
- **External API limitations:** none observed in the direct Anthropic smoke test; it returned HTTP 200.
- **QA-harness defects:** the temporary Playwright import defect is fixed and independently validated; no current harness assertion ran past navigation.
- **Remaining blockers:** the user-managed local server was not accepting connections, so authenticated application-context auth, the single grounded chat retry, and downstream retrieval/citation/report/export/responsive checks could not run.
- **Deployment readiness:** **not ready for final RAG QA sign-off**. The provider smoke path is healthy, but the authenticated chat and remaining UI workflow still require a live user-managed server session.

### Validation after this gate

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run eval` — PASS (14/14 automated; live authenticated workflow not run)
- `npm run test:citations` — PASS
- `npm run test:embeddings` — PASS
- `npm run test:sanitization` — PASS
- `npm run test:report` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

## FINAL AUTHORITATIVE CLOSING SIGN-OFF — 2026-08-31

This closing section supersedes every earlier section in this historical report, including sections appearing above it with `BLOCKED`, `NOT RUN`, or stale deployment/configuration conclusions.

- Production: `https://pliny.vercel.app` returned HTTP 200. Final verified application deployment is `dpl_4rxJbYw7zqdae2KSPHofKs4ffT7P`, **READY**, deployed from commit `80ee5ffe73669fb70a042629f850dccf3b655674` on GitHub `main`.
- Vercel Production variables: all application variables in the current `.env.local.example` contract are present in Production, including `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; provider secrets are sensitive and Upstash integration variables are encrypted. Upstash names are server-only and absent from the browser bundle. The temporary `AI_MAX_REQUESTS_PER_DAY=30` QA override was restored to 20; the INR budget was unchanged.
- Supabase: project `lnvosbeeybisdixfwqdo` is healthy; Auth Site URL and the exact production/local login redirects are configured as externally supplied; RLS, owner scoping, private `documents` Storage, authenticated access, and `vector(1024)` remain intact.
- Automated validation: lint, TypeScript, offline eval 14/14, citations, embeddings, sanitization, report, ingestion, build, and diff-check all passed. `npm audit --omit=dev` remains non-zero only for 7 high, 3 moderate, and 2 low residual transitive findings; direct Next/xlsx/PostCSS paths were remediated and no force fix was run.
- Production QA: login/session/workspace, Claude.pdf 10/10 readiness, Source Inspector evidence, desktop/mobile layout, no horizontal overflow, Markdown export, print report, Upstash limiter, and final-deployment runtime error inspection passed. Deliberate limiter probes generated expected 429 browser console messages; no page errors or final-deployment error/fatal runtime logs were found.
- Authorized live provider checks: grounded Claude.pdf **PASS**; unsupported request **FAIL** because it did not return `insufficient_evidence`; original cross-document request **FAIL** because its saved citation set covered only the CSV, although the multi-document scope fix is deployed in `80ee5ff`; CSV chart **PASS** with rendered chart and resolving CSV citation. Exactly four provider requests were used; no fifth request is claimed.

### Final verdict

**CONDITIONAL** — deployment and infrastructure hardening are complete, but READY is not claimed because two authorized live provider checks did not pass and residual transitive npm-audit findings remain. Further provider-backed verification requires new explicit authorization.

## FINAL VISUAL REFINEMENT — 2026-08-31

This section records the bounded light-theme, brand and content refinement. It does not change ingestion, retrieval, embeddings, authentication, database behavior, provider configuration, rate limits or budgets.

- Brand: the product name is **Pliny** and the primary line is **“Knowledge, traced to its source.”** The original mark is a folio with a restrained quill stroke, supplied as `public/brand/pliny-mark.svg`, 16px, 24px and 48px SVG variants, `public/brand/pliny-mark.png` transparent PNG, and `public/icon.svg`. Old `Pliny.ai` UI strings and logo references were removed.
- Theme: the visible theme switcher, `ThemeProvider`, `ThemeToggle`, `next-themes` dependency, dark initialization/persistence and dark-mode style branches were removed. The application now has one intentional paper/off-white light theme with Oxford ink, rust accents, fine borders and serif-led display typography.
- Navigation and content: the public navigation is Trust & Security, Data & Privacy, Access, About, Sign in and Start workspace. The landing page now explains ingest → retrieve → answer → verify, evidence/citations, deployed formats (PDF, DOCX, XLSX, CSV, Markdown, HTML and TXT), current security/privacy controls and future work without claiming PII pseudonymization, provider zero retention, enterprise RBAC, compliance certification or available paid plans.
- Workspace: the three-column desktop workspace, mobile source-sheet behavior, source filenames, locations, excerpts, citation identities, charts, reports, exports and print paths remain in place. No model selector or Luna/GLM identity was added.
- Visual witnesses: fresh local Chrome screenshots were captured at 1440 × 1024 (`/Users/sandman/Desktop/RAG intelligence/pliny-v11-visual-desktop-1440.png`) and 390 × 844 (`/Users/sandman/Desktop/RAG intelligence/pliny-v11-visual-mobile-390.png`), then the deployed landing page was captured at the same sizes (`/Users/sandman/Desktop/RAG intelligence/pliny-v11-prod-desktop-1440.png` and `/Users/sandman/Desktop/RAG intelligence/pliny-v11-prod-mobile-390.png`). Both deployed witnesses show the new mark, light theme and responsive landing layout; the mobile witness shows the menu, sign-in and compact workspace action with scroll width equal to the 390px viewport. The local browser pass also rendered login at both sizes, redirected unauthenticated dashboard and collection routes to login, and recorded no console exceptions. Existing authenticated workspace/source-inspector/source-sheet evidence remains the regression witness for protected populated state; no document was uploaded or reprocessed in this visual phase.
- Validation: `npm run lint`, `npx tsc --noEmit`, `npm run eval` (14/14 offline), `npm run test:citations`, `npm run test:embeddings`, `npm run test:evidence`, `npm run test:retrieval`, `npm run test:ingestion`, `npm run test:sanitization`, `npm run test:report`, `npm run build`, `git diff --check` and `npm audit --omit=dev` passed. The eval live end-to-end section remained intentionally not run because this phase forbids provider requests.
- Provider requests made in this phase: **zero**. Tender, Markdown, HTML and other document fixtures were not uploaded or transmitted.
- Release metadata: commit `5e3d1b6e8d2b2f80ac2e2e1c54a4cb03c71088a6` is pushed to GitHub `main`. The linked production deployment `dpl_8NUfFXZzRYgFfrYkCmoUCMq6bnMQ` is READY and serves `https://pliny.vercel.app`. Production returned HTTP 200. The error-log scan found only the two expected auth-session error entries generated by the deliberate unauthenticated `/api/chat` and `/api/search-chunks` protection probes; no build, fatal or unhandled runtime error was observed. No environment, rate-limit or budget configuration was changed.
