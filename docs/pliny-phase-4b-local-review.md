# Pliny Phase 4B local review

Date: 2026-09-01; local database acceptance updated 2026-09-02

Baseline: `8f26210148a7d64d8f190ab76d75f476720d5f9d`

Status: local database acceptance passed after one minimum function-ACL correction; migration applied only to a disposable local database; no provider request, remote migration, commit, push, deployment, or production-data change

## Architecture decision

Each workspace has a `default_processing_mode` of `standard` or `privacy_minimised`. Upload copies that value into the document row together with the privacy policy version. A database trigger makes the document mode and policy version immutable. Changing the workspace default updates only the collection row; existing documents are neither mutated nor reprocessed.

Privacy-minimised processing keeps three representations separate:

1. `document_chunks.content` and the original filename/location metadata remain the owner-visible evidence under the existing RLS path.
2. `provider_safe_content` and `provider_safe_metadata` are the masked retrieval projection. The existing `embedding vector(1024)` stores the vector for the projection named by `embedding_projection`.
3. Generation context is built in server memory from masked text, generic document aliases, generic page/chunk locations, and the existing chunk IDs/source IDs. Original filenames and original locations are not placed in a privacy-mode prompt.

No reversible mapping is persisted. The runtime uses typed HMAC-derived pseudonyms such as `[EMAIL_2A5C…_EF09…]` and `[ACCOUNT_2A5C…_11BC…]`. The scope contains the owner and document identifiers; the entity digest contains the normalised detected value. The same value is stable across a document's chunks, but deliberately receives a different token in another document or tenant.

The cross-document trade-off is explicit: unlinkable document scopes prevent a provider from learning that the same identity occurs in two documents, but they remove a global identity token that could improve cross-document matching. Query transformation compensates locally by expanding a detected identifier to one bounded token per participating document. The expansion is capped by the already-authorised document scope and retrieval result ceilings.

Reconstruction remains disabled. The Phase 4A demonstration helper is not imported by ingestion, retrieval, chat, export, or browser code. There is no mapping table, no plaintext mapping, no service-role runtime path, and no `SECURITY DEFINER` function in the migration proposal.

## Exact data flow

| Stage | Standard mode | Privacy-minimised mode | Provider-visible data | Persistent data |
| --- | --- | --- | --- | --- |
| Workspace configuration | Default is `standard` unless explicitly changed | Default can be explicitly selected or changed | None | `collections.default_processing_mode` |
| Upload acceptance | Copies `standard` to the document | Copies `privacy_minimised` and `deterministic-v1` to the document | None | Original private Storage object; immutable document mode/version |
| Extraction and sanitisation | Existing local extraction and active-content sanitisation | Same extraction and sanitisation | None | No new intermediate persistence |
| Chunking | Existing original chunks and provenance | Same chunk boundaries and IDs | None | Original `content`, filename/location metadata, document/chunk provenance |
| Privacy transform | No transform | Server-only deterministic detection and document-scoped typed HMAC pseudonyms | None | Masked content/metadata and policy version; no identity map or secret |
| Document embedding | Original chunk text | `provider_safe_content` only; a preflight assertion rejects detected originals | Mocked in tests only during Phase 4B | Existing `embedding vector(1024)`, model/time, `embedding_projection` |
| Lexical indexing | Existing `lexical_search`, including original filename weighting | Separate `provider_safe_lexical_search`; no original filename weighting | None | Stored generated `tsvector` projection |
| Query preparation | Existing question when no privacy document participates | Detected identifiers expand to document-scoped tokens before embedding | Masked query only for the privacy boundary | Original owner question and masked chat projection; query vector is ephemeral |
| Mixed-mode retrieval | Standard-only workspaces keep the existing path | If any participating document is privacy-minimised, the external query-embedding boundary uses the masked query for the whole request; lexical search remains mode-specific inside Supabase | No original query at the embedding boundary for the mixed privacy request | Existing standard vectors are not changed; privacy vectors remain projection-labelled |
| Candidate retrieval | Existing semantic/lexical RPCs and bounds | Invoker-rights mode-aware lexical RPC plus existing semantic vector ownership filters | None | No new search-history record |
| Evidence assessment | Original owner-visible chunks and question are evaluated locally | Same local owner-visible assessment | None | None |
| Generation request | Existing question, filename/location and original bounded context | Masked question, masked passages, `Document N` aliases, generic page/chunk locations, source IDs and chunk IDs | Only the selected mode's generation representation | No provider payload is logged or stored |
| Citation repair | Existing bounded prompt and draft answer | The same masked prompt plus masked draft answer; original passages are not resent | Masked repair payload only | No repair payload persistence |
| Citation validation | Existing marker validation | Same marker validation against the identical ordered chunk IDs | Model cannot authorise a new ID; unknown IDs are rejected | Citation JSON retains owner-visible source plus masked projection under RLS |
| Source inspection | Original evidence is shown to the authenticated owner | Original evidence is resolved by the preserved chunk/document IDs | None | Existing owner-scoped evidence |
| Chat persistence | Existing original question/answer/citations | Original owner question plus masked question projection; masked answer; owner-visible citation evidence | None | `chat_messages.processing_mode` and `provider_safe_content` distinguish export projection |
| Export | Existing output unchanged | Question, workspace label, filename/location and excerpt use the masked projection by default | Export leaves Pliny only through the owner's browser action | No new server-side export record |
| Logging/errors | Stage and operational identifiers only | Same; messages, provider bodies, original values and mappings are excluded | None | Normal platform logs contain safe stage metadata only by application design |

