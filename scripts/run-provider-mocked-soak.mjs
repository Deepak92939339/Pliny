import assert from "node:assert/strict";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createAnswerProvider, AnswerProviderError } from "../src/lib/ai/answerProvider.ts";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { buildGenerationProviderPayload } from "../src/lib/ai/providerBoundary.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import { retrieveRelevantChunks } from "../src/lib/search/retrieveChunks.ts";

process.env.EMBEDDINGS_ENABLED = "false";

const DURATION_MS = Number(process.env.SOAK_DURATION_MS ?? 600_000);
const CLIENT_COUNT = 20;
const CLIENT_INTERVAL_MS = 10_000;
const supabaseUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
assert.ok(Number.isFinite(DURATION_MS) && DURATION_MS >= 1_000);
assert.ok(supabaseUrl && ["127.0.0.1", "localhost"].includes(new URL(supabaseUrl).hostname), "Soak must use local Supabase only.");
assert.ok(anonKey && serviceRoleKey, "Local Supabase Boolean credential presence is required.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const identity = { email: `soak-${suffix}@example.test`, password: "Synthetic-Soak-Assurance-2026!" };
let userId;
const latencies = [];
const memory = [];
const counters = {
  abortedRequests: 0,
  controlledProviderFailures: 0,
  databaseFailures: 0,
  requests: 0,
  refusals: 0,
  successfulAnswers: 0,
  unexpectedErrors: 0,
};
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
const activeHandlesBefore = process._getActiveHandles().map((handle) => handle.constructor?.name ?? "unknown");
const listenersBefore = process.listenerCount("unhandledRejection") + process.listenerCount("uncaughtException");

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))] ?? 0;
}

function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function sampleMemory(startedAt) {
  const usage = process.memoryUsage();
  memory.push({ elapsedMs: Date.now() - startedAt, heapUsedMb: mb(usage.heapUsed), rssMb: mb(usage.rss) });
}

function getTrend(values) {
  if (values.length < 2) return { deltaMb: 0, stabilized: true };
  const warmupIndex = Math.min(values.length - 1, Math.max(1, Math.floor(values.length * 0.2)));
  const deltaMb = Math.round((values.at(-1) - values[warmupIndex]) * 10) / 10;
  return { deltaMb, stabilized: deltaMb < 32 };
}

function openRouterResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content } }],
    model: "z-ai/glm-5.3-flash",
    usage: { completion_tokens: 9, prompt_tokens: 40, total_tokens: 49 },
  }), { status: 200 });
}

const successProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "synthetic-mocked-key" },
  fetchImpl: async () => openRouterResponse("The beacon calibration interval is 19 days [[s.1]]."),
});
const failureProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "synthetic-mocked-key" },
  fetchImpl: async () => new Response(null, { status: 503 }),
  sleepImpl: async () => {},
});
const abortProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "synthetic-mocked-key" },
  fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }),
});

