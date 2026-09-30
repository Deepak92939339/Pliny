# Pliny Repair Verification Matrix

Date: 2026-09-30
Task Workspace: `/Users/sandman/Desktop/RAG intelligence/pliny-antigravity-review`
Publishing Branch: `fix/pliny-audit-r1-preview-20260930`
Base SHA: `b8a984417d6c07d865613b739aa45d9875dd6fd3`

This matrix maps each audit claim and work package in the Audit Fix R1 package (`pliny-fix-FINAL.zip` and `PLINY_WP3_HOTFIX.patch`) against the active Pliny baseline source, documenting active-code findings, reproduction steps, patch behavior, regression evidence, and remaining limitations.

---

## 1. WP1: Document Processing Resilience & OCR Timeouts (PLN-009 S1, PLN-003 S2)
- **Classification**: Confirmed Defect & Resilience Hardening
- **Claim**: Long document processing/OCR jobs can run indefinitely or fail silently without updating document status to `failed`, leaving documents stuck in "processing" state indefinitely. Missing client error mapping causes upload items to stay in "Uploading" state on errors.
- **Active-Code Finding**: In baseline `src/app/api/process-document/route.ts`, there is no `maxDuration` exported for Vercel functions, no explicit timeout race around OCR/Tesseract execution in `src/lib/ocr/extractPdfWithOcr.ts`, and no background watchdog to recover stale processing documents on read.
- **Reproduction**: A long/unresponsive OCR job or runtime termination leaves the `documents` row with `processing_stage = 'extracting'` / `status = 'processing'` indefinitely. Client upload dropzone lacks explicit handling for 429 Retry-After and network aborts before response.
- **Relevant Paths/Lines**:
  - `src/app/api/process-document/route.ts` (needs `maxDuration = 300`, terminal state wrapper)
  - `src/lib/ocr/extractPdfWithOcr.ts` (needs `OCR_TIME_BUDGET_MS`, `OCR_PAGE_TIMEOUT_MS`, worker termination on timeout)
  - `src/lib/documents/processingTerminalState.ts` (new terminal wrapper)
  - `src/lib/documents/staleProcessing.ts` & `src/lib/documents/queries.ts` (watchdog marking failed on read after `STALE_PROCESSING_MINUTES`)
  - `src/lib/uploads/processFailureMessage.ts` & `src/components/workspace/DocumentUploadDropzone.tsx` (client error mapping)
  - `next.config.ts` (`outputFileTracingIncludes` for canvas/tesseract)
- **Patch Behavior**:
  - Sets function `maxDuration = 300` on `/api/process-document`.
  - Implements bounded OCR time budgets with clean Tesseract worker shutdown.
  - Implements `runProcessingWithTerminalState` ensuring thrown exceptions record failure in DB.
  - Implements pure stale watchdog recovering un-updated documents after timeout.
  - Adds serverless bundling trace rules for `@napi-rs/canvas` and `@tesseract.js-data/eng`.
- **Regression Evidence**: `scripts/test-processing-resilience.mjs` (14 assertions passing), `scripts/test-ocr-e2e.mjs` (scanned PDF generator).
- **Remaining Limitation**: Hosted Vercel function timeout is determined by the hosting plan (Hobby: 60s, Pro: 300s); local timeouts must fit within plan bounds. Watchdog triggers lazily on document read.

---

## 2. WP2: Table-Row Lookups and Hybrid Fusion (PLN-009 Adjacent)
- **Classification**: Confirmed Defect & Retrieval Enhancement
- **Claim**: Exact table identifier queries (e.g., "What is the severity of incident INC-5517?") fail retrieval because CSV/XLSX units are chunked into coarse 50-row blocks that get diluted, lexical search splits identifiers into loose OR terms, and weighted fusion is outranked by semantic decoys.
- **Active-Code Finding**: In baseline `src/lib/document-processing/plugins/csv.ts` line 13, `CSV_ROWS_PER_UNIT = 50`. In `src/lib/search/retrieveChunks.ts`, lexical queries break tokens into individual words (`severity OR incident OR inc OR 5517`), causing common prefixes (`inc`) to flood results.
- **Reproduction**: Synthetic 60-row CSV query for `INC-5517` failed in baseline with weighted Hit@3 = 0/3.
- **Relevant Paths/Lines**:
  - `src/lib/document-processing/limits.ts` (`TABLE_ROWS_PER_UNIT = 8`, `MAX_TABLE_UNITS = 150`)
  - `src/lib/document-processing/plugins/csv.ts` & `xlsx.ts` (8-row units with repeated headers)
  - `src/lib/document-processing/chunkExtractedDocument.ts` (table blocks bypass word window chunking)
  - `src/lib/search/identifiers.ts` (new identifier extraction & quoting)
  - `src/lib/search/fusion.ts` (`fuseCandidatesRrf` with guaranteed identifier slot and 0.001 deterministic boost)
  - `src/lib/search/retrieveChunks.ts` (`RETRIEVAL_FUSION = rrf` selector)
