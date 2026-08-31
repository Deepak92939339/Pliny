# Pliny Storage Accounting — Phase 3A

**Date:** 2026-08-31
**Scope:** read-only inventory and cleanup design
**Project:** `lnvosbeeybisdixfwqdo`
**Baseline:** `5467c4c7491eb3eff421230c0430284ba805fd0`

## Executive summary

The production project is the Supabase **Free** plan. The private `documents` bucket contains 5 active object records and 43,841,029 catalogued bytes, or **4.38%** of the documented 1 GB file-storage quota. PostgreSQL reports 13,675,667 bytes, or **2.74%** of the documented 500 MB database quota. Current egress usage was not exposed by the authenticated management surface used for this read-only run; the Free-plan egress quota is documented as 5 GB.

There are **2 Storage-orphan candidates** totaling 29,176,544 bytes. Both are older than 24 hours but younger than seven days. A second read-only inventory returned the same counts and bytes. They are candidates for a later grace-period review, not confirmed safe deletion targets today. Confirmed safe deletions: **0**.

There is 1 failed document with a matching 76,139-byte object. It is under 24 hours old and remains referenced, so it must be retained for retry or inspection. There are no missing objects, chunk or collection orphans, stale processing rows, duplicate document references, malformed ownership paths, or ready documents with incomplete chunk sets in the current catalog.

The likely near-term constraint is **file storage for large documents**. The application also imposes lower per-file and processing limits before quota exhaustion: a 16 MiB multipart boundary, 15 MiB PDF/DOCX/XLSX limits, 10 MiB CSV, 5 MiB Markdown/HTML/TXT, 500 PDF pages, 1.5 million extracted characters, 20,000 extracted blocks, and 200 chunks.

## Preflight and evidence boundary

