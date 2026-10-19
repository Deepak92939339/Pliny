-- Direct browser-to-Storage uploads (signed upload URLs) and the processing watchdog.
--
-- 1. documents.status gains 'awaiting_upload': the row exists, the browser has a
--    signed URL, but the object has not been confirmed by /api/documents/{id}/process.
-- 2. documents.processing_stage_updated_at records the last time the stage or status
--    moved. The watchdog uses it to find documents that stopped advancing.
-- 3. documents.upload_expired_at marks rows that were failed because the upload never
--    completed, so a second cleanup pass can remove late-arriving objects after the
--    signed upload URL (valid for 2 hours) can no longer be used.
-- 4. The private 'documents' bucket gets a hard 15 MiB object size limit enforced by
--    Storage itself, independent of the size the browser declares.
-- 5. The own-prefix Storage policies are re-asserted. There is intentionally no
--    UPDATE policy, so objects cannot be overwritten with upsert.

do $$
declare
  existing record;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mstatus\M'
      and pg_get_constraintdef(oid) !~* 'processing_stage'
  loop
    execute format('alter table public.documents drop constraint %I', existing.conname);
  end loop;
end $$;

alter table public.documents
  add constraint documents_status_check
  check (status in ('awaiting_upload', 'processing', 'ready', 'failed'));

alter table public.documents
  add column if not exists processing_stage_updated_at timestamptz not null default now();

alter table public.documents
  add column if not exists upload_expired_at timestamptz;

create or replace function public.touch_document_processing_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.processing_stage is distinct from old.processing_stage
     or new.status is distinct from old.status then
    new.processing_stage_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists documents_touch_processing_stage on public.documents;
create trigger documents_touch_processing_stage
  before update on public.documents
  for each row
  execute function public.touch_document_processing_stage();

create index if not exists documents_unfinished_stage_updated_idx
  on public.documents (processing_stage_updated_at)
  where status in ('awaiting_upload', 'processing');

create index if not exists documents_upload_expired_idx
  on public.documents (upload_expired_at)
  where upload_expired_at is not null;

-- The scheduled maintenance job (src/app/api/cron/maintenance) has no user session and runs
-- with the service role. It needs exactly this much and nothing more: it reads and updates
-- document lifecycle columns; chunk and chat tables stay unreachable to it.
grant usage on schema public to service_role;
grant select, update on table public.documents to service_role;

update storage.buckets
set public = false,
    file_size_limit = 15728640
where id = 'documents';

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