- **Patch Behavior**:
  - Reduces table rows per chunk to 8, with adaptive scaling up to 150 units max.
  - Preserves table headers in each chunk.
  - Normalizes and quotes identifiers (`"inc 5517"`) in Postgres `websearch_to_tsquery`.
  - Implements Reciprocal Rank Fusion (RRF, k=60) with guaranteed identifier slot.
- **Regression Evidence**: `scripts/test-table-retrieval.mjs` (22 tests: identifier extraction, chunking, weighted vs RRF Hit@3 0/3 -> 3/3).
- **Remaining Limitation**: Lexical search uses Postgres `ts_rank_cd`, not BM25. Existing documents must be reprocessed to benefit from 8-row chunking.

---

## 3. WP3: Rate Limits & Budget Guard (PLN-005 S2, PLN-004 INFO)
- **Classification**: Confirmed Defect in Baseline + Regression in ALL.patch + Test Flaw
- **Claim**:
  1. Baseline counted `blocked` events toward rate limits, causing self-perpetuating lockouts when retrying.
  2. ALL.patch attempted to fix this by checking `event.status !== "allowed"`, but DB schema only accepts `success`, `failed`, and `blocked`. Thus, all valid events were ignored (minute/daily request count and spend remained 0).
  3. WP3 Hotfix filters out `status === "blocked"` instead, counting `success` and `failed`.
  4. The supplied rate-limit test (`test-rate-limit-retry.mjs`) used `new Date()` with events 2-4 hours ago, failing near UTC midnight.
- **Active-Code Finding**: In baseline `src/lib/ai/budgetGuard.ts` lines 302-306, `dailyRequestCount += 1` and `minuteRequestCount += 1` execute unconditionally for all events including `blocked`.
- **Reproduction**:
  - Baseline: 10 blocked retry events increment minute request count.
  - ALL.patch alone: 40 success events yield 0 minute requests and $0 spend.
  - Hotfix alone at 03:00 UTC: test scores 7/8 because `hoursAgo(4)` crosses into yesterday's UTC date.
- **Relevant Paths/Lines**:
  - `src/lib/ai/budgetGuard.ts` (lines 326-348 in patched code: filter `event.status === "blocked"`)
  - `src/lib/limits/retryAfter.ts` (computes exact Retry-After seconds for minute/daily/reset limits)
  - `src/app/api/chat/route.ts`, `src/app/api/documents/upload/route.ts`, `src/app/api/process-document/route.ts` (emit `Retry-After` header)
  - `src/components/workspace/WorkspaceView.tsx`, `AskSurface.tsx`, `DocumentUploadDropzone.tsx` (countdown UI)
  - `scripts/test-rate-limit-retry.mjs` (requires fixed noon UTC clock + UTC day boundary test)
- **Patch Behavior**:
  - Excludes `blocked` events from minute and daily counts; preserves them in DB for audit history.
  - Calculates accurate `Retry-After` header and disables UI Ask/Upload button with countdown timer.
- **Regression Evidence**: `scripts/test-rate-limit-retry.mjs` (must pass 8/8 with fixed noon UTC clock, plus additional UTC day boundary test).
- **Remaining Limitation**: Budget guard is estimated per user; concurrency and account-wide enforcement are bounded limitations.

---

## 4. WP6: Unverified Answer Text Leaks (Defence in Depth)
- **Classification**: Confirmed Defect
- **Claim**: For single-document queries where evidence is insufficient, baseline code returned the unverified draft answer instead of `NO_CONTEXT_ANSWER`.
- **Active-Code Finding**: In baseline `src/app/api/chat/route.ts` line 1586:
  `const responseAnswer = isInsufficientEvidence && requiredDocumentIds.length > 1 ? NO_CONTEXT_ANSWER : answer;`
  When `requiredDocumentIds.length === 1`, it returned `answer` even if `isInsufficientEvidence` was true!
- **Reproduction**: A question on a single document where retrieved context lacks the answer returned the model's unverified hallucinatory draft rather than refusing.
- **Relevant Paths/Lines**:
  - `src/lib/chat/responseGuard.ts` (`resolveVerifiedResponseAnswer`, `resolveVerifiedResponseCitations`)
  - `src/app/api/chat/route.ts` (delegates to `responseGuard.ts`)
