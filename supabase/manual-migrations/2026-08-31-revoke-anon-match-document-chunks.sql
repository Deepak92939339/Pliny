-- Keep the semantic retrieval RPC authenticated-only.
-- The function remains security invoker and owner-scoped through its query.
revoke execute on function public.match_document_chunks(vector(1024), uuid, uuid, integer) from anon;
grant execute on function public.match_document_chunks(vector(1024), uuid, uuid, integer) to authenticated;

notify pgrst, 'reload schema';
