// Live end-to-end test of the direct-to-Storage upload pipeline against LOCAL infrastructure.
//
//   supabase start && npm run dev      (local keys; EMBEDDINGS_ENABLED=false; CRON_SECRET set)
//   npm run test:direct-upload-e2e
//
// Optional second dev server for the real hang test (PLINY_TEST_EXTRACTION_DELAY_MS=hang,
// PROCESSING_STALL_MINUTES=6) on PLINY_HANG_BASE_URL, and PLINY_E2E_REAL_STALL=1 to wait for it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { buildSizedPdfFixture, buildSyntheticPdfFixture } from "./fixtures/synthetic-files.mjs";

const MiB = 1024 * 1024;
const baseUrl = process.env.PLINY_LOCAL_BASE_URL;
const hangBaseUrl = process.env.PLINY_HANG_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const realStall = process.env.PLINY_E2E_REAL_STALL === "1";
const stallMinutes = Number(process.env.PROCESSING_STALL_MINUTES ?? 6);

function assertLocalUrl(value, name) {
  assert.ok(value, `${name} must be configured.`);
  const hostname = new URL(value).hostname;
  assert.ok(hostname === "127.0.0.1" || hostname === "localhost", `${name} must point to local infrastructure.`);
}

assertLocalUrl(baseUrl, "PLINY_LOCAL_BASE_URL");
assertLocalUrl(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
if (hangBaseUrl) assertLocalUrl(hangBaseUrl, "PLINY_HANG_BASE_URL");
assert.ok(anonKey && serviceRoleKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be configured.");
assert.equal(process.env.EMBEDDINGS_ENABLED, "false", "The local E2E suite must not call an embedding provider.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const requestLog = [];
const owners = new Map(); // documentId -> owning user (rows are read and forged as their owner, under RLS)
const cleanupUsers = [];
let passed = 0;

async function step(name, fn) {
  const started = Date.now();
  await fn();
  passed += 1;
  console.log(`  ok  ${name} (${Date.now() - started} ms)`);
}

async function createUser(label) {
  const jar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data, error } = await client.auth.signUp({ email: `direct-upload-${label}-${suffix}@example.test`, password: "Synthetic-direct-upload-2026!" });
  assert.ifError(error);
  assert.ok(data.user?.id && data.session, "Local auth must issue a session.");
  const user = { client, id: data.user.id, jar, label };
  cleanupUsers.push(user);
  return user;
}

function cookieHeader(user) {
  return user ? Array.from(user.jar, ([name, value]) => `${name}=${value}`).join("; ") : "";
}

async function api(user, path, init = {}, base = baseUrl) {
  const headers = new Headers(init.headers);
  if (user) headers.set("Cookie", cookieHeader(user));
  const bodySize = typeof init.body === "string" ? Buffer.byteLength(init.body) : init.body ? Number(init.body.size ?? init.body.length ?? 0) : 0;
  requestLog.push({ bodySize, method: init.method ?? "GET", path });
  const response = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
  const body = await response.clone().json().catch(() => null);
  return { body, response };
}

async function createCollection(user, name = `Direct upload ${suffix}`) {
  const { data, error } = await user.client.from("collections").insert({ default_processing_mode: "standard", name, user_id: user.id }).select("id").single();
  assert.ifError(error);
  return data.id;
}

async function requestUploadUrl(user, payload) {
  const result = await api(user, "/api/documents/upload-url", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (result.body?.document?.id && !owners.has(result.body.document.id)) owners.set(result.body.document.id, user);
  return result;
}

/** What the browser does: metadata to the API, then bytes straight to Storage with the signed token. */
async function browserUpload(user, collectionId, { bytes, declaredSize, documentId, filename, mimeType }) {
  const { body, response } = await requestUploadUrl(user, {
    collection_id: collectionId,
    document_id: documentId,
    filename,
    mime_type: mimeType,
    size: declaredSize ?? bytes.length,
  });
  if (!response.ok) return { body, response };
  const storage = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await storage.storage
    .from(body.upload.bucket)
    .uploadToSignedUrl(body.upload.path, body.upload.token, new Blob([bytes], { type: mimeType }), { contentType: mimeType, upsert: false });
  return { body, response, uploadError: error };
}

const processDocument = (user, documentId, base = baseUrl, init = {}) => api(user, `/api/documents/${documentId}/process`, { method: "POST", ...init }, base);

async function documentRow(id) {
  const { data, error } = await owners.get(id).client.from("documents").select("*").eq("id", id).maybeSingle();
  assert.ifError(error);
  return data;
}

async function chunkRows(documentId) {
  const { data, error } = await owners.get(documentId).client.from("document_chunks").select("chunk_index,content").eq("document_id", documentId).order("chunk_index");
  assert.ifError(error);
  return data ?? [];
}

/**
 * Row count as the database owner. document_chunks is deliberately unreachable to the service
 * role (see the migration), so deletion is verified straight against the local Postgres container.
 */
function countChunksAsOwner(documentId) {
  assert.match(documentId, /^[0-9a-f-]{36}$/);
  const container = process.env.PLINY_LOCAL_DB_CONTAINER ?? "supabase_db_pliny-local-e2e";
  const out = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-tA", "-c", `select count(*) from public.document_chunks where document_id = '${documentId}'`], { encoding: "utf8" });
  return Number(out.trim());
}

async function objectExists(path) {
  const { data } = await admin.storage.from("documents").exists(path);
  return data === true;
}

/** Backdate a row. Two statements: the touch trigger resets the stage clock on any stage/status change. */
async function forgeRow(id, { createdMinutesAgo, stageMinutesAgo, values = {} }) {
  if (Object.keys(values).length > 0) {
    const { error } = await owners.get(id).client.from("documents").update(values).eq("id", id);
    assert.ifError(error);
  }
  const patch = {};
  if (createdMinutesAgo !== undefined) patch.created_at = new Date(Date.now() - createdMinutesAgo * 60_000).toISOString();
  if (stageMinutesAgo !== undefined) patch.processing_stage_updated_at = new Date(Date.now() - stageMinutesAgo * 60_000).toISOString();
  if (Object.keys(patch).length > 0) {
    const { error } = await owners.get(id).client.from("documents").update(patch).eq("id", id);
    assert.ifError(error);
  }
}

async function loadWorkspace(user, collectionId, base = baseUrl) {
  const { response } = await api(user, `/collection/${collectionId}`, {}, base);
  assert.equal(response.status, 200, "The workspace page must render (it runs the watchdog).");
}

try {
  const userA = await createUser("a");
  const userB = await createUser("b");
  const collectionA = await createCollection(userA);
  const collectionB = await createCollection(userB, `B ${suffix}`);

  console.log("Size matrix: bytes go browser -> Storage, never through the Next function");
  const sizeCases = [
    ["4.4 MiB", Math.round(4.4 * MiB)],
    ["4.6 MiB", Math.round(4.6 * MiB)],
    ["14.9 MiB", Math.round(14.9 * MiB)],
  ];
  for (const [label, size] of sizeCases) {
    await step(`${label} PDF uploads and reaches Ready`, async () => {
      const bytes = buildSizedPdfFixture(size, { seed: label });
      assert.equal(bytes.length, size);
      const upload = await browserUpload(userA, collectionA, { bytes, filename: `report-${label.replace(/\W/g, "")}.pdf`, mimeType: "application/pdf" });
      assert.equal(upload.response.status, 200, `upload-url failed: ${JSON.stringify(upload.body)}`);
      assert.ifError(upload.uploadError);
      const id = upload.body.document.id;
      assert.match(upload.body.upload.path, new RegExp(`^${userA.id}/${collectionA}/${id}/[^/]+\\.pdf$`), "Storage path must be {userId}/{collectionId}/{documentId}/{name}.");
      assert.equal((await documentRow(id)).status, "awaiting_upload");
      const processed = await processDocument(userA, id);
      assert.equal(processed.response.status, 200, `process failed: ${JSON.stringify(processed.body)}`);
      assert.equal(processed.body.status, "ready");
      const row = await documentRow(id);
      assert.equal(row.status, "ready");
      assert.equal(row.file_size, size);
      assert.equal(row.page_count, 12);
      assert.ok((await chunkRows(id)).length > 0, "Ready documents must have chunks.");
    });
  }
  await step("no request to the Next server carried file bytes (largest body < 8 KiB)", async () => {
    const largest = Math.max(...requestLog.map((entry) => entry.bodySize));
    assert.ok(largest < 8 * 1024, `Largest request body to the app was ${largest} bytes.`);
  });

  console.log("Document deletion");
  await step("upload -> process -> delete removes the Storage object, chunks and row", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "to-delete.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    const id = upload.body.document.id;
    const path = upload.body.upload.path;
    assert.equal((await processDocument(userA, id)).body.status, "ready");
    assert.equal(await objectExists(path), true, "The object must exist before deletion.");
    const countChunks = async () => countChunksAsOwner(id);
    assert.ok((await countChunks()) > 0, "The document must have chunks before deletion.");

    const deleted = await api(userA, `/api/documents/${id}`, { method: "DELETE" });
    assert.equal(deleted.response.status, 204, JSON.stringify(deleted.body));
    assert.equal(await objectExists(path), false, "The Storage object must be gone.");
    assert.equal(await countChunks(), 0, "Chunks (and their embeddings) must be gone.");
    const { data: row } = await admin.from("documents").select("id").eq("id", id).maybeSingle();
    assert.equal(row, null, "The document row must be gone.");
  });
  await step("deleting an abandoned awaiting_upload document removes its object too", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "abandoned-delete.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    assert.equal(await objectExists(upload.body.upload.path), true);
    const deleted = await api(userA, `/api/documents/${upload.body.document.id}`, { method: "DELETE" });
    assert.equal(deleted.response.status, 204);
    assert.equal(await objectExists(upload.body.upload.path), false);
  });
  await step("user B cannot delete user A's document or its object", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "not-yours.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    const attempt = await api(userB, `/api/documents/${upload.body.document.id}`, { method: "DELETE" });
    assert.equal(attempt.response.status, 404);
    assert.equal(await objectExists(upload.body.upload.path), true);
    assert.ok(await documentRow(upload.body.document.id));
  });

  console.log("Duplicate detection");
  await step("identical content is blocked with 409 unless 'Upload anyway' is chosen", async () => {
    const bytes = buildSyntheticPdfFixture();
    const sha = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
    const send = (extra = {}) =>
      requestUploadUrl(userA, { collection_id: collectionA, content_sha256: sha, filename: "dup.pdf", mime_type: "application/pdf", size: bytes.length, ...extra });
    const first = await send();
    assert.equal(first.response.status, 200);
    const storage = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await storage.storage.from("documents").uploadToSignedUrl(first.body.upload.path, first.body.upload.token, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
    assert.equal((await processDocument(userA, first.body.document.id)).body.status, "ready");
    assert.equal((await documentRow(first.body.document.id)).content_sha256, sha, "/process must store the verified hash.");

    const blocked = await send();
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.body.error, "This file is already in the workspace.");
    assert.equal((await send({ allow_duplicate: true })).response.status, 200);
  });

  console.log("Size limits");
  await step("15.2 MiB is rejected before upload with a clear message and no row", async () => {
    const countRows = async () => (await userA.client.from("documents").select("id", { count: "exact", head: true })).count;
    const before = await countRows();
    const { body, response } = await requestUploadUrl(userA, { collection_id: collectionA, filename: "huge.pdf", mime_type: "application/pdf", size: Math.round(15.2 * MiB) });
    assert.equal(response.status, 413);
    assert.equal(body.error, "File must be 15 MB or less.");
    assert.equal(await countRows(), before, "A refused file must not create a document row.");
  });
  await step("15 MiB + 1 byte rejected, exactly 15 MiB accepted", async () => {
    const attempt = (size) => requestUploadUrl(userA, { collection_id: collectionA, filename: "edge.pdf", mime_type: "application/pdf", size });
    assert.equal((await attempt(15 * MiB + 1)).response.status, 413);
    const ok = await attempt(15 * MiB);
    assert.equal(ok.response.status, 200);
    await userA.client.from("documents").delete().eq("id", ok.body.document.id);
  });
  await step("a lying declared size cannot bypass the bucket's hard limit", async () => {
    const bytes = Buffer.alloc(15 * MiB + 1, 0x25);
    bytes.write("%PDF-1.4\n");
    const upload = await browserUpload(userA, collectionA, { bytes, declaredSize: 1000, filename: "liar.pdf", mimeType: "application/pdf" });
    assert.equal(upload.response.status, 200, "The declaration itself is plausible, so a URL is issued.");
    assert.ok(upload.uploadError, "Storage must refuse an object over the bucket limit.");
    assert.equal(await objectExists(upload.body.upload.path), false);
  });
  await step("declared 1 KiB but 5 MiB uploaded: /process rejects the mismatch and deletes the object", async () => {
    const bytes = buildSizedPdfFixture(5 * MiB, { seed: "mismatch" });
    const upload = await browserUpload(userA, collectionA, { bytes, declaredSize: 1024, filename: "mismatch.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    const processed = await processDocument(userA, upload.body.document.id);
    assert.equal(processed.response.status, 422);
    assert.match(processed.body.error, /does not match the declared size/);
    assert.equal((await documentRow(upload.body.document.id)).status, "failed");
    assert.equal(await objectExists(upload.body.upload.path), false);
  });

  console.log("Magic bytes and request validation");
  await step("a .pdf whose bytes are text is rejected with a clear message", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: Buffer.from("this is not a pdf at all, just words"), filename: "fake.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    const processed = await processDocument(userA, upload.body.document.id);
    assert.equal(processed.response.status, 422);
    assert.match(processed.body.error, /not a PDF/);
    assert.equal((await documentRow(upload.body.document.id)).status, "failed");
    assert.equal(await objectExists(upload.body.upload.path), false);
  });
  await step("a .docx whose bytes are not a zip container is rejected", async () => {
    const upload = await browserUpload(userA, collectionA, {
      bytes: Buffer.from("plain text pretending to be a word document"),
      filename: "fake.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const processed = await processDocument(userA, upload.body.document.id);
    assert.equal(processed.response.status, 422);
    assert.match(processed.body.error, /not a valid DOCX/);
  });
  await step("a truncated PDF is rejected without crashing", async () => {
    const full = buildSyntheticPdfFixture();
    const upload = await browserUpload(userA, collectionA, { bytes: full.subarray(0, Math.floor(full.length / 2)), filename: "truncated.pdf", mimeType: "application/pdf" });
    const processed = await processDocument(userA, upload.body.document.id);
    assert.ok([400, 422].includes(processed.response.status), `got ${processed.response.status}: ${JSON.stringify(processed.body)}`);
    assert.equal((await documentRow(upload.body.document.id)).status, "failed");
  });
  await step("processing before the upload finished returns 409 and leaves the row awaiting_upload", async () => {
    const { body } = await requestUploadUrl(userA, { collection_id: collectionA, filename: "early.txt", mime_type: "text/plain", size: 100 });
    const processed = await processDocument(userA, body.document.id);
    assert.equal(processed.response.status, 409);
    assert.equal(processed.body.status, "awaiting_upload");
    assert.equal((await documentRow(body.document.id)).status, "awaiting_upload");
  });
  await step("unsupported type, wrong MIME, empty file and path-traversal names are handled", async () => {
    const attempt = (payload) => requestUploadUrl(userA, { collection_id: collectionA, ...payload });
    assert.equal((await attempt({ filename: "x.exe", mime_type: "application/x-msdownload", size: 10 })).response.status, 400);
    assert.match((await attempt({ filename: "x.xls", mime_type: "", size: 10 })).body.error, /Legacy/);
    assert.equal((await attempt({ filename: "x.pdf", mime_type: "image/png", size: 10 })).response.status, 200, "pdf accepts any declared type; magic bytes decide later");
    assert.equal((await attempt({ filename: "x.csv", mime_type: "image/png", size: 10 })).response.status, 400);
    assert.equal((await attempt({ filename: "empty.txt", mime_type: "text/plain", size: 0 })).response.status, 400);
    const traversal = await attempt({ filename: "../../../etc/passwd.txt", mime_type: "text/plain", size: 10 });
    assert.equal(traversal.response.status, 200);
    assert.ok(!traversal.body.upload.path.includes(".."), "Traversal sequences must never reach the storage path.");
    assert.match(traversal.body.upload.path, new RegExp(`^${userA.id}/${collectionA}/${traversal.body.document.id}/passwd\\.txt$`));
    const dots = await attempt({ filename: "...pdf", mime_type: "application/pdf", size: 10 });
    assert.match(dots.body.upload.path, /\/document\.pdf$/);
  });

  console.log("Isolation: user B cannot touch user A");
  const aUpload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "private-a.pdf", mimeType: "application/pdf" });
  assert.ifError(aUpload.uploadError);
  const aDocId = aUpload.body.document.id;
  const aPath = aUpload.body.upload.path;
  await step("B cannot request an upload URL into A's collection (404)", async () => {
    const { response } = await requestUploadUrl(userB, { collection_id: collectionA, filename: "x.txt", mime_type: "text/plain", size: 5 });
    assert.equal(response.status, 404);
  });
  await step("B cannot process A's document (404) and A's row is untouched", async () => {
    const { response } = await processDocument(userB, aDocId);
    assert.equal(response.status, 404);
    assert.equal((await documentRow(aDocId)).status, "awaiting_upload");
  });
  await step("B passing A's document_id as a retry gets a fresh row, never A's", async () => {
    const { body, response } = await requestUploadUrl(userB, { collection_id: collectionB, document_id: aDocId, filename: "b.txt", mime_type: "text/plain", size: 5 });
    assert.equal(response.status, 200);
    assert.notEqual(body.document.id, aDocId);
    assert.ok(body.upload.path.startsWith(`${userB.id}/`));
    assert.equal((await documentRow(aDocId)).storage_path, aPath, "A's row must not be modified.");
  });
  await step("B cannot sign, write, read, list, inspect or delete under A's prefix", async () => {
    const files = userB.client.storage.from("documents");
    const forgedPath = `${userA.id}/${collectionA}/${crypto.randomUUID()}/evil.pdf`;
    assert.ok((await files.createSignedUploadUrl(forgedPath)).error, "B must not be able to mint an upload URL in A's prefix.");
    assert.ok((await files.upload(forgedPath, Buffer.from("evil"), { upsert: false })).error, "B must not write into A's prefix.");
    assert.ok((await files.download(aPath)).error, "B must not read A's object.");
    assert.ok((await files.createSignedUrl(aPath, 60)).error, "B must not sign a read URL for A's object.");
    assert.ok((await files.info(aPath)).error, "B must not inspect A's object.");
    const listing = await files.list(`${userA.id}/${collectionA}/${aDocId}`);
    assert.deepEqual(listing.data ?? [], [], "B must see nothing under A's prefix.");
    await files.remove([aPath]);
    assert.equal(await objectExists(aPath), true, "B's delete must not remove A's object.");
    assert.equal(await objectExists(forgedPath), false);
  });
  await step("B cannot read or modify A's rows through the API", async () => {
    const { data } = await userB.client.from("documents").select("id").eq("id", aDocId);
    assert.deepEqual(data, []);
    const { data: updated } = await userB.client.from("documents").update({ status: "ready" }).eq("id", aDocId).select("id");
    assert.deepEqual(updated, []);
    assert.equal((await documentRow(aDocId)).status, "awaiting_upload");
  });
  await step("the bucket is private: anonymous public-URL reads fail", async () => {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/public/documents/${aPath}`);
    assert.ok(response.status >= 400, `got ${response.status}`);
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    assert.ok((await anon.storage.from("documents").download(aPath)).error);
  });
  await step("unauthenticated requests get 401", async () => {
    const upload = await requestUploadUrl(null, { collection_id: collectionA, filename: "x.txt", mime_type: "text/plain", size: 5 });
    assert.equal(upload.response.status, 401);
    assert.equal((await processDocument(null, aDocId)).response.status, 401);
  });

  console.log("Idempotency: processing twice never duplicates chunks");
  await step("sequential second call is a no-op and chunk set is identical", async () => {
    const bytes = buildSizedPdfFixture(2 * MiB, { seed: "idem" });
    const upload = await browserUpload(userA, collectionA, { bytes, filename: "idempotent.pdf", mimeType: "application/pdf" });
    assert.ifError(upload.uploadError);
    const id = upload.body.document.id;
    const first = await processDocument(userA, id);
    assert.equal(first.response.status, 200);
    const before = await chunkRows(id);
    assert.ok(before.length > 0);
    assert.equal(before.length, first.body.chunk_count);
    const second = await processDocument(userA, id);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.status, "ready");
    assert.match(second.body.message, /already processed/);
    assert.deepEqual(await chunkRows(id), before);
  });
  await step("two concurrent calls produce exactly one chunk set", async () => {
    const bytes = buildSizedPdfFixture(2 * MiB, { seed: "race" });
    const upload = await browserUpload(userA, collectionA, { bytes, filename: "race.pdf", mimeType: "application/pdf" });
    const id = upload.body.document.id;
    const results = await Promise.all([processDocument(userA, id), processDocument(userA, id), processDocument(userA, id)]);
    assert.ok(results.every(({ response }) => response.status === 200), JSON.stringify(results.map((r) => r.body)));
    const winners = results.filter(({ body }) => body.chunk_count !== undefined);
    assert.equal(winners.length, 1, "Exactly one caller may run the pipeline.");
    // Wait for the winner (the others returned immediately) and verify the final state.
    assert.equal((await documentRow(id)).status, "ready");
    const rows = await chunkRows(id);
    assert.equal(rows.length, winners[0].body.chunk_count);
    assert.equal(new Set(rows.map((row) => row.chunk_index)).size, rows.length, "chunk_index must be unique per document.");
  });
  await step("retrying a failed document that already has chunks keeps the set stable", async () => {
    const bytes = buildSizedPdfFixture(1 * MiB, { seed: "retry" });
    const upload = await browserUpload(userA, collectionA, { bytes, filename: "retry.pdf", mimeType: "application/pdf" });
    const id = upload.body.document.id;
    await processDocument(userA, id);
    const before = await chunkRows(id);
    await forgeRow(id, { values: { error_message: "forced", processing_stage: "failed", status: "failed" } });
    const retried = await processDocument(userA, id);
    assert.equal(retried.response.status, 200);
    assert.equal(retried.body.status, "ready");
    assert.deepEqual(await chunkRows(id), before);
  });
  await step("the legacy /api/process-document entry point still works and is idempotent", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "legacy.pdf", mimeType: "application/pdf" });
    const call = () =>
      api(userA, "/api/process-document", { body: JSON.stringify({ document_id: upload.body.document.id }), headers: { "Content-Type": "application/json" }, method: "POST" });
    assert.equal((await call()).body.status, "ready");
    const before = await chunkRows(upload.body.document.id);
    assert.equal((await call()).body.status, "ready");
    assert.deepEqual(await chunkRows(upload.body.document.id), before);
  });

  console.log("Watchdog and cleanup");
  await step("a stalled 'processing' document becomes Needs attention on the next read, and Retry recovers it", async () => {
    const upload = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "stalled.pdf", mimeType: "application/pdf" });
    const id = upload.body.document.id;
    await forgeRow(id, { stageMinutesAgo: stallMinutes + 1, values: { error_message: "Processing started.", processing_stage: "extracting", status: "processing" } });
    const fresh = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "fresh.pdf", mimeType: "application/pdf" });
    await forgeRow(fresh.body.document.id, { stageMinutesAgo: 1, values: { error_message: "Processing started.", processing_stage: "extracting", status: "processing" } });
    await loadWorkspace(userA, collectionA);
    const row = await documentRow(id);
    assert.equal(row.status, "failed");
    assert.match(row.error_message, /extracting: Processing stopped making progress/);
    assert.equal((await documentRow(fresh.body.document.id)).status, "processing", "A document that is still advancing must not be touched.");
    const retried = await processDocument(userA, id);
    assert.equal(retried.body.status, "ready");
  });
  await step("an abandoned upload fails after the upload window and its object is deleted", async () => {
    const stale = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "abandoned.pdf", mimeType: "application/pdf" });
    const recent = await browserUpload(userA, collectionA, { bytes: buildSyntheticPdfFixture(), filename: "recent.pdf", mimeType: "application/pdf" });
    await forgeRow(stale.body.document.id, { createdMinutesAgo: 61 });
    await forgeRow(recent.body.document.id, { createdMinutesAgo: 59 });
    assert.equal(await objectExists(stale.body.upload.path), true);
    await loadWorkspace(userA, collectionA);
    const row = await documentRow(stale.body.document.id);
    assert.equal(row.status, "failed");
    assert.match(row.error_message, /Upload did not complete/);
    assert.ok(row.upload_expired_at);
    assert.equal(await objectExists(stale.body.upload.path), false, "The orphaned object must be deleted.");
    assert.equal((await documentRow(recent.body.document.id)).status, "awaiting_upload");
  });
  if (cronSecret) {
    await step("maintenance job: 401 without the secret", async () => {
      assert.equal((await api(null, "/api/cron/maintenance")).response.status, 401);
      assert.equal((await api(null, "/api/cron/maintenance", { headers: { Authorization: "Bearer wrong" } })).response.status, 401);
    });
    await step("maintenance job sweeps all users: stalled work, and late objects after the URL died", async () => {
      const late = await browserUpload(userB, collectionB, { bytes: buildSyntheticPdfFixture(), filename: "late.pdf", mimeType: "application/pdf" });
      await forgeRow(late.body.document.id, {
        createdMinutesAgo: 200,
        values: { error_message: "Upload did not complete. Upload the file again.", processing_stage: "failed", status: "failed", upload_expired_at: new Date().toISOString() },
      });
      assert.equal(await objectExists(late.body.upload.path), true, "A late upload landed after expiry.");
      const stalled = await browserUpload(userB, collectionB, { bytes: buildSyntheticPdfFixture(), filename: "b-stalled.pdf", mimeType: "application/pdf" });
      await forgeRow(stalled.body.document.id, { stageMinutesAgo: stallMinutes + 2, values: { error_message: "Processing started.", processing_stage: "embedding", status: "processing" } });
      const { body, response } = await api(null, "/api/cron/maintenance", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(await objectExists(late.body.upload.path), false);
      assert.equal((await documentRow(late.body.document.id)).upload_expired_at, null);
      assert.equal((await documentRow(stalled.body.document.id)).status, "failed");
    });
  }

  console.log("Real hang");
  if (hangBaseUrl && realStall) {
    await step(`a hung extraction ends in Needs attention within ${stallMinutes + 2} minutes`, async () => {
      const upload = await browserUpload(userA, collectionA, {
        bytes: Buffer.from("A short plain text document that will hang during extraction. ".repeat(10)),
        filename: "hang.txt",
        mimeType: "text/plain",
      });
      const id = upload.body.document.id;
      const controller = new AbortController();
      const request = processDocument(userA, id, hangBaseUrl, { signal: controller.signal }).catch(() => null);
      // Wait until the pipeline is genuinely inside extraction (the first request compiles the route),
      // then drop the client connection, as a platform kill would.
      let mid = await documentRow(id);
      for (let attempt = 0; attempt < 90 && mid.processing_stage !== "extracting"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        mid = await documentRow(id);
      }
      controller.abort();
      await request;
      assert.equal(mid.status, "processing");
      assert.equal(mid.processing_stage, "extracting");
      const hangEnteredAt = Date.now();
      let row = mid;
      while (row.status === "processing" && Date.now() - hangEnteredAt < (stallMinutes + 3) * 60_000) {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        await loadWorkspace(userA, collectionA, hangBaseUrl);
        row = await documentRow(id);
      }
      const elapsedMinutes = (Date.now() - hangEnteredAt) / 60_000;
      console.log(`      hang resolved to '${row.status}' after ${elapsedMinutes.toFixed(1)} min: ${row.error_message}`);
      assert.equal(row.status, "failed");
      assert.match(row.error_message, /stopped making progress/);
      assert.ok(elapsedMinutes >= stallMinutes - 0.5 && elapsedMinutes <= stallMinutes + 2, `elapsed ${elapsedMinutes}`);
    });
  } else {
    console.log("  --  real-time hang test skipped (set PLINY_HANG_BASE_URL and PLINY_E2E_REAL_STALL=1)");
  }

  console.log(`Direct-upload E2E passed (${passed} checks).`);
} finally {
  for (const user of cleanupUsers) {
    try {
      const { data } = await user.client.from("documents").select("storage_path");
      const paths = (data ?? []).map((row) => row.storage_path).filter(Boolean);
      if (paths.length > 0) await admin.storage.from("documents").remove(paths);
      await admin.auth.admin.deleteUser(user.id);
    } catch (error) {
      console.error("cleanup failed for", user.label, error instanceof Error ? error.message : error);
    }
  }
}
