import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSizedPdfFixture } from "./fixtures/synthetic-files.mjs";
import {
  MAX_UPLOAD_BYTES_CEILING,
  getFileTooLargeMessage,
  getMaxUploadBytes,
  getProcessRequestsPerHour,
  getProcessingStallMinutes,
  getUploadExpiryMinutes,
  getUploadRequestsPerHour,
} from "../src/lib/uploads/config.ts";
import { buildStoragePath, getSafeFilename, isStoragePathOwnedBy, parseStoragePath } from "../src/lib/uploads/filename.ts";
import { describeContentMismatch } from "../src/lib/uploads/contentCheck.ts";
import { validateUploadRequest } from "../src/lib/uploads/validateUploadRequest.ts";
import { UPLOAD_EXPIRED_MESSAGE, getStalledMessage, isProcessingStalled, isUploadExpired, reapStaleDocuments } from "../src/lib/documents/lifecycle.ts";
import { createFailedUploadItem, createUploadQueue, resetUploadItemForRetry, runSequentialUploadBatch } from "../src/lib/uploads/uploadBatch.ts";
import { UploadStalledError, createProgressFetch } from "../src/lib/uploads/progressFetch.ts";
import { checkRouteRateLimit } from "../src/lib/rate-limit.ts";

const MiB = 1024 * 1024;
const root = resolve(import.meta.dirname, "..");
const USER = "145b5ad5-4b74-4081-bad7-918a1185c2f1";
const COLLECTION = "555e5d5e-3144-4eba-babc-7a24309b7e1d";
const DOCUMENT = "4d0a260d-0c0a-4ce8-ade4-a367ad5a629e";

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------- configuration
{
  const names = ["NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES", "UPLOAD_MAX_REQUESTS_PER_HOUR", "PROCESS_MAX_REQUESTS_PER_HOUR", "PROCESSING_STALL_MINUTES", "UPLOAD_EXPIRY_MINUTES"];
  withEnv(Object.fromEntries(names.map((name) => [name, undefined])), () => {
    assert.equal(getMaxUploadBytes(), 15 * MiB, "default upload limit is 15 MiB");
    assert.equal(getUploadRequestsPerHour(), 5);
    assert.equal(getProcessRequestsPerHour(), 5);
    assert.equal(getProcessingStallMinutes(), 6);
    assert.equal(getUploadExpiryMinutes(), 60);
    assert.equal(getFileTooLargeMessage(), "File must be 15 MB or less.");
  });
  withEnv({ NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES: String(5 * MiB), UPLOAD_MAX_REQUESTS_PER_HOUR: "12", PROCESS_MAX_REQUESTS_PER_HOUR: "7", PROCESSING_STALL_MINUTES: "10", UPLOAD_EXPIRY_MINUTES: "30" }, () => {
    assert.equal(getMaxUploadBytes(), 5 * MiB);
    assert.equal(getFileTooLargeMessage(), "File must be 5 MB or less.");
    assert.equal(getUploadRequestsPerHour(), 12);
    assert.equal(getProcessRequestsPerHour(), 7);
    assert.equal(getProcessingStallMinutes(), 10);
    assert.equal(getUploadExpiryMinutes(), 30);
  });
  withEnv({ NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES: String(500 * MiB), PROCESSING_STALL_MINUTES: "1", UPLOAD_EXPIRY_MINUTES: "9999", UPLOAD_MAX_REQUESTS_PER_HOUR: "nonsense" }, () => {
    assert.equal(getMaxUploadBytes(), MAX_UPLOAD_BYTES_CEILING, "the limit can be lowered but never raised past the bucket ceiling");
    assert.equal(getProcessingStallMinutes(), 6, "the stall window can never be shorter than the 300 s function limit");
    assert.ok(getUploadExpiryMinutes() < 120, "uploads must expire before the signed URL does");
    assert.equal(getUploadRequestsPerHour(), 5, "garbage falls back to the default");
  });
  // Upload rate limit is enforced from the configured value.
  await withEnv({ UPLOAD_MAX_REQUESTS_PER_HOUR: "2", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
    const options = { identifier: `unit-${Date.now()}`, limit: getUploadRequestsPerHour(), prefix: "unit-upload", window: "1 h" };
    assert.equal((await checkRouteRateLimit(options)).status, "allowed");
    assert.equal((await checkRouteRateLimit(options)).status, "allowed");
    const third = await checkRouteRateLimit(options);
    assert.equal(third.status, "blocked");
    assert.equal(third.reason, "rate_limited");
  });
}