- **Patch Behavior**: Any insufficient-evidence outcome returns `NO_CONTEXT_ANSWER` and strips citations, regardless of document count.
- **Regression Evidence**: `scripts/test-response-guard.mjs` (5 tests covering single-doc refusal, multi-doc refusal, and citation preservation).
- **Remaining Limitation**: Refusal relies on the accuracy of the upstream evidence sufficiency classifier.

---

## 5. WP4: Security Headers, Cookies, Dependencies (PLN-002 S2, PLN-001 S2)
- **Classification**: Security Hardening & Vulnerability Remediation
- **Claim**: Enforce strict Content Security Policy (CSP) with dynamic per-request nonces instead of Report-Only. Set `secure: true` and `sameSite: 'lax'` on Supabase cookies. Resolve npm audit advisories.
- **Active-Code Finding**: Baseline `next.config.ts` contained `Content-Security-Policy-Report-Only`. Baseline `npm audit` reported 16 vulnerabilities (including `@xmldom/xmldom` and `ai`).
- **Reproduction**: Inspected baseline headers and run `npm audit`.
- **Relevant Paths/Lines**:
  - `src/lib/security/csp.ts` & `src/middleware.ts` (enforced CSP with `crypto.randomUUID()` nonces, `strict-dynamic`)
  - `src/app/layout.tsx` (passes nonce to scripts)
  - `src/lib/supabase/middleware.ts`, `client.ts`, `server.ts` (`cookieOptions`)
  - `package.json` (`overrides` for `@xmldom/xmldom: "0.8.15"`, bump `ai`)
- **Patch Behavior**:
  - Replaces Report-Only CSP with enforced CSP using request nonces.
  - Sets proper secure cookie options while preserving client-accessible session tokens (not HttpOnly, as required by Supabase browser client).
  - Pins `@xmldom/xmldom` to 0.8.15 to fix vulnerability while maintaining mammoth compatibility.
- **Regression Evidence**: `scripts/test-security-headers.mjs` (4 tests), `scripts/check-csp.mjs`.
- **Remaining Limitation**: Inline styles retained (`unsafe-inline`) due to Tailwind runtime CSS injection. Browser Supabase client requires cookie access (non-HttpOnly).

---

## 6. WP5: Document Management: Delete and Duplicates (PLN-007 S3, PLN-006 S3)
- **Classification**: Feature Gap / Enhancement & Data Integrity
- **Claim**: No ability to delete individual documents; duplicate uploads of identical files within a workspace are not detected or prevented.
- **Active-Code Finding**: Baseline has no `DELETE /api/documents/[id]` route, no `DocumentDeleteButton` component, and no SHA-256 hash stored on `documents`.
- **Reproduction**: Users could not delete documents or prevent uploading duplicate files.
- **Relevant Paths/Lines**:
  - `src/app/api/documents/[id]/route.ts` (new DELETE endpoint with ownership checks)
  - `src/lib/documents/deleteDocument.ts` (cascading storage, chunks, and DB row deletion)
  - `supabase/migrations/20260929090000_documents_content_sha256.sql` (additive column & index)
  - `src/lib/documents/duplicateDetection.ts` (hash comparison & 409 response)
  - `src/components/workspace/DocumentDeleteButton.tsx`, `DocumentsSurface.tsx`, `DocumentUploadDropzone.tsx`
- **Patch Behavior**:
  - Adds single document deletion with ownership check (404 on missing/foreign), storage cleanup, and cascade.
  - Adds `content_sha256` hash check returning 409 unless `allow_duplicate: true`.
- **Regression Evidence**: `scripts/test-document-management.mjs` (6 tests).
- **Remaining Limitation**: The new migration `20260929090000_documents_content_sha256.sql` must be applied to Staging/Production database.

---

## 7. WP7: Remove `.xls` Dead Code
- **Classification**: Code Cleanup / Consistency
- **Claim**: `.xls` was mapped to `xlsx` in `fileKinds.ts` but has never been supported by file extractors, causing obscure runtime errors.
- **Active-Code Finding**: `src/lib/document-processing/fileKinds.ts` mapped `.xls` to `xlsx`.
- **Reproduction**: Uploading `.xls` resulted in processing errors rather than immediate rejection.
- **Relevant Paths/Lines**:
  - `src/lib/document-processing/fileKinds.ts`
  - `src/app/api/documents/upload/route.ts` (returns 415 via `getUnsupportedFileRejection`)
  - `src/app/api/chat/route.ts` (preserves historical read compatibility)
