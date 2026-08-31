import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const PLINY_PROJECT_REF = "lnvosbeeybisdixfwqdo";
export const PLINY_BUCKET_ID = "documents";
export const MANIFEST_VERSION = 1;
export const DEFAULT_GRACE_DAYS = 7;
export const MAX_DELETE_HARD_LIMIT = 5;
export const LOCAL_ARTIFACT_ROOT = ".pliny-storage";

const ACTIVE_PROCESSING_STAGES = new Set([
  "validating",
  "uploading",
  "extracting",
  "ocr_fallback",
  "chunking",
  "embedding",
  "indexing",
]);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const EXACT_OBJECT_PATH = new RegExp(`^${UUID}/${UUID}/${UUID}-[a-z0-9_.-]+$`, "i");
const FORBIDDEN_PATH_TOKEN = /[\\*?\[\]{}\u0000-\u001f\u007f]/;

export class StorageSafetyError extends Error {
  constructor(code) {
    super(code);
    this.name = "StorageSafetyError";
    this.code = code;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function validateExactObjectPath(path) {
  if (typeof path !== "string" || path.length === 0) return { ok: false, reason: "EMPTY_PATH" };
  if (path === "/" || path.startsWith("/") || path.endsWith("/")) return { ok: false, reason: "ROOT_OR_FOLDER_PATH" };
  if (FORBIDDEN_PATH_TOKEN.test(path)) return { ok: false, reason: "WILDCARD_OR_UNSAFE_PATH" };
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return { ok: false, reason: "PATH_TRAVERSAL" };
  if (segments.length !== 3) return { ok: false, reason: "PATH_PREFIX_OR_DEPTH" };
  if (!EXACT_OBJECT_PATH.test(path)) return { ok: false, reason: "MALFORMED_OWNERSHIP_PATH" };
  return { ok: true, reason: null };
}

export function pathFingerprint(path) {
  return sha256(path);
}

function isActiveDocument(document) {
  return document.status === "processing" || ACTIVE_PROCESSING_STAGES.has(document.processing_stage);
}

function toTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function completeDaysBetween(first, second) {
  const firstTimestamp = toTimestamp(first);
  const secondTimestamp = toTimestamp(second);
  if (firstTimestamp === null || secondTimestamp === null || secondTimestamp < firstTimestamp) return -1;
  return Math.floor((secondTimestamp - firstTimestamp) / 86_400_000);
}

function metadataMatches(expected, observed) {
  const expectedMetadata = {
    size: expected?.objectSize ?? expected?.size,
    createdAt: expected?.objectCreatedAt ?? expected?.createdAt,
    updatedAt: expected?.objectUpdatedAt ?? expected?.updatedAt,
    ownerId: expected?.objectOwnerId ?? expected?.ownerId,
  };
  const observedMetadata = {
    size: observed?.objectSize ?? observed?.size,
    createdAt: observed?.objectCreatedAt ?? observed?.createdAt,
    updatedAt: observed?.objectUpdatedAt ?? observed?.updatedAt,
    ownerId: observed?.objectOwnerId ?? observed?.ownerId,
  };
  return Boolean(
    expected && observed &&
      expectedMetadata.size === observedMetadata.size &&
      expectedMetadata.createdAt === observedMetadata.createdAt &&
      expectedMetadata.updatedAt === observedMetadata.updatedAt &&
      expectedMetadata.ownerId === observedMetadata.ownerId
  );
}

function metadataKnown(value) {
  const size = value?.objectSize ?? value?.size;
  const createdAt = value?.objectCreatedAt ?? value?.createdAt;
  const updatedAt = value?.objectUpdatedAt ?? value?.updatedAt;
  const ownerId = value?.objectOwnerId ?? value?.ownerId;
  return Number.isFinite(size) && size >= 0 && toTimestamp(createdAt) !== null && toTimestamp(updatedAt) !== null && typeof ownerId === "string" && ownerId.length > 0;
}

function candidateId(projectRef, bucketId, path) {
  return `cand_${sha256(`${projectRef}:${bucketId}:${path}`).slice(0, 24)}`;
}

function witnessFromObject({ object, documents, observedAt }) {
  const references = documents.filter((document) => document.storage_path === object.path);
  const processingReferences = references.filter(isActiveDocument);
  return {
    observedAt,
    objectExists: true,
    databaseReferenceCount: references.length,
    processingReferenceCount: processingReferences.length,
    objectSize: object.size,
    objectCreatedAt: object.createdAt,
    objectUpdatedAt: object.updatedAt,
    objectOwnerId: object.ownerId,
    orphanConfirmed: references.length === 0 && processingReferences.length === 0,
  };
}

function absentWitness(observedAt) {
  return {
    observedAt,
    objectExists: false,
    databaseReferenceCount: 0,
    processingReferenceCount: 0,
    objectSize: null,
    objectCreatedAt: null,
    objectUpdatedAt: null,
    objectOwnerId: null,
    orphanConfirmed: false,
  };
}

function zeroClassification() {
  return {
    STORAGE_ORPHAN: { count: 0, bytes: 0 },
    MISSING_OBJECT: { count: 0, bytes: 0 },
    CHUNK_ORPHAN: { count: 0, bytes: 0 },
    COLLECTION_ORPHAN: { count: 0, bytes: 0 },
    STALE_PROCESSING: { count: 0, bytes: 0 },
    FAILED_WITH_OBJECT: { count: 0, bytes: 0 },
    READY_WITHOUT_COMPLETE_CHUNKS: { count: 0, bytes: 0 },
    DUPLICATE_REFERENCE: { count: 0, bytes: 0 },
    UNEXPECTED_OBJECT: { count: 0, bytes: 0 },
  };
}

export function classifySnapshot(snapshot, now = new Date()) {
  const classification = zeroClassification();
  const objectsByPath = new Map(snapshot.objects.map((object) => [object.path, object]));
  const documentsById = new Map(snapshot.documents.map((document) => [document.id, document]));
  const collectionsById = new Map(snapshot.collections.map((collection) => [collection.id, collection]));
  const documentsByPath = new Map();
  const chunksByDocument = new Map();
  const nullEmbeddingChunkIds = new Set(snapshot.nullEmbeddingChunkIds);

  for (const document of snapshot.documents) {
    const references = documentsByPath.get(document.storage_path) ?? [];
    references.push(document);
    documentsByPath.set(document.storage_path, references);
  }
  for (const chunk of snapshot.chunks) {
    const chunks = chunksByDocument.get(chunk.document_id) ?? [];
    chunks.push(chunk);
    chunksByDocument.set(chunk.document_id, chunks);
  }

  for (const object of snapshot.objects) {
    const references = documentsByPath.get(object.path) ?? [];
    if (references.length === 0) {
      classification.STORAGE_ORPHAN.count += 1;
      classification.STORAGE_ORPHAN.bytes += object.size;
    }
    if (!validateExactObjectPath(object.path).ok) {
      classification.UNEXPECTED_OBJECT.count += 1;
      classification.UNEXPECTED_OBJECT.bytes += object.size;
    }
  }

  for (const document of snapshot.documents) {
    if (!objectsByPath.has(document.storage_path)) {
      classification.MISSING_OBJECT.count += 1;
      classification.MISSING_OBJECT.bytes += document.file_size ?? 0;
    }
    if (!collectionsById.has(document.collection_id)) {
      classification.COLLECTION_ORPHAN.count += 1;
      classification.COLLECTION_ORPHAN.bytes += document.file_size ?? 0;
    }
    const startedAt = document.processing_started_at ?? document.created_at;
    if (isActiveDocument(document) && completeDaysBetween(startedAt, now.toISOString()) >= 0 && now.getTime() - Date.parse(startedAt) > 15 * 60_000) {
      classification.STALE_PROCESSING.count += 1;
      classification.STALE_PROCESSING.bytes += document.file_size ?? 0;
    }
    if (document.status === "failed" && objectsByPath.has(document.storage_path)) {
      classification.FAILED_WITH_OBJECT.count += 1;
      classification.FAILED_WITH_OBJECT.bytes += document.file_size ?? objectsByPath.get(document.storage_path)?.size ?? 0;
    }
    if (document.status === "ready") {
      const chunks = chunksByDocument.get(document.id) ?? [];
      const indexes = chunks.map((chunk) => chunk.chunk_index).sort((left, right) => left - right);
      const contiguous = indexes.length > 0 && indexes.every((index, position) => index === position);
      const hasNullEmbedding = chunks.some((chunk) => nullEmbeddingChunkIds.has(chunk.id));
      if (!contiguous || hasNullEmbedding) {
        classification.READY_WITHOUT_COMPLETE_CHUNKS.count += 1;
        classification.READY_WITHOUT_COMPLETE_CHUNKS.bytes += document.file_size ?? 0;
      }
    }
  }

  for (const chunk of snapshot.chunks) {
    if (!documentsById.has(chunk.document_id)) classification.CHUNK_ORPHAN.count += 1;
  }
  for (const references of documentsByPath.values()) {
    if (references.length > 1) {
      classification.DUPLICATE_REFERENCE.count += references.length;
      classification.DUPLICATE_REFERENCE.bytes += references.reduce((total, document) => total + (document.file_size ?? 0), 0);
    }
  }
  return classification;
}

function getEligibilityReasons(candidate, now, graceDays) {
  const reasons = [];
  const pathCheck = validateExactObjectPath(candidate.exactStoragePath);
  if (!pathCheck.ok) reasons.push(pathCheck.reason);
  else if (candidate.firstWitness?.objectOwnerId !== candidate.exactStoragePath.split("/")[0]) reasons.push("STORAGE_OWNER_PATH_MISMATCH");
  if (candidate.orphanReasonCode !== "STORAGE_ORPHAN") reasons.push("UNSUPPORTED_REASON_CODE");
  if (!candidate.firstWitness?.objectExists || !candidate.firstWitness?.orphanConfirmed) reasons.push("FIRST_WITNESS_INVALID");
  if (!metadataKnown(candidate.firstWitness)) reasons.push("OBJECT_METADATA_UNKNOWN");
  if (!candidate.secondWitness) {
    reasons.push("SECOND_WITNESS_MISSING");
  } else {
    if (!candidate.secondWitness.objectExists || !candidate.secondWitness.orphanConfirmed) reasons.push("SECOND_WITNESS_INVALID");
    if (completeDaysBetween(candidate.firstWitness.observedAt, candidate.secondWitness.observedAt) < graceDays) reasons.push("SECOND_WITNESS_TOO_SOON");
    if (!metadataMatches(candidate.firstWitness, candidate.secondWitness)) reasons.push("OBJECT_METADATA_CHANGED");
  }
  if (completeDaysBetween(candidate.objectCreatedAt, now.toISOString()) < graceDays) reasons.push("AGE_UNDER_GRACE_PERIOD");
  return [...new Set(reasons)];
}

function buildCandidate({ object, documents, observedAt, projectRef, bucketId, previousCandidate, graceDays }) {
  const currentWitness = object ? witnessFromObject({ object, documents, observedAt }) : absentWitness(observedAt);
  const firstWitness = previousCandidate?.firstWitness ?? currentWitness;
  const secondWitness = previousCandidate ? currentWitness : null;
  const exactStoragePath = object?.path ?? previousCandidate?.exactStoragePath;
  if (!exactStoragePath) throw new StorageSafetyError("CANDIDATE_IDENTITY_MISMATCH");
  const candidate = {
    candidateId: previousCandidate?.candidateId ?? candidateId(projectRef, bucketId, exactStoragePath),
    exactStoragePath,
    pathSha256: pathFingerprint(exactStoragePath),
    objectSize: firstWitness.objectSize,
    objectCreatedAt: firstWitness.objectCreatedAt,
    objectUpdatedAt: firstWitness.objectUpdatedAt,
    objectOwnerId: firstWitness.objectOwnerId,
    pathOwnerId: exactStoragePath.split("/")[0],
    pathCollectionId: exactStoragePath.split("/")[1],
    orphanReasonCode: "STORAGE_ORPHAN",
    databaseReferenceCount: currentWitness.databaseReferenceCount,
    processingReferenceCount: currentWitness.processingReferenceCount,
    firstWitness,
    secondWitness,
    eligibility: { state: "ineligible", reasons: [] },
  };
  const reasons = getEligibilityReasons(candidate, new Date(observedAt), graceDays);
  candidate.eligibility = { state: reasons.length === 0 ? "eligible" : "ineligible", reasons };
  return candidate;
}

export function buildManifest({ snapshot, generatedAt, previousManifest = null, projectRef = PLINY_PROJECT_REF, bucketId = PLINY_BUCKET_ID, graceDays = DEFAULT_GRACE_DAYS }) {
  if (snapshot.projectRef !== projectRef) throw new StorageSafetyError("PROJECT_IDENTITY_MISMATCH");
  if (snapshot.bucketId !== bucketId || snapshot.bucketPublic !== false) throw new StorageSafetyError("BUCKET_IDENTITY_MISMATCH");
  const previousByPath = new Map((previousManifest?.candidates ?? []).map((candidate) => [candidate.exactStoragePath, candidate]));
  const objectsByPath = new Map(snapshot.objects.map((object) => [object.path, object]));
  const candidatePaths = new Set(previousByPath.keys());
  for (const object of snapshot.objects) {
    if (!snapshot.documents.some((document) => document.storage_path === object.path)) candidatePaths.add(object.path);
  }
  const candidates = [...candidatePaths]
    .map((path) => buildCandidate({
      object: objectsByPath.get(path) ?? null,
      documents: snapshot.documents,
      observedAt: generatedAt,
      projectRef,
      bucketId,
      previousCandidate: previousByPath.get(path),
      graceDays,
    }))
    .sort((left, right) => left.pathSha256.localeCompare(right.pathSha256));
  const classification = classifySnapshot(snapshot, new Date(generatedAt));
  return {
    manifestVersion: MANIFEST_VERSION,
    generatedBy: "pliny-storage-reconcile",
    projectRef,
    bucketId,
    generatedAt,
    gracePeriodDays: graceDays,
    firstInventoryAt: previousManifest?.firstInventoryAt ?? generatedAt,
    secondInventoryAt: previousManifest ? generatedAt : null,
    inventory: {
      objectCount: snapshot.objects.length,
      objectBytes: snapshot.objects.reduce((total, object) => total + object.size, 0),
      documentCount: snapshot.documents.length,
      chunkCount: snapshot.chunks.length,
      classification,
    },
    candidates,
  };
}

export function signManifest(unsignedManifest, signingKey) {
  const manifestSha256 = sha256(stableStringify(unsignedManifest));
  const signature = createHmac("sha256", signingKey).update(manifestSha256).digest("hex");
  return {
    ...unsignedManifest,
    integrity: { algorithm: "HMAC-SHA256", manifestSha256, signature },
  };
}

export function verifySignedManifest(manifest, signingKey) {
  if (!manifest || manifest.manifestVersion !== MANIFEST_VERSION || manifest.generatedBy !== "pliny-storage-reconcile") {
    throw new StorageSafetyError("INVALID_MANIFEST_FORMAT");
  }
  if (manifest.projectRef !== PLINY_PROJECT_REF) throw new StorageSafetyError("WRONG_MANIFEST_PROJECT_REF");
  if (manifest.bucketId !== PLINY_BUCKET_ID) throw new StorageSafetyError("WRONG_MANIFEST_BUCKET");
  if (manifest.gracePeriodDays !== DEFAULT_GRACE_DAYS) throw new StorageSafetyError("INVALID_GRACE_PERIOD");
  if (!Array.isArray(manifest.candidates) || !manifest.integrity) throw new StorageSafetyError("INVALID_MANIFEST_FORMAT");
  const { integrity, ...unsignedManifest } = manifest;
  const expectedHash = sha256(stableStringify(unsignedManifest));
  const expectedSignature = createHmac("sha256", signingKey).update(expectedHash).digest("hex");
  const actualSignature = String(integrity.signature ?? "");
  if (integrity.algorithm !== "HMAC-SHA256" || integrity.manifestSha256 !== expectedHash || actualSignature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(actualSignature), Buffer.from(expectedSignature))) {
    throw new StorageSafetyError("MANIFEST_INTEGRITY_MISMATCH");
  }
  for (const candidate of manifest.candidates) {
    if (candidate.pathSha256 !== pathFingerprint(candidate.exactStoragePath)) throw new StorageSafetyError("MANIFEST_PATH_FINGERPRINT_MISMATCH");
  }
  return manifest;
}

export function createSigningKey() {
  return randomBytes(32).toString("hex");
}

export function createSanitizedReconciliationReport(manifest) {
  return {
    reportVersion: 1,
    projectRef: manifest.projectRef,
    bucketId: manifest.bucketId,
    generatedAt: manifest.generatedAt,
    firstInventoryAt: manifest.firstInventoryAt,
    secondInventoryAt: manifest.secondInventoryAt,
    gracePeriodDays: manifest.gracePeriodDays,
    inventory: manifest.inventory,
    candidates: manifest.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      pathSha256: candidate.pathSha256,
      objectSize: candidate.objectSize,
      orphanReasonCode: candidate.orphanReasonCode,
      firstWitness: Boolean(candidate.firstWitness?.orphanConfirmed),
      secondWitness: Boolean(candidate.secondWitness?.orphanConfirmed),
      eligibility: candidate.eligibility,
    })),
  };
}

