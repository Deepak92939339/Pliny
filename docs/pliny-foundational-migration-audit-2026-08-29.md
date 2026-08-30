# Pliny foundational migration safety audit — 2026-08-29

## Verdict

**SAFE TO APPLY AS WRITTEN only after the read-only preflight confirms an empty or schema-matching Supabase project and vector extension availability.** The original proposal required changes because it could null existing embeddings during a dimension conversion. The audited proposal now fails closed on a non-`vector(1024)` embedding column, does not drop the embedding index unconditionally, and makes authenticated table/storage/RPC grants explicit.

Do not apply this SQL to the remote project until the preflight has been reviewed. No remote SQL was applied during this audit. No commit or push was performed.

## Evidence and scope

- Live evidence supplied for this audit: Supabase Auth responds `200`; PostgREST returns `404 PGRST205` for `public.collections` and `public.documents`.
- The existing proposed migration is [2026-08-29-proposed-foundational-schema.sql](</Users/sandman/Desktop/RAG intelligence/vector/supabase/manual-migrations/2026-08-29-proposed-foundational-schema.sql>).
- The source schema contract is [schema.sql](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/supabase/schema.sql>); the prior manual migration only covers later `document_chunks` metadata/RPC synchronization.
- The backup patch remains at `/Users/sandman/pliny-current-diff-2026-08-29.patch`.
- The Supabase clients are untyped `@supabase/ssr` clients using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in [server.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/supabase/server.ts:4>) and [client.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/supabase/client.ts:3>). There is no generated `Database` type; handwritten row contracts are in [src/types/index.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/types/index.ts:1>).

## Application contract

| Contract | Repository evidence | Required database behavior |
| --- | --- | --- |
| Auth/session | [auth/session.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/auth/session.ts:1>), [middleware.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/supabase/middleware.ts:18>) | Supabase Auth supplies `auth.uid()`; protected server requests use the authenticated session. |
| Workspace list/read | [collections/queries.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/collections/queries.ts:36>) | `collections` SELECT by `user_id`, ordered by `created_at`; document count reads `documents`. |
| Workspace create/delete | [collections/actions.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/collections/actions.ts:36>) | INSERT payload contains `user_id`, trimmed `name`, nullable `description`; ownership must be enforced by RLS. |
| Collection route | [collection/[id]/page.tsx](</Users/sandman/Desktop/RAG intelligence/vector/src/app/collection/[id]/page.tsx:25>) | Collection and related documents/messages must be user-isolated. |
| Upload | [documents/upload/route.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/app/api/documents/upload/route.ts:151>) | Checks owned collection, uploads to private `documents`, then inserts a `documents` row and selects its generated `id`. |
| Ingestion | [process-document/route.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/app/api/process-document/route.ts:433>) | Reads/updates owned `documents`, downloads Storage object, deletes/inserts `document_chunks`, marks document ready/failed. |
| Keyword retrieval | [retrieveChunks.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/search/retrieveChunks.ts:453>) | Reads ready `document_chunks` joined through `documents!inner(filename,status)` and scopes by collection. |
| Semantic retrieval | [retrieveChunks.ts](</Users/sandman/Desktop/RAG intelligence/vector/src/lib/search/retrieveChunks.ts:381>) | Calls `match_document_chunks` with a 1024-value query vector, collection ID, user ID, and count. |
| Chat persistence | [chat/queries.ts](</Users/sandman/Desktop/RAG%20intelligence/vector/src/lib/chat/queries.ts:14>), [chat route](</Users/sandman/Desktop/RAG%20intelligence/vector/src/app/api/chat/route.ts:831>) | Reads/inserts `chat_messages`; stores citations as JSONB. |
| AI budget | [budgetGuard.ts](</Users/sandman/Desktop/RAG%20intelligence/vector/src/lib/ai/budgetGuard.ts:291>), [chat route](</Users/sandman/Desktop/RAG%20intelligence/vector/src/app/api/chat/route.ts:859>) | Reads/inserts user-scoped `ai_usage_events`. |
| Reports/exports/charts/citations | [reportExport.ts](</Users/sandman/Desktop/RAG%20intelligence/vector/src/lib/export/reportExport.ts:1>), [riskEvidenceReport.ts](</Users/sandman/Desktop/RAG%20intelligence/vector/src/lib/export/riskEvidenceReport.ts:1>), [AnalysisRecord.tsx](</Users/sandman/Desktop/RAG%20intelligence/vector/src/components/workspace/AnalysisRecord.tsx:1>) | No additional database objects; consumes chat response/source/citation objects and persisted `chat_messages.citations`. |

