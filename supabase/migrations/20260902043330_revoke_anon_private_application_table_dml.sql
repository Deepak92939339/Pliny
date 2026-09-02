revoke select, insert, update, delete
on table
  public.collections,
  public.documents,
  public.document_chunks,
  public.chat_messages
from anon;