export function loadLocalEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].includes(key) && !process.env[key]) process.env[key] = value;
  }
}

function projectRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function paginate(queryFactory) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw new StorageSafetyError("DATABASE_INVENTORY_UNAVAILABLE");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function normalizeListedObject(prefix, item) {
  const path = prefix ? `${prefix}/${item.name}` : item.name;
  const size = Number(item.metadata?.size ?? 0);
  return {
    path,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    createdAt: item.created_at ?? item.createdAt ?? null,
    updatedAt: item.updated_at ?? item.updatedAt ?? item.last_modified ?? item.lastModified ?? null,
    ownerId: item.owner_id ?? item.ownerId ?? null,
  };
}

export class SupabaseStorageAdapter {
  constructor({ supabaseUrl, serviceRoleKey, projectRef = PLINY_PROJECT_REF, bucketId = PLINY_BUCKET_ID, client = null }) {
    if (!supabaseUrl || !serviceRoleKey) throw new StorageSafetyError("LOCAL_ADMIN_CONFIGURATION_MISSING");
    if (projectRefFromUrl(supabaseUrl) !== projectRef) throw new StorageSafetyError("PROJECT_IDENTITY_MISMATCH");
    this.projectRef = projectRef;
    this.bucketId = bucketId;
    this.client = client ?? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  async verifyIdentity() {
    const { data, error } = await this.client.storage.getBucket(this.bucketId);
    if (error || !data) throw new StorageSafetyError("BUCKET_IDENTITY_UNAVAILABLE");
    if (data.id !== this.bucketId || data.name !== this.bucketId || data.public !== false) throw new StorageSafetyError("BUCKET_IDENTITY_MISMATCH");
    return { projectRef: this.projectRef, bucketId: this.bucketId, bucketPublic: data.public };
  }

  async listFolder(prefix) {
    const items = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await this.client.storage.from(this.bucketId).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new StorageSafetyError("STORAGE_INVENTORY_UNAVAILABLE");
      items.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return items;
  }

  async listObjects() {
    const objects = [];
    const queue = [{ prefix: "", depth: 0 }];
    let visitedFolders = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth > 8 || visitedFolders > 10_000) throw new StorageSafetyError("STORAGE_PATH_DEPTH_AMBIGUOUS");
      visitedFolders += 1;
      const items = await this.listFolder(current.prefix);
      for (const item of items) {
        const path = current.prefix ? `${current.prefix}/${item.name}` : item.name;
        const isFolder = item.id == null && item.metadata == null;
        if (isFolder) queue.push({ prefix: path, depth: current.depth + 1 });
        else objects.push(normalizeListedObject(current.prefix, item));
      }
    }
    return objects;
  }

  async getObject(path) {
    const pathCheck = validateExactObjectPath(path);
    if (!pathCheck.ok) throw new StorageSafetyError(pathCheck.reason);
    const segments = path.split("/");
    const name = segments.pop();
    const parent = segments.join("/");
    const items = await this.listFolder(parent);
    const item = items.find((candidate) => candidate.name === name && !(candidate.id == null && candidate.metadata == null));
    return item ? normalizeListedObject(parent, item) : null;
  }

  async getDocuments() {
    return paginate((from, to) => this.client.from("documents")
      .select("id,collection_id,user_id,storage_path,file_size,status,processing_stage,processing_started_at,created_at")
      .order("id", { ascending: true }).range(from, to));
  }

  async getReferences(path) {
    const { data, error } = await this.client.from("documents")
      .select("id,storage_path,status,processing_stage,processing_started_at,created_at")
      .eq("storage_path", path);
    if (error) throw new StorageSafetyError("DATABASE_REFERENCE_CHECK_UNAVAILABLE");
    const references = data ?? [];
    return { referenceCount: references.length, processingReferenceCount: references.filter(isActiveDocument).length };
  }

  async inventory() {
    const identity = await this.verifyIdentity();
    const [objects, documents, collections, chunks, nullEmbeddingChunks] = await Promise.all([
      this.listObjects(),
      this.getDocuments(),
      paginate((from, to) => this.client.from("collections").select("id,user_id").order("id", { ascending: true }).range(from, to)),
      paginate((from, to) => this.client.from("document_chunks").select("id,document_id,collection_id,chunk_index").order("id", { ascending: true }).range(from, to)),
      paginate((from, to) => this.client.from("document_chunks").select("id").is("embedding", null).order("id", { ascending: true }).range(from, to)),
    ]);
    return {
      ...identity,
      objects,
      documents,
      collections,
      chunks,
      nullEmbeddingChunkIds: nullEmbeddingChunks.map((chunk) => chunk.id),
    };
  }

  async deleteObject(path) {
    const pathCheck = validateExactObjectPath(path);
    if (!pathCheck.ok) throw new StorageSafetyError(pathCheck.reason);
    const { error } = await this.client.storage.from(this.bucketId).remove([path]);
    if (error) return { ok: false, code: "STORAGE_DELETE_REJECTED" };
    return { ok: true };
  }
}

