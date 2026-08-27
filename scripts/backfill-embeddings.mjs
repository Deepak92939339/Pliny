import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_MODEL = "voyage-4";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_CHUNKS = 200;
const DEFAULT_MAX_CHARS = 8000;

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

function normalizeInput(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, DEFAULT_MAX_CHARS);
}

async function embedText(text) {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is required for embedding backfill.");
  }

  const model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
  const dimensions = getNumberEnv("EMBEDDING_DIMENSIONS", DEFAULT_DIMENSIONS, 1, 4096);
  const input = normalizeInput(text);

  if (!input) {
    throw new Error("Chunk content is empty.");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    body: JSON.stringify({
      input,
      input_type: "document",
      model,
      output_dimension: dimensions,
      output_dtype: "float",
      truncation: true,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Embedding provider request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding ?? payload?.embeddings?.[0];

  if (!Array.isArray(embedding) || embedding.length !== dimensions) {
    throw new Error("Embedding provider returned an unexpected vector shape.");
  }

  return {
    embedding,
    model: payload.model || model,
  };
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

  for (const row of rows) {
    try {
      const result = await embedText(row.content);
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
    } catch (error) {
      errors += 1;
      chunksSkipped += 1;
      console.error("Embedding backfill skipped a chunk.", {
        chunkId: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

console.log("Embedding backfill complete.", {
  chunksEmbedded,
  chunksFound,
  chunksSkipped,
  errors,
});