// ---------------------------------------------------------------- paths and file names
{
  const path = buildStoragePath({ collectionId: COLLECTION, documentId: DOCUMENT, filename: "Q3 Report (final).PDF", userId: USER });
  assert.equal(path, `${USER}/${COLLECTION}/${DOCUMENT}/q3-report-final.pdf`);
  assert.deepEqual(parseStoragePath(path), { collectionId: COLLECTION, documentId: DOCUMENT, filename: "q3-report-final.pdf", userId: USER });
  assert.equal(isStoragePathOwnedBy(path, USER), true);
  assert.equal(isStoragePathOwnedBy(path, "someone-else"), false);
  assert.equal(parseStoragePath(`${USER}/${COLLECTION}/${DOCUMENT}/../x.pdf`), null);
  assert.equal(parseStoragePath(`${USER}//${DOCUMENT}/x.pdf`), null);
  assert.equal(parseStoragePath(`${USER}/${COLLECTION}/x.pdf`), null, "legacy 3-segment paths are not canonical");

  for (const hostile of ["../../etc/passwd.txt", "..\\..\\windows\\system32\\x.pdf", "...pdf", ".pdf", "a/b/c.docx", "名前.pdf", "  spaced  name .csv", "x\u0000y.txt", "CON.txt"]) {
    const safe = getSafeFilename(hostile);
    assert.ok(!safe.includes("/") && !safe.includes("\\") && !safe.includes(".."), `${JSON.stringify(hostile)} -> ${safe}`);
    assert.match(safe, /^[a-z0-9_-]+\.[a-z0-9]+$/, `${JSON.stringify(hostile)} -> ${safe}`);
    assert.ok(safe.length <= 200);
  }
  assert.equal(getSafeFilename("...pdf"), "document.pdf");
}

// ---------------------------------------------------------------- declared-request validation
{
  const pdf = (size, extra = {}) => validateUploadRequest({ filename: "report.pdf", mimeType: "application/pdf", size, ...extra });
  for (const mib of [4.4, 4.6, 14.9]) {
    assert.equal(pdf(Math.round(mib * MiB)).ok, true, `${mib} MiB PDF must be accepted`);
  }
  assert.equal(pdf(15 * MiB).ok, true, "exactly 15 MiB is accepted");
  for (const size of [Math.round(15.2 * MiB), 15 * MiB + 1]) {
    const rejected = pdf(size);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 413);
    assert.equal(rejected.error, "File must be 15 MB or less.");
  }
  assert.equal(pdf(0).ok, false);
  assert.equal(pdf(-5).ok, false);
  assert.equal(pdf(1.5).ok, false);
  assert.equal(validateUploadRequest({ filename: "x.exe", mimeType: "application/x-msdownload", size: 10 }).ok, false);
  assert.match(validateUploadRequest({ filename: "old.xls", mimeType: "", size: 10 }).error, /Legacy/);
  assert.equal(validateUploadRequest({ filename: "noext", mimeType: "", size: 10 }).ok, false);
  assert.equal(validateUploadRequest({ filename: "data.csv", mimeType: "application/vnd.ms-excel", size: 10 }).ok, true, "Windows reports CSV as ms-excel");
  assert.equal(validateUploadRequest({ filename: "notes.md", mimeType: "", size: 10 }).ok, true, "browsers often send no MIME for markdown");
  assert.equal(validateUploadRequest({ filename: "data.csv", mimeType: "image/png", size: 10 }).ok, false);
  const largeText = validateUploadRequest({ filename: "big.txt", mimeType: "text/plain", size: 6 * MiB });
  assert.equal(largeText.ok, false, "per-format caps below the global limit still apply");
  assert.equal(largeText.status, 413);
  assert.equal(pdf(5 * MiB, {}).ok, true);
  assert.equal(validateUploadRequest({ filename: "report.pdf", mimeType: "application/pdf", size: 5 * MiB }, 4 * MiB).ok, false, "a lowered limit is honoured");
}