## Exact compatibility matrix

### Required extensions, tables, columns, and constraints

| Object | Exact required contract | Migration | Application dependents | Compatibility |
| --- | --- | --- | --- | --- |
| Extension `pgcrypto` | Provides `gen_random_uuid()` defaults. | Creates if absent at lines 13–14. | All five table IDs. | Compatible; required on a bare PostgreSQL project. |
| Extension `vector` | Provides `vector`, `<=>`, and `vector_cosine_ops`. | Creates if absent at lines 13–14. | `document_chunks.embedding`, IVFFlat index, `match_document_chunks`. | Compatible; SQL Editor must be allowed to install it. |
| `public.collections` | `id uuid PK DEFAULT gen_random_uuid()`; `user_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE`; `name text NOT NULL` with nonblank check; `description text`; `created_at timestamptz NOT NULL DEFAULT now()`; `updated_at timestamptz NOT NULL DEFAULT now()`. | Lines 16–23. | Dashboard, collection route, collection queries/actions, upload/search/chat ownership lookups, all collection FKs. | Exact match to handwritten `CollectionRow` and app payload. |
| `public.documents` | `id uuid PK DEFAULT gen_random_uuid()`; `collection_id uuid NOT NULL FK collections(id) ON DELETE CASCADE`; `user_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE`; `filename text NOT NULL` nonblank; `storage_path text NOT NULL` nonblank; `page_count integer NOT NULL DEFAULT 0` nonnegative; `file_size integer NOT NULL DEFAULT 0` nonnegative; `status text NOT NULL DEFAULT 'processing'` in `processing/ready/failed`; `error_message text`; `created_at timestamptz NOT NULL DEFAULT now()`. | Lines 79–90. | Document queries, upload, processing, chat inventory, keyword/semantic retrieval, collection document counts. | Exact match to `DocumentRow`; no `updated_at` is required by the app. |
| `public.document_chunks` | `id uuid PK DEFAULT gen_random_uuid()`; `document_id uuid NOT NULL FK documents(id) ON DELETE CASCADE`; `collection_id uuid NOT NULL FK collections(id) ON DELETE CASCADE`; `content text NOT NULL` nonblank; `page_number integer NOT NULL DEFAULT 1` >= 1; `chunk_index integer NOT NULL` >= 0; `file_kind text NOT NULL DEFAULT 'pdf'`; `location_label text NOT NULL DEFAULT 'Source passage'`; `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`; `embedding vector(1024)` nullable; `embedding_model text`; `embedding_created_at timestamptz`; `created_at timestamptz NOT NULL DEFAULT now()`. | Lines 185–199 and 220–236. | Processing inserts/deletes; retrieval selects keyword rows and receives semantic RPC rows; handwritten `DocumentChunkRow`/search types. | Exact match. Embeddings are disabled in current `.env.local`, but schema must remain 1024-compatible for enabled Voyage mode. |
| `public.chat_messages` | `id uuid PK DEFAULT gen_random_uuid()`; `collection_id uuid NOT NULL FK collections(id) ON DELETE CASCADE`; `user_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE`; `role text NOT NULL` in `user/assistant`; `content text NOT NULL` nonblank; `citations jsonb`; `created_at timestamptz NOT NULL DEFAULT now()`. | Lines 375–383. | Chat history query and all user/assistant persistence paths. | Exact match to `ChatMessageRow` and JSON citation payload. |
| `public.ai_usage_events` | `id uuid PK DEFAULT gen_random_uuid()`; `user_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE`; nullable `collection_id uuid FK collections(id) ON DELETE CASCADE`; `model text NOT NULL`; nonnegative `input_tokens integer`, `output_tokens integer` defaults 0; `estimated_cost_usd numeric`; `status text NOT NULL` in `success/blocked/failed`; `reason text`; `created_at timestamptz NOT NULL DEFAULT now()`. | Lines 439–450. | Budget lookup and chat usage-event writes; `AiUsageEventRow`. | Exact match. |