- **Patch Behavior**: Direct upload of `.xls` returns HTTP 415 with clear message; historical DB rows continue to resolve for citations.
- **Regression Evidence**: `scripts/test-xls-dead-code.mjs` (4 tests).
- **Remaining Limitation**: None; legacy `.xls` remains unsupported by design.

---

## 8. WP8: Visual Consistency & Contrast (PLN-008 S2)
- **Classification**: UI Polish & Accessibility (WCAG 2.1 AA)
- **Claim**: Hardcoded hex colors caused inconsistent styling and low contrast on muted text (`#8a7d70` at ~3.5:1 contrast ratio).
- **Active-Code Finding**: 75+ hardcoded hex colors across codebase; muted text failed WCAG AA 4.5:1 ratio.
- **Reproduction**: axe-core contrast audits flagged muted text.
- **Relevant Paths/Lines**:
  - `src/app/globals.css` (CSS variables: `--paper-*`, `--ink-*`, `--rule-*`, `--accent-*`)
  - ~30 UI component files updated to use CSS tokens.
  - `src/app/error.tsx`, `not-found.tsx` restyled to light theme tokens.
- **Patch Behavior**: Replaces raw hex values with semantic CSS variables, lifting contrast ratio to 5.5:1+ for muted text.
- **Regression Evidence**: `scripts/check-a11y.mjs`.
- **Remaining Limitation**: 10 intentional hex values remain for specific semantic needs (link blue, warning amber).

---

## 9. WP9: Documentation, Metadata, and Budget Pricing Fail-Safe
- **Classification**: Documentation Integrity & Resilience
- **Claim**: Invalid `AI_MODEL_PRICING_JSON` crashed chat requests; metadata and descriptions were out of sync with actual model/retrieval architecture.
- **Active-Code Finding**: Baseline `getModelRates` threw an error if `AI_MODEL_PRICING_JSON` was invalid.
- **Reproduction**: Setting `AI_MODEL_PRICING_JSON="invalid"` threw an uncaught error.
- **Relevant Paths/Lines**:
  - `src/lib/ai/budgetGuard.ts` (fail-safe parsing; falls back to max known rate on error)
  - `src/app/layout.tsx` (metadataBase, canonical url, social image tags)
  - `README.md`, `docs/architecture.md`, `docs/limitations.md`
- **Patch Behavior**: `getModelRates` logs error safely and falls back to conservative rate ($3/$15 per million tokens); updates documentation to match current architecture.
- **Regression Evidence**: `scripts/test-budget-guard.mjs`.
- **Remaining Limitation**: Telemetry is estimated, not live billed tokens from OpenRouter.

---

## Summary Matrix

| WP | Topic | Defect / Feature / Polish | Active Code Status | Reproducible | Patched In | Regression Test |
|---|---|---|---|---|---|---|
| WP1 | Processing & OCR Timeout | Confirmed Defect | Missing timeouts & watchdog | Yes | ALL.patch | `test:processing` (14/14) |
| WP2 | Table Retrieval & RRF | Confirmed Defect | Coarse 50-row chunks, loose OR queries | Yes (0/3 Hit@3) | ALL.patch | `test:table-retrieval` (22/22) |
| WP3 | Rate Limits & Budget | Confirmed Defect + Patch Bug | Baseline counted blocked; ALL.patch zero-count bug | Yes (40 success = 0) | WP3 Hotfix | `test:rate-limit-retry` (8/8 + UTC fix) |
| WP4 | Security & Dependencies | Security Hardening | Report-only CSP, outdated deps | Yes (16 vulns) | ALL.patch | `test:security-headers`, `check:csp` |
| WP5 | Delete & Duplicate Docs | Feature Gap / Integrity | Missing DELETE route & content hash | Yes | ALL.patch | `test:document-management` (6/6) |
| WP6 | Unverified Answer Leak | Confirmed Defect | Single-doc draft leak on refusal | Yes (code inspected) | ALL.patch | `test:response-guard` (5/5) |
| WP7 | `.xls` Dead Code | Consistency / Cleanup | `.xls` mapped to `xlsx` without parser | Yes | ALL.patch | `test:xls-dead-code` (4/4) |
| WP8 | Visual Contrast & Tokens | Accessibility / Polish | Hex sprawl, failing contrast #8a7d70 | Yes | ALL.patch | `check:a11y` |
| WP9 | Pricing Fail-Safe & Docs | Resilience / Docs | `getModelRates` threw on invalid JSON | Yes | ALL.patch | `test:budget` |