// ---------------------------------------------------------------- magic bytes
{
  const sized = buildSizedPdfFixture(200_000);
  assert.equal(describeContentMismatch(sized, "a.pdf"), null);
  assert.match(describeContentMismatch(Buffer.from("hello world"), "a.pdf"), /not a PDF/);
  assert.match(describeContentMismatch(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "a.pdf"), /not a PDF/, "an .exe renamed to .pdf");
  assert.equal(describeContentMismatch(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "a.docx"), null);
  assert.equal(describeContentMismatch(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "a.xlsx"), null);
  assert.match(describeContentMismatch(sized, "a.docx"), /not a valid DOCX/, "a PDF renamed to .docx");
  assert.match(describeContentMismatch(Buffer.from("PK nope"), "a.xlsx"), /not a valid XLSX/);
  assert.equal(describeContentMismatch(Buffer.from("# Title\n\nSome text\n"), "a.md"), null);
  assert.equal(describeContentMismatch(Buffer.from("a,b\n1,2\n"), "a.csv"), null);
  assert.match(describeContentMismatch(Buffer.from([1, 2, 0, 3, 4, 5]), "a.txt"), /binary/);
  assert.match(describeContentMismatch(Buffer.alloc(0), "a.txt"), /binary/, "empty text is not accepted");
  assert.match(describeContentMismatch(Buffer.from("x"), "a.bin"), /Unsupported/);
}

// ---------------------------------------------------------------- watchdog decisions
{
  const now = new Date("2026-10-15T12:00:00.000Z");
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  assert.equal(isUploadExpired({ created_at: ago(61), status: "awaiting_upload" }, now, 60), true);
  assert.equal(isUploadExpired({ created_at: ago(59), status: "awaiting_upload" }, now, 60), false);
  assert.equal(isUploadExpired({ created_at: ago(500), status: "ready" }, now, 60), false);
  assert.equal(isProcessingStalled({ created_at: ago(500), processing_stage_updated_at: ago(7), status: "processing" }, now, 6), true);
  assert.equal(isProcessingStalled({ created_at: ago(500), processing_stage_updated_at: ago(5), status: "processing" }, now, 6), false);
  assert.equal(isProcessingStalled({ created_at: ago(500), processing_stage_updated_at: null, status: "processing" }, now, 6), true, "falls back to created_at");
  assert.equal(isProcessingStalled({ created_at: ago(500), processing_stage_updated_at: ago(500), status: "ready" }, now, 6), false);
  assert.equal(isProcessingStalled({ created_at: ago(500), processing_stage_updated_at: ago(500), status: "failed" }, now, 6), false);
  assert.match(getStalledMessage("ocr_fallback"), /^ocr fallback: Processing stopped making progress\. Retry/);
}

// ---------------------------------------------------------------- reaper against an in-memory table
function createFakeClient(rows) {
  const removed = [];
  const matches = (row, filters) =>
    filters.every(({ column, op, value }) => {
      const cell = row[column];
      if (op === "eq") return cell === value;
      if (op === "lt") return cell !== null && cell !== undefined && cell < value;
      if (op === "notnull") return cell !== null && cell !== undefined;
      throw new Error(op);
    });
  function builder(mode, patch) {
    const filters = [];
    let columns = "*";
    const api = {
      eq: (column, value) => (filters.push({ column, op: "eq", value }), api),
      lt: (column, value) => (filters.push({ column, op: "lt", value }), api),
      not: (column) => (filters.push({ column, op: "notnull" }), api),
      select: (value) => ((columns = value), mode === "select" ? api : api),
      then: (resolve) => {
        const selected = rows.filter((row) => matches(row, filters));
        if (mode === "update") selected.forEach((row) => Object.assign(row, patch));
        const project = (row) => (columns === "*" ? { ...row } : Object.fromEntries(columns.split(",").map((key) => [key, row[key]])));
        resolve({ data: selected.map(project), error: null });
      },
    };
    return api;
  }
  return {
    from: () => ({ select: (columns) => builder("select").select(columns), update: (patch) => builder("update", patch) }),
    removed,
    storage: { from: () => ({ remove: async (paths) => (removed.push(...paths), { data: paths.map((name) => ({ name })), error: null }) }) },
  };
}

