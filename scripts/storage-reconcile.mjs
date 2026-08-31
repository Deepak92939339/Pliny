import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  LOCAL_ARTIFACT_ROOT,
  PLINY_BUCKET_ID,
  PLINY_PROJECT_REF,
  StorageSafetyError,
  SupabaseStorageAdapter,
  buildManifest,
  createSanitizedReconciliationReport,
  createSigningKey,
  loadLocalEnv,
  sha256,
  signManifest,
  verifySignedManifest,
} from "./lib/storage-reconciliation.mjs";

function parseArguments(argv) {
  const parsed = { previousManifest: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--previous-manifest") {
      parsed.previousManifest = argv[++index] ?? null;
    } else if (argument.startsWith("--previous-manifest=")) {
      parsed.previousManifest = argument.slice("--previous-manifest=".length);
    } else {
      throw new StorageSafetyError("UNKNOWN_ARGUMENT");
    }
  }
  return parsed;
}

function requireInside(path, parent) {
  const resolvedPath = resolve(path);
  const resolvedParent = `${resolve(parent)}/`;
  if (!resolvedPath.startsWith(resolvedParent)) throw new StorageSafetyError("MANIFEST_OUTSIDE_LOCAL_ARTIFACT_ROOT");
  return resolvedPath;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  loadLocalEnv(resolve(process.cwd(), ".env.local"));
  const artifactRoot = resolve(process.cwd(), LOCAL_ARTIFACT_ROOT);
  const manifestDirectory = resolve(artifactRoot, "manifests");
  const reportDirectory = resolve(artifactRoot, "reports");
  const signingKeyPath = resolve(artifactRoot, "manifest-signing.key");
  await mkdir(manifestDirectory, { recursive: true, mode: 0o700 });
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });

  if (!existsSync(signingKeyPath)) {
    await writeFile(signingKeyPath, `${createSigningKey()}\n`, { mode: 0o600, flag: "wx" });
  }
  await chmod(signingKeyPath, 0o600);
  const signingKey = (await readFile(signingKeyPath, "utf8")).trim();

  let previousManifest = null;
  if (args.previousManifest) {
    const previousPath = requireInside(args.previousManifest, manifestDirectory);
    previousManifest = verifySignedManifest(JSON.parse(await readFile(previousPath, "utf8")), signingKey);
  }

  const adapter = new SupabaseStorageAdapter({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const snapshot = await adapter.inventory();
  const generatedAt = new Date().toISOString();
  const signedManifest = signManifest(buildManifest({ snapshot, generatedAt, previousManifest }), signingKey);
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const manifestPath = resolve(manifestDirectory, `storage-candidates-${stamp}.json`);
  const reportPath = resolve(reportDirectory, `storage-reconcile-${stamp}.sanitized.json`);
  const manifestContents = `${JSON.stringify(signedManifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestContents, { mode: 0o600, flag: "wx" });
  await writeFile(reportPath, `${JSON.stringify(createSanitizedReconciliationReport(signedManifest), null, 2)}\n`, { mode: 0o600, flag: "wx" });

  console.log(JSON.stringify({
    mode: "read-only",
    projectRef: PLINY_PROJECT_REF,
    bucketId: PLINY_BUCKET_ID,
    manifest: relative(process.cwd(), manifestPath),
    sanitizedReport: relative(process.cwd(), reportPath),
    manifestFileSha256: sha256(manifestContents),
    objectCount: signedManifest.inventory.objectCount,
    documentCount: signedManifest.inventory.documentCount,
    candidateCount: signedManifest.candidates.length,
    eligibleCount: signedManifest.candidates.filter((candidate) => candidate.eligibility.state === "eligible").length,
    candidates: signedManifest.candidates.map((candidate) => ({
      pathSha256: candidate.pathSha256,
      objectSize: candidate.objectSize,
      firstWitness: Boolean(candidate.firstWitness?.orphanConfirmed),
      secondWitness: Boolean(candidate.secondWitness?.orphanConfirmed),
      eligibility: candidate.eligibility,
    })),
  }, null, 2));
}

main().catch((error) => {
  const code = error instanceof StorageSafetyError ? error.code : "UNEXPECTED_RECONCILIATION_FAILURE";
  console.error(`Storage reconciliation refused: ${code}`);
  process.exitCode = 1;
});
