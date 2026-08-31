import assert from "node:assert/strict";
import {
  DEFAULT_GRACE_DAYS,
  PLINY_BUCKET_ID,
  PLINY_PROJECT_REF,
  StorageSafetyError,
  buildManifest,
  createSanitizedReconciliationReport,
  evaluateLiveCandidate,
  executeCleanup,
  pathFingerprint,
  planCleanup,
  sha256,
  signManifest,
  validateDestructiveConfirmations,
  validateExactObjectPath,
  verifySignedManifest,
} from "./lib/storage-reconciliation.mjs";

const DAY = 86_400_000;
const FIRST_AT = "2026-08-01T00:00:00.000Z";
const SECOND_AT = "2026-08-09T00:00:00.000Z";
const OWNER = "145b5ad5-4b74-4081-bad7-918a1185c2f1";
const COLLECTION = "555e5d5e-3144-4eba-babc-7a24309b7e1d";
const OBJECT = "4d0a260d-0c0a-4ce8-ade4-a367ad5a629e";
const PRIVATE_PATH = `${OWNER}/${COLLECTION}/${OBJECT}-private-fixture.pdf`;
const SIGNING_KEY = "local-test-signing-key-not-a-provider-credential";
const SECRET_SENTINEL = "service-role-secret-must-never-appear";

function object(path = PRIVATE_PATH, createdAt = "2026-07-20T00:00:00.000Z") {
  return { path, size: 12345, createdAt, updatedAt: createdAt, ownerId: OWNER };
}

