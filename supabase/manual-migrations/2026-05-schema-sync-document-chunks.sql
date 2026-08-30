-- Pliny AI manual schema sync for document chunk metadata.
-- Safe to run in Supabase SQL Editor. Additive/idempotent where possible.
-- Root cause fixed: live PostgREST schema did not expose document_chunks.file_kind.

create extension if not exists vector;

alter table public.document_chunks
  add column if not exists file_kind text not null default 'pdf';

alter table public.document_chunks
  add column if not exists location_label text not null default 'Source passage';

alter table public.document_chunks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.document_chunks
  add column if not exists embedding vector(1024);

alter table public.document_chunks
  add column if not exists embedding_model text;

alter table public.document_chunks
  add column if not exists embedding_created_at timestamptz;

create index if not exists document_chunks_collection_kind_idx
  on public.document_chunks (collection_id, file_kind);

create index if not exists document_chunks_document_id_chunk_index_idx
  on public.document_chunks (document_id, chunk_index);

create index if not exists document_chunks_collection_id_idx
  on public.document_chunks (collection_id);

create index if not exists document_chunks_collection_page_chunk_idx
  on public.document_chunks (collection_id, page_number, chunk_index);

create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

drop function if exists public.match_document_chunks(vector(1024), uuid, uuid, int);

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

notify pgrst, 'reload schema';