### Index matrix

| Index | Definition | Dependent operations | Audit result |
| --- | --- | --- | --- |
| `collections_user_id_created_at_idx` | `collections (user_id, created_at DESC)` | Workspace list for user ordered newest first. | Present and compatible. |
| `documents_user_id_created_at_idx` | `documents (user_id, created_at DESC)` | User-scoped document access. | Present and compatible. |
| `documents_collection_id_created_at_idx` | `documents (collection_id, created_at DESC)` | Workspace document lists. | Present and compatible. |
| `documents_storage_path_key` | Unique `documents(storage_path)`. | Prevents duplicate Storage/object references. | Present and compatible. |
| `document_chunks_document_id_chunk_index_idx` | `document_chunks (document_id, chunk_index)`. | Chunk replacement and ordered retrieval. | Present and compatible. |
| `document_chunks_collection_id_idx` | `document_chunks (collection_id)`. | Collection retrieval. | Present and compatible. |
| `document_chunks_collection_page_chunk_idx` | `document_chunks (collection_id, page_number, chunk_index)`. | Ordered collection passages. | Present and compatible. |
| `document_chunks_collection_kind_idx` | `document_chunks (collection_id, file_kind)`. | File-kind/source scoping. | Present and compatible. |
| `document_chunks_document_id_chunk_index_key` | Unique `(document_id, chunk_index)`. | Prevents duplicate chunk positions. | Present and compatible. |
| `document_chunks_embedding_idx` | IVFFlat on `embedding vector_cosine_ops`, lists 100, partial `embedding IS NOT NULL`. | Semantic retrieval RPC. | Present and compatible for 1024 vectors; existing incompatible same-named indexes require preflight review. |
| `chat_messages_collection_id_created_at_idx` | `chat_messages (collection_id, created_at)`. | Recent history. | Present and compatible. |
| `chat_messages_user_id_created_at_idx` | `chat_messages (user_id, created_at)`. | User-scoped history. | Present and compatible. |
| `ai_usage_events_user_id_created_at_idx` | `ai_usage_events (user_id, created_at DESC)`. | Persistent budget lookup. | Present and compatible. |
| `ai_usage_events_collection_id_created_at_idx` | `ai_usage_events (collection_id, created_at DESC)`. | Collection usage inspection. | Present and compatible. |

### RLS policy matrix

| Table/object | Required policies | Ownership condition | Audit result |
| --- | --- | --- | --- |
| `collections` | SELECT, INSERT, UPDATE, DELETE to `authenticated`. | SELECT/DELETE `auth.uid() = user_id`; INSERT `WITH CHECK auth.uid() = user_id`; UPDATE uses both. | Owner-isolated; no profile/membership dependency. |
| `documents` | SELECT, INSERT, UPDATE, DELETE to `authenticated`. | Direct `auth.uid() = user_id`; INSERT/UPDATE additionally require an owned `collections` row matching `collection_id`. | Owner-isolated and parent-scoped. |
| `document_chunks` | SELECT, INSERT, UPDATE, DELETE to `authenticated`. | Requires an owned `documents` row with matching `document_id` and `collection_id`; parent document user equals `auth.uid()`. | Owner-isolated and prevents document/collection mismatch. |
| `chat_messages` | SELECT, INSERT, DELETE to `authenticated`. | Direct `auth.uid() = user_id` plus owned matching collection. | Owner-isolated; no UPDATE needed by app. |
| `ai_usage_events` | SELECT, INSERT to `authenticated`. | `auth.uid() = user_id`; nullable collection must be owned when present. | Owner-isolated. |
| `storage.objects` | SELECT, INSERT, DELETE to `authenticated`. | Bucket `documents`; first path segment equals `auth.uid()`. | Matches app path `<user>/<collection>/<uuid>-<safe-filename>`; no public bucket policy. |