export function evaluateLiveCandidate({ candidate, liveObject, references, now, graceDays = DEFAULT_GRACE_DAYS }) {
  const reasons = getEligibilityReasons(candidate, now, graceDays);
  if (!liveObject) reasons.push("OBJECT_ABSENT");
  else if (!metadataKnown(liveObject)) reasons.push("LIVE_OBJECT_METADATA_UNKNOWN");
  else if (!metadataMatches(candidate.firstWitness, liveObject)) reasons.push("LIVE_OBJECT_METADATA_CHANGED");
  if (references.referenceCount !== 0) reasons.push("CURRENT_DATABASE_REFERENCE");
  if (references.processingReferenceCount !== 0) reasons.push("CURRENT_PROCESSING_REFERENCE");
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export async function planCleanup({ manifest, adapter, now = new Date(), maxDelete = MAX_DELETE_HARD_LIMIT }) {
  if (manifest.projectRef !== PLINY_PROJECT_REF) throw new StorageSafetyError("WRONG_MANIFEST_PROJECT_REF");
  if (manifest.bucketId !== PLINY_BUCKET_ID) throw new StorageSafetyError("WRONG_MANIFEST_BUCKET");
  if (manifest.gracePeriodDays !== DEFAULT_GRACE_DAYS) throw new StorageSafetyError("INVALID_GRACE_PERIOD");
  const identity = await adapter.verifyIdentity();
  if (identity.projectRef !== manifest.projectRef) throw new StorageSafetyError("PROJECT_IDENTITY_MISMATCH");
  if (identity.bucketId !== manifest.bucketId || identity.bucketPublic !== false) throw new StorageSafetyError("BUCKET_IDENTITY_MISMATCH");
  if (!Number.isInteger(maxDelete) || maxDelete < 1 || maxDelete > MAX_DELETE_HARD_LIMIT) throw new StorageSafetyError("INVALID_MAX_DELETE");

  const results = [];
  for (const candidate of manifest.candidates) {
    const liveObject = await adapter.getObject(candidate.exactStoragePath);
    const references = await adapter.getReferences(candidate.exactStoragePath);
    const evaluation = evaluateLiveCandidate({ candidate, liveObject, references, now, graceDays: manifest.gracePeriodDays });
    results.push({
      candidateId: candidate.candidateId,
      pathSha256: candidate.pathSha256,
      objectSize: candidate.objectSize,
      ageCompleteDays: completeDaysBetween(candidate.objectCreatedAt, now.toISOString()),
      reason: candidate.orphanReasonCode,
      witnesses: { first: Boolean(candidate.firstWitness?.orphanConfirmed), second: Boolean(candidate.secondWitness?.orphanConfirmed) },
      eligibility: evaluation.eligible ? "eligible" : "ineligible",
      refusalReasons: evaluation.reasons,
    });
  }
  const eligibleCount = results.filter((result) => result.eligibility === "eligible").length;
  return {
    mode: "dry-run",
    projectRef: manifest.projectRef,
    bucketId: manifest.bucketId,
    candidateCount: results.length,
    eligibleCount,
    maximumDelete: maxDelete,
    batchRefusal: eligibleCount > maxDelete ? "MAX_DELETE_EXCEEDED" : null,
    candidates: results,
  };
}

export async function executeCleanup({ manifest, adapter, now = new Date(), maxDelete }) {
  const plan = await planCleanup({ manifest, adapter, now, maxDelete });
  if (plan.batchRefusal) throw new StorageSafetyError(plan.batchRefusal);
  const audit = { ...plan, mode: "execute", startedAt: now.toISOString(), outcomes: [] };
  for (const planned of plan.candidates.filter((candidate) => candidate.eligibility === "ineligible")) {
    audit.outcomes.push({
      candidateId: planned.candidateId,
      pathSha256: planned.pathSha256,
      status: planned.refusalReasons.includes("OBJECT_ABSENT") ? "already_absent" : "ineligible",
      reasons: planned.refusalReasons,
    });
  }
  for (const planned of plan.candidates.filter((candidate) => candidate.eligibility === "eligible")) {
    const candidate = manifest.candidates.find((item) => item.candidateId === planned.candidateId);
    if (!candidate) throw new StorageSafetyError("CANDIDATE_IDENTITY_MISMATCH");
    await adapter.verifyIdentity();
    const liveObject = await adapter.getObject(candidate.exactStoragePath);
    if (!liveObject) {
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "already_absent" });
      continue;
    }
    const references = await adapter.getReferences(candidate.exactStoragePath);
    const evaluation = evaluateLiveCandidate({ candidate, liveObject, references, now, graceDays: manifest.gracePeriodDays });
    if (!evaluation.eligible) {
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "ineligible", reasons: evaluation.reasons });
      continue;
    }
    let deletion;
    try {
      deletion = await adapter.deleteObject(candidate.exactStoragePath);
    } catch {
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "uncertain", reason: "DELETE_VERIFICATION_UNAVAILABLE" });
      break;
    }
    if (!deletion.ok) {
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "failed", reason: deletion.code });
      continue;
    }
    try {
      const after = await adapter.getObject(candidate.exactStoragePath);
      if (after) {
        audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "uncertain", reason: "POST_DELETE_OBJECT_STILL_PRESENT" });
        break;
      }
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "deleted_verified" });
    } catch {
      audit.outcomes.push({ candidateId: candidate.candidateId, pathSha256: candidate.pathSha256, status: "uncertain", reason: "POST_DELETE_VERIFICATION_UNAVAILABLE" });
      break;
    }
  }
  audit.completedAt = new Date().toISOString();
  return audit;
}

export function parseInteger(value) {
  if (!/^[1-9][0-9]*$/.test(String(value ?? ""))) throw new StorageSafetyError("INVALID_MAX_DELETE");
  return Number(value);
}

export function validateDestructiveConfirmations({ confirmProjectRef, confirmBucket, confirmManifestSha256, manifestFileSha256, maxDelete }) {
  if (confirmProjectRef !== PLINY_PROJECT_REF) throw new StorageSafetyError("PROJECT_CONFIRMATION_MISMATCH");
  if (confirmBucket !== PLINY_BUCKET_ID) throw new StorageSafetyError("BUCKET_CONFIRMATION_MISMATCH");
  if (confirmManifestSha256 !== manifestFileSha256) throw new StorageSafetyError("MANIFEST_HASH_CONFIRMATION_MISMATCH");
  if (!Number.isInteger(maxDelete) || maxDelete < 1 || maxDelete > MAX_DELETE_HARD_LIMIT) throw new StorageSafetyError("INVALID_MAX_DELETE");
}
