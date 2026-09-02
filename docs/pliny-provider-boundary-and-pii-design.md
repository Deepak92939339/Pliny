# Pliny provider boundary and PII-minimisation design

Date: 2026-08-31

Baseline reviewed: `8f26210148a7d64d8f190ab76d75f476720d5f9d`

Status: provider-free architecture review; no production integration

## Executive summary

Pliny currently sends original extracted document text to Voyage for document embeddings and sends the user's original question to Voyage for query embeddings. For an answered question, Anthropic receives the original question, bounded original source passages, source filenames, source locations, and chunk identifiers. A failed citation check can cause the same evidence plus the draft answer to be sent to Anthropic a second time. These are material provider boundaries and should be stated plainly to users.

Supabase holds the original file, filename, extracted chunks, provenance, vectors, lexical search representation, questions, answers, citations, and usage records. The `documents` Storage bucket is private and the application tables use owner-scoped RLS. Vectors are derived sensitive data; they are not anonymous.

The recommended first privacy implementation is an immutable per-document processing mode with a workspace default. In privacy-minimised mode, deterministic high-confidence identifiers are pseudonymised before both embedding and generation. Original evidence stays owner-scoped in Supabase; providers receive only the sanitised representation. Names, addresses, and organisations remain a separately disclosed limitation until an optional local or dedicated NER service is approved.

This phase adds isolated detector, tokenisation, and prompt-boundary utilities. They are not connected to ingestion, retrieval, or answer generation. Production integration needs a reviewed migration and a later reprocessing path; neither is created here.

## Evidence basis and fact discipline

The current-state map comes from the baseline code and schema:

- Upload and object creation: `src/app/api/documents/upload/route.ts:105-253`
- Extraction, chunking, embeddings, and indexing: `src/app/api/process-document/route.ts:253-702`
- Voyage request construction: `src/lib/embeddings/embedBatch.ts:112-183`
- Chunk embedding preparation: `src/lib/document-processing/prepareChunkRowsWithEmbeddings.ts:10-28`
- Hybrid retrieval: `src/lib/search/retrieveChunks.ts:528-670`
- Anthropic prompt and request construction: `src/app/api/chat/route.ts:678-731` and `src/app/api/chat/route.ts:1340-1493`
- Citation validation: `src/lib/citations/validateCitations.ts`
- Storage, tables, indexes, and RLS: `src/lib/supabase/schema.sql`
- Browser exports: `src/lib/export/reportExport.ts` and `src/lib/export/browserReportExport.ts`
- Current disclosure copy: `src/components/landing/infoContent.ts`

Provider policy statements below are limited to current first-party documentation. Account-level controls, contract addenda, regional routing, and provider endpoint eligibility were not inspected remotely in this phase. Where the account state is unknown, the report says so.

## Current data flow

