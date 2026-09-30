# Antigravity Review Handoff — Pliny Audit Fix R1

## 1. Branch and Deployment Identifiers
- **Repository**: `https://github.com/Deepak92939339/Pliny.git`
- **Publishing Branch**: `fix/pliny-audit-r1-preview-20260930`
- **Base Commit**: `b8a984417d6c07d865613b739aa45d9875dd6fd3` (clean `origin/main`)
- **Application Candidate Commit (Pre-Docs)**: `69de250005a76c8f9dbd99ea7e53f0da591aa9ef`
- **Final Candidate SHA**: (recorded below after review docs commit and push)
- **Draft Pull Request**: (recorded below after branch push)
- **Vercel Preview Deployment**:
  - Target: `Preview` (branch-scoped)
  - Source Branch: `fix/pliny-audit-r1-preview-20260930`
  - Canonical Production (`pliny.vercel.app`): **Untouched** at `b8a9844`

---

## 2. Claim Classification and Evidence Matrix

| Claim / Work Package | Classification | Active Source Finding | Reproduction & Evidence | Patch Behavior | Remaining Limitations |
|---|---|---|---|---|---|
| **WP1: Processing & OCR Resilience** (PLN-009, PLN-003) | Reproduced & Fixed | Baseline `/api/process-document` lacked `maxDuration`, bounded OCR races, worker terminations, and stale watchdog | Long jobs stayed in `processing` indefinitely; client dropzone had no 429/error mapping | `maxDuration = 300`, `runProcessingWithTerminalState` guarantees `status='failed'`, Tesseract worker cleanup, lazy watchdog in `queries.ts`, client dropzone error states. `test:processing` (14/14 pass), `test:ocr-e2e` (ready in 3.9s vs 240s budget). | Plan duration ceiling (Vercel plan clamps maxDuration); watchdog triggers on collection/doc read. |
| **WP2: Table Lookups & RRF** (PLN-009) | Reproduced & Fixed | Baseline `plugins/csv.ts` chunked into 50-row blocks; lexical query split identifiers into loose OR terms | INC-5517 query scored Hit@3 = 0/3 in baseline under weighted blend | 8-row units with repeated headers (`TABLE_ROWS_PER_UNIT = 8`), normalized identifier quotation (`"inc 5517"`), RRF fusion (k=60) with guaranteed identifier slot and 1.0 exact boost. Hit@3 = 3/3 on table queries. `test:table-retrieval` (22/22 pass). | Uses Postgres `ts_rank_cd`, not BM25 extension. Existing CSV/XLSX docs retain old chunks until reprocessed. |
| **WP2 Addendum: Voyage `input_type` Parity** | Checked & Already Correct | `src/lib/embeddings/embedBatch.ts` sets `input_type: options.inputType ?? "document"` for both direct Voyage and OpenRouter | Ingestion sends `"document"`, search sends `"query"` | Verified via code inspection and regression assertion in `scripts/test-privacy-phase4b.mjs` asserting `["document", "query"]` | OpenRouter downstream passthrough of `input_type` is vendor-dependent; global setting ensures intra-workspace consistency. |
| **WP3: Rate Limits & Budget Guard** (PLN-005, PLN-004) | Reproduced & Fixed | Baseline counted blocked rows toward rate limits. ALL.patch introduced zero-count bug (`status !== 'allowed'`). Rate-limit test had UTC midnight flaw. | Baseline 10 blocked retries extended lockout; ALL.patch yielded 0 spend/reqs for 40 successes; test failed 8/9 at 03:34 UTC | WP3 Hotfix filters `event.status === "blocked"`; `scripts/test-rate-limit-retry.mjs` corrected with fixed noon-UTC clock and UTC day boundary test. 11/11 tests pass. | Budget guard is per-user estimate, not atomic multi-user account cap. |
| **WP6: Unverified Answer Text Leaks** | Reproduced & Fixed | Baseline `chat/route.ts` line 1586: `isInsufficientEvidence && requiredDocumentIds.length > 1 ? NO_CONTEXT_ANSWER : answer;` | Single-document queries returned unverified draft answer on insufficient evidence | `resolveVerifiedResponseAnswer` in `responseGuard.ts` returns `NO_CONTEXT_ANSWER` for ANY insufficient evidence regardless of document count. `test:response-guard` (5/5 pass). | Upstream evidence classifier determines insufficiency. |
| **WP4: Security Headers & Dependencies** (PLN-002, PLN-001) | Reproduced & Fixed | Baseline had Report-Only CSP in `next.config.ts`; `npm audit` flagged 16 vulnerabilities (7 high) | Unenforced CSP; vulnerable `@xmldom/xmldom` | Enforced CSP with per-request nonces and `strict-dynamic` in `middleware.ts`; `@xmldom/xmldom: 0.8.15` override + `ai` bump clears all prod vulnerabilities (`npm audit --omit=dev` = 0). `test:security-headers` (4/4 pass), live CSP verified via curl. | `unsafe-inline` retained for Tailwind runtime styles; cookies not HttpOnly due to Supabase browser client architecture. |
| **WP5: Document Delete & Duplicate Detection** (PLN-007, PLN-006) | Feature Gap Addressed | Missing `DELETE /api/documents/[id]` route; missing content hash in schema/upload | Users could not delete documents or detect duplicate uploads | `DELETE /api/documents/[id]` route with ownership check (404 on missing/unowned), cascading storage and chunk deletion; additive migration `20260929090000_documents_content_sha256.sql` + 409 duplicate check with "Upload anyway" override. `test:document-management` (6/6 pass). | Migration must be applied to Staging/Production database. |
| **WP7: Remove `.xls` Dead Code** | Checked & Cleaned | `.xls` mapped to `xlsx` in `fileKinds.ts` without parser support | `.xls` uploads caused extraction failure | Removed `.xls` from `fileKinds.ts`; server returns HTTP 415 with clear error; historical rows supported for citations. `test:xls-dead-code` (4/4 pass). | None; `.xls` legacy format intentionally unsupported. |
| **WP8: Visual Contrast & Design Tokens** (PLN-008) | UI Polish Addressed | 75+ hardcoded hex colors; muted text `#8a7d70` failed WCAG AA (3.53:1) | Contrast failure on dark/muted text | Semantic CSS tokens in `globals.css` (`--paper-*`, `--ink-*`, `--rule-*`, `--accent-*`); muted text contrast raised to 5.5:1+; light theme error/not-found pages. | 10 intentional hex colors preserved for specific status/link roles. |
| **WP9: Fail-Safe Pricing & Documentation** | Reproduced & Fixed | `getModelRates` threw an unhandled error on invalid `AI_MODEL_PRICING_JSON` | Misconfigured env var crashed chat route | Safely logs error and falls back to most conservative rate ($3/$15 per million); documentation aligned with Luna and Voyage 4 OpenRouter architecture. `test:budget` (pass). | Live billed tokens from OpenRouter are unavailable in telemetry. |

