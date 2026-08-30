# Pliny AI Professional Readiness Audit

Date: 2026-05-17

Pliny AI is a private document intelligence workspace for source-cited answers. This audit describes what the current codebase actually supports, where the system is strong enough for controlled demos, and what remains before a professional paid pilot.

## 1. Current System Map

### Auth Flow

- User action: visit `/login` or `/signup`, authenticate, then access `/dashboard` and `/collection/[id]`.
- Files/components: `src/components/auth/AuthView.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/middleware.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`.
- API/server actions: Supabase Auth through SSR clients and auth actions.
- Supabase tables: `auth.users`; app tables reference `user_id`.
- External services: Supabase Auth.
- Failure points: invalid env vars, expired session, callback mismatch, RLS misconfiguration.

### Workspace / Project Flow

- User action: open dashboard, create workspace, open `/collection/[id]`.
- Files/components: `src/app/dashboard/page.tsx`, `src/components/dashboard/DashboardView.tsx`, `src/components/dashboard/NewWorkspaceDialog.tsx`, `src/app/collection/[id]/page.tsx`, `src/components/workspace/WorkspaceView.tsx`.
- API/server actions: dashboard/workspace server loading through Supabase server client.
- Supabase tables: `collections`, `documents`, `chat_messages`.
- External services: Supabase Postgres.
- Failure points: ownership lookup errors, empty states, stale collection IDs, RLS drift.

### Document Upload Flow

- User action: drop or select a supported file in the Documents panel.
- Files/components: `src/components/workspace/DocumentUploadDropzone.tsx`, `src/app/api/documents/upload/route.ts`, `src/lib/document-processing/registry.ts`, `src/lib/document-processing/fileKinds.ts`.
- API routes: `POST /api/documents/upload`.
- Supabase tables/storage: `documents` table, private `documents` Storage bucket.
- External services: Supabase Storage and Postgres.
- Failure points: unsupported extension/MIME, file size limits, storage upload failure, insert failure, rate limiting.

### Document Processing Flow

- User action: upload triggers processing or user clicks retry/process.
- Files/components: `src/components/workspace/DocumentProcessButton.tsx`, `src/app/api/process-document/route.ts`, processors under `src/lib/document-processing/`.
- API routes: `POST /api/process-document`.
- Supabase tables/storage: `documents`, `document_chunks`, private `documents` bucket.
- External services: Supabase Storage/Postgres, optional Voyage embeddings, OCR tooling for PDF fallback.
- Failure points: storage download, parser failure, no readable text, OCR failure, chunk insert failure, embedding failure, stale processing lock.

### Chunking / Storage Flow

- User action: indirect, during processing.
- Files/components: `src/lib/document-processing/chunkExtractedDocument.ts`, `src/lib/document-processing/chunking.ts`, `src/app/api/process-document/route.ts`.
- Supabase tables: `document_chunks`.
- External services: optional Voyage embeddings.
- Failure points: chunk creation empty, old chunk deletion failure, insert failure, embedding partial failure, schema drift.

### Retrieval Flow

- User action: ask a question in a workspace.
- Files/components: `src/app/api/chat/route.ts`, `src/lib/search/retrieveChunks.ts`, `src/lib/embeddings/*`.
- API routes: `POST /api/chat`; internal RPC `match_document_chunks` when embeddings are enabled.
- Supabase tables/functions: `documents`, `document_chunks`, `match_document_chunks`.
- External services: optional Voyage embeddings.
- Failure points: no ready chunks, broad weak fallback, disabled embeddings, RPC mismatch, low precision keyword matches.

### Answer Generation Flow

- User action: submit chat question.
- Files/components: `src/app/api/chat/route.ts`, `src/lib/ai/modelRouter.ts`, `src/lib/ai/budgetGuard.ts`.
- API routes: `POST /api/chat`.
- Supabase tables: `chat_messages`, `ai_usage_events`.
- External services: Anthropic Claude.
- Failure points: missing API key, budget/rate block, model error, uncited answer, weak evidence.

### Citation Creation Flow

- User action: receive answer with inline citation pills.
- Files/components: `src/app/api/chat/route.ts`, `src/components/workspace/AnalysisRecord.tsx`.
- API routes: `POST /api/chat`.
- Supabase tables: `chat_messages` stores `citations` JSON.
- External services: Anthropic Claude generates `[[s.X]]` markers; server maps markers to chunks.
- Failure points: model emits invalid markers, no markers, stale chunks after reprocessing, irrelevant retrieved chunks.

### Source Inspector Flow

