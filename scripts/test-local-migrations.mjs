import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseline = await readFile(
  new URL("../supabase/migrations/20260830000000_initial_schema_baseline.sql", import.meta.url),
  "utf8"
);
const extensionIndex = baseline.indexOf("create extension if not exists vector;");
const vectorColumnIndex = baseline.indexOf("embedding vector(1024)");
const vectorParameterIndex = baseline.indexOf("query_embedding vector(1024)");

assert.ok(extensionIndex >= 0, "The baseline migration must bootstrap the vector extension for a fresh local database.");
assert.ok(vectorColumnIndex > extensionIndex, "The vector extension must be available before vector column declarations.");
assert.ok(vectorParameterIndex > extensionIndex, "The vector extension must be available before vector-typed function declarations.");
assert.ok(
  baseline.includes("grant select, insert, update, delete\n  on table public.collections, public.documents, public.document_chunks,"),
  "The baseline migration must grant authenticated users table access before RLS can enforce ownership."
);
assert.ok(
  baseline.includes("grant select, insert, delete on table storage.objects to authenticated;"),
  "The baseline migration must grant authenticated users Storage access before bucket policies can enforce ownership."
);

console.log("Local migration bootstrap test passed.");