---

## 3. Local Gate Verification Results

| Gate Command | Result | Exit Code | Environment Class | Notes / Warnings |
|---|---|---|---|---|
| `npm ci` | PASS | 0 | Local | 744 packages installed; lockfile clean |
| `npm run typecheck` | PASS | 0 | Local | Clean TypeScript compilation (`tsc --noEmit`) |
| `npm run lint` | PASS | 0 | Local | 0 errors, 2 pre-existing unused variable warnings |
| `npm run test:deterministic` | PASS | 0 | Local Mocked | All 24 test suites green (ci-config, auth, answer-provider, budget, citations, context, embeddings, evidence, ingestion, history, holdout, privacy, retrieval, table-retrieval, sanitization, report, storage-cleanup, trust, rate-limit-retry, response-guard, security-headers, document-management, xls-dead-code, processing) |
| `npm run test:eval` | PASS | 0 | Local Mocked | 36/36 release evaluation cases passed (100% threshold match) |
| `npm run build` | PASS | 0 | Local Production Build | Next.js 15.5.24 production build succeeded (all routes compiled) |
| `npm run test:privacy:bundle` | PASS | 0 | Local Build Output | Verified server secrets and internal keys absent from browser bundle |
| `git diff --check` | PASS | 0 | Local Git | Clean whitespace and diff formatting |
| `npm audit --omit=dev` | PASS | 0 | Local Dependency Audit | 0 vulnerabilities found |
| `OCR_ENABLED=true PLINY_OCR_E2E=1 npm run test:ocr-e2e` | PASS | 0 | Local Synthetic OCR | Scanned PDF generator passed OCR in 3.9s vs 240s budget |
| Live Production Server CSP Test | PASS | 0 | Local Production Server (`next start`) | Nonce generated per-request, `strict-dynamic`, no `unsafe-eval` |