async function runRequest(client, collectionId, sequence) {
  const started = performance.now();
  counters.requests += 1;
  const kind = sequence % 20 === 0 ? "abort" : sequence % 7 === 0 ? "failure" : sequence % 5 === 0 ? "refusal" : "success";

  try {
    const question = kind === "refusal" ? "What is the nonexistent cafeteria price?" : "What is the beacon calibration interval?";
    const retrieval = await retrieveRelevantChunks(client, { collectionId, limit: 5, query: question, userId });
    if (retrieval.error) {
      counters.databaseFailures += 1;
      return;
    }
    const evidence = assessEvidenceSufficiency({ question, retrievalReason: retrieval.retrievalReason, sources: retrieval.results });
    if (!evidence.sufficient) {
      counters.refusals += 1;
      return;
    }

    const payload = buildGenerationProviderPayload({
      maxTokens: 120,
      model: "z-ai/glm-5.3-flash",
      prompt: `<question>${question}</question><sources><source id="s.1">${retrieval.results[0].content}</source></sources>`,
      system: "Use only synthetic sources and cite every factual claim.",
      temperature: 0,
    });
    if (kind === "failure") {
      try {
        await failureProvider.generate(payload);
        counters.unexpectedErrors += 1;
      } catch (error) {
        if (error instanceof AnswerProviderError && error.code === "upstream_error") counters.controlledProviderFailures += 1;
        else counters.unexpectedErrors += 1;
      }
      return;
    }
    if (kind === "abort") {
      const controller = new AbortController();
      const pending = abortProvider.generate(payload, { signal: controller.signal });
      controller.abort();
      try {
        await pending;
        counters.unexpectedErrors += 1;
      } catch (error) {
        if (error instanceof AnswerProviderError && error.code === "cancelled") counters.abortedRequests += 1;
        else counters.unexpectedErrors += 1;
      }
      return;
    }

    const answer = await successProvider.generate(payload);
    if (validateCitations(answer.text, retrieval.results).rejectedAnswer) counters.unexpectedErrors += 1;
    else counters.successfulAnswers += 1;
  } catch {
    counters.unexpectedErrors += 1;
  } finally {
    latencies.push(performance.now() - started);
  }
}

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ ...identity, email_confirm: true });
  assert.ifError(createError);
  userId = created.user.id;
  const clients = await Promise.all(Array.from({ length: CLIENT_COUNT }, async () => {
    const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await client.auth.signInWithPassword(identity);
    assert.ifError(error);
    return client;
  }));
  const owner = clients[0];
  const { data: collection, error: collectionError } = await owner.from("collections")
    .insert({ name: "Synthetic provider-mocked soak", user_id: userId }).select("id").single();
  assert.ifError(collectionError);
  const { data: document, error: documentError } = await owner.from("documents").insert({
    collection_id: collection.id,
    filename: "synthetic-soak.txt",
    status: "ready",
    storage_path: `${userId}/synthetic-soak.txt`,
    user_id: userId,
  }).select("id").single();
  assert.ifError(documentError);
  const { error: chunkError } = await owner.from("document_chunks").insert({
    chunk_index: 0,
    collection_id: collection.id,
    content: "This is invented evidence. The beacon calibration interval is 19 days for the synthetic soak fixture.",
    document_id: document.id,
    file_kind: "text",
    location_label: "Lines 1-1",
    metadata: {},
    page_number: 1,
  });
  assert.ifError(chunkError);

  const startedAt = Date.now();
  const deadline = startedAt + DURATION_MS;
  eventLoop.enable();
  sampleMemory(startedAt);
  const sampler = setInterval(() => sampleMemory(startedAt), 5_000);
  const progress = setInterval(() => {
    console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000), requests: counters.requests }));
  }, 30_000);

  await Promise.all(clients.map(async (client, clientIndex) => {
    let sequence = clientIndex;
    while (Date.now() < deadline) {
      await runRequest(client, collection.id, sequence);
      sequence += CLIENT_COUNT;
      const remaining = deadline - Date.now();
      if (remaining > 0) await sleep(Math.min(CLIENT_INTERVAL_MS, remaining));
    }
  }));
  clearInterval(sampler);
  clearInterval(progress);
  sampleMemory(startedAt);
  eventLoop.disable();
  await sleep(1_000);

  const activeHandlesAfter = process._getActiveHandles().map((handle) => handle.constructor?.name ?? "unknown");
  const listenersAfter = process.listenerCount("unhandledRejection") + process.listenerCount("uncaughtException");
  const result = {
    clients: CLIENT_COUNT,
    durationMs: Date.now() - startedAt,
    evidenceClass: "local authenticated Supabase retrieval plus provider-mocked answer boundary",
    externalProviderRequests: 0,
    requests: counters.requests,
    outcomes: counters,
    errorRate: counters.unexpectedErrors / Math.max(counters.requests, 1),
    latencyMs: {
      p50: Math.round(percentile(latencies, 0.5) * 10) / 10,
      p95: Math.round(percentile(latencies, 0.95) * 10) / 10,
      p99: Math.round(percentile(latencies, 0.99) * 10) / 10,
    },
    memory: {
      samples: memory,
      heapTrend: getTrend(memory.map((sample) => sample.heapUsedMb)),
      rssTrend: getTrend(memory.map((sample) => sample.rssMb)),
    },
    eventLoopDelayMs: {
      mean: Math.round((eventLoop.mean / 1e6) * 100) / 100,
      p95: Math.round((eventLoop.percentile(95) / 1e6) * 100) / 100,
      p99: Math.round((eventLoop.percentile(99) / 1e6) * 100) / 100,
      max: Math.round((eventLoop.max / 1e6) * 100) / 100,
    },
    handles: { before: activeHandlesBefore, after: activeHandlesAfter, delta: activeHandlesAfter.length - activeHandlesBefore.length },
    listeners: { before: listenersBefore, after: listenersAfter, delta: listenersAfter - listenersBefore },
  };
  assert.equal(counters.unexpectedErrors, 0);
  assert.equal(counters.databaseFailures, 0);
  assert.equal(result.listeners.delta, 0);

  if (process.env.PLINY_SOAK_OUTPUT) {
    await mkdir(dirname(process.env.PLINY_SOAK_OUTPUT), { recursive: true });
    await writeFile(process.env.PLINY_SOAK_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    assert.ifError(error);
  }
}