### Storage and RPC matrix

| Object | Exact contract | Dependents | Audit result |
| --- | --- | --- | --- |
| Storage bucket `documents` | ID/name `documents`, `public = false`. | Upload/download/remove in upload and process routes. | Upsert forces private; this is a deliberate security-tightening config change if a bucket already exists. |
| `storage.foldername(name)` | Managed Supabase helper used to inspect first path segment. | Storage policies. | Requires standard Supabase Storage schema. |
| `public.set_updated_at()` | `trigger` function, `security invoker`, `search_path = public`, sets `NEW.updated_at = now()`. | `set_collections_updated_at` trigger. | Correct; only collection `updated_at` behavior is required. |
| `public.match_document_chunks(vector(1024), uuid, uuid, integer)` | Stable SQL, `security invoker`, returns `id`, `document_id`, `collection_id`, `content`, `file_kind`, `location_label`, `metadata`, `page_number`, `chunk_index`, `similarity`; filters collection/user/ready/non-null embedding; cosine orders and limits. | `src/lib/search/retrieveChunks.ts:381`. | Compatible; audited migration revokes public execute and grants authenticated execute. |

## Safety findings

### Fixed before this audit was completed

- Removed the original `ALTER COLUMN embedding ... USING null::vector(1024)`, which could irreversibly discard all existing vectors.
- Removed the unconditional `DROP INDEX public.document_chunks_embedding_idx`.
- Added a transaction-aborting type guard for any existing embedding type other than `vector(1024)`.
- Added `pgcrypto`, explicit authenticated table/storage grants, authenticated-only RPC execution, and PostgREST schema reload.

### Remaining controlled risks

- `DROP POLICY IF EXISTS` replaces same-named policies on the five application tables and Storage. This is intentional for the Pliny policy names but can overwrite custom policies; preflight review is mandatory.
- `DROP TRIGGER IF EXISTS` replaces the same-named collections trigger. It is not data-destructive but can remove a custom trigger with that name.
- `CREATE OR REPLACE FUNCTION` can change an existing same-named function. The proposal defines the expected Pliny functions; review if the project is shared.
- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` do not reconcile an incompatible existing object. They avoid duplicate errors but may leave drift; preflight must detect and stop for mismatches.
- `ON CONFLICT ... SET public = false` changes an existing `documents` bucket to private. This is required by Pliny but can affect other consumers.
- Foreign-key cascades are intentional: deleting a user cascades collections, documents, chunks, chat messages, and usage events; deleting a collection cascades its relational children; deleting a document cascades chunks. Storage objects are not FK-linked, so collection/user deletion can leave orphaned private files. The app’s collection delete path does not remove Storage objects.
- There is no down migration. A transaction protects the apply operation from partial failure, but committed DDL, policy changes, grants, bucket visibility changes, and cascaded deletes require backup/manual restoration.

### Checks performed

| Check | Result |
| --- | --- |
| Destructive `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or data deletion | None found. |
| Destructive vector conversion | Removed; mismatch now aborts. |
| Permissive RLS (`USING (true)`) | None found. |
| Service-role/browser assumption | None; only public Supabase key and authenticated role. |
| Ownership column mismatch | None; app and schema use `user_id`. |
| Updated timestamp behavior | `collections.updated_at` has trigger; no app contract requires document `updated_at`. |
| Storage ownership | Path and policy both use first segment `auth.uid()`. |
| Missing grants | Explicit authenticated table/storage grants and RPC execute grant added. |
| Repeat execution | Safe on empty/matching schema; same-named custom objects and incompatible existing definitions require preflight review. |