- User action: click a citation pill.
- Files/components: `src/components/workspace/AnalysisRecord.tsx`, `src/components/workspace/SourceInspector.tsx`, `src/components/workspace/WorkspaceView.tsx`.
- API routes: none after answer; uses returned or persisted citation source payload.
- Supabase tables: `chat_messages.citations`.
- External services: none.
- Failure points: missing source metadata, stale source payload, small-screen sheet state.

### Spreadsheet Handling Flow

- User action: upload XLS/XLSX/CSV and ask tabular questions or chart requests.
- Files/components: `src/lib/document-processing/processors/xlsx.ts`, `src/lib/document-processing/processors/csv.ts`, `src/lib/document-processing/chunking.ts`, `src/components/chart/ChartBlock.tsx`.
- API routes: upload, process, chat.
- Supabase tables: `documents`, `document_chunks`.
- External services: Anthropic Claude for reasoning/chart JSON; optional Voyage embeddings.
- Failure points: formulas flattened, merged cells not modeled, row limits, model chart JSON error, unsupported complex workbooks.

### Usage / Budget Tracking Flow

- User action: ask chat questions.
- Files/components: `src/lib/ai/budgetGuard.ts`, `src/app/api/chat/route.ts`, `src/lib/rate-limit.ts`.
- API routes: `POST /api/chat`, upload/process routes for rate limits.
- Supabase tables: `ai_usage_events`.
- External services: Supabase Postgres; Upstash Redis for production rate limiting.
- Failure points: missing env vars, usage insert failure, local fallback divergence from production.

### Export / Report Capabilities

- Current state before Phase 1: no visible report export surface in chat.
- Phase 1 adds: copy answer with citations and Markdown answer export in `AnalysisRecord`.
- Not implemented: PDF export, DOCX export, packaged source excerpts, signed share links.

### Security Controls Currently Present

- Supabase Auth and server-side user checks.
- User-scoped collection/document queries.
- RLS expected from Supabase schema.
- Private Storage bucket expected from Supabase schema.
- Server-side upload validation through the processor registry.
- Rate limits and persistent usage event tracking.
- Safe API JSON errors in core routes.

### Missing / Partial Systems

- No background queue.
- No document versioning.
- No audit logs.
- No team roles or billing.
- No formal citation confidence or quote matching.
- No production monitoring or incident workflow.
- No integration bridge yet.

## 2. Retrieval Audit

Status: Partial.

- Retrieval type: keyword by default, optional semantic retrieval with Voyage, hybrid/RRF when both are available.
- Embeddings: implemented behind `EMBEDDINGS_ENABLED=true` and `VOYAGE_API_KEY`.
- Enabled by default: no, `.env.local.example` defaults embeddings to false.
- Reranking: not implemented.
- Query rewriting: not implemented.
- Multi-document retrieval: yes, within a workspace.
- Workspace scoping: yes by `collection_id`; semantic RPC receives `match_user_id` and then filters document IDs.
- Permission respect: relies on API auth checks, collection ownership checks, RLS, and user-scoped retrieval.
- Chunk count: controlled by `AI_MAX_CHUNKS`; retrieval internally considers broader candidates.
- Ranking: keyword scoring plus optional semantic/RRF merge.
- Irrelevant filtering: dedupe, tiny chunk filtering, balancing, and fallback rules exist, but no learned reranker.
- Score threshold: no exposed confidence threshold.
- No-context behavior: safe when no chunks are found; broad fallback remains conservative but not a true confidence system.
- Spreadsheet handling: sheet/row metadata is preserved and surfaced.
- Cross-document comparison: possible if relevant chunks are retrieved.
- Multi-source answers: possible.
- Refusal behavior: improved in Phase 1 by rejecting uncited model answers.

Recommended improvements:

1. Add an evaluation set with expected source chunks.
2. Expose retrieval score/reason per source.
3. Add a stricter confidence gate for broad fallback.
4. Add query rewriting for vague questions.
5. Add a lightweight reranker before sending sources to Claude.

Phase 2 update:

- Retrieved chunks now carry optional `retrievalMode` and `relevanceScore` where the current retrieval path can provide them.
- New chat responses include retrieval debug metadata with source id, document id/name, location, spreadsheet sheet/row fields when available, retrieval mode, score when available, and excerpt preview.
- Debug metadata is returned with the current answer payload. Persisted chat history still primarily relies on citations and embedded source payloads, not a separate database metadata column.

## 3. Citation / Source Quality Audit

Status: Partial.

