-- Pliny RLS verification script
-- Run this manually in the Supabase SQL Editor after applying schema.sql.
-- These checks report the active database posture; they do not replace manual cross-user testing.

-- 1. Confirm RLS is enabled on application tables.
select
  n.nspname as schema,
  c.relname as table,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'collections',
    'documents',
    'document_chunks',
    'chat_messages',
    'ai_usage_events'
  )
order by c.relname;

-- 2. List application table policies.
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

-- 3. Check indexes that support ownership filters and ordered queries.
select
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

-- 4. List Storage policies for the private documents bucket.
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- Manual cross-user tests before public deployment:
-- - Unauthenticated anon requests should return no rows from public application tables.
-- - User A should not read, update, or delete User B rows.
-- - User A should not query chunks, chat messages, or usage events for User B collections.
-- - User B must not list User A's storage prefix.
-- - User B must not download User A's storage object.
-- - Unauthenticated requests must not list private bucket contents.
-- - The documents bucket should remain private.

-- 5. Phase 4B privacy columns must exist without changing vector(1024).
select
  table_name,
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'collections' and column_name = 'default_processing_mode')
    or (table_name = 'documents' and column_name in ('processing_mode', 'privacy_policy_version'))
    or (table_name = 'document_chunks' and column_name in ('provider_safe_content', 'provider_safe_metadata', 'embedding_projection'))
    or (table_name = 'chat_messages' and column_name in ('processing_mode', 'provider_safe_content'))
  )
order by table_name, column_name;

select format_type(atttypid, atttypmod) as embedding_type
from pg_attribute
where attrelid = 'public.document_chunks'::regclass
  and attname = 'embedding'
  and not attisdropped;

-- 6. Privacy functions remain invoker-rights and anon has no execute grant.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'enforce_document_processing_mode_immutable',
    'match_document_chunks_lexical_by_mode'
  )
order by p.proname;

-- Manual Phase 4B checks after a reviewed local apply:
-- - Existing documents read as processing_mode = 'standard' with no privacy policy version.
-- - Updating a document processing_mode or privacy_policy_version is rejected.
-- - Changing collections.default_processing_mode does not update any existing document row.
-- - User A cannot read User B original or provider-safe chunk projections.
-- - anon cannot execute match_document_chunks_lexical_by_mode.
