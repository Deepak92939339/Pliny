create or replace function public.match_document_chunks_for_document(
  query_embedding vector(1024),
  match_collection_id uuid,
  match_document_id uuid,
  match_user_id uuid,
  match_count integer default 5
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
  join public.documents d
    on d.id = dc.document_id
   and d.collection_id = dc.collection_id
  where dc.collection_id = match_collection_id
    and dc.document_id = match_document_id
    and d.user_id = match_user_id
    and match_user_id = (select auth.uid())
    and d.status = 'ready'
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_document_chunks_for_document(vector(1024), uuid, uuid, uuid, integer) from public;
revoke execute on function public.match_document_chunks_for_document(vector(1024), uuid, uuid, uuid, integer) from anon;
grant execute on function public.match_document_chunks_for_document(vector(1024), uuid, uuid, uuid, integer) to authenticated;
