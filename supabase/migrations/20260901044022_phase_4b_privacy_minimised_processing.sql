-- Phase 4B proposal only. Do not apply remotely before review.
-- Existing documents and messages remain standard mode by explicit backfill/default.

alter table public.collections
  add column if not exists default_processing_mode text not null default 'standard';

alter table public.documents
  add column if not exists processing_mode text not null default 'standard',
  add column if not exists privacy_policy_version text;

alter table public.document_chunks
  add column if not exists provider_safe_content text,
  add column if not exists provider_safe_metadata jsonb,
  add column if not exists privacy_policy_version text,
  add column if not exists embedding_projection text not null default 'original';

alter table public.chat_messages
  add column if not exists processing_mode text not null default 'standard',
  add column if not exists provider_safe_content text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'collections_default_processing_mode_check'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections add constraint collections_default_processing_mode_check
      check (default_processing_mode in ('standard', 'privacy_minimised'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_processing_mode_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents add constraint documents_processing_mode_check
      check (processing_mode in ('standard', 'privacy_minimised'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_privacy_policy_version_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents add constraint documents_privacy_policy_version_check
      check (
        (processing_mode = 'standard' and privacy_policy_version is null)
        or
        (processing_mode = 'privacy_minimised' and char_length(btrim(privacy_policy_version)) > 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'document_chunks_embedding_projection_check'
      and conrelid = 'public.document_chunks'::regclass
  ) then
    alter table public.document_chunks add constraint document_chunks_embedding_projection_check
      check (embedding_projection in ('original', 'privacy_minimised'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'document_chunks_privacy_projection_check'
      and conrelid = 'public.document_chunks'::regclass
  ) then
    alter table public.document_chunks add constraint document_chunks_privacy_projection_check
      check (
        (embedding_projection = 'original' and provider_safe_content is null and privacy_policy_version is null)
        or
        (
          embedding_projection = 'privacy_minimised'
          and char_length(btrim(provider_safe_content)) > 0
          and provider_safe_metadata is not null
          and char_length(btrim(privacy_policy_version)) > 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_messages_processing_mode_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages add constraint chat_messages_processing_mode_check
      check (processing_mode in ('standard', 'privacy_minimised'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_messages_privacy_projection_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages add constraint chat_messages_privacy_projection_check
      check (
        processing_mode = 'standard'
        or char_length(btrim(provider_safe_content)) > 0
      );
  end if;
end $$;

alter table public.document_chunks
  add column if not exists provider_safe_lexical_search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(provider_safe_metadata ->> 'headingPath', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(provider_safe_metadata ->> 'locationLabel', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(provider_safe_content, '')), 'C')
  ) stored;

create index if not exists document_chunks_provider_safe_lexical_search_idx
  on public.document_chunks using gin (provider_safe_lexical_search)
  where embedding_projection = 'privacy_minimised';

create or replace function public.enforce_document_processing_mode_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.processing_mode is distinct from old.processing_mode
    or new.privacy_policy_version is distinct from old.privacy_policy_version then
    raise exception using
      errcode = '22023',
      message = 'Document processing mode is immutable; use an explicit reprocessing operation.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_document_processing_mode_immutable() from public;
revoke execute on function public.enforce_document_processing_mode_immutable() from anon, authenticated, service_role;

drop trigger if exists enforce_document_processing_mode_immutable on public.documents;
create trigger enforce_document_processing_mode_immutable
  before update of processing_mode, privacy_policy_version on public.documents
  for each row
  execute function public.enforce_document_processing_mode_immutable();

create or replace function public.match_document_chunks_lexical_by_mode(
  match_query text,
  match_collection_id uuid,
  match_processing_mode text,
  match_document_id uuid default null,
  match_user_id uuid default null,
  match_count integer default 10
)
returns table (
  id uuid,
  document_id uuid,
  collection_id uuid,
  content text,
  provider_safe_content text,
  provider_safe_metadata jsonb,
  processing_mode text,
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
    dc.provider_safe_content,
    dc.provider_safe_metadata,
    d.processing_mode,
    dc.file_kind,
    dc.location_label,
    dc.metadata,
    dc.page_number,
    dc.chunk_index,
    (
      case
        when match_processing_mode = 'privacy_minimised'
          then ts_rank_cd(dc.provider_safe_lexical_search, query.terms, 32)
        else ts_rank_cd(dc.lexical_search, query.terms, 32)
      end
      + case
          when match_processing_mode = 'standard'
            and to_tsvector('simple', d.filename) @@ query.terms then 0.25
          else 0
        end
    )::real as lexical_rank
  from public.document_chunks dc
  join public.documents d
    on d.id = dc.document_id
   and d.collection_id = dc.collection_id
  cross join query
  where dc.collection_id = match_collection_id
    and d.processing_mode = match_processing_mode
    and match_processing_mode in ('standard', 'privacy_minimised')
    and (match_document_id is null or dc.document_id = match_document_id)
    and match_user_id = (select auth.uid())
    and d.user_id = (select auth.uid())
    and d.status = 'ready'
    and (
      (
        match_processing_mode = 'privacy_minimised'
        and dc.provider_safe_lexical_search @@ query.terms
      )
      or
      (
        match_processing_mode = 'standard'
        and (dc.lexical_search @@ query.terms or to_tsvector('simple', d.filename) @@ query.terms)
      )
    )
  order by lexical_rank desc, dc.document_id, dc.chunk_index
  limit least(greatest(match_count, 1), 30);
$$;

revoke all on function public.match_document_chunks_lexical_by_mode(text, uuid, text, uuid, uuid, integer) from public;
revoke execute on function public.match_document_chunks_lexical_by_mode(text, uuid, text, uuid, uuid, integer) from anon, service_role;
grant execute on function public.match_document_chunks_lexical_by_mode(text, uuid, text, uuid, uuid, integer) to authenticated;
