# Pliny Storage Reconciliation and Cleanup Runbook

This runbook covers the local, admin-only Storage reconciliation tools introduced in Phase 3B. The tools do not add an application route, maintenance page, scheduled job, database function, migration or policy. They operate only from a trusted terminal checkout.

Supabase Storage deletion is permanent. Supabase requires object deletion through the Storage API; deleting rows from `storage.objects` does not delete the underlying object. Pliny therefore treats every possible orphan as ineligible until two independent inventories, a seven-day interval and an immediate pre-delete check all agree.

## What counts as a Storage orphan

For this tool, `STORAGE_ORPHAN` means all of the following are true at an inventory:

- An object exists in the private `documents` bucket.
- Its exact object path has no matching `public.documents.storage_path` value.
- No uploading or processing document row references the exact path.
- The path matches Pliny's three-segment convention: owner UUID, collection UUID and an object UUID-prefixed filename.

A failed document with a matching object is not an orphan. A recently uploaded object is not eligible for cleanup. Missing objects, broken document relationships and incomplete chunk sets are reported separately and are never repaired or deleted by these tools.

## Why two witnesses and seven days are mandatory

Storage and PostgreSQL changes are not one atomic transaction. An object may become visible before its document row, a failed row may remain retryable, and a network failure can make an operation's result uncertain. A single inventory cannot distinguish all of these cases safely.

Eligibility requires:

1. A first inventory that records the exact object as unreferenced.
2. Seven complete days with the same object metadata.
3. A second inventory at least seven complete days after the first that independently confirms the orphan condition.
4. A live recheck immediately before deletion.

Any unknown, changed or unavailable condition makes the candidate ineligible.

## Local files and credential boundary

The tools use the repository's server-only Supabase configuration from `.env.local`. `NEXT_PUBLIC_SUPABASE_URL` must identify `lnvosbeeybisdixfwqdo`, and `SUPABASE_SERVICE_ROLE_KEY` must be available only in the trusted local terminal. The key is never written to a manifest, report or audit and must never be copied into browser code.

All generated artifacts are under `.pliny-storage/`, which is ignored by Git:

- `manifests/` contains exact private paths and must remain local.
- `reports/` contains sanitized fingerprints and aggregate counts.
- `audits/` contains sanitized cleanup outcomes.
- `manifest-signing.key` is a local integrity key used to reject hand-edited manifests.

The exact-path manifest is mode `0600`. Terminal output and sanitized artifacts show SHA-256 path fingerprints only.

## Generate the first inventory

Run:

```bash
npm run storage:audit
```

The command is read-only. It validates the project URL, verifies that `documents` is private, inventories Storage and relevant database relationships, and writes a signed manifest plus a sanitized report. Record the manifest filename and its file SHA-256 from the terminal output. Do not copy the manifest into tickets, chat, source control or shared QA folders.

The manifest records its first inventory timestamp. Every new orphan gets only a first witness and remains ineligible.

## Generate the second inventory

Wait at least seven complete days, then pass the first signed manifest back to the reconciliation tool:

```bash
npm run storage:audit -- --previous-manifest .pliny-storage/manifests/<first-manifest>.json
```

The previous manifest must be inside the ignored manifest directory and must pass its HMAC integrity check. The new manifest preserves the first witness and records the second observation. A candidate remains ineligible when it is referenced, absent, too young, observed too soon, malformed, or has changed size or timestamps.

## Review a dry run

Dry-run is the cleanup command's default:

```bash
npm run storage:cleanup -- --manifest .pliny-storage/manifests/<second-manifest>.json
```

Dry-run performs live project, bucket, object and database-reference checks but does not call Storage deletion. For each candidate it reports only:

- path fingerprint;
- object size and complete age in days;
- orphan reason;
- first- and second-witness status;
- eligibility;
- exact refusal reason codes.

Review the sanitized audit under `.pliny-storage/audits/`. Never use the private manifest as a report.

## Destructive confirmation

Actual deletion is disabled unless every confirmation is supplied:

```bash
npm run storage:cleanup -- \
  --execute \
  --manifest .pliny-storage/manifests/<second-manifest>.json \
  --confirm-project-ref=lnvosbeeybisdixfwqdo \
  --confirm-bucket=documents \
  --confirm-manifest-sha256=<exact-file-sha256> \
  --max-delete=<1-to-5>
```

When a TTY is present, the operator must also type the exact requested confirmation phrase. The utility rejects unknown options, including `--force`. It does not accept roots, folders, prefixes, wildcards, recursive targets, unresolved paths or “delete all.” If eligible candidates exceed `--max-delete`, the complete batch is refused before deletion.

Do not execute this command for the current production candidates. They have only a first tool witness and have not completed the seven-day interval.

## Partial failures and retry

Each eligible object is revalidated immediately before one exact-path Storage API deletion. The utility then checks the same exact path again:

- `deleted_verified`: deletion returned successfully and the exact object is absent.
- `failed`: Storage explicitly rejected deletion.
- `uncertain`: deletion may have occurred, but post-delete verification was unavailable or the object still appeared. Stop and investigate before any further run.
- `already_absent`: the object was absent before a retry; this is distinct from a new successful deletion.
- `ineligible`: a live safety condition failed; no deletion was attempted.

Rerunning the same manifest is idempotent. An already absent object is never deleted again. The batch stops when project identity changes or post-delete verification becomes unavailable. The tool never deletes document, chunk, collection or user rows.

## Accidental or uncertain deletion response

Storage deletion is permanent and cannot be rolled back by PostgreSQL. If an outcome is accidental or uncertain:

1. Stop the cleanup run and preserve the sanitized audit.
2. Do not recreate metadata directly in `storage.objects`.
3. Check the exact object through a trusted Storage administration surface.
4. Check whether any document row now references a missing object.
5. Restore only from an independently retained source file or backup under separate approval.
6. Record the incident and require a fresh two-witness cycle before any further cleanup.

## Current production candidates

Phase 3A found two exact-path Storage-orphan candidates totaling 29,176,544 bytes. At the Phase 3B implementation date, both are younger than seven days and neither has a second tool inventory at least seven days after the first. They are therefore ineligible. This phase must not delete or modify them.

## Disposable integration test, later approval

The tooling is suitable for a separately approved disposable-object integration test after local configuration is available. That test should create one synthetic object in a dedicated test collection/path, record two deliberately time-controlled witnesses in an isolated non-production project, exercise exact deletion, and verify absence. Do not shorten production grace rules, upload a real document, or use either existing production candidate for that test.

## Official references

- [Delete objects through the Supabase Storage API](https://supabase.com/docs/guides/storage/management/delete-objects)
- [JavaScript `remove` reference](https://supabase.com/docs/reference/javascript/file-buckets-remove)
- [Storage schema is read-only metadata](https://supabase.com/docs/guides/storage/schema/design)
- [Storage ownership and RLS](https://supabase.com/docs/guides/storage/security/ownership)
- [List objects with the JavaScript client](https://supabase.com/docs/reference/javascript/v1/storage-from-list)
