# Direct upload pipeline

Files up to **15 MiB** go from the browser straight to Supabase Storage on a signed upload URL. The
Vercel function never receives file bytes, so Vercel's ~4.5 MB request-body limit does not apply.

```
Browser                          Next.js (Vercel)                       Supabase
  │  POST /api/documents/upload-url  {collection_id, filename, mime_type, size}
  │ ───────────────────────────────▶ auth · declared size/type · rate limit · collection ownership
  │                                  insert documents row (status 'awaiting_upload')
  │                                  createSignedUploadUrl({userId}/{collectionId}/{documentId}/{name}) ─▶ Storage (RLS: own prefix)
  │ ◀─────────────── {document.id, upload.path, upload.token}
  │  uploadToSignedUrl(path, token, file)  ── bytes, with real progress ───────────────────▶ Storage (private bucket, 15 MiB cap)
  │  POST /api/documents/{id}/process
  │ ───────────────────────────────▶ auth · ownership · object exists · actual size == declared
  │                                  download · magic bytes · validate · extract · chunk · embed · upsert
  │ ◀─────────────── {status: 'ready'}
```

## Endpoints

| Endpoint | Purpose | Failure modes |
| --- | --- | --- |
| `POST /api/documents/upload-url` | Validates the *declared* file, creates the row, returns a signed URL. Body is JSON metadata only (≤ 8 KiB). | 401 unauthenticated · 400 bad name/type/empty · 413 over the limit · 404 not your project · 429/503 rate limit |
| `POST /api/documents/{id}/process` | Confirms the object, re-checks real size and magic bytes, runs the existing pipeline. `maxDuration = 300`. | 401 · 404 not your document · 409 still uploading / file missing · 422 size or content mismatch (object deleted) |
| `POST /api/process-document` | Legacy body-based entry point; delegates to the same handler. | same |
| `GET /api/cron/maintenance` | Service-role sweep, `Authorization: Bearer $CRON_SECRET`. Scheduled by `vercel.json`. | 401 without the secret |

A document that belongs to someone else is indistinguishable from one that does not exist: **404**,
never 403, so ids cannot be probed.

## Document lifecycle

`awaiting_upload → processing → ready`, or `→ failed`. In the UI `failed` is **Needs attention** and
offers **Retry**; `awaiting_upload` is shown as an in-progress document.

* **Idempotent processing.** The lock is a compare-and-swap on the status the row was read in, so
  concurrent callers cannot both run the pipeline. A `ready` document returns immediately. Chunks are
  upserted on `(document_id, chunk_index)` and the stale tail is deleted, so even a retry after a
  partial failure leaves exactly one chunk set.
* **Size is verified, not trusted.** The declared size gates the signed URL; the bucket's
  `file_size_limit` stops a lying client; `/process` compares Storage's real object size with the
  declared size and the limit and deletes the object on mismatch.
* **Content is verified, not trusted.** The first bytes must match the extension (`%PDF-`, ZIP
  container for DOCX/XLSX, non-binary text) before any parser sees the file.

## Watchdog (no silent hangs)

`documents.processing_stage_updated_at` is bumped by a trigger whenever the stage or status changes.

| Condition | Result | Where it runs |
| --- | --- | --- |
| `processing` and no stage change for `PROCESSING_STALL_MINUTES` (default 6) | `failed`, message `<stage>: Processing stopped making progress. Retry to try again.` | on every workspace read (`getDocumentsForCollection`, owner-scoped, RLS) and in the cron job (all users) |
| `awaiting_upload` older than `UPLOAD_EXPIRY_MINUTES` (default 60) | `failed`, message `Upload did not complete. Upload the file again.`, object deleted | same |
| expired upload whose signed URL has now died (2 h + 5 min) | late-arriving object deleted, marker cleared | cron only |

Every transition repeats its predicate in the `UPDATE`, so a document that advanced in the meantime
is never touched. The workspace polls `router.refresh()` every 15 s while anything is unfinished, so
a stall surfaces without a manual reload. The 6-minute floor is deliberately longer than the
300-second function budget: a live invocation can never be mistaken for a dead one, and a Retry can
never race it.