- Citations linked to chunks: yes.
- Page numbers: yes for page-like processors.
- Document names: yes.
- Spreadsheet sheet/rows: yes through `location_label` and metadata.
- Source Inspector quoted text: yes, from chunk content.
- Multiple source navigation: yes in Source Inspector.
- Answer-to-source correspondence: prompt-enforced, but not quote-matched.
- Quote matching: not implemented.
- Citation confidence: not implemented.
- Stable after reprocessing: partially. Stored citation payloads preserve source text, but chunk IDs can become stale after reprocessing.
- Strong vs weak citation distinction: not implemented.
- Irrelevant citations: possible if retrieval returns weak chunks or model cites loosely.

Recommended improvements:

1. Add post-generation citation validation beyond marker mapping.
2. Store or compute citation confidence.
3. Add quote/excerpt matching for cited claims.
4. Persist answer source set independently from citations.
5. Add regression tests for irrelevant citation scenarios.

Phase 2 update:

- Citation validation now parses markers, rejects invalid markers, checks that markers map to real retrieved chunks, requires non-empty source excerpts, dedupes duplicate citations, and refuses when source context produced no valid citations.
- The chosen behavior is safe refusal, not a model repair attempt. This avoids retry loops and avoids displaying unverified repaired citations.
- Citation confidence and quote-level claim matching remain future work.

## 4. Spreadsheet Intelligence Audit

Status: Partial.

- Parsing: `xlsx` for XLS/XLSX; CSV processor for CSV.
- Sheets: preserved.
- Rows/columns: row ranges and headers preserved; individual cell addresses are not fully modeled.
- Formulas: flattened to displayed/raw values, not preserved as formulas.
- Merged cells: not modeled as merged-cell structures.
- Tables: inferred from rows/headers, not formally detected.
- Numeric values: parsed as displayed/raw values; chart prompt normalizes values.
- Dates: handled through `cellDates` and formatted values.
- Sheet names: stored.
- Cell/range references: row ranges are stored; exact cell ranges are not.
- Across-sheet questions: possible if retrieval finds chunks from multiple sheets.
- Charts: inline chart JSON is supported from grounded numeric source data.
- Cell/range citations: sheet/row citations yes; exact cell citations no.
- Summaries, anomalies, totals, trends: possible for small/simple data; not a full spreadsheet engine.
- Financial-model-like sheets: limited by row/chunk extraction and model reasoning.

Recommended upgrades:

1. Add exact row/cell range metadata when practical.
2. Add spreadsheet-specific eval questions.
3. Preserve formula text when present if safe and useful.
4. Add deterministic table summaries for small sheets.
5. Add guardrails for large/complex workbooks.

Phase 2 update:

- Spreadsheet regression fixture CSV files were added under `docs/test-fixtures/`.
- The manual test script now includes renewals, Q4 expense, chart value, and Q1-to-Q4 comparison checks.
- XLSX exact cell-level citation is still not implemented; sheet/row context remains the current verification layer.

## 5. Document Processing Pipeline Audit

Status: Partial to Solid for an MVP.

- Supported formats: PDF, DOCX, XLS/XLSX, CSV, Markdown/MD, TXT.
- Validation: processor registry validates extension/MIME/size server-side.
- File size limits: per processor.
- OCR fallback: present for PDFs.
- Processing: synchronous API route, not a background queue.
- Status states: `processing`, `ready`, `failed`.
- Failures stored: yes in `documents.error_message`.
- Retry: yes for failed/stale processing.
- Reprocess: retry path deletes old chunks before insert; no explicit versioned reprocess UI.
- Duplicate uploads: not detected.
- Large files: limited but not queue-safe.
- Processing logs visible to user: limited; server logs only.
- Stale chunks: old chunks are deleted before retry insert.
- Versioning: not implemented.
- UI failure reasons: improved in Phase 1.

Recommended upgrades:

1. Background queue for long processing.
2. Document versioning or processing run IDs.
3. Duplicate detection by hash.
4. Processing log/status details.
5. Better scanned PDF guidance.

## 6. Workspace / Project Organization Audit

Status: Basic to Partial.

- Multiple workspaces: yes.
- Documents grouped by workspace: yes.
- Folders/tags/saved views: not implemented.
- Metadata fields: basic filename, status, file size, page count, timestamps.
- Delete/archive: not assessed as complete.
- Document status: visible.
- Search/filter documents: not implemented as a full document-list feature.
- Rename workspace: not confirmed as implemented.
- Professional fit: usable for demos and small pilots; legal/finance teams would likely need folders, tags, matter/client metadata, and archive/delete controls.