{
  const now = new Date("2026-10-15T12:00:00.000Z");
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const row = (id, user, overrides) => ({ collection_id: "c1", created_at: ago(1), id, processing_stage: "uploading", processing_stage_updated_at: ago(1), status: "awaiting_upload", storage_path: `${user}/c1/${id}/f.pdf`, upload_expired_at: null, user_id: user, ...overrides });
  const rows = [
    row("expired", "u1", { created_at: ago(61) }),
    row("fresh-upload", "u1", { created_at: ago(59) }),
    row("stalled", "u1", { processing_stage: "extracting", processing_stage_updated_at: ago(7), status: "processing" }),
    row("advancing", "u1", { processing_stage: "embedding", processing_stage_updated_at: ago(2), status: "processing" }),
    row("ready", "u1", { created_at: ago(900), processing_stage_updated_at: ago(900), status: "ready" }),
    row("other-user-expired", "u2", { created_at: ago(90) }),
    row("other-user-stalled", "u2", { processing_stage_updated_at: ago(30), status: "processing" }),
    row("late", "u1", { created_at: ago(300), processing_stage: "failed", status: "failed", upload_expired_at: ago(240) }),
    row("late-but-retried", "u1", { created_at: ago(300), processing_stage: "extracting", status: "processing", processing_stage_updated_at: ago(1), upload_expired_at: null }),
  ];
  const byId = (id) => rows.find((entry) => entry.id === id);

  // Lazy, per-user path (user-scoped client): only u1, only expiry + stall.
  const client = createFakeClient(rows);
  const first = await reapStaleDocuments(client, { now, userId: "u1" });
  assert.deepEqual(first, { expiredUploads: 1, lateObjectsRemoved: 0, objectsRemoved: 1, stalledDocuments: 1 });
  assert.equal(byId("expired").status, "failed");
  assert.equal(byId("expired").error_message, UPLOAD_EXPIRED_MESSAGE);
  assert.ok(byId("expired").upload_expired_at);
  assert.deepEqual(client.removed, ["u1/c1/expired/f.pdf"], "only the expired row's exact object is deleted");
  assert.equal(byId("fresh-upload").status, "awaiting_upload");
  assert.equal(byId("stalled").status, "failed");
  assert.match(byId("stalled").error_message, /^extracting: Processing stopped making progress/);
  assert.equal(byId("advancing").status, "processing");
  assert.equal(byId("ready").status, "ready");
  assert.equal(byId("other-user-expired").status, "awaiting_upload", "scoped sweeps never touch other users");
  assert.equal(byId("other-user-stalled").status, "processing");
  assert.equal(byId("late").upload_expired_at !== null, true, "the late-object sweep is maintenance-only");

  // Idempotent: a second sweep changes nothing.
  assert.deepEqual(await reapStaleDocuments(client, { now, userId: "u1" }), { expiredUploads: 0, lateObjectsRemoved: 0, objectsRemoved: 0, stalledDocuments: 0 });

  // Service-role maintenance path: everyone, plus late objects.
  const sweep = await reapStaleDocuments(client, { now, sweepLateObjects: true });
  assert.equal(sweep.expiredUploads, 1);
  assert.equal(sweep.stalledDocuments, 1);
  assert.equal(sweep.lateObjectsRemoved, 1);
  assert.equal(byId("other-user-expired").status, "failed");
  assert.equal(byId("other-user-stalled").status, "failed");
  assert.equal(byId("late").upload_expired_at, null, "marker cleared once the late object is swept");
  assert.ok(client.removed.includes("u1/c1/late/f.pdf"));
  assert.equal(byId("late-but-retried").status, "processing", "a retried document is never swept as a late object");
  assert.ok(!client.removed.includes("u1/c1/late-but-retried/f.pdf"));
}

