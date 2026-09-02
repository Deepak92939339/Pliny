begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

-- Fixed synthetic tenant identities; no real user or document data is used.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner-one@example.test', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'owner-two@example.test', now(), now());

-- Catalog, generated-column, index, vector, trigger, and function witnesses.
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'collections' and column_name = 'default_processing_mode' and column_default = '''standard''::text' and is_nullable = 'NO'),
  'collections.default_processing_mode exists with a non-null standard default'
);
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'processing_mode' and column_default = '''standard''::text' and is_nullable = 'NO'),
  'documents.processing_mode exists with a non-null standard default'
);
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'privacy_policy_version'),
  'documents privacy policy version exists'
);
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'document_chunks' and column_name = 'privacy_policy_version'),
  'chunk privacy policy version exists'
);
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'provider_safe_content'),
  'masked chat/export projection exists'
);
select extensions.is(
  (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.document_chunks'::regclass and attname = 'embedding' and not attisdropped),
  'vector(1024)',
  'embedding remains vector(1024)'
);
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'document_chunks' and column_name = 'provider_safe_lexical_search' and is_generated = 'ALWAYS'),
  'provider-safe lexical column is generated'
);
select extensions.ok(
  exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'document_chunks_provider_safe_lexical_search_idx'
      and i.indisvalid and i.indisready
      and pg_get_expr(i.indpred, i.indrelid) = '(embedding_projection = ''privacy_minimised''::text)'
  ),
  'partial provider-safe GIN index is valid and ready'
);
select extensions.ok(
  not (select p.prosecdef from pg_proc p where p.oid = 'public.enforce_document_processing_mode_immutable()'::regprocedure),
  'immutability trigger function is SECURITY INVOKER'
);
select extensions.ok(
  (select p.proconfig = array['search_path=""']::text[] from pg_proc p where p.oid = 'public.enforce_document_processing_mode_immutable()'::regprocedure),
  'immutability trigger function has an empty search_path'
);
select extensions.ok(
  not (select p.prosecdef from pg_proc p where p.oid = 'public.match_document_chunks_lexical_by_mode(text,uuid,text,uuid,uuid,integer)'::regprocedure),
  'mode-aware lexical function is SECURITY INVOKER'
);
select extensions.ok(
  (select p.proconfig = array['search_path=public']::text[] from pg_proc p where p.oid = 'public.match_document_chunks_lexical_by_mode(text,uuid,text,uuid,uuid,integer)'::regprocedure)
  and not has_schema_privilege('authenticated', 'public', 'CREATE')
  and not has_schema_privilege('anon', 'public', 'CREATE'),
  'mode-aware lexical function search_path cannot be shadowed by API roles'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.enforce_document_processing_mode_immutable()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enforce_document_processing_mode_immutable()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.enforce_document_processing_mode_immutable()', 'EXECUTE'),
  'trigger function is not directly executable by API roles'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.match_document_chunks_lexical_by_mode(text,uuid,text,uuid,uuid,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.match_document_chunks_lexical_by_mode(text,uuid,text,uuid,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.match_document_chunks_lexical_by_mode(text,uuid,text,uuid,uuid,integer)', 'EXECUTE'),
  'mode-aware lexical RPC is authenticated-only and has no service-role dependency'
);
select extensions.ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.documents'::regclass and tgname = 'enforce_document_processing_mode_immutable' and tgenabled = 'O'),
  'document immutability trigger is enabled'
);
select extensions.ok(
  (select count(*) = 4 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('collections','documents','document_chunks','chat_messages') and c.relrowsecurity),
  'RLS is enabled on all Phase 4B tables'
);
select extensions.ok(
  (select count(*) = 2 from pg_policies where schemaname = 'public' and tablename in ('collections','documents') and cmd = 'UPDATE' and qual is not null and with_check is not null),
  'collection and document UPDATE policies have USING and WITH CHECK'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.collections', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API DML privileges on collections'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.documents', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API DML privileges on documents'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.document_chunks', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API DML privileges on document_chunks'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.chat_messages', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API DML privileges on chat_messages'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.collections', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.documents', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.document_chunks', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.chat_messages', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated has the existing table DML grants gated by RLS'
);

-- Tenant one creates a workspace in standard mode, then captures one standard
-- document before changing the default and one privacy document afterwards.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

insert into public.collections (id, user_id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'Mixed synthetic workspace');

insert into public.documents (
  id, collection_id, user_id, filename, storage_path, status, processing_stage,
  processing_mode, privacy_policy_version
)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', id,
  '11111111-1111-4111-8111-111111111111',
  'Rahul-Kapoor-standard.pdf',
  '11111111-1111-4111-8111-111111111111/standard.pdf',
  'ready', 'ready', default_processing_mode, null
from public.collections
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

update public.collections
set default_processing_mode = 'privacy_minimised'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

insert into public.documents (
  id, collection_id, user_id, filename, storage_path, status, processing_stage,
  processing_mode, privacy_policy_version
)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', id,
  '11111111-1111-4111-8111-111111111111',
  'Asha-Mehta-private.pdf',
  '11111111-1111-4111-8111-111111111111/privacy.pdf',
  'ready', 'ready', default_processing_mode, 'deterministic-v1'
from public.collections
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

insert into public.document_chunks (
  id, document_id, collection_id, content, page_number, chunk_index,
  file_kind, location_label, metadata, provider_safe_content,
  provider_safe_metadata, privacy_policy_version, embedding_projection
)
values
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Rahul Kapoor works at Standard Analytics. Contact rahul.kapoor@example.test.',
    1, 0, 'pdf', 'Page 1',
    '{"filename":"Rahul-Kapoor-standard.pdf","headingPath":"Standard profile","locationLabel":"Page 1"}',
    null, null, null, 'original'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Asha Mehta at Prism Systems, asha.mehta@example.test, +91 98765 43210, account ACCT-00918872, card 4111 1111 1111 1111, 42 Lake View Road, Bengaluru 560001.',
    1, 0, 'pdf', 'Page 1',
    '{"filename":"Asha-Mehta-private.pdf","headingPath":"Prism Systems account","locationLabel":"42 Lake View Road"}',
    '[PERSON_A1] at [ORG_B1], [EMAIL_C1], [PHONE_D1], account [ACCOUNT_E1], card [PAYMENT_CARD_F1], [ADDRESS_G1].',
    '{"headingPath":"[ORG_B1] [ACCOUNT_E1]","locationLabel":"Page 1"}',
    'deterministic-v1', 'privacy_minimised'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Prism Systems repeated asha.mehta@example.test and ACCT-00918872 for Asha Mehta.',
    2, 1, 'pdf', 'Page 2',
    '{"filename":"Asha-Mehta-private.pdf","headingPath":"Repeated account","locationLabel":"Page 2"}',
    '[ORG_B1] repeated [EMAIL_C1] and [ACCOUNT_E1] for [PERSON_A1].',
    '{"headingPath":"Repeated [ACCOUNT_E1]","locationLabel":"Page 2"}',
    'deterministic-v1', 'privacy_minimised'
  );

