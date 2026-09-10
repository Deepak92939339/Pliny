import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { retrieveRelevantChunks } from "../src/lib/search/retrieveChunks.ts";

process.env.EMBEDDINGS_ENABLED = "false";

const supabaseUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const localHostname = supabaseUrl ? new URL(supabaseUrl).hostname : "";
assert.ok(localHostname === "127.0.0.1" || localHostname === "localhost", "Database assurance must use local Supabase only.");
assert.ok(anonKey && serviceRoleKey, "Local Supabase Boolean credential presence is required.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const identities = [
  { email: `db-owner-${suffix}@example.test`, password: "Synthetic-DB-Assurance-Owner-2026!" },
  { email: `db-outsider-${suffix}@example.test`, password: "Synthetic-DB-Assurance-Outsider-2026!" },
];
const createdUserIds = [];

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function createAuthenticatedClient(identity) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    password: identity.password,
  });
  assert.ifError(createError);
  assert.ok(created.user?.id);
  createdUserIds.push(created.user.id);
  const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword(identity);
  assert.ifError(signInError);
  assert.ok(session.user?.id);
  return { client, userId: session.user.id };
}

let result;
try {
  const owner = await createAuthenticatedClient(identities[0]);
  const outsider = await createAuthenticatedClient(identities[1]);
  const { data: collection, error: collectionError } = await owner.client
    .from("collections")
    .insert({ name: "Synthetic database assurance", user_id: owner.userId })
    .select("id")
    .single();
  assert.ifError(collectionError);
  const { data: document, error: documentError } = await owner.client
    .from("documents")
    .insert({
      collection_id: collection.id,
      filename: "synthetic-database-assurance.txt",
      status: "ready",
      storage_path: `${owner.userId}/synthetic-database-assurance.txt`,
      user_id: owner.userId,
    })
    .select("id")
    .single();
  assert.ifError(documentError);

  const rows = Array.from({ length: 100 }, (_, index) => ({
    chunk_index: index,
    collection_id: collection.id,
    content: `Synthetic retrieval benchmark passage ${index}. The beacon calibration interval is ${17 + (index % 5)} days. No real data is present.`,
    document_id: document.id,
    file_kind: "text",
    location_label: `Chunk ${index + 1}`,
    metadata:
      index === 0
        ? {}
        : index === 1
          ? { optionalProperty: null }
          : index === 2
            ? { boundedNote: "m".repeat(8_192) }
            : { syntheticIndex: index },
    page_number: 1,
  }));
  const { error: chunksError } = await owner.client.from("document_chunks").insert(rows);
  assert.ifError(chunksError);

  const { data: outsiderRows, error: outsiderReadError } = await outsider.client
    .from("document_chunks")
    .select("id")
    .eq("collection_id", collection.id);
  assert.ifError(outsiderReadError);
  assert.deepEqual(outsiderRows, [], "cross-tenant table access must return no rows");

  const { data: outsiderRpcRows, error: outsiderRpcError } = await outsider.client.rpc("match_document_chunks_lexical_by_mode", {
    match_collection_id: collection.id,
    match_count: 30,
    match_document_id: null,
    match_processing_mode: "standard",
    match_query: "beacon OR calibration",
    match_user_id: outsider.userId,
  });
  assert.ifError(outsiderRpcError);
  assert.deepEqual(outsiderRpcRows, [], "cross-tenant retrieval RPC must return no rows");

  const { data: cappedRows, error: cappedError } = await owner.client.rpc("match_document_chunks_lexical_by_mode", {
    match_collection_id: collection.id,
    match_count: 100,
    match_document_id: null,
    match_processing_mode: "standard",
    match_query: "beacon OR calibration",
    match_user_id: owner.userId,
  });
  assert.ifError(cappedError);
  assert.equal(cappedRows.length, 30, "the lexical RPC must enforce its 30-row hard ceiling");

  const latencies = [];
  const outcomes = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const started = performance.now();
      try {
        const retrieval = await retrieveRelevantChunks(owner.client, {
          collectionId: collection.id,
          limit: 5,
          query: "What is the beacon calibration interval?",
          userId: owner.userId,
        });
        latencies.push(performance.now() - started);
        return { error: retrieval.error, resultCount: retrieval.results.length };
      } catch (error) {
        latencies.push(performance.now() - started);
        return { error: error instanceof Error ? error.name : "unknown", resultCount: 0 };
      }
    })
  );
  const errors = outcomes.filter((outcome) => outcome.error);
  assert.equal(errors.length, 0, "50 parallel retrieval operations must complete without database errors");
  assert.equal(outcomes.every((outcome) => outcome.resultCount === 5), true);

  const { data: metadataRows, error: metadataError } = await owner.client
    .from("document_chunks")
    .select("chunk_index,metadata")
    .eq("document_id", document.id)
    .in("chunk_index", [0, 1, 2])
    .order("chunk_index");
  assert.ifError(metadataError);
  assert.deepEqual(metadataRows[0].metadata, {});
  assert.equal(metadataRows[1].metadata.optionalProperty, null);
  assert.ok(JSON.stringify(metadataRows[2].metadata).length >= 8_192);
  assert.ok(JSON.stringify(metadataRows[2].metadata).length < 10_000);

  result = {
    evidenceClass: "isolated local Supabase HTTP clients and production retrieval RPC",
    externalProviderRequests: 0,
    metadata: { boundedLargeBytes: JSON.stringify(metadataRows[2].metadata).length, emptyPassed: true, missingPropertyPassed: true },
    parallelRetrieval: {
      databaseErrors: errors.length,
      operationCount: outcomes.length,
      p50Ms: Math.round(percentile(latencies, 0.5) * 10) / 10,
      p95Ms: Math.round(percentile(latencies, 0.95) * 10) / 10,
      p99Ms: Math.round(percentile(latencies, 0.99) * 10) / 10,
      resultCountPerOperation: 5,
    },
    resourceLimits: { requestedRpcRows: 100, returnedRpcRows: cappedRows.length },
    tenantIsolation: { crossUserRpcRows: outsiderRpcRows.length, crossUserTableRows: outsiderRows.length, passed: true },
  };

  if (process.env.PLINY_DB_OUTPUT) {
    await mkdir(dirname(process.env.PLINY_DB_OUTPUT), { recursive: true });
    await writeFile(process.env.PLINY_DB_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const userId of createdUserIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    assert.ifError(error);
  }
}
