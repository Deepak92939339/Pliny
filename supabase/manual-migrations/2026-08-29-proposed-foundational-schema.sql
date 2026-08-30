-- PROPOSED ONLY — do not apply without explicit approval.
-- Root cause evidence (2026-08-29): the configured Supabase project returns
-- PGRST205 for public.collections and public.documents because the foundational
-- application schema is absent from the PostgREST schema cache.
--
-- This is the existing reviewed Pliny schema, made idempotent for SQL Editor
-- application. It creates the required tables, explicit authenticated grants,
-- owner-scoped RLS policies, and private documents Storage policies. No policy
-- uses USING (true), and no service-role credential is involved.

begin;

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists collections_user_id_created_at_idx
  on public.collections (user_id, created_at desc);

alter table public.collections enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_collections_updated_at on public.collections;

create trigger set_collections_updated_at
  before update on public.collections
  for each row
  execute function public.set_updated_at();

drop policy if exists "Users can select own collections" on public.collections;
drop policy if exists "Users can insert own collections" on public.collections;
drop policy if exists "Users can update own collections" on public.collections;
drop policy if exists "Users can delete own collections" on public.collections;

create policy "Users can select own collections"
  on public.collections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own collections"
  on public.collections
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own collections"
  on public.collections
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own collections"
  on public.collections
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.collections(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null check (char_length(btrim(filename)) > 0),
  storage_path text not null check (char_length(btrim(storage_path)) > 0),
  page_count integer not null default 0 check (page_count >= 0),
  file_size integer not null default 0 check (file_size >= 0),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz default now() not null
);

create index if not exists documents_user_id_created_at_idx
  on public.documents (user_id, created_at desc);

create index if not exists documents_collection_id_created_at_idx
  on public.documents (collection_id, created_at desc);

create unique index if not exists documents_storage_path_key
  on public.documents (storage_path);

alter table public.documents enable row level security;

drop policy if exists "Users can select own documents" on public.documents;
drop policy if exists "Users can insert own documents" on public.documents;
drop policy if exists "Users can update own documents" on public.documents;
drop policy if exists "Users can delete own documents" on public.documents;

create policy "Users can select own documents"
  on public.documents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own documents"
  on public.documents
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.collections
      where collections.id = documents.collection_id
        and collections.user_id = (select auth.uid())
    )
  );

create policy "Users can update own documents"
  on public.documents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.collections
      where collections.id = documents.collection_id
        and collections.user_id = (select auth.uid())
    )
  );

create policy "Users can delete own documents"
  on public.documents
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update
set public = false;

drop policy if exists "Users can read own document files" on storage.objects;
drop policy if exists "Users can upload own document files" on storage.objects;
drop policy if exists "Users can delete own document files" on storage.objects;

create policy "Users can read own document files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload own document files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete own document files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  collection_id uuid references public.collections(id) on delete cascade not null,
  content text not null check (char_length(btrim(content)) > 0),
  page_number integer not null default 1 check (page_number >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  file_kind text not null default 'pdf',
  location_label text not null default 'Source passage',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1024),
  embedding_model text,
  embedding_created_at timestamptz,
  created_at timestamptz default now() not null
);

-- Voyage embeddings use 1024 dimensions by default. If this column was
-- previously created for another provider, stop and resolve the mismatch
-- manually. Existing vectors must not be nulled implicitly.
do $$
declare
  embedding_type text;
begin
  select format_type(atttypid, atttypmod)
    into embedding_type
  from pg_attribute
  where attrelid = 'public.document_chunks'::regclass
    and attname = 'embedding'
    and not attisdropped;

  if embedding_type is not null and embedding_type <> 'vector(1024)' then
    raise exception 'Existing public.document_chunks.embedding has type %, expected vector(1024); resolve manually before applying Pliny migration', embedding_type;
  end if;
end $$;

alter table public.document_chunks
  add column if not exists embedding vector(1024);

alter table public.document_chunks
  add column if not exists embedding_model text;

alter table public.document_chunks
  add column if not exists embedding_created_at timestamptz;

alter table public.document_chunks
  add column if not exists file_kind text not null default 'pdf';

alter table public.document_chunks
  add column if not exists location_label text not null default 'Source passage';

alter table public.document_chunks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists document_chunks_document_id_chunk_index_idx
  on public.document_chunks (document_id, chunk_index);

create index if not exists document_chunks_collection_id_idx
  on public.document_chunks (collection_id);

create index if not exists document_chunks_collection_page_chunk_idx
  on public.document_chunks (collection_id, page_number, chunk_index);