Recommended upgrades:

1. Workspace rename/delete/archive.
2. Document search and filters.
3. Tags or matter/client metadata.
4. Saved source sets or review folders.

## 7. Professional Chat Workflow Audit

Status: Basic to Partial.

- Saved prompts/templates: not implemented.
- Question history: chat history persists, no search.
- Pinned answers: not implemented.
- Regenerate with same sources: not implemented.
- Follow-up source memory: only normal chat/history, not explicit source-set locking.
- Export chat/answer: Phase 1 adds copy and Markdown answer export.
- Share answer: not implemented.
- Answer version history: not implemented.
- Answer metadata: model/retrieval metadata exists in response.
- Visible source set: citations and Source Inspector exist.
- Refusal/no-context messages: present and strengthened in Phase 1.
- Loading states: present.
- Failed AI answer recovery: basic error messages.

Recommended upgrades:

1. Regenerate using the same source set.
2. Pin/save important answers.
3. Export full chat transcript.
4. Prompt templates for review workflows.
5. Question history search.

## 8. Export / Report Generation Audit

Status before Phase 1: Basic/Missing.
Status after Phase 1: Basic.
Status after Phase 3: Partial professional work-product support.

- Copy answer: Phase 1 adds copy with citations.
- Copy answer with citations: Phase 1 adds.
- Export answer as Markdown: Phase 1 adds.
- Export chat transcript: Phase 3 adds Markdown transcript export for the visible workspace chat.
- HTML print view: Phase 3 adds a print-friendly selected answer/report view for browser Print or Save as PDF.
- PDF/DOCX: not implemented.
- Cited memo/risk report: Phase 3 adds cited answer, due diligence, risk, and table summary Markdown templates derived from existing cited answer/source payloads.
- Export chart: Phase 3 table summary includes chart/table data when structured chart data exists in the answer.
- Download report package: not implemented.

Recommended build order:

1. Continue manual QA of report sources and weak-evidence guards.
2. Add pinned answers and saved report drafts.
3. Add signed share links only after access-control design.
4. Later native PDF/DOCX if package choice is approved.

## 9. Security / Compliance Productization Audit

Status: Demo-safe, pilot-safe only with stated limitations and more QA.

Current controls:

- Supabase Auth.
- User-scoped API checks.
- RLS expected in schema.
- Private document Storage bucket expected.
- Server-side upload validation.
- Rate limits and persistent AI usage events.
- Budget guard.
- Safe user-facing errors in key routes.
- Prompt now explicitly treats documents as untrusted evidence.

Safe claims we can make:

- Private workspace model.
- User/workspace-scoped documents.
- Source-cited answers.
- Private Supabase Storage bucket when configured per schema.
- Rate and budget controls exist.
- The product is designed for verification against source passages.

Claims we must NOT make:

- SOC 2 certification.
- HIPAA compliance.
- Formal enterprise compliance certification.
- Zero hallucinations.
- Guaranteed legal, financial, or compliance correctness.
- Bank-level security.

Security gaps before paid pilot:

- Manual RLS verification on production Supabase.
- Production env validation.
- Deletion/export policy.
- Security headers review.
- Log review for private content.
- Processing limits with real files.
- Incident/backup plan.

Security gaps before enterprise:

- Audit logs.
- Team roles and admin controls.
- SSO/SAML.
- Data retention controls.
- Compliance program and evidence.
- Vendor/security documentation.

## 10. Prompt Injection / Malicious Document Audit

Status before Phase 1: Partial.
Status after Phase 1: Improved but still needs evals.

Current risk:

- Retrieved chunks are inserted into the prompt as source evidence.
- The prior prompt said source text is evidence, not instructions, but needed stronger malicious-document language.
- The app does not execute tools based on document text, which limits impact.
- There is no automated prompt-injection eval suite yet.

Phase 1 hardening:

- Server prompt explicitly states uploaded text is untrusted evidence.
- Source passages must not override system rules.
- Hidden prompts, secrets, unrelated documents, and private data must not be revealed.
- Malicious source instructions must be treated as malicious or irrelevant evidence.

Recommended next steps:

1. Add test documents containing malicious instructions.
2. Add expected refusal behavior to manual QA.
3. Add automated checks when a test harness exists.

## 11. Evaluation / Self-Improvement Audit

Status: Basic.

Existing:

- `docs/manual-qa.md`.
- Deployment and architecture docs.
- Some build/type/static checks used in prior phases.

Missing:

