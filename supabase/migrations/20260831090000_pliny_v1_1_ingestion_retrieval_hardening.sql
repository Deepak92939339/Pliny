-- Materializing a stored tsvector for existing chunks can require more than
-- the project's 32 MB default. Keep the bounded increase inside this
-- migration transaction; it is rolled back with the migration on failure.
set local maintenance_work_mem = '64MB';

alter table public.documents
  add column if not exists processing_stage text;

alter table public.documents
  add column if not exists processing_started_at timestamptz;

update public.documents
set processing_stage = case status
  when 'ready' then 'ready'
  when 'failed' then 'failed'
  else 'uploading'
end
where processing_stage is null;

alter table public.documents
  alter column processing_stage set default 'uploading',
  alter column processing_stage set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_processing_stage_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents add constraint documents_processing_stage_check
      check (processing_stage in ('validating', 'uploading', 'extracting', 'ocr_fallback', 'chunking', 'embedding', 'indexing', 'ready', 'failed'));
  end if;
end $$;

alter table public.document_chunks
  add column if not exists lexical_search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(metadata ->> 'filename', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(metadata ->> 'headingPath', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(metadata ->> 'locationLabel', '')), 'B') ||
    setweight(to_tsvector('simple', content), 'C')
  ) stored;

create index if not exists document_chunks_lexical_search_idx
  on public.document_chunks using gin (lexical_search);

create or replace function public.match_document_chunks_lexical(
  match_query text,
  match_collection_id uuid,
  match_document_id uuid default null,
  match_user_id uuid default null,
  match_count integer default 10
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
  lexical_rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with query as (
    select websearch_to_tsquery('simple', left(match_query, 500)) as terms
  )
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
    (
      ts_rank_cd(dc.lexical_search, query.terms, 32) +
      case when to_tsvector('simple', d.filename) @@ query.terms then 0.25 else 0 end
    )::real as lexical_rank
  from public.document_chunks dc
  join public.documents d
    on d.id = dc.document_id
   and d.collection_id = dc.collection_id
  cross join query
  where dc.collection_id = match_collection_id
    and (match_document_id is null or dc.document_id = match_document_id)
    and match_user_id = (select auth.uid())
    and d.user_id = (select auth.uid())
    and d.status = 'ready'
    and (dc.lexical_search @@ query.terms or to_tsvector('simple', d.filename) @@ query.terms)
  order by lexical_rank desc, dc.document_id, dc.chunk_index
  limit least(greatest(match_count, 1), 30);
$$;

revoke all on function public.match_document_chunks_lexical(text, uuid, uuid, uuid, integer) from public;
revoke execute on function public.match_document_chunks_lexical(text, uuid, uuid, uuid, integer) from anon;
grant execute on function public.match_document_chunks_lexical(text, uuid, uuid, uuid, integer) to authenticated;
