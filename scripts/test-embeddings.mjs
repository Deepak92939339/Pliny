import assert from "node:assert/strict";
import { embedTexts, EmbeddingProviderError, getEmbeddingConfig } from "../src/lib/embeddings/embedBatch.ts";
import { prepareChunkRowsWithEmbeddings } from "../src/lib/document-processing/prepareChunkRowsWithEmbeddings.ts";

process.env.EMBEDDINGS_ENABLED = "true";
process.env.EMBEDDINGS_PROVIDER = "voyage";
process.env.EMBEDDING_MODEL = "voyage-4";
process.env.EMBEDDING_DIMENSIONS = "1024";
process.env.VOYAGE_API_KEY = "test-key-not-a-real-secret";

const vector = (seed) => Array.from({ length: 1024 }, (_, index) => seed + index / 10_000);
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const successBody = (inputs, indexed = false) => ({
  data: inputs.map((_, index) => ({ ...(indexed ? { index } : {}), embedding: vector(index + 1) })),
  model: "voyage-4",
});
const noWait = async () => {};

assert.equal(getEmbeddingConfig().model, "voyage-4");
assert.equal(getEmbeddingConfig().dimensions, 1024);
assert.equal(getEmbeddingConfig().batchSize, 10);

let calls = [];
const batched = await embedTexts(Array.from({ length: 10 }, (_, index) => `chunk ${index}`), {
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(successBody(body.input));
  },
  sleep: noWait,
});
assert.equal(calls.length, 1, "ten chunks should use one request at the default batch size");
assert.equal(calls[0].input.length, 10);
assert.deepEqual(batched.map((result) => result.embedding[0]), Array.from({ length: 10 }, (_, index) => index + 1));

const ordered = await embedTexts(["first", "second"], {
  batchSize: 2,
  fetchImpl: async () => response({
    data: [{ index: 1, embedding: vector(2) }, { index: 0, embedding: vector(1) }],
    model: "voyage-4",
  }),
  sleep: noWait,
});
assert.deepEqual(ordered.map((result) => result.embedding[0]), [1, 2], "indexed provider results must be restored to input order");

await assert.rejects(
  () => embedTexts(["one", "two"], { fetchImpl: async () => response({ data: [{ embedding: vector(1) }] }), sleep: noWait }),
  /unexpected number of vectors/
);
const partialRows = [{ chunk_index: 0, content: "partial" }, { chunk_index: 1, content: "result" }];
await assert.rejects(
  () => prepareChunkRowsWithEmbeddings(partialRows, { fetchImpl: async () => response({ data: [{ embedding: vector(1) }] }), sleep: noWait }),
  /unexpected number of vectors/
);
assert.equal(partialRows.every((row) => !row.embedding), true, "partial provider results must not mutate chunk rows");
await assert.rejects(
  () => embedTexts(["one"], { fetchImpl: async () => response({ data: [{ embedding: [1, 2] }] }), sleep: noWait }),
  /unexpected vector shape/
);
await assert.rejects(
  () => embedTexts(["one", "two"], { fetchImpl: async () => response({ data: [{ index: 0, embedding: vector(1) }, { index: 0, embedding: vector(2) }] }), sleep: noWait }),
  /invalid vector ordering/
);

let retryCalls = 0;
const retryDelays = [];
const retried = await embedTexts(["retry me"], {
  fetchImpl: async () => {
    retryCalls += 1;
    return retryCalls === 1 ? response({ error: "rate limited" }, 429) : response(successBody(["retry me"]));
  },
  random: () => 0,
  sleep: async (delay) => retryDelays.push(delay),
});
assert.equal(retried[0].embedding.length, 1024);
assert.equal(retryCalls, 2);
assert.deepEqual(retryDelays, [1000], "429 without Retry-After should use bounded exponential backoff");

let transientCalls = 0;
await embedTexts(["temporary"], {
  fetchImpl: async () => {
    transientCalls += 1;
    return transientCalls === 1 ? response({ error: "temporary" }, 503) : response(successBody(["temporary"]));
  },
  sleep: noWait,
});
assert.equal(transientCalls, 2, "transient 5xx responses should be retried");

let networkCalls = 0;
await embedTexts(["network"], {
  fetchImpl: async () => {
    networkCalls += 1;
    if (networkCalls === 1) throw new Error("socket closed");
    return response(successBody(["network"]));
  },
  sleep: noWait,
});
assert.equal(networkCalls, 2, "network failures should be retried");

const retryAfterDelays = [];
let retryAfterCalls = 0;
await embedTexts(["retry after"], {
  fetchImpl: async () => {
    retryAfterCalls += 1;
    return retryAfterCalls === 1
      ? response({ error: "slow down" }, 429, { "Retry-After": "0.25" })
      : response(successBody(["retry after"]));
  },
  sleep: async (delay) => retryAfterDelays.push(delay),
});
assert.deepEqual(retryAfterDelays, [250], "Retry-After should control the retry delay");

let exhaustedCalls = 0;
await assert.rejects(
  () => embedTexts(["exhaust me"], {
    fetchImpl: async () => {
      exhaustedCalls += 1;
      return response({ error: "rate limited" }, 429, { "Retry-After": "999" });
    },
    sleep: noWait,
  }),
  (error) => error instanceof EmbeddingProviderError && error.status === 429
);
assert.equal(exhaustedCalls, 5, "retry count must be bounded at five total attempts");

let unauthorizedCalls = 0;
await assert.rejects(
  () => embedTexts(["unauthorized"], {
    fetchImpl: async () => {
      unauthorizedCalls += 1;
      return response({ error: "unauthorized" }, 401);
    },
    sleep: noWait,
  }),
  (error) => error instanceof EmbeddingProviderError && error.status === 401 && error.retryable === false
);
assert.equal(unauthorizedCalls, 1, "401 must not be retried");

const rows = [{ chunk_index: 0, content: "alpha" }, { chunk_index: 1, content: "beta" }];
let reprocessCalls = 0;
const processOptions = {
  batchSize: 2,
  fetchImpl: async (_url, init) => {
    reprocessCalls += 1;
    return response(successBody(JSON.parse(init.body).input, true));
  },
  sleep: noWait,
};
const firstRows = await prepareChunkRowsWithEmbeddings(rows, processOptions);
const secondRows = await prepareChunkRowsWithEmbeddings(rows, processOptions);
assert.equal(reprocessCalls, 2, "each reprocessing pass should produce one complete replacement batch");
assert.deepEqual(firstRows.map((row) => row.chunk_index), [0, 1]);
assert.deepEqual(secondRows.map((row) => row.chunk_index), [0, 1]);
assert.equal(new Set(secondRows.map((row) => row.chunk_index)).size, 2, "reprocessing must not duplicate chunks");
assert.equal(rows.every((row) => !row.embedding), true, "failed or pending preparation must not partially mutate source rows");

console.log("Embedding batching and retry tests passed.");
