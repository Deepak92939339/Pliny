/**
 * WP5 — DOCUMENT MANAGEMENT: DELETE AND DUPLICATES (spec: PLINY FIX R1, WP5)
 *
 * Tests-first: these tests fail on pre-WP5 code (the modules do not exist).
 * - computeDocumentHash: server-side SHA-256 over received bytes
 * - shouldBlockDuplicateUpload: duplicate decision (existing ready → block;
 *   existing failed → allow; allowDuplicate → allow)
 * - deleteDocumentWithDependencies: route core with a mocked Supabase client
 *   (success tears down storage + chunks + row; missing/not-owned → 404)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server.js";
import { z } from "zod";

const duplicateModule = await import("../src/lib/documents/duplicateDetection.ts").catch((error) => ({ __importError: error }));
const deleteModule = await import("../src/lib/documents/deleteDocument.ts").catch((error) => ({ __importError: error }));

const { computeDocumentHash, shouldBlockDuplicateUpload } = duplicateModule;
const { deleteDocumentWithDependencies } = deleteModule;

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

await run("computeDocumentHash: SHA-256 hex digest of received bytes", () => {
  assert.equal(typeof computeDocumentHash, "function", "computeDocumentHash does not exist yet");
  const bytes = new TextEncoder().encode("abc");
  assert.equal(computeDocumentHash(bytes), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(computeDocumentHash(new Uint8Array(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

await run("duplicate decision: existing ready doc blocks without allowDuplicate", () => {
  assert.equal(typeof shouldBlockDuplicateUpload, "function", "shouldBlockDuplicateUpload does not exist yet");
  assert.equal(
    shouldBlockDuplicateUpload({ existingStatus: "ready", allowDuplicate: false }),
    "block"
  );
  assert.equal(
    shouldBlockDuplicateUpload({ existingStatus: "processing", allowDuplicate: false }),
    "block"
  );
});

await run("duplicate decision: existing failed doc and allowDuplicate are allowed", () => {
  assert.equal(typeof shouldBlockDuplicateUpload, "function", "shouldBlockDuplicateUpload does not exist yet");
  assert.equal(shouldBlockDuplicateUpload({ existingStatus: "failed", allowDuplicate: false }), "allow");
  assert.equal(shouldBlockDuplicateUpload({ existingStatus: "ready", allowDuplicate: true }), "allow");
  assert.equal(shouldBlockDuplicateUpload({ existingStatus: null, allowDuplicate: false }), "allow");
});

function makeSupabaseMock({ existingDocument, deleteFails = false, storageFails = false, chunkDeleteFails = false }) {
  const calls = { chunkDelete: 0, rowDelete: 0, storageRemove: 0, selectWhere: [] };
  const documentRow = existingDocument ?? null;
  return {
    calls,
    from(table) {
      if (table === "documents") {
        return {
          select() {
            const query = {
              eq(_column, value) {
                calls.selectWhere.push(`${_column}=${value}`);
                return query;
              },
              async maybeSingle() {
                return { data: documentRow, error: null };
              },
            };
            return query;
          },
          delete() {
            return {
              eq() {
                calls.rowDelete += 1;
                return Promise.resolve({ error: deleteFails ? { message: "row delete failed" } : null });
              },
            };
          },
        };
      }
      if (table === "document_chunks") {
        return {
          delete() {
            return {
              eq() {
                calls.chunkDelete += 1;
                return Promise.resolve({ error: chunkDeleteFails ? { message: "chunk delete failed" } : null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          remove(paths) {
            calls.storageRemove += paths.length;
            return Promise.resolve({ error: storageFails ? { message: "storage remove failed" } : null });
          },
        };
      },
    },
  };
}

await run("delete: owned document removes storage, chunks and row (204 path)", async () => {
  assert.equal(typeof deleteDocumentWithDependencies, "function", "deleteDocumentWithDependencies does not exist yet");
  const supabase = makeSupabaseMock({
    existingDocument: { id: "doc-1", storage_path: "user/col/file.pdf" },
  });
  const result = await deleteDocumentWithDependencies(supabase, { documentId: "doc-1", userId: "user-1" });
  assert.deepEqual(result, { ok: true });
  assert.equal(supabase.calls.storageRemove, 1, "storage object must be removed");
  assert.equal(supabase.calls.chunkDelete, 1, "chunks must be deleted");
  assert.equal(supabase.calls.rowDelete, 1, "document row must be deleted");
});

await run("delete: missing or not-owned document returns 404 without touching data", async () => {
  assert.equal(typeof deleteDocumentWithDependencies, "function", "deleteDocumentWithDependencies does not exist yet");
  const supabase = makeSupabaseMock({ existingDocument: null });
  const result = await deleteDocumentWithDependencies(supabase, { documentId: "doc-2", userId: "user-1" });
  assert.deepEqual(result, { ok: false, status: 404, error: "Document not found." });
  assert.equal(supabase.calls.rowDelete, 0, "no delete may run for a not-owned document");
  assert.equal(supabase.calls.storageRemove, 0, "no storage delete may run for a not-owned document");
});

await run("delete: row-delete failure surfaces a 500 so the client can retry", async () => {
  assert.equal(typeof deleteDocumentWithDependencies, "function", "deleteDocumentWithDependencies does not exist yet");
  const supabase = makeSupabaseMock({ existingDocument: { id: "doc-1", storage_path: "p" }, deleteFails: true });
  const result = await deleteDocumentWithDependencies(supabase, { documentId: "doc-1", userId: "user-1" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

// Execute the real route with isolated dependencies: no database/storage writes.
const routeCode = ts.transpileModule(readFileSync("src/app/api/documents/[id]/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const reason of ["rate_limited", "missing_redis_config", "redis_error", "allowed"]) {
  await run(`DELETE route: ${reason} ${reason === "allowed" ? "permits" : "prevents"} deletion`, async () => {
    let deletes = 0;
    const exported = {};
    const dependencies = {
      "next/server": { NextResponse },
      zod: { z },
      "@/lib/documents/deleteDocument": { deleteDocumentWithDependencies: async () => { deletes++; return { ok: true }; } },
      "@/lib/rate-limit": { checkRouteRateLimit: async () => ({ status: reason === "allowed" ? "allowed" : "blocked", reason, resetAt: Date.now() + 5000 }) },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "synthetic-user" } }, error: null }) } }) },
    };
    runInNewContext(routeCode, { exports: exported, require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected route dependency: ${name}`);
      return dependencies[name];
    }, Date });
    const response = await exported.DELETE(new Request("http://localhost/api/documents/test"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    assert.equal(response.status, reason === "allowed" ? 204 : reason === "rate_limited" ? 429 : 503);
    assert.equal(deletes, reason === "allowed" ? 1 : 0);
  });
}

const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP5 document management tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
