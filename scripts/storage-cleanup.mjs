import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  LOCAL_ARTIFACT_ROOT,
  MAX_DELETE_HARD_LIMIT,
  StorageSafetyError,
  SupabaseStorageAdapter,
  executeCleanup,
  loadLocalEnv,
  parseInteger,
  planCleanup,
  sha256,
  validateDestructiveConfirmations,
  verifySignedManifest,
} from "./lib/storage-reconciliation.mjs";

function parseArguments(argv) {
  const parsed = {
    execute: false,
    manifest: null,
    confirmProjectRef: null,
    confirmBucket: null,
    confirmManifestSha256: null,
    maxDelete: null,
  };
  const valueFlags = new Map([
    ["--manifest", "manifest"],
    ["--confirm-project-ref", "confirmProjectRef"],
    ["--confirm-bucket", "confirmBucket"],
    ["--confirm-manifest-sha256", "confirmManifestSha256"],
    ["--max-delete", "maxDelete"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      parsed.execute = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    const target = valueFlags.get(flag);
    if (!target) throw new StorageSafetyError("UNKNOWN_ARGUMENT");
    parsed[target] = equals >= 0 ? argument.slice(equals + 1) : argv[++index] ?? null;
  }
  if (!parsed.manifest) throw new StorageSafetyError("MANIFEST_REQUIRED");
  if (parsed.maxDelete !== null) parsed.maxDelete = parseInteger(parsed.maxDelete);
  return parsed;
}

function requireManifestPath(path, manifestDirectory) {
  const resolvedPath = resolve(path);
  if (!resolvedPath.startsWith(`${resolve(manifestDirectory)}/`)) throw new StorageSafetyError("MANIFEST_OUTSIDE_LOCAL_ARTIFACT_ROOT");
  return resolvedPath;
}

async function confirmInteractively(plan) {
  if (!input.isTTY || !output.isTTY) return;
  const prompt = `Type DELETE ${plan.eligibleCount} to approve exact-path deletion from ${plan.projectRef}/${plan.bucketId}: `;
  const terminal = createInterface({ input, output });
  const answer = await terminal.question(prompt);
  terminal.close();
  if (answer !== `DELETE ${plan.eligibleCount}`) throw new StorageSafetyError("INTERACTIVE_CONFIRMATION_REJECTED");
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  loadLocalEnv(resolve(process.cwd(), ".env.local"));
  const artifactRoot = resolve(process.cwd(), LOCAL_ARTIFACT_ROOT);
  const manifestDirectory = resolve(artifactRoot, "manifests");
  const auditDirectory = resolve(artifactRoot, "audits");
  const signingKeyPath = resolve(artifactRoot, "manifest-signing.key");
  const manifestPath = requireManifestPath(args.manifest, manifestDirectory);
  const manifestContents = await readFile(manifestPath, "utf8");
  const manifestFileSha256 = sha256(manifestContents);
  const signingKey = (await readFile(signingKeyPath, "utf8")).trim();
  const manifest = verifySignedManifest(JSON.parse(manifestContents), signingKey);
  const adapter = new SupabaseStorageAdapter({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const maxDelete = args.maxDelete ?? MAX_DELETE_HARD_LIMIT;
  const plan = await planCleanup({ manifest, adapter, maxDelete });

  let result = plan;
  if (args.execute) {
    validateDestructiveConfirmations({
      confirmProjectRef: args.confirmProjectRef,
      confirmBucket: args.confirmBucket,
      confirmManifestSha256: args.confirmManifestSha256,
      manifestFileSha256,
      maxDelete: args.maxDelete,
    });
    if (plan.batchRefusal) throw new StorageSafetyError(plan.batchRefusal);
    await confirmInteractively(plan);
    result = await executeCleanup({ manifest, adapter, maxDelete: args.maxDelete });
  }

  await mkdir(auditDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const auditPath = resolve(auditDirectory, `storage-cleanup-${stamp}.sanitized.json`);
  await writeFile(auditPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ ...result, audit: relative(process.cwd(), auditPath), manifestFileSha256 }, null, 2));
}

main().catch((error) => {
  const code = error instanceof StorageSafetyError ? error.code : "UNEXPECTED_CLEANUP_FAILURE";
  console.error(`Storage cleanup refused: ${code}`);
  process.exitCode = 1;
});
