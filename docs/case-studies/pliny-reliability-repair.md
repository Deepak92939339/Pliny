# Pliny Reliability Repair

## The problem

Pliny could refuse ordinary questions even when the answer was present in an uploaded document. It could also remove useful text near the end of a retrieved chunk before answer generation. The assurance audit additionally reported a Production PDF rejection, a non-portable ingestion test, an incorrect report label, a truncated-citation-marker gap, and a short conversation-history restore.

This repair was performed against source snapshot `66cdd48c4278d60784ee6a4b7507a02acdce40c3`. Production observations in the prior audit were conversation-derived records because the original browser evidence was lost. The repair measurements below are fresh local tests with synthetic content. Later release-candidate provider checks are labelled separately. No Production or remote Supabase requests were made.

The current-host baseline passed all nine original repository test commands, lint, typecheck, and the Production build. This differs from the audit rebuild's 8/9 result because the two personal files referenced by `test:ingestion` happen to exist on this host; the source still proved the test was non-portable. The assurance report sidecar and all but one bundle-manifest entry verified: the archived `evidence-index.json` does not match the hash recorded in the supplied `SHA256SUMS.txt`. The assurance bundle was not modified.

## Reproduction and responsible code

The main answer-recall failure was confirmed in the lexical retrieval path. `retrieveChunks.ts` sent the full natural-language question to PostgreSQL `websearch_to_tsquery('simple', ...)`. With the `simple` configuration, words such as "who", "is", and "the" were retained and ANDed, so a short fact-bearing chunk had to contain every question word. When no lexical or semantic row survived, retrieval returned `broad_context_fallback`; the evidence gate correctly refused that low-confidence result.

The context loss was independently confirmed in the chat route. Every retrieved chunk was hard-sliced at 1,200 characters before both evidence assessment and provider payload construction. A synthetic fact placed after character 1,200 was absent from the generation envelope even though retrieval had selected the correct stored chunk.

The other confirmed defects were direct code-path issues:

- The ingestion test read a DOCX and PDF from personal absolute paths outside the repository.
- A successful uncited workspace-inventory answer was labeled "Insufficient Evidence Report" because citation absence was treated as evidence failure.
- A truncated marker such as `[[s.1` was ignored when another valid marker existed.
- History restoration requested only 20 rows and assumed strict user/assistant alternation.

Local database-backed validation found two additional release-candidate defects. Fresh local Supabase bootstrap failed because the incremental migrations assumed an untracked foundational schema, including the `vector` extension and retrieval functions. After bootstrap, authenticated requests were denied table access before RLS policies could evaluate because the baseline grants were absent. A third local reproduction showed that Storage can return a MIME value with parameters such as `text/plain; charset=utf-8`; exact registry matching then rejected a previously accepted `.txt` document during processing.

The reported Production PDF HTTP 422 was not reproduced. The audit PDF and a new generated holdout PDF both pass local validation and extraction; truncated and wrong-MIME controls fail with the intended messages. The snapshot already externalizes `pdf-parse` and `pdfjs-dist` from the Next.js server bundle, so the proposed runtime change was obsolete. Establishing the original Production cause still requires staging or runtime evidence.

## Focused repair

Pliny now converts meaningful lexical terms into a PostgreSQL web-search expression joined with `OR`, while preserving quoted phrases and the existing document scope, privacy projection, ownership predicates, rank fusion, and evidence sufficiency gate. No model provider or retrieval threshold was changed.

Context construction now has two explicit limits: 3,000 characters per selected passage and 12,000 characters across document context by default. Complete query-relevant sentences are preferred. When a source has no usable sentence boundaries, Pliny selects a word-bounded window near matching terms and marks omitted text. This keeps relevant tail evidence without silently expanding the prompt.

The remaining changes are deliberately small: generated synthetic DOCX/PDF fixtures replace personal files; malformed citation-like markers are rejected; uncited metadata answers export as "Answer Report"; and history is loaded in bounded 200-row pages up to 1,000 messages, with a visible notice if older rows remain.

For a clean local database, Pliny now has an ordered foundational migration that creates the required schema, vector extension, retrieval functions, RLS policies, and authenticated grants before the existing incremental migrations. MIME types are reduced to their normalized media type before upload and processing registry checks, so a valid parameterized content type follows the same validated processor path as its upload-time equivalent. ESLint now excludes Supabase's generated local `.temp` runtime artifact rather than treating it as application source. These changes do not alter Pliny's Anthropic answer model, Voyage embedding role, OCR provider, ownership predicates, or evidence gate.

