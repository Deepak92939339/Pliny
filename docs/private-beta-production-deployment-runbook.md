# Pliny private-beta Production deployment runbook

Status: prepared and independently checked on 2026-09-10. This runbook has **not** been executed against Production.

## Release boundary

- Scope: private portfolio/beta release. Public self-signup must remain disabled in both Pliny and Supabase Auth.
- Pull request: `Deepak92939339/Pliny#1` into `main`.
- Production Supabase project name: `vector`.
- Isolated comparison target: `pliny-preview-assurance-20260908`.
- Never replay `20260830000000_initial_schema_baseline.sql` against the realized Production schema.
- Never use `supabase db push --include-all`, reset Production, seed Production, or expose credentials in command output.

## Evidence supporting the migration decision

The SELECT-only equivalence harness verifies the human-readable target name before every query and compares the effects of the foundational migration across public tables and columns, constraints, indexes, functions, triggers, RLS policies, table grants, Storage bucket configuration, Storage policies and grants, schema privileges, routine privileges, and required extensions. It reads no user rows.

After the isolated Preview-only grant repair, Production and Preview have identical realized fingerprints across all 14 sections. Production alone lacks the foundational migration-history row, while Preview additionally records the forward-only `20260910120000_revoke_public_match_document_chunks_execute` repair. Production already has the secure end state of that repair: `anon` cannot execute `match_document_chunks`.

Conclusion: marking `20260830000000` as applied is safe **only while the final equivalence check remains clean**. `supabase migration repair --status applied` changes migration history; it does not execute the migration SQL. The new forward migration must then be applied through the ordinary migration workflow. On current Production it is an idempotent security no-op, while fresh environments need it to remove execute inherited through `PUBLIC`.

## Preconditions — stop if any fails

1. Obtain explicit Production-change approval and open a bounded release window.
2. Confirm PR #1 has the expected head SHA, required CI is green, review is complete, and no later commit is present.
3. Record the current stable Vercel Production deployment identifier for application rollback. Do not change its domain.
4. Use an isolated detached Git worktree at the exact approved PR head; do not link the main working tree to any Supabase project.
5. Confirm the authenticated Supabase and GitHub identities are the approved owners.
6. Resolve the Production project reference by the exact project name `vector` in protected process memory. Reject zero matches, multiple matches, or any match named `pliny-preview-assurance-20260908`.
7. Run the read-only equivalence command below. Require `schema.equivalent=true`, `schema.differences=[]`, `blocksDeployment=false`, zero Production mutations, and only the two documented Preview-only migration rows.

```sh
git fetch origin
git worktree add --detach /private/tmp/pliny-production-release "$EXPECTED_RELEASE_SHA"
cd /private/tmp/pliny-production-release
npm ci
PLINY_SCHEMA_EQUIVALENCE_OUTPUT=/private/tmp/pliny-production-equivalence.json npm run test:production-schema-equivalence
```

Do not continue if the schema result differs, the target-name guard fails, the PR head changes, or any secret appears in output.

## Ordered Production procedure

### 1. Disable public signup at the Auth service

In the Supabase dashboard, select the project whose displayed name is exactly `vector`. In **Authentication → Settings**, turn off **Allow new users to sign up**. Do not change redirect URLs, email providers, existing users, or any other Auth setting.

Validate immediately through a protected test runner:

- an invented anonymous signup request returns the documented signup-disabled response and creates no user;
- one administrator-created, confirmed synthetic user can log in;
- its session survives one reload;
- logout clears the session;
- delete the synthetic user and confirm no rows remain.

If existing-user login fails, stop. Re-enabling signup is not a login repair and must not be used as one.

### 2. Repair only the foundational migration-history row

Inspect the installed CLI help immediately before execution, re-resolve the project name, and use the process-only verified Production reference:

```sh
supabase migration repair --help
supabase migration repair 20260830000000 --status applied --project-ref "$PLINY_PRODUCTION_REF"
supabase migration list --project-ref "$PLINY_PRODUCTION_REF"
```

Require `20260830000000 initial_schema_baseline` to appear exactly once as applied. Do not run the baseline SQL.

### 3. Dry-run, then apply only the forward grant repair

```sh
supabase db push --help
supabase db push --dry-run --skip-vault --project-ref "$PLINY_PRODUCTION_REF"
```

The dry run must list exactly:

```text
20260910120000_revoke_public_match_document_chunks_execute.sql
```

If any other migration is listed, stop. Otherwise:

```sh
supabase db push --skip-vault --project-ref "$PLINY_PRODUCTION_REF" --yes
supabase migration list --project-ref "$PLINY_PRODUCTION_REF"
PLINY_SCHEMA_EQUIVALENCE_OUTPUT=/private/tmp/pliny-production-equivalence-after.json npm run test:production-schema-equivalence
```

Require identical realized schema fingerprints, no migration differences, `anon` execute=false for `match_document_chunks`, and zero data-row inspection.

### 4. Merge and deploy the approved application

Only after database and Auth validation passes:

1. Merge PR #1 into `main` without force-push or history rewrite, preserving the reviewed release commits.
2. Allow the existing Git-connected Vercel project to create the Production deployment from that exact merge result. Do not promote a different Preview artifact.
3. Wait for Vercel status `READY`; record the deployment identifier and commit SHA.
4. Do not change Production domains or Production environment values during this step.

### 5. Production validation

Using invented content and a new administrator-created confirmed synthetic user, perform one bounded smoke:

- `/signup` shows invitation-only private-beta messaging and no form;
- direct anonymous signup remains disabled;
- login, protected-route redirect, reload persistence, and logout pass;
- one TXT upload reaches `Ready`;
- one grounded question returns a resolving citation;
- one unsupported question refuses;
- Source Inspector and report rendering work;
- browser console has no errors, application responses have no 5xx, and no credential or private identifier appears in the browser bundle or response body;
- delete the synthetic account, Storage object, and database rows.

Stop provider testing after these minimum requests and record exact provider usage and cost.

## Rollback boundaries

- **Before the forward migration is pushed:** if and only if the history repair targeted the wrong version or validation fails, revert that metadata row with `supabase migration repair 20260830000000 --status reverted --project-ref "$PLINY_PRODUCTION_REF"`. Re-run the migration list and stop. This does not undo schema.
- **After the forward migration is applied:** do not revert schema or restore `PUBLIC`/`anon` execute. The repair is a security restriction and should remain. Correct later database defects with a separately reviewed forward-only migration.
- **Application failure:** use Vercel's approved rollback operation to route the Production domain to the recorded stable deployment. Do not reset the database, undo the baseline ledger row, or change repository history.
- **Auth setting:** keep signup disabled while the release remains private beta, including during application rollback. Re-enabling public signup is a product-scope change requiring separate approval and a tested confirmation-email path.
- Stop and escalate on target ambiguity, unexpected migrations, schema drift, credential exposure, data mutation outside synthetic cleanup, or any destructive operation.

## Completion record

Record the approved PR head, merge SHA, migration-list result, before/after equivalence fingerprints, Auth signup-disabled Boolean, Vercel deployment identifier/READY state, bounded smoke result, provider usage/cost, cleanup result, and rollback deployment identifier. Store only sanitized evidence.
