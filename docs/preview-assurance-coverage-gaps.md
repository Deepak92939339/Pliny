# Preview assurance coverage-gap matrix

Baseline: `e15bd7774d7a75e5dc7c9fec8d96eeb67396e115` on `feature/openrouter-glm-answer-model`, reviewed against `d215f1280a1416910fb81a83a879a534b6bb325b` before release-assurance implementation.

## Runtime map

`browser` → non-streaming `POST /api/chat` → authenticated Supabase HTTP client → lexical/semantic RPC retrieval → bounded `selectPromptChunks` context → provider-safe prompt boundary → configured answer provider → citation/evidence validation and one bounded citation-repair path → Supabase chat/usage persistence → JSON response → React rendering and Source Inspector.

Pliny does not stream answers. It uses Supabase HTTP clients and RPCs rather than an application-managed PostgreSQL connection pool, so streaming-specific and pool-exhaustion tests are out of scope.

## Baseline and gaps

| Risk | Existing reproducible evidence | Gap to close in this phase |
| --- | --- | --- |
| Grounded answer and refusal | Provider-mocked success/refusal; 7/7 mocked holdout correctness | Exercise full provider response-shape and route contract; preserve zero unsupported answers |
| Citation identifiers | Valid, nonexistent and malformed-marker validation | Add explicit unsupported-claim-with-valid-source evaluation; do not turn semantic support into a runtime fuzzy invariant |
| Model output parsing | Empty/missing OpenRouter content rejected; route repairs invalid citations | Cover Markdown-fenced JSON, invalid JSON, truncation, content arrays and oversized output deterministically |
| Credentials and privacy | Missing key, bounded prompt/privacy tests, browser-bundle scan | Reconfirm all required secrets by Boolean presence only; expand server-only bundle assertions |
| Provider faults | Timeout plus 429/500/503 normalization, no adapter retries | Add 401/402 no-retry, Retry-After-aware capped 429 retries, bounded 500/502/503/504 retries, caller cancellation and concurrency |
| Provider selection | OpenRouter default; Anthropic manually selectable | Prove no automatic Anthropic fallback during every OpenRouter failure path |
| Retrieval | 6/6 Hit@5, 7-case synthetic holdout, local DB E2E | Version 30–40 cases, freeze at least 10 holdout cases, add Recall/Precision/MRR/nDCG where graded relevance exists, run actual pipeline where credentials permit |
| Database/RLS | Six migrations; local pgTAP 59/59; local authenticated E2E | EXPLAIN ANALYZE representative synthetic scale, metadata edges, 50 parallel retrievals, latency/error distribution |
| Load behavior | No baseline soak | Ten-minute provider-mocked 20-client soak with bounded rate, latency, memory, event-loop and abort accounting |
| Preview/browser | No isolated Preview evidence | Isolated Supabase + Vercel Preview, synthetic account/documents, human browser acceptance, logs and screenshots |
| CI | Individual scripts only; existing `eval` includes constructed mocked integration | Add provider-free `test:eval` over the actual deterministic retrieval/citation/refusal harness and a pinned pull-request workflow |

The release gate will preserve the existing minimums of 6/6 Hit@5, 7/7 mocked correctness and zero unsupported answers. Any additional threshold will be justified from the versioned dataset and measured baseline rather than asserted universally.
