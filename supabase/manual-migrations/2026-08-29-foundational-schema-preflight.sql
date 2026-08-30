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