## Read-only preflight SQL

The exact runnable preflight is [2026-08-29-foundational-schema-preflight.sql](</Users/sandman/Desktop/RAG intelligence/vector/supabase/manual-migrations/2026-08-29-foundational-schema-preflight.sql>). It must be run separately and does not mutate data or schema.

```sql
-- Pliny foundational schema preflight — READ ONLY.
-- Run this separately before applying
-- 2026-08-29-proposed-foundational-schema.sql.
-- It performs no INSERT, UPDATE, DELETE, DDL, policy, grant, or reload action.

-- 1. Required extensions and their schemas.
select
  extname as extension_name,
  extnamespace::regnamespace::text as installed_schema
from pg_extension
where extname in ('pgcrypto', 'vector')
order by extname;

-- 2. Required application tables and RLS posture.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'collections',
    'documents',
    'document_chunks',
    'chat_messages',
    'ai_usage_events'
  )
order by c.relname;

-- 3. Actual columns, types, nullability, and defaults.
select
  table_name,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'collections',
    'documents',
    'document_chunks',
    'chat_messages',
    'ai_usage_events'
  )
order by table_name, ordinal_position;

-- 4. Vector dimensions and embedding column type.
select
  c.relname as table_name,
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as actual_type
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'document_chunks'
  and a.attname = 'embedding'
  and not a.attisdropped;

-- 5. Primary keys, unique constraints, foreign keys, and checks.
select
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  case contype
    when 'p' then 'primary_key'
    when 'u' then 'unique'
    when 'f' then 'foreign_key'
    when 'c' then 'check'
    else contype::text
  end as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'public.collections',
    'public.documents',
    'public.document_chunks',
    'public.chat_messages',
    'public.ai_usage_events'
  )
order by table_name, constraint_type, constraint_name;

-- 6. Index definitions.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'collections',
    'documents',
    'document_chunks',
    'chat_messages',
    'ai_usage_events'
  )
order by tablename, indexname;

-- 7. Application RLS policies and exact ownership expressions.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'collections',
    'documents',
    'document_chunks',
    'chat_messages',
    'ai_usage_events'
  )
order by tablename, policyname;

-- 8. Explicit table grants for the authenticated role.
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and (
    (table_schema = 'public' and table_name in (
      'collections',
      'documents',
      'document_chunks',
      'chat_messages',
      'ai_usage_events'
    ))
    or (table_schema = 'storage' and table_name = 'objects')
  )
group by table_schema, table_name, grantee
order by table_schema, table_name;

-- 9. RPC/function definition, security mode, and execute grants.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  not p.prosecdef as security_invoker,
  pg_get_function_result(p.oid) as return_type,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'match_document_chunks')
order by p.proname, arguments;

-- 10. Required private Storage bucket.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'documents' or name = 'documents';

-- 11. Storage object policies and path ownership expressions.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- Manual interpretation gates before applying the proposal:
-- - A non-empty table with an incompatible shape requires manual review.
-- - An existing embedding type other than vector(1024) must be resolved
--   without silently discarding existing vectors.
-- - Existing custom policies, triggers, indexes, or Storage policies must be
--   reviewed before the proposal replaces same-named Pliny objects.
-- - The vector extension must be available to the SQL Editor role.
```

## Manual Supabase application procedure

