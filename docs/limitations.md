# Current limitations

Pliny is a production-deployed portfolio system with deliberately narrow guarantees. These limits are part of the product description, not footnotes to it.

## Privacy and provider boundaries

- Deterministic identifier detection can miss names, organisations, addresses and sensitive values outside its supported patterns.
- Standard processing sends bounded original document text and questions to configured external processors.
- Privacy-minimised processing sends masked content, not no content. A detector miss can therefore cross the external-processing boundary.
- Voyage and OpenRouter account-level zero-retention and training opt-out status remain unverified for this deployment.
- Privacy-minimised processing is not local-only processing and is not a compliance certification.

## Extraction and retrieval

- Poor scans can exceed the bounded OCR page limit or produce inaccurate recovered text.
- Complex DOCX layout, comments and tracked changes may not be represented completely.
- Large or unusually structured spreadsheets can exceed sheet, row, column or cell limits.
- Hybrid retrieval can miss relevant evidence; broad fallback is intentionally insufficient for answer generation.
- The deterministic acronym/title equivalence layer is deliberately small. It currently covers proven concepts rather than attempting open-ended synonym rewriting.
- Citations prove which retrieved passage supported an answer; they do not prove the passage itself is complete or correct.

## Product scope

- OpenRouter with `openai/gpt-6-luna` is the default answer-generation provider; Anthropic remains manually selectable without automatic fallback. Voyage 4 remains the embedding model, available through direct Voyage or OpenRouter transport.
- The INR daily answer-cost guard estimates usage; it does not include embedding charges or impose a billing limit on either provider account.
- Team roles, shared workspaces, enterprise SSO and billing are not implemented.
- Presentations, legacy `.xls`, macro-enabled spreadsheets, notebooks and arbitrary code files are not supported.
- Provider-backed answer-quality evaluation remains limited compared with the deterministic suite.
- Storage reconciliation is an operator-run guarded workflow, not automatic background deletion.

## Dependency posture (updated by audit-r1 WP4)

`npm audit --omit=dev` now reports **0 vulnerabilities**. `@xmldom/xmldom` is forced via npm `overrides` to **0.8.15** — the first patched release that clears the HIGH advisory while staying compatible with `mammoth`'s DOMParser API (0.9.x rejects `mammoth` 1.12's mimeType-less `parseFromString` and breaks DOCX extraction, verified and rolled back). The `ai` package was updated 6.0.168 → 6.0.293 within its existing `^6.0.168` range to clear the remaining low-severity advisories. `npm run test:ingestion` proves DOCX extraction still works.

## Known limits updated by audit-r1 (WP1–WP8)

- Existing CSV/XLSX documents keep their pre-WP2 coarse chunks until they are re-uploaded or reprocessed; only then do they gain row-faithful 8-row units.
- PostgreSQL `ts_rank_cd` is not BM25; if a real BM25 extension is installed in Supabase, a third retrieval lane can slot into `retrieveChunks.ts` (see the `TODO(audit-r1)` note there).
- Supabase auth cookies are `Secure` + `SameSite=Lax` in production but deliberately not `HttpOnly`: the browser Supabase client must read the session. The enforced nonce-based CSP is the primary XSS mitigation (see security-and-privacy.md).
- Upload/process rate limiting via Upstash still counts rejected attempts inside the current window (PLN-004); the UI now prevents accidental retry spam and every 429 carries `Retry-After`.
- The answer-cost guard falls safe on unknown or misconfigured model pricing (most expensive known rate) instead of failing the request.
- Embedding `input_type` parity (WP2): both transports — direct Voyage and OpenRouter — send the same `input_type` ("document" for ingestion, "query" for search), asserted by `scripts/test-privacy-phase4b.mjs` against mocked OpenRouter payloads. `EMBEDDINGS_PROVIDER` is one global setting feeding both the ingestion and query paths, so vectors and queries are always embedded through the same transport. Switching `EMBEDDINGS_PROVIDER`, `EMBEDDING_MODEL` or dimensions after documents were ingested can change search quality for those documents — re-ingest after any provider/model switch. (Whether OpenRouter forwards the vendor-specific field to Voyage could not be observed without a live key; if it were dropped, both sides would still stay consistent within one provider setting.)

See [Security & Privacy](./security-and-privacy.md) for implemented controls and [Evaluation](./evaluation.md) for the evidence behind current claims.

## Rate limiting (WP3)

- Upload and document-processing limits run through Upstash sliding windows when Redis is configured. Rejected attempts still consume a slot in the current Upstash window (documented `INFO` finding PLN-004); the UI now disables submits and shows a Retry-After countdown so accidental retry spam is unlikely, but the slot cost of a rejected attempt is inherent to the edge limiter.
- Chat minute/daily limits count only `allowed` usage events since WP3. Blocked requests are persisted for audit history but no longer extend a user's lockout, and every 429 from `/api/chat`, `/api/documents/upload` and `/api/process-document` carries a `Retry-After` header the UI reads.