-- Enough safe rows to verify the hard 30-result RPC ceiling.
insert into public.document_chunks (
  document_id, collection_id, content, page_number, chunk_index,
  file_kind, location_label, metadata, provider_safe_content,
  provider_safe_metadata, privacy_policy_version, embedding_projection
)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Synthetic owner evidence passage ' || n,
  3, n, 'pdf', 'Page 3', '{}'::jsonb,
  '[SAFE_SHARED] synthetic passage ' || n,
  jsonb_build_object('headingPath', '[SAFE_SHARED]', 'locationLabel', 'Page 3'),
  'deterministic-v1', 'privacy_minimised'
from generate_series(2, 36) n;

insert into public.chat_messages (
  id, collection_id, user_id, role, content, citations,
  processing_mode, provider_safe_content
)
values (
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '11111111-1111-4111-8111-111111111111',
  'assistant',
  'Asha Mehta owns account ACCT-00918872.',
  '[{"chunkId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"}]',
  'privacy_minimised',
  '[PERSON_A1] owns account [ACCOUNT_E1].'
);

select extensions.is(
  (select processing_mode from public.documents where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  'standard',
  'document captures the workspace default at creation'
);
select extensions.is(
  (select processing_mode from public.documents where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  'privacy_minimised',
  'later document captures the changed workspace default'
);
select extensions.is(
  (select processing_mode from public.documents where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  'standard',
  'changing the workspace default does not mutate an existing document'
);
select extensions.lives_ok(
  $$update public.documents set status = 'processing', processing_stage = 'indexing' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  'unrelated legitimate document updates work'
);
select extensions.throws_ok(
  $$update public.documents set processing_mode = 'standard', privacy_policy_version = null where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '22023',
  'Document processing mode is immutable; use an explicit reprocessing operation.',
  'direct processing_mode changes are rejected'
);
select extensions.throws_ok(
  $$update public.documents set privacy_policy_version = 'deterministic-v2' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '22023',
  'Document processing mode is immutable; use an explicit reprocessing operation.',
  'privacy policy version changes are rejected'
);
select extensions.is(
  (select processing_mode || ':' || privacy_policy_version from public.documents where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  'privacy_minimised:deterministic-v1',
  'failed immutable updates leave the row unchanged'
);
select extensions.lives_ok(
  $$update public.documents set status = 'ready', processing_stage = 'ready' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  'document can return to ready after unrelated update'
);
select extensions.ok(
  (select provider_safe_lexical_search @@ to_tsquery('simple', 'email_c1') from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  'masked generated lexical value contains the masked email token'
);
select extensions.ok(
  not (select provider_safe_lexical_search @@ to_tsquery('simple', 'asha') from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  'masked generated lexical value excludes the original name'
);
select extensions.ok(
  (select provider_safe_content !~* '(Asha|Prism|asha\\.mehta|98765|00918872|4111|Lake View|Bengaluru)' from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  'masked chunk projection contains none of the fixture originals'
);
select extensions.ok(
  (select provider_safe_metadata::text !~* '(Asha|Prism|asha\\.mehta|98765|00918872|4111|Lake View|Bengaluru|filename)' from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
  'masked metadata contains no original identifier or filename field'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('[EMAIL_C1]', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 10)),
  2::bigint,
  'privacy RPC uses the masked lexical representation across repeated identifiers'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('Asha', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 10)),
  0::bigint,
  'privacy RPC does not weight or search the original filename'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('[SAFE_SHARED]', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 100)),
  30::bigint,
  'privacy RPC clamps oversized result limits to 30'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('Rahul', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'standard', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 10)),
  1::bigint,
  'mode-aware standard retrieval preserves existing filename weighting'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical('Rahul', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 10)),
  1::bigint,
  'existing standard lexical RPC remains unchanged'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('[EMAIL_C1]', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 10)),
  0::bigint,
  'RPC document boundary excludes a different-mode document'
);
select extensions.is(
  (select count(*) from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2' and document_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' and page_number = 1 and chunk_index = 0),
  1::bigint,
  'masked projection preserves chunk ID and provenance'
);
select extensions.is(
  (select count(*) from public.chat_messages where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' and provider_safe_content !~* '(Asha|00918872)'),
  1::bigint,
  'masked chat/export projection excludes original fixture identifiers'
);

reset role;

-- Tenant two owns a separate workspace and document with a deliberately
-- missing masked projection to exercise fail-closed retrieval.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
insert into public.collections (id, user_id, name, default_processing_mode)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', 'Second synthetic tenant', 'privacy_minimised');
insert into public.documents (
  id, collection_id, user_id, filename, storage_path, status, processing_stage,
  processing_mode, privacy_policy_version
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '22222222-2222-4222-8222-222222222222',
  'Missing-projection.pdf',
  '22222222-2222-4222-8222-222222222222/missing.pdf',
  'ready', 'ready', 'privacy_minimised', 'deterministic-v1'
);
insert into public.document_chunks (
  id, document_id, collection_id, content, page_number, chunk_index,
  file_kind, location_label, metadata, embedding_projection
)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'Original-only missing masked projection for synthetic account ZZ-7788.',
  1, 0, 'pdf', 'Page 1', '{}', 'original'
);

select extensions.is((select count(*) from public.collections), 1::bigint, 'authenticated non-owner sees only the second tenant collection');
select extensions.is((select count(*) from public.documents), 1::bigint, 'authenticated non-owner sees only the second tenant document');
select extensions.is((select count(*) from public.document_chunks), 1::bigint, 'authenticated non-owner sees only the second tenant chunk');
select extensions.is((select count(*) from public.chat_messages), 0::bigint, 'authenticated non-owner cannot read owner-one masked chat/export rows');
select extensions.is((select count(*) from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'), 0::bigint, 'non-owner citation resolution cannot read owner-one evidence');
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('missing', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'privacy_minimised', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '22222222-2222-4222-8222-222222222222', 10)),
  0::bigint,
  'missing masked projection fails closed'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('[EMAIL_C1]', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', null, '22222222-2222-4222-8222-222222222222', 10)),
  0::bigint,
  'non-owner RPC cannot retrieve another tenant collection'
);
select extensions.is(
  (select count(*) from public.match_document_chunks_lexical_by_mode('[EMAIL_C1]', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', null, '11111111-1111-4111-8111-111111111111', 10)),
  0::bigint,
  'RPC rejects a match_user_id that differs from auth.uid()'
);
select extensions.lives_ok(
  $$update public.documents set status = 'failed' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  'non-owner UPDATE is safely filtered by RLS'
);
select extensions.throws_ok(
  $$insert into public.documents (collection_id, user_id, filename, storage_path) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'cross-tenant.pdf', '22222222-2222-4222-8222-222222222222/cross-tenant.pdf')$$,
  '42501',
  'new row violates row-level security policy for table "documents"',
  'document WITH CHECK blocks cross-tenant insert'
);

reset role;

-- Owner one still resolves original evidence through its owner-visible RLS path.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select extensions.is((select count(*) from public.collections), 1::bigint, 'owner sees only its workspace');
select extensions.is((select count(*) from public.documents), 2::bigint, 'owner sees only its two mixed-mode documents');
select extensions.is((select status from public.documents where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'), 'ready', 'non-owner UPDATE left the owner row unchanged');
select extensions.is((select count(*) from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2' and content like 'Asha Mehta%'), 1::bigint, 'owner citation resolves to original owner-visible evidence');
select extensions.is((select count(*) from public.document_chunks where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'), 0::bigint, 'owner cannot read second-tenant evidence');
reset role;

-- Anonymous requests fail at grants before RLS or RPC execution.
set local role anon;
select extensions.throws_ok(
  $$select * from public.collections$$,
  '42501',
  'permission denied for table collections',
  'anonymous table SELECT is denied by grants'
);
select extensions.throws_ok(
  $$select * from public.match_document_chunks_lexical_by_mode('safe', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'privacy_minimised', null, null, 10)$$,
  '42501',
  'permission denied for function match_document_chunks_lexical_by_mode',
  'anonymous mode-aware RPC execution is denied'
);
reset role;

select * from extensions.finish();
rollback;