| State | Exact data | Raw text or identity present | Destination and transport | Persistence and logging | Deletion behaviour | Controlling code |
| --- | --- | --- | --- | --- | --- | --- |
| Browser upload | File bytes, original filename, MIME type, collection UUID, auth cookie/JWT | Yes | HTTPS request through Vercel to a Next.js function | Vercel handles the request; Pliny logs filename and IDs on some upload failures, not file content by design | No object exists until Storage upload succeeds | `src/app/api/documents/upload/route.ts` |
| Supabase object | Original bytes at `user UUID/collection UUID/random UUID-safe filename` | Yes | Supabase Storage API over HTTPS | Private `documents` bucket | Failed row insertion attempts exact object removal; collection deletion currently does not prove Storage removal | Upload route; `src/lib/supabase/schema.sql:138-172` |
| Document row | Owner, collection, filename, storage path, MIME, byte count, state, stage, counts, errors | Filename and owner identifiers | Supabase Data API | PostgreSQL `documents` | Collection FK cascade removes the row; Storage is a separate lifecycle | `src/lib/supabase/schema.sql:66-136` |
| Extraction/OCR | Downloaded original bytes, decoded text, pages, headings, rows, source locations | Yes | Server memory in the Vercel function; PDF OCR is local Tesseract | Not intentionally logged; sanitised stage errors and operational IDs are logged | Ephemeral function memory; original stays in Storage | `src/app/api/process-document/route.ts`; `src/lib/document-processing/plugins/*`; `src/lib/ocr/extractPdfWithOcr.ts` |
| Normalisation/chunking | Original readable text, block type, page, heading path, table context, stable source location | Yes | Server memory | Not separately persisted until chunk insertion | Ephemeral until insertion | `src/lib/document-processing/chunkExtractedDocument.ts` |
| Document embedding | Normalised chunk content, `input_type=document`, model, dimension 1024 | Yes; no filename or user ID is intentionally included | Direct HTTPS POST to Voyage | Provider handling depends on Voyage account opt-out; Pliny stores returned vector/model/time | Provider-side deletion/training control is account-dependent | `src/lib/embeddings/embedBatch.ts`; `prepareChunkRowsWithEmbeddings.ts` |
| Indexed chunk | Original chunk content, page, index, kind, location, metadata including document and filename, vector(1024), embedding model/time, generated lexical tsvector | Yes; vector is derived sensitive data | Supabase PostgreSQL | Persistent `document_chunks`; HNSW and GIN indexes | FK cascade with document/collection | `src/lib/supabase/schema.sql:174-329` |
| Query embedding | Original user question, `input_type=query`, model, dimension 1024 | Yes | Direct HTTPS POST to Voyage | Vector is used in the request path and is not intentionally stored; provider policy still applies | Ephemeral in Pliny | `src/lib/search/retrieveChunks.ts`; `src/lib/embeddings/embedText.ts` |
| Lexical retrieval | Original question text, collection/document/user UUIDs | Yes | Authenticated Supabase RPC | PostgreSQL evaluates the query; application does not store a separate search record | Ephemeral query execution | `match_document_chunks_lexical`; `retrieveChunks.ts` |
| Semantic retrieval | Query vector plus collection/document/user UUIDs | Derived sensitive vector | Authenticated Supabase RPC | PostgreSQL evaluates owner-scoped candidates | Ephemeral query execution | `match_document_chunks*`; `retrieveChunks.ts` |
| Model context | System rules, original question, bounded original chunks, filename, type, location, chunk ID | Yes | Direct Anthropic API request over HTTPS | Anthropic commercial API policy applies; Pliny does not log prompt content by design | Default provider retention is contract/config dependent | `src/app/api/chat/route.ts:695-731,1441-1479` |
| Citation repair | Same model context plus the first draft answer | Yes | A second Anthropic request when a single-document answer fails citation validation | Same boundary as the first call | Same boundary as the first call | `src/app/api/chat/route.ts:1454-1492` |
| Stored conversation | Original question, answer, citation JSON containing filenames, locations, and source excerpts; model and usage metadata | Yes | Supabase Data API | `chat_messages` and `ai_usage_events` under RLS | Collection cascade; no automatic time-based retention | `src/app/api/chat/route.ts`; `src/lib/supabase/schema.sql:477-588` |
| Browser rendering | Owner-authorised documents, source excerpts, questions, answers, citations, charts | Yes | Supabase/Next.js responses to authenticated browser | Browser memory and normal browser/network diagnostics | Session/browser controls; server records persist until deletion | Workspace components and query modules |
| Export | Question, answer, filenames, locations, excerpts, chart/report data | Yes | Client-generated clipboard, Markdown, HTML, print, or file download | Leaves Pliny under user control | User-managed after export | `src/lib/export/reportExport.ts`; `browserReportExport.ts` |

## Provider-boundary table