## Before and after

The holdout corpus is separate from the audit corpus and covers direct facts, paraphrases, acronyms and roles, a fact near a chunk ending, multi-document aggregation, conflicting statements, an unsupported question, citation-to-passage checks, privacy-minimised transformation, malformed provider output, and valid/invalid PDF ingestion.

| Measure | Before | After |
| --- | ---: | ---: |
| Direct retrieval Hit@5 | 0/6 | 6/6 |
| Required-passage coverage@5 | 0/6 | 6/6 |
| Mocked answer/refusal correctness | 1/7 | 7/7 |
| Citation-to-passage correctness | 0/6 | 6/6 |
| Tail fact present in context | No | Yes |
| Unsupported answers | 0 | 0 |

Retrieval figures use a deterministic local emulation of the PostgreSQL web-search semantics. Answer figures use mocked extractive generation and manually explicit ground truth. They demonstrate the repaired code path, not Production accuracy or model quality.

## Release-candidate verification

The repairs were integrated into the canonical Pliny repository on a local release-candidate branch based on the audited commit. All 16 provider-free local test tasks, local database acceptance checks, lint, typecheck, and the optimized production build passed. The full suite includes retrieval, tail-context selection, valid and invalid PDF ingestion, citations, reports, bounded history, privacy boundaries, and the separate holdout corpus.

A live provider smoke test sent synthetic text only. Voyage returned the required 1,024-dimensional embedding and Anthropic returned the requested minimal response. The successful run made two provider requests and no database writes. Embeddings are disabled in the persisted environment; the smoke test enables them only in its own process, so it verifies the provider contract without changing the deployment configuration. This is live provider evidence, not a database-backed staging end-to-end result.

With Docker available, a fresh **local Supabase** instance applied all six migrations and passed 59 database acceptance assertions. A local-only E2E harness then created and deleted one synthetic user and its workspace data while exercising authenticated upload, Storage, PDF/DOCX/TXT extraction, chunk storage, document-scoped retrieval, privacy-minimised projection, deterministic inventory chat, insufficient-evidence refusal, history loading, report labeling, and workspace rendering. It accepted the generated PDF and DOCX, rejected a non-PDF payload labeled as PDF with `400`, and rejected a truncated PDF with the user-safe `422` validation response. External answer and embedding providers were explicitly disabled for this run; provider request count was zero.

| Local database measure | Before | After |
| --- | --- | --- |
| Fresh migration bootstrap | Failed before foundational schema | Six migrations apply; 59/59 acceptance assertions pass |
| Authenticated RLS path | Table DML denied before policy evaluation | Synthetic owner can use the scoped workflow; cross-owner checks remain in acceptance suite |
| Parameterized MIME TXT processing | Accepted upload then `422` at processing | Upload → extraction → chunk storage completes |
| Synthetic database-backed E2E | Not available | Passes with provider calls `0` |

## OpenRouter GLM answer-provider phase

On 2026-09-08, a focused local phase made OpenRouter the default answer-provider transport and `z-ai/glm-5.3-flash` its default API model identifier. The upstream endpoint label `z-ai/fp8` is explicitly rejected as a model configuration. Anthropic remains manually selectable with `ANSWER_PROVIDER=anthropic`; there is no automatic cross-provider fallback. Voyage embeddings, retrieval, context selection, ingestion, OCR, Supabase schema and the interface were unchanged.

The adapter preserves the existing generation payload contract at the orchestration boundary. OpenRouter receives only the system instructions and the already-bounded question/source prompt through its OpenAI-compatible `/chat/completions` endpoint. Citation repair uses the same selected provider and the same bounded evidence. Provider errors are normalized without retaining response bodies, request headers or credentials; retries remain disabled. Privacy payload assertions, pseudonym checks, citation validation, evidence reassessment and structured refusal behavior remain outside the adapter and unchanged.

