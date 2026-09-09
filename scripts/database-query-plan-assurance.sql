begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('90909090-9090-4090-8090-909090909090', 'authenticated', 'authenticated', 'query-plan@example.test', now(), now());

insert into public.collections (id, user_id, name)
values ('91919191-9191-4191-8191-919191919191', '90909090-9090-4090-8090-909090909090', 'Synthetic query-plan corpus');

insert into public.documents (id, collection_id, user_id, filename, storage_path, status, processing_stage)
values (
  '92929292-9292-4292-8292-929292929292',
  '91919191-9191-4191-8191-919191919191',
  '90909090-9090-4090-8090-909090909090',
  'synthetic-query-plan.txt',
  '90909090-9090-4090-8090-909090909090/synthetic-query-plan.txt',
  'ready',
  'ready'
);

insert into public.document_chunks (
  document_id, collection_id, content, page_number, chunk_index,
  file_kind, location_label, metadata, embedding, embedding_model, embedding_created_at
)
select
  '92929292-9292-4292-8292-929292929292',
  '91919191-9191-4191-8191-919191919191',
  case
    when n = 42 then 'Synthetic query-plan passage 42 contains rareheliotrope evidence and no real data.'
    else 'Synthetic query-plan passage ' || n || ' contains beacon calibration evidence and no real data.'
  end,
  1,
  n,
  'text',
  'Chunk ' || (n + 1),
  case
    when n = 0 then '{}'::jsonb
    when n = 1 then '{"optionalProperty":null}'::jsonb
    when n = 2 then jsonb_build_object('boundedNote', repeat('m', 8192))
    else jsonb_build_object('syntheticIndex', n)
  end,
  ('[' || array_to_string(array_fill(((n % 17) + 1)::real / 100, array[1024]), ',') || ']')::vector(1024),
  'synthetic-no-provider',
  now()
from generate_series(0, 4999) n;

analyze public.document_chunks;

select 'LEXICAL_PLAN_BEGIN' as marker;
explain (analyze, buffers, format json)
select id
from public.document_chunks
where collection_id = '91919191-9191-4191-8191-919191919191'
  and lexical_search @@ websearch_to_tsquery('simple', 'beacon OR calibration')
order by ts_rank_cd(lexical_search, websearch_to_tsquery('simple', 'beacon OR calibration'), 32) desc
limit 5;
select 'LEXICAL_PLAN_END' as marker;

select 'SELECTIVE_LEXICAL_PLAN_BEGIN' as marker;
explain (analyze, buffers, format json)
select id
from public.document_chunks
where collection_id = '91919191-9191-4191-8191-919191919191'
  and lexical_search @@ websearch_to_tsquery('simple', 'rareheliotrope')
order by ts_rank_cd(lexical_search, websearch_to_tsquery('simple', 'rareheliotrope'), 32) desc
limit 5;
select 'SELECTIVE_LEXICAL_PLAN_END' as marker;

select 'VECTOR_PLAN_BEGIN' as marker;
explain (analyze, buffers, format json)
select id
from public.document_chunks
where collection_id = '91919191-9191-4191-8191-919191919191'
  and embedding is not null
order by embedding <=> ('[' || array_to_string(array_fill(0.05::real, array[1024]), ',') || ']')::vector(1024)
limit 5;
select 'VECTOR_PLAN_END' as marker;

select
  count(*) as synthetic_rows,
  pg_size_pretty(pg_relation_size('public.document_chunks_embedding_idx')) as vector_index_size,
  pg_size_pretty(pg_relation_size('public.document_chunks_lexical_search_idx')) as lexical_index_size
from public.document_chunks
where collection_id = '91919191-9191-4191-8191-919191919191';

rollback;