## Schema and migration proposal

The single proposal is `supabase/migrations/20260901044022_phase_4b_privacy_minimised_processing.sql`.

- `collections.default_processing_mode`: explicit workspace default; existing rows default to `standard`.
- `documents.processing_mode`: immutable per-document capture; existing rows default to `standard`.
- `documents.privacy_policy_version`: required only for privacy-minimised documents.
- `document_chunks.provider_safe_content` and `provider_safe_metadata`: one-to-one masked projections on the existing chunk identity.
- `document_chunks.embedding_projection`: records whether the unchanged `vector(1024)` represents original or privacy-minimised text.
- `document_chunks.privacy_policy_version`: records the detector/token policy used for the projection.
- `document_chunks.provider_safe_lexical_search`: a generated and indexed masked lexical representation.
- `chat_messages.processing_mode` and `provider_safe_content`: retain a masked export projection without replacing owner-visible content.
- `enforce_document_processing_mode_immutable`: `SECURITY INVOKER` trigger function; execute is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role` as a callable function.
- `match_document_chunks_lexical_by_mode`: `SECURITY INVOKER`, authenticated-only RPC with collection, document, mode, owner, readiness, and bounded-count predicates.

The proposal does not add an exposed mapping table, anonymous grant, service-role dependency, view, or `SECURITY DEFINER`. Existing table RLS policies and owner predicates are preserved. The canonical schema mirror and RLS verification script are updated for review. Supabase's current guidance distinguishes grants from RLS and recommends invoker-rights functions; this proposal follows both controls.

## Threat model

| Threat | Control implemented | Residual risk |
| --- | --- | --- |
| Original PII enters document embedding payload | Privacy projection is created before embedding; mocked payload assertion compares the serialised request with every detected original | Deterministic coverage has false negatives, especially names, addresses, organisations and unsupported formats |
| Original PII enters query embedding payload | Query is transformed with the same document scopes before embedding; mixed privacy requests use the strictest external boundary | HMAC token expansion can reduce semantic similarity for identity-heavy questions |
| Original passage or filename enters generation | Privacy prompt accepts only `providerSafeContent`, aliases and generic locations; runtime payload preflight fails closed | Undetected identifiers can remain in the masked projection |
| Citation repair retransmits original passages | Repair payload reuses the privacy prompt and does not rebuild from original evidence | Provider-generated draft text is resent, though it was produced from the masked prompt |
| Provider invents a citation ID | Existing citation validation rejects unknown markers; repair instruction permits only supplied source IDs | A fully provider-backed acceptance run is still required later |
| Citation resolves to the wrong original | Source order and existing chunk/document IDs are preserved; citations are built from the owner-scoped in-memory chunk set; local owner/non-owner RLS witnesses passed | A provider-backed end-to-end citation run remains outside this provider-free phase |
| Token map leaks from database or browser | No mapping is stored; the HMAC key is server-only and bundle-scanned | Key rotation would change pseudonyms and therefore requires an explicit future reprocessing operation |
| Cross-tenant or cross-document linkage | Scope includes tenant/document; deterministic tests prove token separation; RPC retains owner/document predicates | Within one request, a provider can see the bounded set of different tokens supplied for a multi-document query |
| Privacy export leaks owner-visible evidence | Privacy-mode export helpers require the masked question/content and alias original workspace/document metadata | A privacy record missing its masked projection degrades to an unavailable excerpt instead of exporting the original |
| Logs or thrown errors echo sensitive values | Provider bodies are discarded; safe logging records name/code/status plus non-content operational IDs; error messages are stage-specific | Hosting/platform logs outside application calls remain governed by platform configuration |
| Browser receives secret or mapping material | Secret module is server-only by import graph; production static chunks are scanned | Source maps and future client imports must remain part of release review |
| Workspace-default edit reprocesses old documents | Action updates only `collections`; document capture is immutable | Mixed-mode retrieval has different external query semantics and needs quality measurement |

## Deterministic acceptance coverage

- Mocked Voyage document and query payloads contain no detected originals.
- Mocked generation and citation-repair payloads contain no detected originals.
- Typed pseudonyms are stable across chunks and isolated across documents and tenants.
- Multi-document query expansion is bounded to authorised document scopes.
- Provider-safe sources preserve chunk/document IDs and resolve to the original owner-visible chunk object.
- Standard embedding payload selection remains unchanged.
- A later workspace default capture does not mutate an earlier document capture; SQL immutability is statically checked.
- Privacy export projections contain no detected original test identifiers.
- Safe logs and thrown boundary errors do not contain sensitive test values.
- Production browser chunks contain no privacy key name, test secret, scope-secret field, or Phase 4A mapping field.
- Migration text contains no `SECURITY DEFINER`, anonymous grant, RLS disablement, mapping table, or embedding-vector alteration.

## Phase 4B.1 local database acceptance

### Disposable target and migration execution

The repository remains linked to a hosted Supabase project, so no repository-default or linked CLI command was used. Acceptance ran in the isolated temporary project `/tmp/pliny-phase4b-acceptance.OQvzsb` with project ID `pliny-phase4b-acceptance-4b1`, database port `56322`, Docker container `supabase_db_pliny-phase4b-acceptance-4b1`, Supabase CLI `2.115.0`, Docker `29.7.2`, and PostgreSQL image `17.6.1.159` (`server_version` 17.6). The target had no remote project reference.

The checked-in migration history is incremental and does not bootstrap the application tables. For acceptance only, the existing reviewed `supabase/manual-migrations/2026-08-29-proposed-foundational-schema.sql` was copied into the temporary migration chain at version `20260829000000`, followed by byte-identical copies of every checked-in migration. No repository config or migration-history repair was created, and no migration was manually marked applied.

The corrected Phase 4B migration applied successfully from a clean schema twice. A subsequent `supabase migration up --local` returned `applied: []`, proving it did not apply a second time. The two corrected `public` schema dumps were byte-identical with SHA-256 `4d9cf5b90a8346b531eff4b9d7e03ae0563dc42a0e3b285ec4c5074da9832fec`.

Current Supabase guidance was reviewed before execution:

- [Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): new projects require explicit grants by default; the same behavior is scheduled for existing projects on 2026-10-30. Grants and RLS remain separate controls.
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api): object grants control reachability; RLS controls rows; both must be tested.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): UPDATE requires a SELECT policy and should use both `USING` and `WITH CHECK`.
- [Database functions](https://supabase.com/docs/guides/database/functions): invoker rights are preferred, function execution is public by default unless revoked, and search paths must be controlled.

The breaking-change review exposed one portability defect. Under simulated legacy Supabase default privileges, both new functions retained explicit `service_role=EXECUTE` even though the new-project defaults hid that fact. The minimum correction explicitly revokes `service_role` execution on both functions. Reapplying the corrected migration under the simulated legacy defaults produced the same least-privilege function matrix as the new defaults.

### Exact catalog witnesses

| Witness | Accepted catalog state |
| --- | --- |
| Workspace mode | `collections.default_processing_mode text NOT NULL DEFAULT 'standard'`, validated two-value check |
| Document mode/version | `documents.processing_mode text NOT NULL DEFAULT 'standard'`; nullable policy version with validated mode/version check |
| Chunk projection | nullable `provider_safe_content`, `provider_safe_metadata`, and policy version; non-null `embedding_projection DEFAULT 'original'`; both projection checks validated |
| Chat/export projection | `chat_messages.processing_mode text NOT NULL DEFAULT 'standard'` plus nullable `provider_safe_content`; validated projection check |
| Masked lexical value | `provider_safe_lexical_search tsvector GENERATED ALWAYS ... STORED`; expression contains only masked heading, masked location, and masked content |
| Masked lexical index | `document_chunks_provider_safe_lexical_search_idx`, GIN, partial on `embedding_projection = 'privacy_minimised'`, `indisvalid=true`, `indisready=true` |
| Existing indexes | original lexical GIN and IVFFlat embedding indexes remained valid and ready |
| Embedding type | `public.document_chunks.embedding` remained exactly `vector(1024)` |
| Trigger | `enforce_document_processing_mode_immutable`, enabled, `BEFORE UPDATE OF processing_mode, privacy_policy_version` |
| Views | no masked/privacy view was introduced; projections remain RLS-protected columns |

All seven Phase 4B check constraints were present and validated. Database lint reported no schema errors.

### Function privilege matrix

| Function | `prosecdef` | Search path witness | `PUBLIC` | `anon` | `authenticated` | `service_role` | Ownership/bounds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `enforce_document_processing_mode_immutable()` | `false` | empty | denied | denied | denied | denied | trigger-only constant failure; no service-role path |
| `match_document_chunks_lexical_by_mode(text, uuid, text, uuid, uuid, integer)` | `false` | `public`; safe because API roles have no `CREATE` there and all relations/auth references are qualified | denied | denied | execute | denied | collection filter, optional document filter, mode/readiness predicates, `match_user_id = auth.uid()`, document owner = `auth.uid()`, invoker RLS, result clamp 1–30 |

The simulated legacy-default ACL witness was `{postgres=X/postgres}` for the trigger function and `{postgres=X/postgres,authenticated=X/postgres}` for the RPC. No introduced function is `SECURITY DEFINER`, and no service-role dependency or execution grant remains.

### Role-by-role grants and RLS matrix

| Role witness | Tables/columns | RPC | Read isolation | Mutation isolation |
| --- | --- | --- | --- | --- |
| Anonymous (`anon`) | no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grant on the four Phase 4B tables; table SELECT returned SQLSTATE `42501` | execute denied with SQLSTATE `42501` | no rows reachable | no Data API DML operation reachable |
| Authenticated owner | existing DML grants, gated by RLS | mode-aware RPC executes | saw one owned workspace, its two mixed-mode documents, masked projections, and original owner-visible evidence only | legitimate status update succeeded; mode/version changes failed with SQLSTATE `22023`; failed changes left the row unchanged |
| Authenticated non-owner | same object grants, different `auth.uid()` | callable but returned zero for the other tenant | saw only its own workspace/document/chunk; owner chat/export and citation chunk counts were zero | update of the owner's document affected zero rows; cross-tenant INSERT failed with SQLSTATE `42501` |

`collections` and `documents` UPDATE policies both have `USING` and `WITH CHECK`, and all four tables have RLS enabled. No per-column grant or function grant makes an object newly reachable to `anon`. The local Supabase baseline still reports ancillary `TRUNCATE`, `REFERENCES`, and `TRIGGER` table privileges for API roles; these are not operations exposed by PostgREST and were not introduced by Phase 4B, but foundational privilege hardening should review them separately before a future remote apply.

### Immutability, retrieval, and privacy fixtures

The 56-test pgTAP suite in `supabase/tests/phase4b_acceptance.sql` passed after each corrected clean rebuild. Synthetic fixtures covered two tenants; a mixed-mode workspace; standard, privacy-minimised, and missing-projection documents; names, emails, phones, account numbers, payment-card-like values, addresses, organisations, and repeated identifiers across chunks.

- A document captured the workspace default at creation. Changing the default changed only later capture; the existing document stayed `standard`.
- Direct mode and policy-version changes were rejected; unrelated status/stage updates succeeded; rejected updates were atomic.
- Masked content, metadata, and generated lexical values contained the typed fixture tokens and none of the original fixture markers.
- Masked projections retained the original chunk ID, document ID, page, and chunk index.
- The privacy RPC found both repeated masked identifiers, never matched the original privacy filename/name, enforced collection/document/owner bounds, and clamped 100 requested results to 30.
- The mode-aware standard path and existing standard lexical RPC both retained original filename weighting.
- A privacy document with an original-only chunk and no masked projection returned zero masked results.
- The owner resolved the original cited chunk through RLS; the second tenant could not read it.
- Masked chat/export content contained no fixture originals. Application tests separately proved mocked document/query embedding, generation, citation-repair, and export builders contain no detected originals.
- The isolated PostgreSQL log contained none of the synthetic sensitive fixture markers after the suite.

Index build completed without warning using local `maintenance_work_mem=64MB`, `max_parallel_maintenance_workers=2`, and `shared_buffers=128MB`. The empty masked index was 16 kB. The database container used about 92 MiB during the post-build snapshot from a 3.825 GiB Docker allocation. This is a schema-acceptance witness, not a production-scale index-memory benchmark.

### Regression and advisor results

Passed: `npm run test:privacy`, `npm run test:privacy:bundle` after a fresh build, `npm run test:ingestion`, `npm run test:retrieval`, `npm run test:embeddings`, `npm run test:evidence`, `npm run test:citations`, `npm run test:sanitization`, `npm run test:report`, `npm run eval` (14/14 automated; live provider flow explicitly not run), `npm run lint`, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and `npm audit --omit=dev` (0 vulnerabilities).

Supabase database lint passed. Security Advisor reported only the pre-existing `vector` extension in `public`. Performance Advisor reported unused indexes, expected on a newly rebuilt empty database; this included the new masked GIN index and does not establish production index usefulness.

## Unresolved risks and review gates

1. Deterministic detection intentionally does not claim complete person-name, postal-address, organisation or multilingual coverage. Privacy minimisation is not anonymisation.
2. Mixed-mode semantic recall may be lower because existing standard embeddings are not silently regenerated while the strictest query boundary is used. The mode-aware lexical path preserves exact retrieval locally, but a provider-free quality threshold still needs a larger representative corpus.
3. HMAC key rotation has no silent path. It must be a future explicit reprocessing operation with an atomic chunk replacement plan.
4. The Voyage account's retention/training opt-out remains unverified. This implementation reduces payload disclosure but does not create a provider-policy claim.
5. Provider-backed generation, citation repair, latency, cost and failure tests were deliberately not run in this provider-free phase.
6. No original-export override is implemented. Privacy-minimised exports are masked by default and reconstruction remains disabled.
7. The checked-in migrations remain incremental and require the existing foundational schema when bootstrapping a brand-new local database. The acceptance harness supplied that foundation only inside the disposable project.
8. The local new-project grant defaults and simulated legacy function defaults are covered, but no hosted-project catalog was queried. The explicit revokes make the corrected function ACLs deterministic across those default regimes.
9. The database acceptance fixtures were synthetic and transactionally rolled back. Production-scale GIN build time, memory, selectivity, semantic recall, and mixed-mode latency remain future release gates.

## Boundary confirmation

Phase 4B.1 made no Voyage, Anthropic, GLM, Z.ai, or other provider request; no document upload/transmission; no linked or remote migration; no production environment change; no production-data change; no commit; no push; and no deployment. Work stops for explicit approval at the local database acceptance boundary.