// ---------------------------------------------------------------- upload batch state machine
{
  const file = (name, size = 100) => ({ name, size });
  const run = async (files, handlers) => {
    const seen = [];
    const items = await runSequentialUploadBatch(createUploadQueue(files), {
      onChange: (_all, changed) => seen.push({ ...changed }),
      process: async () => ({ status: "ready" }),
      upload: async () => ({ documentId: "doc-1" }),
      ...handlers,
    });
    return { items, seen };
  };

  const happy = await run([file("a.pdf")], {
    upload: async (_file, context) => {
      context.onDocumentId("doc-1");
      [10, 50, 100].forEach((percent) => context.onProgress(percent));
      return { documentId: "doc-1" };
    },
  });
  assert.equal(happy.items[0].status, "ready");
  assert.deepEqual(happy.seen.filter((entry) => entry.status === "uploading" && typeof entry.progress === "number").map((entry) => entry.progress), [0, 0, 10, 50, 100]);

  for (const [label, thrown] of [["Error", new Error("boom")], ["string", "weird"], ["rejection", Promise.reject(new Error("later"))]]) {
    const result = await run([file("a.pdf")], {
      upload: async () => {
        if (label === "rejection") await thrown;
        throw thrown;
      },
    });
    assert.equal(result.items[0].status, "failed", `upload failure (${label}) must end in failed, never uploading`);
    assert.ok(result.items[0].message);
    assert.equal(result.items[0].retryable, true);
  }

  const notRetryable = await run([file("a.pdf")], { upload: async () => { throw Object.assign(new Error("too big"), { retryable: false }); } });
  assert.equal(notRetryable.items[0].retryable, false);

  const never = await run([file("a.pdf"), file("b.pdf")], { upload: async (f) => { if (f.name === "a.pdf") throw new Error("first fails"); return { documentId: "doc-b" }; } });
  assert.deepEqual(never.items.map((item) => item.status), ["failed", "ready"], "one failure does not block the rest of the batch");
  assert.ok(never.items.every((item) => item.status !== "uploading" && item.status !== "queued"));

  // Retry after an upload failure re-enters the upload with the same document row.
  const contexts = [];
  let attempts = 0;
  const uploadHandler = async (_file, context) => {
    contexts.push(context.documentId);
    context.onDocumentId("doc-1");
    attempts += 1;
    if (attempts === 1) throw new Error("network dropped");
    return { documentId: "doc-1" };
  };
  const firstTry = await run([file("a.pdf")], { upload: uploadHandler });
  assert.equal(firstTry.items[0].status, "failed");
  assert.equal(firstTry.items[0].documentId, "doc-1", "document id is kept so Retry reuses the row");
  const retried = await runSequentialUploadBatch([resetUploadItemForRetry(firstTry.items[0])], { onChange() {}, process: async () => ({ status: "ready" }), upload: uploadHandler });
  assert.equal(retried[0].status, "ready");
  assert.deepEqual(contexts, [undefined, "doc-1"]);

  // Retry after a processing failure skips the upload entirely.
  let uploads = 0;
  let processes = 0;
  const processHandlers = {
    process: async () => {
      processes += 1;
      if (processes === 1) throw new Error("extraction failed");
      return { pageCount: 3, status: "ready" };
    },
    upload: async () => {
      uploads += 1;
      return { documentId: "doc-9" };
    },
  };
  const processFailed = await run([file("a.pdf")], processHandlers);
  assert.equal(processFailed.items[0].status, "failed");
  assert.equal(processFailed.items[0].uploaded, true);
  const processRetried = await runSequentialUploadBatch([resetUploadItemForRetry(processFailed.items[0])], { onChange() {}, ...processHandlers });
  assert.equal(processRetried[0].status, "ready");
  assert.equal(uploads, 1, "the file is not uploaded again");
  assert.equal(processes, 2);

  const rejected = createFailedUploadItem(file("huge.pdf", 16 * MiB), getFileTooLargeMessage());
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.retryable, false);
}

