# Packet C — CSV answer-context repair

Date: 2026-10-04. Repository: `pliny-antigravity-review`. Branch: `fix/pliny-audit-r1-preview-20260930`. Committed baseline: `68c12504ff54ace032f3a6e592a91af9474921e8`. Local, uncommitted repair; previous changes preserved.

## Confirmed failure

Offline inspection of the owner-provided CSV and transcript reproduced lost evidence. Extraction, sanitization and chunking retained the requested customer row, but `src/lib/ai/contextSelection.ts` reduced its 2,626-character chunk to a 178-character excerpt containing headers/domain endings rather than the customer. The old punctuation-excluding match expression restarted after internal URL dots, silently dropping preceding text. Its oversized-neighbor fallback could also select an early generic header instead of the relevant row.

The ingestion path stores full chunk content (`src/app/api/process-document/route.ts`); the chat route subsequently calls `selectPromptChunks` before the evidence gate (`src/app/api/chat/route.ts`). This was a context-selection failure, not evidence that extraction or the refusal gate needed weakening.

## Focused repair

- Preserve characters by splitting prose at punctuation followed by whitespace or newlines, rather than matching punctuation-free fragments.
- Preserve labelled table rows as newline-delimited passages, including company abbreviations and their associated fields.
- Bound the best relevant passage when it is oversized; unrelated oversized neighbors no longer trigger a chunk-wide header-anchored fallback.
- Retain existing character caps, chunk identity/location, privacy handling and evidence/refusal rules. No providers, schema, embeddings or budget changes.

Only application change: `src/lib/ai/contextSelection.ts`. Regression coverage: `scripts/test-context-selection.mjs`, using entirely synthetic rows, reserved domains and fictional contact data. Owner customer values are not copied into fixtures or this report.

## Verification

The new synthetic regression failed before the repair and passed afterward. It covers complete field retention, URL/decimal punctuation, company abbreviations, oversized unrelated passages, actual prompt-chunk selection, provenance and masked phone numbers in privacy payloads.

Offline owner-CSV replay through extraction → sanitization → chunking → deterministic lexical ranking → prompt selection retained the complete requested row in the top-four context. Selected excerpt lengths were 757, 616, 614 and 772 characters, all within the 900-character cap; location metadata remained intact. No customer data was sent to a provider.

Passed: context tests; table retrieval (22 tests); retrieval and route-pipeline tests; evidence sufficiency; citation tests; privacy foundation and phase 4b; sanitization; typecheck; lint (zero errors, two existing warnings); 36-case provider-free evaluation; production build; diff whitespace checks. Build retains an existing malformed generated CSS utility warning and unused import warning, unrelated to this repair.

## Limits and next action

This does not prove hosted semantic retrieval, stored Production row integrity or a live generated answer. No database migration is needed for this repair. Existing intact labelled-row chunks can benefit after publication without re-upload; historical flattened or otherwise incomplete chunks may require separately authorized reprocessing. Old saved answers/transcripts will not change automatically: ask the question again after a verified deployment.

Packet D (bounded interaction/motion refinement) remains next, separately initiated by the owner. Commit/push/deployment remain separately authorized.

External AI/embedding calls: **0**; external provider cost: **$0**. Exact Codex input/output/cache counters and billed/API-equivalent cost are unavailable, not zero.