`maxDuration = 300` is the longest every Vercel plan allows with Fluid Compute (enabled by default on
projects created after April 2025). On a Pro/Enterprise plan it can be raised in the two process route
files (it must be a literal there); then raise the `PROCESSING_STALL_MINUTES` floor in
`src/lib/uploads/config.ts` to match.

Vercel Hobby only runs cron jobs once a day, which is why `vercel.json` schedules `0 3 * * *`. The
per-read sweep is what enforces the 1-hour rule for anyone looking at their workspace; on Pro,
change the schedule to `*/15 * * * *` to also sweep users who never return.

## Storage security

* The `documents` bucket is **private**. There are no public URLs.
* `storage.objects` policies allow `select`, `insert` and `delete` only where
  `(storage.foldername(name))[1] = auth.uid()`. There is **no `update` policy**, so objects cannot be
  overwritten. The signed URL is minted with the caller's own session, so a path outside `{userId}/`
  cannot even be signed.
* The service role is imported by exactly one file, `src/app/api/cron/maintenance/route.ts`, and has
  only `select, update` on `public.documents` (migration `20261015000000`). Request handlers use the
  per-user client so RLS and Storage policies stay in force.

## Configuration

All values are environment variables; defaults apply when unset or invalid. See `.env.example`.

| Variable | Default | Range | Meaning |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES` | `15728640` (15 MiB) | 1 KiB – 15 MiB | Largest accepted file. Shared by the browser pre-check and the server. Cannot exceed the bucket cap. |
| `UPLOAD_MAX_REQUESTS_PER_HOUR` | `5` | 1 – 1000 | Signed upload URLs per user per hour. A retry costs one; a refused (oversize/unsupported) file does not. |
| `PROCESS_MAX_REQUESTS_PER_HOUR` | `5` | 1 – 1000 | `/process` calls per user per hour, including Retry. |
| `PROCESSING_STALL_MINUTES` | `6` | 6 – 240 | Stage-stall window before "Needs attention". |
| `UPLOAD_EXPIRY_MINUTES` | `60` | 5 – 110 | Time an `awaiting_upload` row waits for its file. |
| `CRON_SECRET` | – | – | Bearer secret for `/api/cron/maintenance`. |
| `SUPABASE_SERVICE_ROLE_KEY` | – | – | Used only by the maintenance job. |
| `AI_MAX_REQUESTS_PER_MINUTE` / `AI_MAX_REQUESTS_PER_DAY` / `AI_DAILY_BUDGET_INR` | `5` / `30` / `50` | see `budgetGuard.ts` | Existing answer limits. |

Raising the file limit above 15 MiB needs a migration for the bucket's `file_size_limit` as well as a
review of the per-format processor ceilings (HTML/Markdown/TXT 5 MB, CSV 10 MB).

## Testing

| Command | Needs | Covers |
| --- | --- | --- |
| `npm run test:direct-upload` | nothing (in `test:deterministic`) | config clamps, path/filename safety, declared-request validation, magic bytes, watchdog decisions and the reaper's compare-and-swap semantics, upload state machine (never stuck in *Uploading*, Retry resumes), XHR progress fetch, rate limit, structural guarantees (no byte-reading routes, service role confined, `maxDuration`, bucket/policy SQL) |
| `npm run test:direct-upload-e2e` | local Supabase + `next dev` | 4.4 / 4.6 / 14.9 MiB PDFs reach Ready · 15.2 MiB refused · lying sizes · magic-byte mismatches · upload → process → delete leaves no object, chunks or row · duplicate upload blocked (409) unless "Upload anyway" · user B vs user A (API and Storage) · idempotent and concurrent processing · stall and expiry sweeps · maintenance job · optional real-time hang (`PLINY_HANG_BASE_URL`, `PLINY_E2E_REAL_STALL=1`, a second dev server started with `PLINY_TEST_EXTRACTION_DELAY_MS=hang`) |

`PLINY_TEST_EXTRACTION_DELAY_MS` (`hang` or milliseconds) is a test seam that is inert when
`NODE_ENV === "production"`.
