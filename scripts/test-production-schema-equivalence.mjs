import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPOSITORY = resolve(import.meta.dirname, "..");
const PREVIEW_PROJECT = "pliny-preview-assurance-20260908";
const PRODUCTION_PROJECT = "vector";
const OUTPUT = process.env.PLINY_SCHEMA_EQUIVALENCE_OUTPUT
  ? resolve(process.env.PLINY_SCHEMA_EQUIVALENCE_OUTPUT)
  : null;

const INVENTORY_SQL = String.raw`
select jsonb_build_object(
  'tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'kind', c.relkind,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    ) order by c.relname)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
  ), '[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'ordinal', ordinal_position,
      'name', column_name,
      'type', data_type,
      'udt_schema', udt_schema,
      'udt_name', udt_name,
      'nullable', is_nullable,
      'default', column_default,
      'identity', is_identity,
      'generated', is_generated
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
  ), '[]'::jsonb),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
    ) order by c.relname, con.conname)
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ), '[]'::jsonb),
  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    ) order by tablename, indexname)
    from pg_catalog.pg_indexes
    where schemaname = 'public'
  ), '[]'::jsonb),
  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result', pg_catalog.pg_get_function_result(p.oid),
      'kind', p.prokind,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'definition', pg_catalog.pg_get_functiondef(p.oid)
    ) order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  ), '[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    ) order by tablename, policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
  ), '[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table,
      'name', trigger_name,
      'timing', action_timing,
      'events', event_manipulation,
      'statement', action_statement
    ) order by event_object_table, trigger_name, event_manipulation)
    from information_schema.triggers
    where trigger_schema = 'public'
  ), '[]'::jsonb),
  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'role', grantee,
      'table', table_name,
      'privilege', privilege_type,
      'grantable', is_grantable
    ) order by grantee, table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated', 'service_role')
  ), '[]'::jsonb),
  'storage_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    ) order by tablename, policyname)
    from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  ), '[]'::jsonb),
  'storage_bucket', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'public', public,
      'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types
    ) order by id)
    from storage.buckets
    where id = 'documents'
  ), '[]'::jsonb),
  'storage_table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'role', grantee,
      'table', table_name,
      'privilege', privilege_type,
      'grantable', is_grantable
    ) order by grantee, table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'storage'
      and table_name = 'objects'
      and grantee in ('anon', 'authenticated', 'service_role')
  ), '[]'::jsonb),
  'schema_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'role', role_name,
      'schema', schema_name,
      'usage', pg_catalog.has_schema_privilege(role_name, schema_name, 'USAGE'),
      'create', pg_catalog.has_schema_privilege(role_name, schema_name, 'CREATE')
    ) order by role_name, schema_name)
    from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
    cross join (values ('public'), ('storage')) schemas(schema_name)
  ), '[]'::jsonb),
  'routine_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'role', roles.role_name,
      'name', p.proname,
      'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'execute', pg_catalog.has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ) order by roles.role_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  ), '[]'::jsonb),
  'extensions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', e.extname,
      'schema', n.nspname
    ) order by e.extname)
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('vector', 'pgcrypto', 'uuid-ossp')
  ), '[]'::jsonb)
) as inventory;
`;

const MIGRATIONS_SQL = String.raw`
select version, name
from supabase_migrations.schema_migrations
order by version;
`;

function runSupabase(args, options = {}) {
  const result = spawnSync("supabase", args, {
    cwd: options.cwd ?? REPOSITORY,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });

  if (result.status !== 0) {
    let diagnostic = "unknown_cli_error";
    try {
      const parsed = JSON.parse(result.stdout);
      const code = parsed?.error?.code ?? "cli_error";
      const message = String(parsed?.error?.message ?? "")
        .replaceAll(/[a-z]{20}/g, "[project-ref]")
        .replaceAll(/postgres(?:ql)?:\/\/\S+/g, "[db-url]")
        .slice(0, 500);
      diagnostic = `${code}:${message}`;
    } catch {
      diagnostic = /statement timeout/i.test(result.stderr)
        ? "statement_timeout"
        : /syntax error/i.test(result.stderr)
          ? "sql_syntax_error"
          : diagnostic;
    }
    throw new Error(`${options.failureCode ?? "supabase_cli_failed"}:${diagnostic}`);
  }

  return result.stdout;
}

function listProjects() {
  const payload = JSON.parse(
    runSupabase(["projects", "list", "--output-format", "json", "--log-level", "error"], {
      failureCode: "project_inventory_failed",
    }),
  );
  return Array.isArray(payload) ? payload : payload.projects;
}

function resolveVerifiedProject(name) {
  const matches = listProjects().filter((project) => project.name === name);
  if (matches.length !== 1) throw new Error(`project_identity_failed:${name}`);
  return matches[0];
}

function makeIsolatedWorkdir() {
  const root = mkdtempSync(join(tmpdir(), "pliny-schema-equivalence-"));
  mkdirSync(join(root, "supabase"));
  cpSync(join(REPOSITORY, "supabase", "config.toml"), join(root, "supabase", "config.toml"));
  return root;
}

