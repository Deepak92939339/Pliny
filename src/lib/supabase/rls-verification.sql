-- Vector RLS verification script
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
