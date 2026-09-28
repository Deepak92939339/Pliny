-- WP5 (audit-r1, PLN-006): duplicate-upload detection.
-- Adds content_sha256 to documents (nullable — existing rows stay valid) and
-- an index for the per-collection duplicate lookup. RLS is unchanged.

alter table public.documents
  add column if not exists content_sha256 text;

create index if not exists documents_collection_content_sha256_idx
  on public.documents (collection_id, content_sha256);
