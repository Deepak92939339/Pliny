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

## Remaining limitations

- The database proof uses local Supabase and server-rendered HTTP checks. A separate shared staging environment and interactive browser automation remain unverified; the linked remote project was not accessed because it could not be safely classified as non-Production.
- OCR-provider, shared staging, and Production requests were not made. The successful Voyage and Anthropic smoke test is limited to synthetic provider payloads. The local database E2E deliberately disabled both providers, so it does not prove live generation in the authenticated workflow.
- The original Production PDF 422 and prior garbled adversarial refusal remain unverified without runtime evidence.
- One supplied assurance-bundle manifest entry is internally inconsistent, as noted above.
- History restoration remains intentionally bounded at 1,000 messages; the interface now discloses truncation instead of silently showing only ten exchanges.
- The deterministic privacy detector still has the documented limitations of a bounded pseudonymizer and is not a general redaction system.

Reproduce the focused verification with `npm run test:holdout`, `npm run test:retrieval`, `npm run test:context`, `npm run test:ingestion`, `npm run test:citations`, `npm run test:report`, `npm run test:history`, `npm run test:local-migrations`, `supabase test db --local supabase/tests/phase4b_acceptance.sql`, and `npm run test:local-e2e` with local-only environment variables.