- Standard eval document pack.
- Expected answers and expected citations.
- Retrieval accuracy scorecard.
- Spreadsheet eval scorecard.
- Prompt injection evals.
- Repeatable pre-demo checklist.

Phase 1 creates:

- `docs/EVALUATION_PLAYBOOK.md`.
- `docs/DEMO_READINESS_CHECKLIST.md`.

## 12. Integration Readiness Audit

Status: Missing/Early.

- Webhook export: not implemented.
- n8n bridge: not implemented.
- Google Drive import: not implemented.
- Email ingestion: not implemented.
- Slack/Telegram alerts: not implemented.
- External API access: not exposed as product API.
- Export data format: Markdown answer export added in Phase 1.

Best first bridge to n8n:

- Configurable webhook that sends a completed answer/report summary with workspace ID, question, answer, source references, and document metadata.
- This should be Phase 5, after retrieval/citation evaluation and basic exports are stable.

## 13. Priority Matrix

| Feature / System | Current status | User value | Trust impact | Revenue impact | Complexity | Risk if ignored | Recommended phase |
|---|---|---:|---:|---:|---:|---|---|
| Weak-evidence refusal | Partial | High | High | High | Low | Unsupported answers | Phase 1 |
| Prompt injection prompt hardening | Partial | High | High | Medium | Low | Malicious document instructions | Phase 1 |
| Copy answer with citations | Missing | High | Medium | High | Low | Hard to use output professionally | Phase 1 |
| Markdown answer export | Missing | High | Medium | High | Low | No portable work product | Phase 1 |
| Evaluation playbook | Basic | High | High | High | Low | Regressions go unnoticed | Phase 1 |
| Citation validation | Partial | High | High | High | Medium | Irrelevant citations | Phase 2 |
| Retrieval scoring/reranking | Partial | High | High | High | Medium | Weak retrieval quality | Phase 2 |
| Spreadsheet evals | Partial | Medium | High | High | Medium | Wrong table answers | Phase 2 |
| HTML/PDF report export | Partial | High | Medium | High | Medium | Limited professional deliverables | Phase 3 |
| Full chat transcript export | Partial | Medium | Medium | Medium | Medium | Poor record keeping | Phase 3 |
| Folders/tags/search | Basic | Medium | Medium | Medium | Medium | Workspace clutter | Phase 4 |
| Webhook/n8n bridge | Missing | Medium | Medium | Medium | Medium | Workflow isolation | Phase 5 |
| Team roles/admin/billing | Missing | High | High | High | High | Cannot support teams | Phase 6 |
| PPTX/code/IPYNB | Missing | Medium | Medium | Medium | Medium | Format gaps | Phase 7 |

## Phase Recommendations

### Phase 1 - Professional Demo Hardening

- Weak-evidence enforcement.
- Prompt injection prompt hardening.
- Copy answer with citations.
- Markdown export.
- Evaluation and limitations docs.
- Processing failure clarity.

### Phase 2 - Reliability / Citations / Evaluation

- Retrieval debug metadata.
- Citation marker validation.
- Weak-evidence refusal on invalid or missing citations.
- Spreadsheet regression fixtures and manual checks.
- Prompt injection regression checks.

### Phase 3 - Export / Work Product

- Full chat transcript export.
- HTML print view.
- Cited memo templates.
- Later PDF/DOCX after package decision.

Phase 3 implementation status:

- Full visible chat transcript export is implemented as Markdown from the workspace header.
- Selected answer print view is implemented as a browser print-friendly HTML window. Users can use browser Print or Save as PDF.
- Cited answer report, due diligence summary, risk report, and table summary Markdown templates are implemented from existing cited answer/source payloads.
- Table summary includes chart/table values only when structured chart data exists in the answer.
- Reports include workspace name, timestamp, question, content, source excerpts, and a verification note.
- Weak/no-evidence answers can still be exported as insufficient-evidence records, but due diligence, risk, and table report actions are guarded against confident uncited output.
- Native PDF export and native DOCX export remain intentionally unimplemented.

### Phase 4 - Workflow Organization

- Rename/archive/delete.
- Tags/folders.
- Document search and filters.
- Pinned answers.

### Phase 5 - Integrations / n8n Bridge

- Configurable webhook.
- Export payload format.
- Processing complete event.

### Phase 6 - Collaboration / Admin / Billing

- Team roles.
- Workspace admin.
- Stripe billing.
- Audit logs.

### Phase 7 - Advanced Formats / Enterprise

- PPTX if needed.
- Code/IPYNB if needed.
- SSO/SAML.
- Compliance program.