1. Confirm the Supabase SQL Editor is connected to the same project represented by `NEXT_PUBLIC_SUPABASE_URL`; do not use the browser/service-role key.
2. Take a database backup or confirm the project is empty. Preserve the preflight output.
3. Run [the preflight SQL](</Users/sandman/Desktop/RAG intelligence/vector/supabase/manual-migrations/2026-08-29-foundational-schema-preflight.sql>).
4. If any required table exists with a conflicting shape, if custom same-named policies/triggers/indexes exist, if `embedding` is not `vector(1024)`, or if `vector` is unavailable, stop for manual review. Do not delete or null data to force compatibility.
5. For an empty/matching project, paste the exact contents of [the proposed migration](</Users/sandman/Desktop/RAG intelligence/vector/supabase/manual-migrations/2026-08-29-proposed-foundational-schema.sql>) into the SQL Editor and run it as one transaction.
6. If the vector extension cannot be created by the SQL Editor role, enable the approved Supabase `vector` extension manually, rerun preflight, and only then rerun the proposal.
7. Run the post-application verification queries below and retain their output.
8. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser and do not disable RLS.

## Post-application verification queries

Run the preflight again, then verify the following focused checks:

```sql
select table_name, rls_enabled
from (
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('collections','documents','document_chunks','chat_messages','ai_usage_events')
) objects
order by table_name;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('collections','documents','document_chunks','chat_messages','ai_usage_events'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select table_schema, table_name, has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'SELECT') as can_select,
       has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'INSERT') as can_insert
from (values
  ('public','collections'), ('public','documents'), ('public','document_chunks'),
  ('public','chat_messages'), ('public','ai_usage_events'), ('storage','objects')
) required(table_schema, table_name);

select id, name, public from storage.buckets where id = 'documents';

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       not p.prosecdef as security_invoker,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_document_chunks';
```

Expected results: all five public tables exist with `rls_enabled = true`; authenticated has required table privileges; the documents bucket is private; the RPC is security invoker, executable by authenticated, and not executable by anon; policies contain owner/parent checks rather than unconditional access.

## Rollback limitations

- The migration is transactional, so a statement failure should roll back that run.
- There is no automatic down migration.
- Do not roll back by dropping tables: that would destroy workspace, document, chunk, chat, and usage data.
- Restoring a backup is the only reliable rollback for committed schema/data changes. Policy and grant restoration must use the prior definitions captured by preflight.
- Storage objects are independent of relational cascades; any orphan cleanup requires a separately reviewed Storage operation.

## Local validation results

| Command | Result | Notes |
| --- | --- | --- |
| `git diff --check` | PASS | No whitespace errors. |
| `npm run lint` | PASS | Completed with the existing source tree. |
| `npx tsc --noEmit` | PASS | A concurrent first attempt raced with `.next/types` regeneration; the serialized rerun passed. |
| `npm run build` | PASS | Production build completed successfully. |
| `npm run eval` | PASS | 14/14 automated evaluations; live Supabase/Voyage/Anthropic flow not run. |
| `npm run test:citations` | PASS | Citation validation tests passed. |
| `npm run test:report` | PASS | Risk/evidence report tests passed. |

## Application regression checklist

After approved application and verification:

- Log in through the local Pliny UI; confirm the dashboard workspace SELECT succeeds.
- Create one dedicated QA workspace; confirm workspace INSERT succeeds and the new row’s `user_id` is the logged-in user.
- Confirm a second user cannot list or open the first user’s workspace, documents, chunks, chat messages, usage events, or Storage prefix.
- Upload `Claude.pdf`; confirm Storage upload and `documents` INSERT succeed.
- Process it; confirm document ownership lookup, chunk delete/insert, and ready-status update succeed.
- Run two factual questions, one synthesis question, one citation-verification question, and one unanswerable question.
- Confirm grounded citations, evidence inspector, insufficient-evidence behavior, chart/report generation where supported, and Markdown/transcript export.
- Confirm the mobile evidence sheet and no cross-user evidence leakage.
- Keep paid generation calls within the existing eight-call limit.

## Audit result

**Final audited migration: SAFE TO APPLY AS WRITTEN for an empty or schema-matching Supabase project, with mandatory preflight and manual review of any existing same-named objects.** The live project remains blocked until an authorized operator applies the SQL remotely; this audit did not apply it.