function document(overrides = {}) {
  return {
    id: "d0000000-0000-4000-8000-000000000001",
    collection_id: COLLECTION,
    user_id: OWNER,
    storage_path: PRIVATE_PATH,
    file_size: 12345,
    status: "ready",
    processing_stage: "ready",
    processing_started_at: null,
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot({ objects = [object()], documents = [], chunks = [], nullEmbeddingChunkIds = [] } = {}) {
  return {
    projectRef: PLINY_PROJECT_REF,
    bucketId: PLINY_BUCKET_ID,
    bucketPublic: false,
    objects,
    documents,
    collections: [{ id: COLLECTION, user_id: OWNER }],
    chunks,
    nullEmbeddingChunkIds,
  };
}

function firstManifest(options = {}) {
  return buildManifest({ snapshot: snapshot(options), generatedAt: FIRST_AT });
}

function secondManifest(options = {}, secondAt = SECOND_AT) {
  const first = firstManifest(options);
  return buildManifest({ snapshot: snapshot(options), generatedAt: secondAt, previousManifest: first });
}

class MockAdapter {
  constructor({ liveObject = object(), references = { referenceCount: 0, processingReferenceCount: 0 }, projectRef = PLINY_PROJECT_REF, bucketId = PLINY_BUCKET_ID, bucketPublic = false, deleteResult = { ok: true }, verificationError = false } = {}) {
    this.liveObject = liveObject;
    this.references = references;
    this.projectRef = projectRef;
    this.bucketId = bucketId;
    this.bucketPublic = bucketPublic;
    this.deleteResult = deleteResult;
    this.verificationError = verificationError;
    this.deleteCalls = [];
    this.getObjectCalls = 0;
  }

  async verifyIdentity() {
    return { projectRef: this.projectRef, bucketId: this.bucketId, bucketPublic: this.bucketPublic };
  }

  async getObject() {
    this.getObjectCalls += 1;
    if (this.verificationError && this.deleteCalls.length > 0) throw new Error("verification unavailable");
    return this.liveObject;
  }

  async getReferences() {
    return this.references;
  }

  async deleteObject(path) {
    this.deleteCalls.push(path);
    if (this.deleteResult.ok) this.liveObject = null;
    return this.deleteResult;
  }
}

function expectSafetyError(action, code) {
  assert.throws(action, (error) => error instanceof StorageSafetyError && error.code === code);
}

// Default planning is dry-run and a first witness alone remains ineligible.
const first = firstManifest();
const firstPlan = await planCleanup({ manifest: first, adapter: new MockAdapter(), now: new Date(SECOND_AT), maxDelete: 2 });
assert.equal(firstPlan.mode, "dry-run");
assert.equal(firstPlan.eligibleCount, 0);
assert.equal(firstPlan.candidates[0].refusalReasons.includes("SECOND_WITNESS_MISSING"), true);

// Young objects are rejected even when two observations otherwise agree.
const youngFirst = firstManifest({ objects: [object(PRIVATE_PATH, "2026-08-05T00:00:00.000Z")] });
const youngSecond = buildManifest({ snapshot: snapshot({ objects: [object(PRIVATE_PATH, "2026-08-05T00:00:00.000Z")] }), generatedAt: SECOND_AT, previousManifest: youngFirst });
const youngPlan = await planCleanup({ manifest: youngSecond, adapter: new MockAdapter({ liveObject: object(PRIVATE_PATH, "2026-08-05T00:00:00.000Z") }), now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(youngPlan.candidates[0].refusalReasons.includes("AGE_UNDER_GRACE_PERIOD"), true);

// A missing second inventory and a second inventory less than seven complete days later are rejected.
assert.equal(first.candidates[0].eligibility.reasons.includes("SECOND_WITNESS_MISSING"), true);
const earlySecond = secondManifest({}, new Date(Date.parse(FIRST_AT) + 6 * DAY).toISOString());
assert.equal(earlySecond.candidates[0].eligibility.reasons.includes("SECOND_WITNESS_TOO_SOON"), true);

// A stable exact-path candidate independently observed after seven days becomes eligible.
const stable = secondManifest();
assert.equal(stable.candidates[0].eligibility.state, "eligible");
const stablePlan = await planCleanup({ manifest: stable, adapter: new MockAdapter(), now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(stablePlan.eligibleCount, 1);

// Current references and active processing references independently block deletion.
const referenced = await planCleanup({ manifest: stable, adapter: new MockAdapter({ references: { referenceCount: 1, processingReferenceCount: 0 } }), now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(referenced.candidates[0].refusalReasons.includes("CURRENT_DATABASE_REFERENCE"), true);
const processing = await planCleanup({ manifest: stable, adapter: new MockAdapter({ references: { referenceCount: 1, processingReferenceCount: 1 } }), now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(processing.candidates[0].refusalReasons.includes("CURRENT_PROCESSING_REFERENCE"), true);
const ownershipMismatchObject = { ...object(), ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const ownershipMismatch = await planCleanup({ manifest: stable, adapter: new MockAdapter({ liveObject: ownershipMismatchObject }), now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(ownershipMismatch.candidates[0].refusalReasons.includes("LIVE_OBJECT_METADATA_CHANGED"), true);

// Wrong remote identity and cross-project/bucket manifests are refused.
await assert.rejects(() => planCleanup({ manifest: stable, adapter: new MockAdapter({ projectRef: "aaaaaaaaaaaaaaaaaaaa" }), now: new Date(SECOND_AT), maxDelete: 1 }), /PROJECT_IDENTITY_MISMATCH/);
const wrongProject = { ...stable, projectRef: "aaaaaaaaaaaaaaaaaaaa" };
await assert.rejects(() => planCleanup({ manifest: wrongProject, adapter: new MockAdapter(), now: new Date(SECOND_AT), maxDelete: 1 }), /WRONG_MANIFEST_PROJECT_REF/);
const wrongBucket = { ...stable, bucketId: "other" };
await assert.rejects(() => planCleanup({ manifest: wrongBucket, adapter: new MockAdapter(), now: new Date(SECOND_AT), maxDelete: 1 }), /WRONG_MANIFEST_BUCKET/);

// Exact-path validation rejects malformed ownership, traversal, wildcard, prefix, folder and root targets.
assert.equal(validateExactObjectPath(PRIVATE_PATH).ok, true);
for (const [unsafePath, reason] of [
  [`${OWNER}/${COLLECTION}/plain-name.pdf`, "MALFORMED_OWNERSHIP_PATH"],
  [`${OWNER}/${COLLECTION}/../secret.pdf`, "PATH_TRAVERSAL"],
  [`${OWNER}/${COLLECTION}/*.pdf`, "WILDCARD_OR_UNSAFE_PATH"],
  [`${OWNER}/${COLLECTION}`, "PATH_PREFIX_OR_DEPTH"],
  [`${OWNER}/${COLLECTION}/`, "ROOT_OR_FOLDER_PATH"],
  ["/", "ROOT_OR_FOLDER_PATH"],
]) {
  assert.deepEqual(validateExactObjectPath(unsafePath), { ok: false, reason });
}

// Signed manifests cannot be hand-edited, and execute confirmation requires the exact file hash.
const signed = signManifest(stable, SIGNING_KEY);
assert.equal(verifySignedManifest(signed, SIGNING_KEY).integrity.algorithm, "HMAC-SHA256");
expectSafetyError(() => verifySignedManifest({ ...signed, generatedAt: "2026-08-09T00:00:01.000Z" }, SIGNING_KEY), "MANIFEST_INTEGRITY_MISMATCH");
const manifestFileSha256 = sha256(`${JSON.stringify(signed, null, 2)}\n`);
validateDestructiveConfirmations({
  confirmProjectRef: PLINY_PROJECT_REF,
  confirmBucket: PLINY_BUCKET_ID,
  confirmManifestSha256: manifestFileSha256,
  manifestFileSha256,
  maxDelete: 1,
});
expectSafetyError(() => validateDestructiveConfirmations({ confirmProjectRef: PLINY_PROJECT_REF, confirmBucket: PLINY_BUCKET_ID, confirmManifestSha256: "0".repeat(64), manifestFileSha256, maxDelete: 1 }), "MANIFEST_HASH_CONFIRMATION_MISMATCH");

// A batch above the operator maximum is refused before deletion.
const secondPath = `${OWNER}/${COLLECTION}/5d0a260d-0c0a-4ce8-ade4-a367ad5a629e-second.pdf`;
const twoFirst = buildManifest({ snapshot: snapshot({ objects: [object(), object(secondPath)] }), generatedAt: FIRST_AT });
const twoStable = buildManifest({ snapshot: snapshot({ objects: [object(), object(secondPath)] }), generatedAt: SECOND_AT, previousManifest: twoFirst });
const twoObjectAdapter = new MockAdapter();
twoObjectAdapter.getObject = async (path) => path === PRIVATE_PATH || path === secondPath ? object(path) : null;
const overLimit = await planCleanup({ manifest: twoStable, adapter: twoObjectAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(overLimit.batchRefusal, "MAX_DELETE_EXCEEDED");
await assert.rejects(() => executeCleanup({ manifest: twoStable, adapter: twoObjectAdapter, now: new Date(SECOND_AT), maxDelete: 1 }), /MAX_DELETE_EXCEEDED/);
assert.equal(twoObjectAdapter.deleteCalls.length, 0);

// One eligible candidate invokes one exact deletion and verifies absence.
const exactAdapter = new MockAdapter();
const deletionAudit = await executeCleanup({ manifest: stable, adapter: exactAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
assert.deepEqual(exactAdapter.deleteCalls, [PRIVATE_PATH]);
assert.equal(deletionAudit.outcomes[0].status, "deleted_verified");
assert.equal(exactAdapter.getObjectCalls >= 3, true);

// Explicit deletion failure is failed; unavailable post-delete verification is uncertain.
const failedAdapter = new MockAdapter({ deleteResult: { ok: false, code: "STORAGE_DELETE_REJECTED" } });
const failedAudit = await executeCleanup({ manifest: stable, adapter: failedAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(failedAudit.outcomes[0].status, "failed");
const uncertainAdapter = new MockAdapter({ verificationError: true });
const uncertainAudit = await executeCleanup({ manifest: stable, adapter: uncertainAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(uncertainAudit.outcomes[0].status, "uncertain");

// Repeated execution is idempotent and reports an already-absent object distinctly.
const repeatAdapter = new MockAdapter();
await executeCleanup({ manifest: stable, adapter: repeatAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
const repeatedAudit = await executeCleanup({ manifest: stable, adapter: repeatAdapter, now: new Date(SECOND_AT), maxDelete: 1 });
assert.equal(repeatedAudit.outcomes[0].status, "already_absent");
assert.equal(repeatAdapter.deleteCalls.length, 1);

// Referenced and processing objects are not emitted as new orphan candidates.
assert.equal(firstManifest({ documents: [document()] }).candidates.length, 0);
assert.equal(firstManifest({ documents: [document({ status: "processing", processing_stage: "embedding" })] }).candidates.length, 0);

// Sanitized reports and terminal-shaped results contain fingerprints, never paths, filenames or credentials.
const sanitized = JSON.stringify(createSanitizedReconciliationReport(signed));
const terminalResult = JSON.stringify(stablePlan);
for (const output of [sanitized, terminalResult, JSON.stringify(deletionAudit)]) {
  assert.equal(output.includes(PRIVATE_PATH), false);
  assert.equal(output.includes("private-fixture.pdf"), false);
  assert.equal(output.includes(SECRET_SENTINEL), false);
  assert.equal(output.includes(pathFingerprint(PRIVATE_PATH)), true);
}

// The local admin credential identifier and a service-role sentinel are absent from browser source.
const { readFile, readdir } = await import("node:fs/promises");
const { resolve } = await import("node:path");
async function browserFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await browserFiles(path));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
for (const path of await browserFiles(resolve(process.cwd(), "src"))) {
  const source = await readFile(path, "utf8");
  if (source.includes('"use client"') || source.includes("'use client'") || path.endsWith("/src/lib/supabase/client.ts")) {
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
    assert.equal(source.includes(SECRET_SENTINEL), false);
  }
}

// Direct eligibility helper remains conservative when any condition is unknown.
assert.equal(evaluateLiveCandidate({ candidate: stable.candidates[0], liveObject: null, references: { referenceCount: 0, processingReferenceCount: 0 }, now: new Date(SECOND_AT), graceDays: DEFAULT_GRACE_DAYS }).eligible, false);

console.log("Storage reconciliation and exact-path cleanup safety tests passed.");