---

## 4. Patches and Bug Fix Confirmation
- **`pliny-fix-FINAL/ALL.patch`**: All 10 commits applied cleanly via `git am`.
- **`PLINY_WP3_HOTFIX.patch`**: Applied cleanly via `git am`. Confirmed that `summarizeUsageEvents` filters out `event.status === "blocked"` rather than checking `event.status !== "allowed"`. Verified that 40 success rows plus 10 blocked rows correctly yield 40 minute requests, 40 daily requests, and $0.40 spend.
- **UTC Test Fixture Flaw**: Fixed in `scripts/test-rate-limit-retry.mjs`. Tests now use deterministic noon-UTC timestamps, preventing clock-rollover failures near UTC midnight, and include explicit UTC-day-boundary coverage.

---

## 5. Database Migrations Status
- **Pending Migration**: `supabase/migrations/20260929090000_documents_content_sha256.sql`
  ```sql
  alter table public.documents
    add column if not exists content_sha256 text;

  create index if not exists documents_collection_content_sha256_idx
    on public.documents (collection_id, content_sha256);
  ```
- **Compatibility**: Strictly additive and non-breaking. `content_sha256` is nullable, preserving all existing documents. RLS policies and table grants are unchanged.
- **Rollback Safety**: If application code is rolled back, the column and index remain harmless. If migration needs rollback:
  `drop index if exists public.documents_collection_content_sha256_idx;`
  `alter table public.documents drop column if exists content_sha256;`
- **Execution Boundary**: Not executed on Production Supabase. Production Supabase remains at prior release schema.

---

## 6. Provider Usage and Data Boundaries
- **External Provider Requests Used**: `0` (ceiling: 25). All verification was performed using isolated local synthetic fixtures and mocks.
- **Cost Incurred**: $0.00.
- **Production Safety**:
  - `main` branch: Not modified (clean at `b8a984417d6c07d865613b739aa45d9875dd6fd3`).
  - Production Vercel deployment: Not promoted, aliased, or touched.
  - Production Supabase / Redis: Not connected to or written to.
  - Secrets: No secrets printed, logged, or exposed in commits or artifacts.

---

## 7. Review Request for Codex

```text
Please perform final independent release review of branch `fix/pliny-audit-r1-preview-20260930` targeting `main`.
Base commit: b8a984417d6c07d865613b739aa45d9875dd6fd3
All 10 commits of ALL.patch and PLINY_WP3_HOTFIX.patch have been integrated and verified.
The UTC rate-limit test flaw has been corrected with 11/11 passing assertions.
All local gates pass: typecheck (0), lint (0), test:deterministic (24 suites, 0), test:eval (36 cases, 0), build (0), test:privacy:bundle (0), npm audit --omit=dev (0 vulns), OCR e2e (0).
Zero external provider requests were consumed. Production main and Production Supabase/Vercel remain untouched.
```