// ---------------------------------------------------------------- XHR-backed progress fetch
{
  class FakeXhr {
    constructor(script) {
      this.script = script;
      this.upload = {};
      this.headers = {};
      this.aborted = false;
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    getAllResponseHeaders() {
      return "content-type: application/json\r\n";
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      queueMicrotask(() => this.script(this));
    }
  }
  const made = [];
  const factory = (script) => () => {
    const xhr = new FakeXhr(script);
    made.push(xhr);
    return xhr;
  };

  const progress = [];
  const ok = createProgressFetch({
    onProgress: (loaded, total) => progress.push([loaded, total]),
    xhrFactory: factory((xhr) => {
      xhr.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      Object.assign(xhr, { responseText: '{"Key":"documents/x"}', status: 200, statusText: "OK" });
      xhr.onload();
    }),
  });
  const response = await ok("https://storage.example/object/upload/sign/documents/x?token=t", { body: "payload", headers: { "x-upsert": "false" }, method: "PUT" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { Key: "documents/x" });
  assert.deepEqual(progress, [[25, 100], [100, 100]]);
  assert.equal(made.at(-1).method, "PUT");
  assert.equal(made.at(-1).headers["x-upsert"], "false");
  assert.equal(made.at(-1).body, "payload");

  const failedResponse = await createProgressFetch({
    onProgress() {},
    xhrFactory: factory((xhr) => {
      Object.assign(xhr, { responseText: '{"error":"too big"}', status: 413, statusText: "Payload Too Large" });
      xhr.onload();
    }),
  })("https://x", { method: "PUT" });
  assert.equal(failedResponse.status, 413);
  assert.equal(failedResponse.ok, false);

  await assert.rejects(
    createProgressFetch({ onProgress() {}, xhrFactory: factory((xhr) => xhr.onerror()) })("https://x", { method: "PUT" }),
    TypeError,
    "a dropped connection rejects instead of hanging"
  );

  const startedAt = Date.now();
  await assert.rejects(
    createProgressFetch({ inactivityMs: 40, onProgress() {}, xhrFactory: factory(() => {}) })("https://x", { method: "PUT" }),
    (error) => error instanceof UploadStalledError,
    "an upload that stops moving is aborted"
  );
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(made.at(-1).aborted, true);
}

// ---------------------------------------------------------------- structural guarantees
{
  const listFiles = (directory) =>
    readdirSync(directory).flatMap((entry) => {
      const full = join(directory, entry);
      return statSync(full).isDirectory() ? listFiles(full) : [full];
    });

  // The app's API surface must never accept file bytes.
  for (const file of listFiles(join(root, "src/app/api")).filter((entry) => entry.endsWith(".ts"))) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/formData\(\)|arrayBuffer\(\)|request\.blob\(\)/.test(source), `${file} must not read a request body as bytes`);
  }
  assert.throws(() => statSync(join(root, "src/app/api/documents/upload/route.ts")), "the byte-receiving upload route must be gone");

  // Process routes declare the function budget the watchdog is built around.
  for (const route of ["src/app/api/documents/[id]/process/route.ts", "src/app/api/process-document/route.ts"]) {
    const source = readFileSync(join(root, route), "utf8");
    const duration = Number(source.match(/export const maxDuration = (\d+);/)?.[1]);
    assert.equal(duration, 300, `${route} must set maxDuration = 300`);
    assert.ok(getProcessingStallMinutes() * 60 > duration, "the stall window must outlast the function budget");
  }

  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/cron/maintenance"));

  const migration = readFileSync(join(root, "supabase/migrations/20261015000000_direct_upload_pipeline.sql"), "utf8");
  assert.match(migration, /'awaiting_upload'/);
  assert.match(migration, /file_size_limit = 15728640/);
  assert.match(migration, /public = false/);
  assert.match(migration, /processing_stage_updated_at timestamptz not null default now\(\)/);
  for (const operation of ["select", "insert", "delete"]) {
    assert.match(migration, new RegExp(`for ${operation}\\s+to authenticated[\\s\\S]*?\\(storage\\.foldername\\(name\\)\\)\\[1\\] = \\(select auth\\.uid\\(\\)\\)::text`), `${operation} policy must be own-prefix`);
  }
  assert.ok(!/on storage\.objects\s+for update/.test(migration), "objects must not be overwritable");
  assert.ok(!/grant[^;]*(insert|delete)[^;]*to service_role/i.test(migration), "service_role gets read/update on documents only");

  const adminImporters = listFiles(join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file) && readFileSync(file, "utf8").includes("supabase/admin"));
  assert.deepEqual(adminImporters.map((file) => file.replace(`${root}/`, "")), ["src/app/api/cron/maintenance/route.ts"], "the service-role client is imported by the maintenance job only");

  // The seam that forces a hang must be inert in production builds.
  const processSource = readFileSync(join(root, "src/lib/documents/processDocument.ts"), "utf8");
  assert.match(processSource, /process\.env\.NODE_ENV === "production" \|\| !directive/);
}

console.log("Direct-upload unit tests passed.");