- The worktree was clean on entry, on `main`, at the authoritative baseline commit. No existing user changes were present to preserve.
- `supabase --version` returned `2.115.0`. `supabase --help`, `supabase db --help`, `supabase migration --help`, and `supabase projects --help` were inspected. The CLI reported that no local access token was available for `projects list` and `migration list --linked`; no token was printed or persisted.
- Authenticated Supabase management access through the connector succeeded for the exact project reference, catalog SQL, migrations, extensions, plan, and advisors. Remote migration history is `20260830183604`, `20260830214649`, and `20260831090000`.
- The project is `ACTIVE_HEALTHY`, PostgreSQL 17.6.1, region `ap-southeast-2`. The current production deployment is READY at the baseline commit, with alias `pliny.vercel.app`.
- Environment-variable names were inspected without values. The browser/server Supabase clients use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/lib/supabase/client.ts:3-20`, `src/lib/supabase/server.ts:4-37`). No service-role credential was printed or browser-exposed.
- `storage.buckets` confirms bucket `documents` is private (`public = false`), standard, with no bucket-level file-size or MIME restriction. RLS is enabled on the application tables and `storage.objects`.

## Storage lifecycle mapped to source

1. **Upload request and ownership:** `src/app/api/documents/upload/route.ts:90-119` authenticates the user; `:165-179` checks that the collection belongs to that user. The multipart body is bounded at 16 MiB by `MAX_MULTIPART_BODY_BYTES` (`:29`, `:138-141`).
2. **Validation:** the file is read into memory and selected against the processor registry at `:181-205`; processor validation runs before Storage upload at `:206-217`.
3. **Storage object creation:** `:219-224` writes to the private `documents` bucket using the path `<user UUID>/<collection UUID>/<random UUID>-<normalized filename>`, with `upsert: false` and the supplied MIME type.
4. **Document row:** `:231-243` records `collection_id`, `user_id`, original display filename, declared byte size, `storage_path`, processing status, and initial stage. If insertion fails, `:245-248` attempts to remove the object, but the cleanup result is not checked; a failed cleanup can therefore leave a Storage object without a row.
5. **Processing lock and retry:** `src/app/api/process-document/route.ts:303-368` uses owner-scoped updates, retries failed rows, and retries stale `processing` rows after 15 minutes. The stale cutoff is based on `created_at` at `:295-300`; `processing_started_at` is recorded but is not the cutoff field.
6. **Extraction:** owner lookup is enforced at `:486-507`; Storage download uses the exact recorded path at `:528-541`. Native extraction and processor validation run before stage updates at `:543-575`.
7. **Normalization, limits, and chunks:** sanitization and extracted limits run at `:589-591`; chunking is stage-tracked at `:601-608`. Chunks retain page, location, file kind, heading and other provenance in `src/lib/document-processing/chunkExtractedDocument.ts:29-49` and `:61-88`.
8. **Embeddings and indexing:** embedding preparation occurs before database insertion at `:610-628`; `src/lib/document-processing/prepareChunkRowsWithEmbeddings.ts:13-23` requires one vector per row and exactly 1024 dimensions. Complete rows are upserted by `(document_id, chunk_index)` at `:648-650`, stale higher indexes are removed at `:660-665`, and the document becomes ready only after the final update at `:680-714`. A failure is sanitized and marks the row failed at `:715-736`.
9. **Document and collection deletion:** the only application action found is owner-scoped deletion of a collection row in `src/lib/collections/actions.ts:69-105`. Foreign keys cascade collections to documents, chunks, chat messages and usage events, but this action does not remove Storage objects. Storage deletion is therefore not atomic with database deletion, and collection deletion can create Storage-orphan candidates.

### Deployed formats and boundaries

The registry in `src/lib/document-processing/registry.ts:1-35` includes PDF, DOCX, XLSX, HTML, Markdown, TXT and CSV. The implementation details are:

| Format | Accepted extensions/MIME behavior | Main limits or notes |
|---|---|---|
| PDF | `.pdf`, `application/pdf` | 15 MiB, 500 pages; native text first; OCR only for sparse/low-text pages when enabled, with default OCR maximum 5 pages and environment clamp 1–10 (`plugins/pdf.ts:19`, `:168-210`). |
| Markdown | `.md`, `.markdown`; Markdown, plain-text and octet-stream MIME fallbacks | 5 MiB; embedded unsafe HTML is treated as text/noise (`plugins/markdown.ts:14-20`, `:153-169`). |
| HTML | `.html`, `.htm`; `text/html` plus controlled text fallbacks | 5 MiB; sanitizes active, hidden and unsafe content and rejects unsupported charsets (`plugins/html.ts:13-107`, `:195-232`). |
| TXT | `.txt`, text/plain/octet-stream | 5 MiB and readable-text validation (`plugins/text.ts:12-100`). |
| CSV | `.csv`; CSV/plain/Excel MIME variants | 10 MiB (`plugins/csv.ts:12-169`). |
| XLSX | `.xlsx`; OOXML spreadsheet MIME | 15 MiB, 20 sheets, 5,000 rows/sheet, 100 columns, 500 characters/cell (`plugins/xlsx.ts:13-17`, `:234-284`). |
| DOCX | `.docx`; OOXML DOCX MIME | 15 MiB; Mammoth raw-text extraction (`plugins/docx.ts:12-107`). |

`.xls` and `.xlsm` are not in the active processor extension registry and are explicitly rejected by the upload route when no processor is found (`upload/route.ts:190-196`). Extracted content is capped at 1,500,000 characters and 20,000 units; chunking is capped at 200 chunks with an estimated 500-token target and 50-token overlap (`limits.ts:3-21`, `chunkExtractedDocument.ts:52-96`).

## Current plan and quotas

The authenticated management response identifies the organization plan as **Free**. The quota values below are the current documented Free-plan values, expressed in decimal bytes for percentage calculations.

| Resource | Current measured usage | Documented Free quota | Usage |
|---|---:|---:|---:|
| File Storage | 43,841,029 B | 1,000,000,000 B | **4.38%** |
| Database size | 13,675,667 B | 500,000,000 B | **2.74%** |
| Egress | Not exposed by the management surface in this run | 5,000,000,000 B | Unknown |

The database value is `pg_database_size(current_database())`. File usage is the sum of active `storage.objects.metadata->>'size'` values for bucket `documents`; the catalog contained no delete markers in this inventory. Quota values and storage/RLS semantics were checked against the official documentation listed in [Sources](#sources).

## Database and Storage usage

### Application table sizes

Sizes are physical PostgreSQL relation sizes. Heap, index and TOAST figures are reported separately where applicable. Counts are exact counts from the read-only queries.

| Relation | Rows | Heap | Index | TOAST | Total |
|---|---:|---:|---:|---:|---:|
| `public.document_chunks` | 11 | 16,384 B | 1,826,816 B | 114,688 B | **1,957,888 B** |
| `public.chat_messages` | 46 | 32,768 B | 49,152 B | 57,344 B | 163,840 B |
| `storage.objects` (documents bucket) | 5 | 8,192 B | 81,920 B | 8,192 B | 98,304 B |
| `public.documents` | 3 | 8,192 B | 65,536 B | 8,192 B | 81,920 B |
| `public.ai_usage_events` | 34 | 8,192 B | 49,152 B | 8,192 B | 65,536 B |
| `public.collections` | 3 | 8,192 B | 32,768 B | 8,192 B | 49,152 B |
| `storage.buckets` | 1 | 8,192 B | 32,768 B | 8,192 B | 49,152 B |

The public application relations total 4,341,760 B. The largest relation is `document_chunks`; its vector index is the largest individual index.

### Vector and lexical footprint

- `document_chunks.embedding` is exactly `vector(1024)`.
- 11 of 11 chunks have non-null vectors; the average, minimum and maximum vector datum size is 4,100 B.
- The existing vector index is `document_chunks_embedding_idx`, an IVFFlat cosine index with `lists = 100`, valid and ready, at 1,646,592 B. It is not an HNSW index.
- The stored `lexical_search` column is a generated `tsvector`; its valid GIN index `document_chunks_lexical_search_idx` is 81,920 B.
- Across the 11 chunks, vector datums contribute 45,100 B, content datums 15,882 B, lexical datums 27,902 B, and metadata datums 3,513 B. These are column datum sizes, not a replacement for physical table/index accounting.
- The current ready-document logical payload average is approximately 46,199 B per document across two ready documents. The current physical `document_chunks` relation allocation averages approximately 978,944 B per ready document because it includes shared index and page allocation; this is a small-sample observation and should not be treated as a stable per-document price.

### Tuple and maintenance indicators

`pg_stat_all_tables` estimates the following dead tuples: collections 9, documents 21, document_chunks 30, AI usage events 5, Storage objects 7, chat messages 0. No vacuum or analyze timestamp was present for most of these relations; these are planner statistics, not a deletion recommendation. Reusable space should be confirmed with routine maintenance tooling before capacity decisions.

## Observed document and object distribution

The three document rows have declared file sizes of 74 B, 76,139 B and 14,588,272 B. The live-document mean is 4,888,162 B; median 76,139 B; p90 and maximum 14,588,272 B. The five Storage objects have mean 8,768,206 B; median, p90 and maximum 14,588,272 B.

| Safe category | Objects | Bytes |
|---|---:|---:|
| PDF | 3 | 43,764,816 B |
| Markdown | 1 | 76,139 B |
| CSV | 1 | 74 B |

| Age range at snapshot | Objects | Bytes |
|---|---:|---:|
| Under 1 hour | 0 | 0 B |
| 1–24 hours | 2 | 76,213 B |
| 1–7 days | 3 | 43,764,816 B |
| Over 7 days | 0 | 0 B |

All five object paths have exactly three segments. The first two segments are UUID-shaped owner and collection identifiers. No raw paths or filenames are included in this report. Where an example is needed, the report uses a truncated MD5 fingerprint of the full path; it is only a sanitized correlation label.

## Per-document chunk statistics

There are 2 ready documents with 11 chunks: average 5.50, median 6, p90 9, maximum 10. All 11 ready chunks have embeddings, and every ready document has contiguous indexes from 0 through its maximum. The failed document has zero chunks and zero embeddings.

| Metric | Value |
|---|---:|
| Total chunks | 11 |
| Embedded chunks | 11 |
| Null embeddings | 0 |
| Average chunks per ready document | 5.50 |
| Median chunks per ready document | 6 |
| p90 chunks per ready document | 9 |
| Maximum chunks per ready document | 10 |
| Average vector datum | 4,100 B |
| Average content datum | 873.50 B |
| Average lexical datum | 1,520 B |

## Orphan classification

The minimum analysis age is 24 hours. The recommended unattended cleanup age is seven days. “Safe automatically” means safe for unattended deletion under the current evidence; no class qualifies today.

| Class | Count | Bytes | Age range | Confidence | Likely cause | Safe automatically? |
|---|---:|---:|---|---|---|---|
| A `STORAGE_ORPHAN` | **2** | **29,176,544 B** | 28–31 hours | High for unmatched relation; medium for cause | Earlier upload/retry or collection deletion without Storage cleanup | No; review after 7-day grace and a second verification |
| B `MISSING_OBJECT` | 0 | 0 B | — | High | None observed | No candidate |
| C `CHUNK_ORPHAN` | 0 | 0 B | — | High | Foreign key and set comparison show none | No candidate |
| D `COLLECTION_ORPHAN` | 0 | 0 B | — | High | Foreign key and set comparison show none | No candidate |
| E `STALE_PROCESSING` | 0 | 0 B | — | High at 15-minute threshold | None observed | No candidate |
| F `FAILED_WITH_OBJECT` | **1** | **76,139 B** | Under 24 hours | High | Failed processing with retained retryable object | No; retain for retry/inspection |
| G `READY_WITHOUT_COMPLETE_CHUNKS` | 0 | 0 B | — | High | Ready set is complete | No candidate |
| H `DUPLICATE_REFERENCE` | 0 | 0 B | — | High | Unique `documents_storage_path_key` and set comparison | No candidate |
| I `UNEXPECTED_OBJECT` | 0 | 0 B | — | High | All paths match the three-segment convention | No candidate |

Sanitized example path fingerprints for class A are `52022f54dbbb85a4` and `1501e524ba586224`. The class F document fingerprint is `f60ff07d59aa2f5b`. These fingerprints do not expose paths, filenames or contents.

## Two-witness evidence

The first catalog pass and a second independent read-only snapshot at `2026-08-31 13:10:27 UTC` both found 5 active Storage objects, 43,841,029 bytes, 2 unmatched paths, and 29,176,544 unmatched bytes. The two witnesses for the Storage-orphan candidates were:

1. **Storage catalog witness:** active rows in `storage.objects` for bucket `documents`, with object byte metadata and creation timestamps.
2. **Database/lifecycle witness:** an exact `storage.objects.name = documents.storage_path` comparison found no row for the two paths; the document inventory had 0 processing rows and 0 processing rows older than 15 minutes. Both unmatched objects were older than 24 hours at the second snapshot.

For missing objects, the reverse exact join found 3 document rows and 0 missing paths. For F, the object catalog and the failed document row agreed on the exact reference. For C and D, the parent joins returned zero and the live foreign keys are `ON DELETE CASCADE`. The repeated snapshot is additional evidence that the A set was stable during this run, but it does not prove historical intent or ownership beyond the path convention.

## Capacity scenarios

These are planning estimates, not hard limits. They subtract current measured usage and use decimal quota values. “Database per document” includes a range for chunk payload, vector/lexical data and index allocation; the current 46 KB logical payload and approximately 979 KB physical relation allocation show why a small sample can mislead.

| Scenario | Raw Storage / document | Estimated DB / document | Additional docs to 70%: Storage / DB | Additional docs to 90%: Storage / DB | First likely quota |
|---|---:|---:|---:|---:|---|
| Small documents | ~0.10 MB | ~0.05–0.15 MB | ~6,560 / 2,240–6,720 | ~8,560 / 2,900–8,720 | Database at the high-overhead end; otherwise close |
| Current observed mean | ~4.89 MB | ~0.20–1.00 MB | ~134 / 336–1,680 | ~175 / 436–2,180 | File Storage |
| Large, near PDF/DOCX/XLSX limit | ~15 MB | ~1.5–3.0 MB | ~43 / 112–224 | ~57 / 145–290 | File Storage |

Uncertainty is at least approximately ±20% for raw files and wider for database allocation because extraction, overlap, metadata, table content and index growth vary. The current sample suggests a practical capacity range of roughly **43 to 8,700 additional documents** before the 70–90% guard bands, depending on document profile. Application file-size, 200-chunk, extraction-character and OCR/provider processing limits will often be reached before a quota limit for an individual large or complex document.

## Phase 3B cleanup design proposal

Use the smallest safe implementation for this portfolio-scale product: an authenticated admin-only server-side maintenance script, run manually with a reviewed candidate manifest. A later scheduled job can reuse the same verification code only after the manifest/audit model has proven safe. Do not expose a browser cleanup endpoint or a service-role key.

The staged flow should be:

1. **Inventory:** read `storage.objects` and the exact `documents.storage_path` relationship for the private `documents` bucket.
2. **Candidate recording:** write a candidate record containing a random candidate ID, hashed path, byte size, owner/collection/document relationship when present, reason code, first-seen timestamp, and evidence-witness references. Do not store raw paths in user-visible output.
3. **Grace period:** require at least 24 hours for operator review and preferably seven days for unattended deletion. Exclude all active or recently created upload/processing rows.
4. **Second verification:** re-read the exact bucket/path, document row, collection ownership and processing state. Recompute the path hash and require the candidate to match the manifest. Reject changed or ambiguous candidates.
5. **Approval:** require explicit admin approval per candidate or a tightly bounded reviewed manifest. Never delete by prefix, glob, unresolved path, or recursive bucket operation.
6. **Exact-target deletion:** call the Storage API with the exact approved object path only. Do not delete through a public SQL function or by removing metadata rows.
7. **Post-delete verification:** confirm the exact Storage object is absent and record the result. If deletion fails, keep the candidate pending for safe retry; do not broaden the target.
8. **Audit:** retain candidate ID, hashed path, witnesses, approval, attempt time, result, verification time and sanitized error category. Storage and PostgreSQL are not transactionally atomic, so each partial failure must remain observable and retryable.

The later design must preserve RLS and owner checks. It must not add a public `SECURITY DEFINER` function, disable RLS, grant anonymous access, or place service-role credentials in browser code. Collection deletion should eventually be paired with an explicit, owner-scoped Storage cleanup workflow rather than relying on database cascades.

## Risks and uncertainties

- `storage.objects` is a metadata/catalog witness; it reports the recorded object size, not a downloaded object checksum. No Storage object was downloaded or modified in this phase.
- The two A candidates have a strong exact-reference absence signal, but their historical cause is uncertain. Their age is not yet the recommended seven-day unattended-cleanup threshold.
- Current database physical allocation is dominated by shared indexes and page allocation at only 11 chunks. Capacity projections should be recalculated after a larger provider-free fixture set or after additional real documents are ingested under separate authorization.
- `n_dead_tup` values are estimates and should not be interpreted as reclaimable bytes without maintenance inspection.
- Egress usage was unavailable through the authenticated management connector used here, so only the documented quota is reported.
- This phase made no Storage changes, database row changes, migrations, uploads, provider calls, commits, pushes or deployments.

## Exact recommendation for Phase 3B

Do not delete the two class-A candidates yet. Re-inventory them after they pass the seven-day age threshold, record them in a reviewed candidate manifest, perform a second exact-path and lifecycle verification, then obtain explicit cleanup approval for exact-target deletion. Retain the failed referenced object for retry/inspection. Implement the server-side admin-only staged cleanup script only in that separately approved phase.

## Sources

- [Supabase Storage access control and RLS](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Storage buckets and limits](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Storage schema and read-only metadata guidance](https://supabase.com/docs/guides/storage/schema/design)
- [Supabase Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [Supabase database and disk size](https://supabase.com/docs/guides/platform/database-size)
- [Supabase billing and current plan quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Supabase March 2026 Storage update](https://supabase.com/changelog/43465-developer-update-march-2026)
