import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../src/lib/embeddings/embedBatch.ts";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_CHUNKS = 200;

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getNumberEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

if (process.env.EMBEDDINGS_ENABLED !== "true") {
  console.error("Embedding backfill skipped: EMBEDDINGS_ENABLED must be true.");
  process.exit(1);
}

if ((process.env.EMBEDDINGS_PROVIDER || "voyage") !== "voyage") {
  console.error("Embedding backfill skipped: only EMBEDDINGS_PROVIDER=voyage is supported.");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Embedding backfill requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const batchSize = getNumberEnv("EMBEDDING_BACKFILL_BATCH_SIZE", DEFAULT_BATCH_SIZE, 1, 25);
const maxChunks = getNumberEnv("EMBEDDING_BACKFILL_MAX_CHUNKS", DEFAULT_MAX_CHUNKS, 1, 1000);
let chunksFound = 0;
let chunksEmbedded = 0;
let chunksSkipped = 0;
let errors = 0;

while (chunksFound < maxChunks) {
  const remaining = maxChunks - chunksFound;
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id,content")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(Math.min(batchSize, remaining));

  if (error) {
    console.error("Embedding backfill failed while loading chunks.", { message: error.message });
    process.exit(1);
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    break;
  }

  chunksFound += rows.length;

  try {
    const results = await embedTexts(rows.map((row) => row.content), {
      batchSize: rows.length,
      inputType: "document",
    });

    for (const [index, row] of rows.entries()) {
      const result = results[index];
      const { error: updateError } = await supabase
        .from("document_chunks")
        .update({
          embedding: result.embedding,
          embedding_created_at: new Date().toISOString(),
          embedding_model: result.model,
        })
        .eq("id", row.id);

      if (updateError) {
        errors += 1;
        console.error("Embedding backfill failed while updating a chunk.", { chunkId: row.id, message: updateError.message });
        continue;
      }

      chunksEmbedded += 1;
    }
  } catch (error) {
    errors += 1;
    chunksSkipped += rows.length;
    console.error("Embedding backfill batch skipped.", {
      chunkIds: rows.map((row) => row.id),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log("Embedding backfill complete.", {
  chunksEmbedded,
  chunksFound,
  chunksSkipped,
  errors,
});