| Boundary | What reaches it today | What does not intentionally reach it | Current policy evidence | Current uncertainty |
| --- | --- | --- | --- | --- |
| Supabase | Original files and filenames; owner/collection IDs; raw chunks and provenance; vectors; lexical representation; questions, outputs, citation excerpts, usage events | Provider API keys in browser traffic | Private buckets require RLS-authorised download; service-role keys bypass RLS and must stay server-side ([private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)) | Project region, contractual addenda, and retention settings are outside this code review |
| Voyage | Raw normalised document chunks; raw query; model/input type/dimension | Filename, collection ID, owner ID, whole file as a file | Voyage says hosted API customers can opt out of storage/training for future submissions, producing zero-day retention; current terms otherwise grant training/improvement rights ([FAQ](https://docs.voyageai.com/docs/faq), [Terms](https://www.voyageai.com/tos)) | Pliny's account opt-out state is not verified; therefore no zero-retention or no-training claim is justified |
| Anthropic | Raw question; bounded raw source text; filenames, source location and chunk IDs; system instructions; sometimes draft answer in citation repair | Supabase user UUID and provider keys other than Anthropic's | Commercial API inputs/outputs are normally deleted within 30 days, subject to exceptions; commercial content is not used for training unless the customer opts in ([retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [training](https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training)) | Workspace-specific ZDR or exceptions are not verified; current models are not assumed to have ZDR |
| Vercel hosting | Incoming HTTP requests, cookies, upload bodies, function environment at runtime, responses, and application-generated logs | Supabase service role is not used by the application runtime | Vercel documents request/runtime observability and log collection ([Observability](https://vercel.com/docs/observability), [runtime logs](https://vercel.com/docs/cli/logs)) | This app does not use AI Gateway today; exact hosting log retention depends on plan/settings |
| Vercel AI Gateway | Nothing today | All Pliny prompts and documents | If adopted, Gateway would receive prompt/output and routing metadata; Vercel documents optional ZDR/no-training filters and provider routing evidence ([Gateway](https://vercel.com/docs/ai-gateway), [ZDR controls](https://vercel.com/changelog/zero-data-retention-no-prompt-training-on-ai-gateway)) | GLM-5.3-Flash ZDR-eligible upstream availability must be verified at integration time |
| Upstash | User UUID as rate-limit identifier, key prefix, count/window metadata | Document text, filename, question, answer | Verified from local code, not a provider policy review | Workspace/account retention and region were not inspected |
| Browser client | Owner-visible filenames, source excerpts, answers, charts, reports; public Supabase URL and anon key | Service-role, Voyage, Anthropic, or future GLM keys | Browser Supabase client uses the public anon credential; RLS is the server-side enforcement layer | Browser extensions, downloads, clipboard, and local device security are outside Pliny's control |
| Future GLM provider | Nothing today | Everything | No GLM call or integration exists in this phase | Proposed privacy mode would send only sanitised question/context and non-sensitive source aliases; route is gated in the GLM decision record |

The March 2026 Supabase Storage update also warns that direct SQL deletion of `storage.objects` can orphan underlying objects; deletion should use the Storage API ([Storage security and reliability update](https://supabase.com/blog/supabase-storage-performance-security-reliability-updates)). This is consistent with the separate Phase 3 cleanup tooling.

## Current disclosure assessment

`src/components/landing/infoContent.ts` is materially truthful: it says that Voyage receives document text for embeddings, answer providers receive the question and retrieved context, provider zero retention is under evaluation, and PII pseudonymisation is not active. It does not promise complete Storage cleanup or a time-based retention window.

Two refinements should ship with the later integration, after behavior exists:

1. State that filenames and bounded source locations are also included in current answer-provider payloads.
2. State whether the verified Voyage account is opted out. Until it is verified, keep the current cautious wording.

## Threat model

Likelihood and impact use `low`, `medium`, or `high` for this application, not universal severity scores.

| Threat | Likelihood | Impact | Existing protection | Residual risk and required control |
| --- | --- | --- | --- | --- |
| PII sent to Voyage during ingestion | High | High | Server-side key; bounded chunks | Raw text is intentionally sent. Verify account opt-out and implement pre-provider pseudonymisation. |
| PII sent to Voyage in a query | Medium | High | Query length cap | Detect and pseudonymise queries consistently with selected private documents. |
| PII sent to Anthropic | High | High | Bounded retrieval and server-only key | Original source text and filenames are sent; privacy mode must sanitise both question and context. |
| Filename reveals identity | Medium | Medium | Safe filename normalisation prevents path attacks | Use non-sensitive document aliases in provider payloads; keep original filename only in owner UI. |
| Prompt injection in documents | Medium | High | HTML/Markdown active-content removal; source delimiter neutralisation; system instruction; no model tools | Textual injection remains possible. Use encoded evidence envelopes, structured output validation, citation/evidence gates, and empty tool allowlist for answer generation. |
| Cross-user retrieval | Low | High | Auth check, owner predicates, RLS, user-scoped RPCs | Keep RLS/grants tests and never introduce public privileged RPCs. |
| Cross-document retrieval outside selection | Low to medium | High | Collection/document scoping and required-document coverage | Preserve exact selected IDs and reject unrelated citation IDs. |
| Reversible token map reaches browser | Low if designed as proposed | High | No token map exists today | Store mappings outside exposed schemas or as server-only ciphertext; never return them in general API payloads. |
| Reversible token map reaches a model | Low if designed as proposed | High | No token map exists today | Enforce payload assertions and tests that mapping values cannot be serialised into provider requests. |
| Logs contain document text | Low to medium | High | Application log helpers avoid prompt/source text | Voyage error-body logging could include provider text if echoed. Log only status/request ID/category, not provider bodies, in the integration phase. |
| Model reconstructs a masked identity incorrectly | Medium | High | Citation checks, but no masking path yet | Models must emit only supplied tokens. Reject unknown tokens; reconstruction is server-side, allowlisted, and post-validation. |
| Citation mismatch after masking | Medium | High | Stable chunk IDs and current validator | Keep one chunk identity with original/sanitised projections; validate against sanitised evidence, then show authorised original by chunk ID. |
| Malicious HTML/Markdown survives extraction | Low to medium | High | Active, hidden, external and unsafe elements are removed; input is never rendered as uploaded HTML | Maintain sanitisation regressions and treat remaining text as untrusted. |
| Arbitrary model HTML/SVG executes | Low to medium | High | Answer renderer is structured; chart parser is bounded | Explicitly reject executable HTML/SVG/event attributes and keep a strict chart schema. |
| Cache leakage | Low | High | No application prompt cache | Disable provider prompt caching for privacy mode unless its data policy is reviewed; never cache token maps in shared/global caches. |
| Report/export leaks originals | Medium | High | Exports require authenticated workspace access | Let users choose masked or original export; default privacy-mode exports to masked and label the choice. |
| Provider fallback changes privacy guarantees | Medium | High | Direct Anthropic route has no automatic cross-provider fallback today | Future fallback must be explicit, pinned, policy-equivalent, and fail closed if no eligible endpoint exists. |
| Maintenance credential reaches runtime/browser | Low | Critical | Service role is confined to local Phase 3 scripts; browser uses anon key | Add bundle/static checks and never add maintenance scripts to an application route. |
| Storage row/object deletion diverges | Medium | Medium | Failed upload cleanup; guarded local reconciliation utility | Keep exact-path two-witness cleanup; add user-visible deletion semantics before stronger privacy claims. |

## Privacy terminology

- **Redaction** removes information.
- **Masking** obscures information, often only for display.
- **Pseudonymisation** replaces identifiers with stable, potentially reversible tokens. The proposed Pliny mapping is pseudonymisation.
- **Anonymisation** means identification is no longer reasonably possible. Pliny does not provide this.

Embeddings, masked text, pseudonyms, and usage metadata remain potentially sensitive. None should be described as harmless or anonymous.

## Recommended processing modes

### Standard mode

1. Store the original in owner-scoped private Supabase Storage.
2. Extract, normalise, and chunk original text with current provenance.
3. Send original chunk text to Voyage and store vector(1024).
4. Send the original query to Voyage.
5. Send the original bounded retrieved context and question to the selected answer provider.
6. Validate citations and persist the answer/citation evidence under RLS.
7. Disclose these provider boundaries before processing.

### Privacy-minimised mode

1. Store the original in the same owner-scoped private Storage boundary.
2. Extract and chunk once, preserving the current stable chunk index and provenance.
3. Detect supported PII server-side before any external inference call.
4. Replace supported values with document-scoped, stable, unlinkable pseudonyms.
5. Send only sanitised chunks to Voyage; store the sanitised vector and policy version.
6. Transform a query locally against the selected document's mapping before query embedding.
7. Retrieve against sanitised semantic and lexical representations.
8. Send only sanitised context, sanitised question, source IDs, and non-sensitive document aliases to the answer model.
9. Validate structured output, citation markers, evidence sufficiency, and token membership before any reconstruction.
10. Leave values masked by default. Reconstruct only an explicitly permitted output class after owner authorisation.
11. Resolve a citation to the original chunk only in the authenticated source inspector. The model never receives that original projection or the mapping.

### Mode scope and immutability

Use a workspace-level default copied into an immutable `documents.privacy_mode` when the upload is accepted. The processing mode belongs to the document because it determines the chunk text, lexical representation, and vector provenance. Changing it requires explicit reprocessing and replacement of the complete chunk set; it must never mutate an already-ready document in place.

The first release should reject cross-document questions that mix modes when identity-sensitive query transformation would be ambiguous. It should explain that the user must reprocess the selected documents under one mode. Silent mixing would make score interpretation and provider disclosure unreliable.

## Detection scope

The provider-free foundation implements deterministic high-confidence candidates for:

- email addresses;
- formatted international or context-labelled phone numbers;
- payment-card candidates that pass Luhn validation;
- valid IPv4 and conservative IPv6 candidates;
- URLs containing credentials or sensitive query keys;
- Indian PAN format candidates;
- Aadhaar-formatted candidates that pass Verhoeff validation;
- context-labelled bank account candidates and IFSC codes;
- explicit configurable government/organisation patterns.

PAN and IFSC have format validation rather than an authoritative issuer lookup. Bank accounts, phone numbers, and government identifiers vary by country. Names, street addresses, and organisations are deliberately excluded from regex-only claims.

### Implementation options

| Option | Vercel fit | Accuracy and language | Operations/cost | Privacy boundary | Assessment |
| --- | --- | --- | --- | --- | --- |
| A. TypeScript deterministic | Native Node runtime; no service | High precision for structured identifiers; predictable false negatives; weak for names/addresses/organisations and multilingual prose | Lowest cost and complexity; fast local tests | No new processor | Recommended first layer and mandatory baseline |
| B. Microsoft Presidio service | Requires a separately hosted Python service; unsuitable for a normal Vercel function cold start | Better extensibility and optional recognisers; quality depends on NLP model/language | New deployment, monitoring, scaling, and model management | Adds another service unless self-hosted in the same controlled environment | Defer until measured false negatives justify it |
| C. Deterministic plus optional NER | Deterministic path remains native; NER can be a protected dedicated service | Best path for names, addresses, organisations, and multilingual expansion, but requires thresholds and human review | Moderate to high complexity and cost | NER service becomes another sensitive-data processor | Recommended eventual architecture, with NER disabled by default until separately reviewed |

For current portfolio scale, adopt A first. Add an interface for optional detectors and measure misses on synthetic and consented fixtures before selecting an NER service. Never market this as complete PII detection.

## Reversible token design

Tokens must include a scope-derived opaque component, for example `[EMAIL_7D33A9F012AB44C1_001]`. The scope component is an HMAC of an owner/document scope using a server-only secret. This makes the same ordinal token differ across unrelated documents and users. A stateful per-document pseudonymiser gives repeated values the same token across chunks.

Rules:

- The scope secret never enters the database row, browser bundle, logs, or model payload.
- The mapping is owner- and document-scoped and is deleted with the document.
- Mapping values are stored only as protected server-side data. A future migration should use authenticated encryption with key versioning; exact key custody must be reviewed before implementation.
- Token values are not global identifiers and must not be used for analytics across owners.
- Reconstruction defaults to disabled. Each output type has an explicit allowlist.
- Unknown or malformed tokens in model output cause rejection, not best-effort replacement.
- Provider payload tests compare the serialised request against every original mapped value.

The new `src/lib/privacy/pseudonymize.ts` utility demonstrates the token semantics in isolation. It does not persist mappings or run in production.

## Retrieval and citation integrity

1. Keep one stable chunk identity, chunk index, page, heading path, table context, and source location.
2. Store original and sanitised content as two projections of that identity; do not re-chunk after replacement.
3. Detect and replace inside the already-bounded chunk so changed character offsets cannot change chunk membership.
4. Store replacement spans or a compact alignment map if character-level highlighting is required. Citations should resolve by chunk ID and source location, not provider-visible character offsets.
5. Build privacy-mode lexical search from sanitised content. Exact original PII terms in a query must be transformed locally using the authorised map before lexical search.
6. Embed only sanitised content and store the privacy policy version beside vector provenance.
7. Validate model citations against the sanitised prompt source list with the existing validator unchanged.
8. Validate that all output pseudonyms exist in the selected document mappings before optional reconstruction.
9. Fetch original evidence by chunk ID only after the browser request passes normal owner checks. Do not persist copied original excerpts in privacy-mode chat citation JSON; persist IDs/provenance or a sanitised excerpt.
10. Mask privacy-mode report exports by default. An original export requires an explicit owner action and clear label.
11. Preserve `insufficient_evidence` whenever sanitisation removes essential support or selected documents do not cover the request.

This design preserves citation identity while accepting that replacement changes offsets. It does not weaken `validateCitations`.

## Prompt-injection boundary

The current system prompt correctly says source text is evidence, but prompt text is still concatenated XML-like content. The isolated `buildUntrustedEvidenceEnvelope` utility encodes the complete evidence payload as JSON and escapes delimiter characters. A later integration should combine it with controls outside the prompt:

- authenticate and owner-check every selected document;
- retrieve only bounded candidates with a strict global ceiling;
- use non-sensitive document aliases in provider payloads;
- run the existing evidence-sufficiency gate before generation;
- provide no tools for normal answer generation; if tools are later added, use a server-side allowlist with typed arguments;
- require schema-valid structured output or the existing strictly parsed text/chart grammar;
- reject script, iframe, form, object, embed, SVG, event-handler, and `javascript:` output;
- reject citations not present in the supplied source table;
- reject unknown pseudonyms;
- never include secrets, system prompt text, or token mappings in correction prompts;
- fail with `insufficient_evidence` when source scope or validation fails.

Prompt instructions are one layer. Ownership, retrieval bounds, parser validation, citation validation, token validation, and tool isolation carry the security decision.

## Migration implications for the next phase

No migration is created in Phase 4A. A reviewed idempotent migration will likely need:

- immutable `documents.privacy_mode` and `documents.pii_policy_version` fields;
- an explicit processing generation/version so retries replace one complete projection atomically;
- sanitised chunk content or a separate private sanitised projection tied one-to-one to `document_chunks.id`;
- vector and lexical provenance that records the content projection used;
- a protected mapping table outside exposed schemas, or encrypted values in a table with no browser grants and strict owner checks;
- FK cascades from mappings and projections to documents;
- unique document/chunk/version constraints preventing duplicate projections;
- privacy-mode lexical RPCs using the exact indexed sanitised expression;
- privacy-mode message citations that store source IDs/provenance without copied original excerpts.

Before drafting SQL, decide the encryption key custody, whether private schemas are exposed to any server client, the reprocessing transaction boundary, and the mixed-mode query policy. The migration must preserve vector(1024), RLS, authenticated owner scoping, and the old application's compatibility during rollout.

## Truthful disclosure copy for the later UI phase

> Pliny offers two document-processing modes. Standard mode sends extracted document passages to the configured embedding provider and sends your question plus selected source passages to the configured answer provider. Privacy-minimised mode replaces supported structured identifiers with document-scoped pseudonyms before those requests. The original file and original evidence remain in your private, owner-scoped workspace.

> Privacy-minimised mode reduces disclosure; it does not anonymise a document and cannot detect every name, address, organisation, or identifier. Embeddings and pseudonymised text remain sensitive data. Review the detected categories and provider terms before processing sensitive documents.

> Pliny keeps token mappings server-side and does not include them in model prompts. Source citations resolve to original passages only for the authenticated owner. Masked export is the default for privacy-minimised documents.

Do not publish this copy until the described mode, mapping protection, and export behaviour are actually deployed.

## Risks and unresolved questions

- Voyage account opt-out is not verified. This blocks any current no-training or zero-day-retention claim.
- Anthropic workspace-specific retention controls are not verified. Standard commercial retention remains the truthful default statement.
- Direct Z.ai GLM-5.3-Flash pricing is absent from the current official pricing table.
- Direct Z.ai endpoint acceptance for the exact model ID, structured outputs, and stream semantics still needs a synthetic provider-backed test.
- Names, addresses, and organisations remain outside deterministic coverage.
- Mapping encryption/key rotation and disaster recovery are not selected.
- Current collection deletion can diverge from Storage deletion; the Phase 3 exact-path reconciliation process remains necessary.
- A second Anthropic citation-repair request can retransmit source evidence. The GLM phase should prefer one schema-constrained request or make any repair request a separately budgeted and disclosed action.
- Current provider error-body handling should be tightened before privacy-mode integration.

## Exact next implementation phase

Phase 4B should remain provider-free until its migration and runtime payload tests pass:

1. Verify Voyage opt-out and record evidence without exposing account secrets.
2. Approve the per-document mode schema, private mapping storage, and key-custody design.
3. Add privacy-mode extraction projections without calling Voyage.
4. Add local query transformation, mixed-mode refusal, payload assertions, masked export, and owner-scoped original evidence resolution.
5. Run deterministic migration, RLS, ingestion, retrieval, citation, sanitisation, and browser tests.
6. Review the exact synthetic fixtures and maximum GLM/Voyage requests before any provider-backed acceptance run.

## Phase 4A provider activity

- Provider inference requests: **zero**
- Document uploads: **zero**
- Remote data changes: **zero**
- Migrations created or applied: **zero**
- Production integration: **none**