function queryVerifiedProject(name, sql) {
  // Resolve and verify the human-readable project name before every remote operation.
  const project = resolveVerifiedProject(name);
  const workdir = makeIsolatedWorkdir();
  try {
    const payload = JSON.parse(
      runSupabase(
        [
          "db",
          "query",
          "--linked",
          "--project-ref",
          project.id,
          "--output-format",
          "json",
          "--log-level",
          "error",
          "--workdir",
          workdir,
          sql,
        ],
        { cwd: workdir, failureCode: `read_only_query_failed:${name}` },
      ),
    );
    return payload.rows;
  } finally {
    rmSync(workdir, { force: true, recursive: true });
  }
}

function normalize(value) {
  if (typeof value === "string") {
    return value.replaceAll(/\s+/g, " ").trim();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

function itemKey(section, item) {
  switch (section) {
    case "columns":
      return `${item.table}.${item.ordinal}.${item.name}`;
    case "constraints":
    case "indexes":
    case "policies":
    case "storage_policies":
      return `${item.table}.${item.name}`;
    case "functions":
      return `${item.name}(${item.identity_arguments})`;
    case "triggers":
      return `${item.table}.${item.name}.${item.events}`;
    case "table_grants":
    case "storage_table_grants":
      return `${item.role}.${item.table}.${item.privilege}`;
    case "schema_privileges":
      return `${item.role}.${item.schema}`;
    case "routine_privileges":
      return `${item.role}.${item.name}(${item.identity_arguments})`;
    case "storage_bucket":
      return item.id;
    default:
      return item.name;
  }
}

function compareSection(section, production, preview) {
  const left = new Map(production.map((item) => [itemKey(section, item), item]));
  const right = new Map(preview.map((item) => [itemKey(section, item), item]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  return keys.flatMap((key) => {
    if (!left.has(key)) return [{ section, object: key, difference: "preview_only" }];
    if (!right.has(key)) return [{ section, object: key, difference: "production_only" }];
    if (fingerprint(left.get(key)) !== fingerprint(right.get(key))) {
      if (section === "routine_privileges") {
        return [{
          section,
          object: key,
          difference: "definition_mismatch",
          productionExecute: left.get(key).execute,
          previewExecute: right.get(key).execute,
        }];
      }
      return [{ section, object: key, difference: "definition_mismatch" }];
    }
    return [];
  });
}

const startedAt = new Date().toISOString();
const previewInventory = queryVerifiedProject(PREVIEW_PROJECT, INVENTORY_SQL)[0]?.inventory;
const productionInventory = queryVerifiedProject(PRODUCTION_PROJECT, INVENTORY_SQL)[0]?.inventory;
const previewMigrations = queryVerifiedProject(PREVIEW_PROJECT, MIGRATIONS_SQL);
const productionMigrations = queryVerifiedProject(PRODUCTION_PROJECT, MIGRATIONS_SQL);

if (!previewInventory || !productionInventory) throw new Error("schema_inventory_missing");

const sections = [
  "tables",
  "columns",
  "constraints",
  "indexes",
  "functions",
  "policies",
  "triggers",
  "table_grants",
  "storage_policies",
  "storage_bucket",
  "storage_table_grants",
  "schema_privileges",
  "routine_privileges",
  "extensions",
];
const schemaDifferences = sections.flatMap((section) =>
  compareSection(section, productionInventory[section] ?? [], previewInventory[section] ?? []),
);
const migrationVersions = {
  preview: previewMigrations.map(({ version, name }) => ({ version, name })),
  production: productionMigrations.map(({ version, name }) => ({ version, name })),
};
const previewVersionSet = new Set(migrationVersions.preview.map((migration) => migration.version));
const productionVersionSet = new Set(migrationVersions.production.map((migration) => migration.version));
const migrationDifferences = [
  ...migrationVersions.preview
    .filter((migration) => !productionVersionSet.has(migration.version))
    .map((migration) => ({ ...migration, difference: "preview_only" })),
  ...migrationVersions.production
    .filter((migration) => !previewVersionSet.has(migration.version))
    .map((migration) => ({ ...migration, difference: "production_only" })),
];

const result = {
  schemaVersion: 2,
  evidenceType: "Production migration and schema equivalence (strictly read-only)",
  startedAt,
  completedAt: new Date().toISOString(),
  targets: {
    preview: PREVIEW_PROJECT,
    production: PRODUCTION_PROJECT,
  },
  safety: {
    isolatedTemporaryConfiguration: true,
    targetNameVerifiedBeforeEveryQuery: true,
    selectStatementsOnly: true,
    productionDataInspected: false,
    productionMutations: 0,
  },
  schema: {
    sections,
    productionFingerprint: fingerprint(productionInventory),
    previewFingerprint: fingerprint(previewInventory),
    equivalent: schemaDifferences.length === 0,
    differences: schemaDifferences,
    counts: Object.fromEntries(
      sections.map((section) => [
        section,
        {
          production: productionInventory[section]?.length ?? 0,
          preview: previewInventory[section]?.length ?? 0,
        },
      ]),
    ),
  },
  migrations: {
    production: migrationVersions.production,
    preview: migrationVersions.preview,
    equivalent: migrationDifferences.length === 0,
    differences: migrationDifferences,
  },
  blocksDeployment: schemaDifferences.length > 0,
};

if (OUTPUT) writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