Provider-mocked coverage passed for a grounded answer, a resolvable `[[s.1]]` citation, an exact insufficient-evidence refusal, malformed response data, missing credentials, timeout, HTTP `429`, HTTP `500`/`503`, the exact OpenRouter request shape and manual Anthropic selection without fallback. The complete deterministic gate passed: `test:answer-provider`, `test:citations`, `test:context`, `test:embeddings`, `test:evidence`, `test:ingestion`, `test:history`, `test:holdout`, `test:privacy`, `test:privacy:bundle`, `test:retrieval`, `test:sanitization`, `test:report`, `test:storage-cleanup`, `test:trust`, `test:local-migrations`, 59/59 local pgTAP assertions, the synthetic local database E2E, ESLint, TypeScript and the optimized Production build. The first local E2E invocation used `AI_ENABLED=false` and correctly returned `403`; it was rerun successfully with orchestration enabled, embeddings disabled and both answer-provider credentials blank, proving the unsupported path refused before provider generation.

Two authorized live OpenRouter requests used only invented Cedar Laboratory evidence and made no database writes. The supported-answer request passed citation and factual-contract validation in 2,558 ms using 127 input and 14 output tokens (141 total), with reported cost approximately `$0.00001760`. The unsupported-answer request returned the required refusal and passed contract validation in 1,940 ms using 126 input and 8 output tokens (134 total), with reported cost approximately `$0.00001028`. Total: 2 requests, 253 input tokens, 22 output tokens, 275 tokens and approximately `$0.00002788`. The optional third adversarial request was not needed.

The rebuilt browser bundle contains neither the configured OpenRouter credential nor the server-only names `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` and `ANSWER_PROVIDER`. The local configuration check reported only booleans: `.env.local` is Git-ignored, the key is present, and the provider/model selectors match the required values.

## Remaining limitations

- The database proof uses local Supabase and server-rendered HTTP checks. A separate shared staging environment and interactive browser automation remain unverified; the linked remote project was not accessed because it could not be safely classified as non-Production.
- OCR-provider, shared staging, and Production requests were not made. The successful historical Voyage/Anthropic smoke and current OpenRouter GLM contract checks are limited to synthetic provider payloads. The local database E2E deliberately disabled providers, so it does not prove live generation in the authenticated workflow.
- The original Production PDF 422 and prior garbled adversarial refusal remain unverified without runtime evidence.
- One supplied assurance-bundle manifest entry is internally inconsistent, as noted above.
- History restoration remains intentionally bounded at 1,000 messages; the interface now discloses truncation instead of silently showing only ten exchanges.
- The deterministic privacy detector still has the documented limitations of a bounded pseudonymizer and is not a general redaction system.

Reproduce the focused verification with `npm run test:holdout`, `npm run test:retrieval`, `npm run test:context`, `npm run test:ingestion`, `npm run test:citations`, `npm run test:report`, `npm run test:history`, `npm run test:local-migrations`, `supabase test db --local supabase/tests/phase4b_acceptance.sql`, and `npm run test:local-e2e` with local-only environment variables.

## Isolated Preview assurance — 2026-09-09

The final assurance phase used a separately named Free-plan Supabase project and a Vercel Preview deployment. Production Supabase, Vercel Production, `main`, customer documents and personal data stayed outside the boundary. All six migrations were applied to the disposable database through the ordinary migration workflow. Every Preview variable was Preview-scoped.

The provider boundary was extended with bounded retries for retryable OpenRouter failures, `Retry-After` delay capping, caller `AbortSignal` propagation, strict content-shape/size checks and deterministic rejection of truncated provider output. HTTP 401 and 402 do not retry; 429 and 500/502/503/504 stop after two retries. Cancellation does not retry and does not trigger Anthropic. These changes preserve the existing evidence, citation, refusal and privacy layers outside the adapter.

A versioned 36-case invented corpus, including 12 frozen holdouts, ran through extraction, sanitization, chunking, deterministic ranking, evidence assessment and citation validation. Hit@5, Recall@5, refusal accuracy, citation identifier validity and supported-answer correctness were all `1.000`; MRR was `0.984`, nDCG@5 was `0.988`, Precision@5 was `0.515`, and unsupported answers remained `0`. This is release evidence for the checked synthetic distribution, not universal accuracy.

Three defects were confirmed and repaired:

- Short but valid TXT evidence could be displaced by longer passages. Retrieval and evidence selection now preserve query-relevant short passages; the frozen format-equivalence holdout passes.
- Vercel's upload inventory included local Supabase link-state files. `.vercelignore` now excludes `.env*` and `supabase/.temp/`; the dry-run upload list contains neither boundary.
- PDF parsing failed in Vercel with worker initialisation. Pliny now bundles and registers the `pdf-parse` worker explicitly while leaving the native canvas/parser packages server-external. Standard and parameterized-MIME PDFs reach `Ready` in Preview.