create index if not exists document_chunks_collection_kind_idx
  on public.document_chunks (collection_id, file_kind);

create unique index if not exists document_chunks_document_id_chunk_index_key
  on public.document_chunks (document_id, chunk_index);

create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

alter table public.document_chunks enable row level security;

drop policy if exists "Users can select own document chunks" on public.document_chunks;
drop policy if exists "Users can insert own document chunks" on public.document_chunks;
drop policy if exists "Users can update own document chunks" on public.document_chunks;
drop policy if exists "Users can delete own document chunks" on public.document_chunks;

create policy "Users can select own document chunks"
  on public.document_chunks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.documents
      where documents.id = document_chunks.document_id
        and documents.collection_id = document_chunks.collection_id
        and documents.user_id = (select auth.uid())
    )
  );

create policy "Users can insert own document chunks"
  on public.document_chunks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.documents
      where documents.id = document_chunks.document_id
        and documents.collection_id = document_chunks.collection_id
        and documents.user_id = (select auth.uid())
    )
  );

create policy "Users can update own document chunks"
  on public.document_chunks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.documents
      where documents.id = document_chunks.document_id
        and documents.collection_id = document_chunks.collection_id
        and documents.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.documents
      where documents.id = document_chunks.document_id
        and documents.collection_id = document_chunks.collection_id
        and documents.user_id = (select auth.uid())
    )
  );

create policy "Users can delete own document chunks"
  on public.document_chunks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.documents
      where documents.id = document_chunks.document_id
        and documents.collection_id = document_chunks.collection_id
        and documents.user_id = (select auth.uid())
    )
  );

create or replace function public.match_document_chunks(
  query_embedding vector(1024),
  match_collection_id uuid,
  match_user_id uuid,
  match_count int default 20
)
returns table (
  id uuid,
  document_id uuid,
  collection_id uuid,
  content text,
  file_kind text,
  location_label text,
  metadata jsonb,
  page_number integer,
  chunk_index integer,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    dc.id,
    dc.document_id,
    dc.collection_id,
    dc.content,
    dc.file_kind,
    dc.location_label,
    dc.metadata,
    dc.page_number,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.collection_id = match_collection_id
    and d.user_id = match_user_id
    and d.status = 'ready'
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.collections(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) > 0),
  citations jsonb,
  created_at timestamptz default now() not null
);

create index if not exists chat_messages_collection_id_created_at_idx
  on public.chat_messages (collection_id, created_at);

create index if not exists chat_messages_user_id_created_at_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "Users can select own chat messages" on public.chat_messages;
drop policy if exists "Users can insert own chat messages" on public.chat_messages;
drop policy if exists "Users can delete own chat messages" on public.chat_messages;

create policy "Users can select own chat messages"
  on public.chat_messages
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.collections
      where collections.id = chat_messages.collection_id
        and collections.user_id = (select auth.uid())
    )
  );

create policy "Users can insert own chat messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.collections
      where collections.id = chat_messages.collection_id
        and collections.user_id = (select auth.uid())
    )
  );

create policy "Users can delete own chat messages"
  on public.chat_messages
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.collections
      where collections.id = chat_messages.collection_id
        and collections.user_id = (select auth.uid())
    )
  );

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  collection_id uuid references public.collections(id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric,
  status text not null check (status in ('success', 'blocked', 'failed')),
  reason text,
  created_at timestamptz default now() not null
);

create index if not exists ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_collection_id_created_at_idx
  on public.ai_usage_events (collection_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can select own AI usage events" on public.ai_usage_events;
drop policy if exists "Users can insert own AI usage events" on public.ai_usage_events;

create policy "Users can select own AI usage events"
  on public.ai_usage_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own AI usage events"
  on public.ai_usage_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      collection_id is null
      or exists (
        select 1
        from public.collections
        where collections.id = ai_usage_events.collection_id
          and collections.user_id = (select auth.uid())
      )
    )
  );

-- Make the intended API table privileges explicit. RLS remains the row-level
-- boundary; these grants do not expose rows to anon or bypass ownership checks.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on table public.collections, public.documents, public.document_chunks,
             public.chat_messages, public.ai_usage_events
  to authenticated;

grant usage on schema storage to authenticated;
grant select, insert, delete on table storage.objects to authenticated;

revoke all on function public.match_document_chunks(vector(1024), uuid, uuid, integer) from public;
grant execute on function public.match_document_chunks(vector(1024), uuid, uuid, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