The ten-minute provider-mocked soak used 20 authenticated clients and 1,200 requests. It recorded zero unexpected errors and zero database failures, p50/p95/p99 latency of 51.9/73.0/103.5 ms, 60 intentional aborts and no listener growth. Fifty parallel local retrievals returned zero cross-tenant rows and zero database errors. At 5,000 rolled-back synthetic rows, lexical sequential scans were fast enough that an index change was not justified; vector retrieval used the existing IVFFlat index.

Real-browser Preview acceptance passed protected-route behavior, invalid login, confirmed synthetic-user login, workspace creation, PDF/DOCX/TXT and parameterized-PDF ingestion, grounded and unsupported questions, contradictions, prompt-injection resistance, citations, Source Inspector, report export, history reload, privacy-minimised processing, tenant isolation, mobile layout, keyboard basics, controlled cancellation, console review, bundle inspection and logout. A three-client live check returned three `200` answers, each with a valid citation and contract validation.

Live application testing used 16 questions: 14 OpenRouter responses are confirmed complete, one provider-bound cancellation has unknown billing status, and one unsupported question refused before generation. Exact billed usage, retry attempts and total Voyage request count were not retained. The conservative OpenRouter cap-based cost estimate is approximately `$0.006`, not an invoice. Only synthetic evidence was sent.

The resulting dossier is outside the application repository at `PLINY_RELEASE_ASSURANCE/`. Its recommendation is **NOT READY for Production** despite Preview readiness within the tested scope. Remaining gates are a reproducible hosted public-signup flow, resolution of the Git/Vercel repository identity mismatch so CI can be observed on the exact pushed candidate, and a read-only Production schema/grant equivalence review followed by an independently reviewed migration-ledger plan.

## Production release gate — 2026-09-10

The final gate resolved the repository and schema uncertainties without changing Production. Native Git authentication identifies the expected repository owner, the release branch was pushed without force, and pull request [#1](https://github.com/Deepak92939339/Pliny/pull/1) targets `main`. Production was queried only for schema and migration metadata through isolated CLI configurations. Its realized public schema, functions, policies, grants, triggers, indexes and required extensions match the isolated Preview exactly. The migration ledger differs only because Preview records the foundational baseline while Production begins with the five later migrations; this is non-blocking for schema equivalence but requires a reviewed deployment runbook so the baseline is never replayed against Production.

The answer route now retains provider-reported OpenRouter token usage, cost and exact adapter request count in server-side response metadata. The existing preflight estimate remains separate. This is an observability repair only: bounded evidence, citations, refusals, privacy assertions, validation, retries and manual Anthropic selection are unchanged. Provider-mocked regression coverage verifies ordinary OpenRouter accounting, retry accounting and Anthropic accounting; lint, typecheck, Production build and the browser-bundle secret scan pass.

One bounded final Preview workflow used invented content and completed confirmed-user login, upload and processing, Voyage retrieval, a grounded GLM answer with one resolving citation, prompt-injection resistance, an unsupported pre-generation refusal, Source Inspector, print report, reload persistence, logout and synthetic cleanup. The retained generated answer used one OpenRouter request, 1,251 input tokens and 140 output tokens, with provider-reported cost `$0.00025765`; the workflow made three logical Voyage operations. Browser console errors and Preview 5xx responses were zero.

Public hosted signup remains a confirmed release blocker. A new disposable synthetic address reached the isolated Supabase Auth service, but the service returned its email-send rate limit before a confirmation message or redirect could be verified. The same identity was then created and confirmed administratively inside the isolated Preview solely to test the downstream authenticated application; this does not substitute for a public-signup pass. Firefox and WebKit automation were unavailable, and exact aggregate cost for discarded diagnostic smoke attempts was not retained.

The evidence-based decision is **NO-GO for Production**. The candidate demonstrates **release readiness within the tested scope**, but Production promotion should wait for one successful public signup plus confirmation-link redirect test and independent approval of the migration-ledger deployment plan.

The first pull-request quality-gate run also exposed an honest CI-only defect: the workflow selected Node 20 while the committed deterministic scripts require Node's `--experimental-strip-types` support. The repair moves the pinned setup to Node 22 and adds a provider-free configuration regression that rejects unsupported Node majors and provider-secret references. No application runtime behavior changed.
