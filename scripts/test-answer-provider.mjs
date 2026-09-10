import assert from "node:assert/strict";
import {
  AnswerProviderError,
  createAnswerProvider,
  getConfiguredOpenRouterModel,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from "../src/lib/ai/answerProvider.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import { buildGenerationProviderPayload } from "../src/lib/ai/providerBoundary.ts";
import { routeModel } from "../src/lib/ai/modelRouter.ts";

const source = {
  chunkIndex: 0,
  collectionId: "synthetic-collection",
  content: "Cedar Laboratory has 11 analysts. This is synthetic evidence.",
  documentId: "synthetic-document",
  filename: "synthetic-evidence.txt",
  id: "synthetic-chunk",
  locationLabel: "Page 1",
  pageNumber: 1,
};
const system = "Answer only from the supplied synthetic source and cite supported claims.";
const prompt = `<question>How many analysts work at Cedar Laboratory?</question>\n<sources><source id="s.1">${source.content}</source></sources>`;

function request(model = OPENROUTER_DEFAULT_MODEL) {
  return buildGenerationProviderPayload({
    maxTokens: 120,
    model,
    prompt,
    system,
    temperature: 0.2,
  });
}

function openRouterResponse(content, options = {}) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: options.finishReason ?? "stop", index: 0, message: { content, role: "assistant" } }],
      id: "synthetic-completion",
      model: OPENROUTER_DEFAULT_MODEL,
      object: "chat.completion",
      usage: {
        completion_tokens: 9,
        cost: 0.000004,
        prompt_tokens: 41,
        total_tokens: 50,
      },
    }),
    { headers: options.headers, status: options.status ?? 200 }
  );
}

async function expectProviderError(promise, code, status) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof AnswerProviderError &&
      error.code === code &&
      (status === undefined || error.status === status) &&
      !error.message.includes("provider-secret-echo")
  );
}

let capturedUrl = "";
let capturedInit;
const successfulProvider = createAnswerProvider({
  env: {
    ANSWER_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "mock-openrouter-key",
    OPENROUTER_MODEL: OPENROUTER_DEFAULT_MODEL,
  },
  fetchImpl: async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return openRouterResponse("Cedar Laboratory has 11 analysts [[s.1]].");
  },
});
const supported = await successfulProvider.generate(request());
assert.equal(successfulProvider.name, "openrouter");
assert.equal(successfulProvider.configured, true);
assert.equal(capturedUrl, `${OPENROUTER_BASE_URL}/chat/completions`);
assert.equal(supported.text, "Cedar Laboratory has 11 analysts [[s.1]].");
assert.equal(supported.model, OPENROUTER_DEFAULT_MODEL);
assert.equal(supported.requestCount, 1);
assert.deepEqual(supported.usage, {
  costUsd: 0.000004,
  inputTokens: 41,
  outputTokens: 9,
  totalTokens: 50,
});
assert.equal(validateCitations(supported.text, [source]).rejectedAnswer, false, "supported citations must pass Pliny validation");
const unsupportedClaimWithValidCitation = "Cedar Laboratory was founded in 1984 [[s.1]].";
assert.equal(
  validateCitations(unsupportedClaimWithValidCitation, [source]).rejectedAnswer,
  false,
  "runtime citation validation is intentionally identifier-based; claim support is an evaluation concern"
);
assert.equal(
  source.content.includes("founded in 1984"),
  false,
  "the semantic-support evaluation fixture must remain demonstrably unsupported"
);
const capturedBody = JSON.parse(String(capturedInit.body));
assert.deepEqual(capturedBody, {
  max_tokens: 120,
  messages: [
    { content: system, role: "system" },
    { content: prompt, role: "user" },
  ],
  model: "z-ai/glm-5.3-flash",
  temperature: 0.2,
});
assert.equal(capturedBody.model, "z-ai/glm-5.3-flash", "the API model identifier must not use an upstream endpoint label");
assert.equal(JSON.stringify(capturedBody).includes("z-ai/fp8"), false);
assert.throws(
  () => getConfiguredOpenRouterModel({ OPENROUTER_MODEL: "z-ai/fp8" }),
  (error) => error instanceof AnswerProviderError && error.code === "invalid_configuration"
);
assert.equal(
  routeModel({ answerProvider: "openrouter", maxOutputTokens: 120, question: "Compare every clause", retrievedChunkCount: 8 }).selectedModel,
  "z-ai/glm-5.3-flash",
  "OpenRouter must use its configured API model identifier without Anthropic hard-question routing"
);

const refusalProvider = createAnswerProvider({
  env: { OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => openRouterResponse("INSUFFICIENT_EVIDENCE"),
});
assert.equal(refusalProvider.name, "openrouter", "OpenRouter must be the default runtime answer provider");
assert.equal((await refusalProvider.generate(request())).text, "INSUFFICIENT_EVIDENCE");

for (const content of [
  "```json\n{\"answer\":\"11 analysts\"}\n```",
  '{"answer":"11 analysts"',
  "Cedar Laboratory has 11 analysts [[s.1",
]) {
  const textualMalformedAnswerProvider = createAnswerProvider({
    env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
    fetchImpl: async () => openRouterResponse(content),
  });
  const result = await textualMalformedAnswerProvider.generate(request());
  assert.equal(result.text, content.trim(), "the adapter must preserve textual model output for Pliny's validators");
  assert.equal(validateCitations(result.text, [source]).rejectedAnswer, true, "invalid textual answers must fail Pliny validation");
}

const malformedProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
});
await expectProviderError(malformedProvider.generate(request()), "malformed_response");

for (const content of ["", [], [{ text: "unexpected array content" }]]) {
  const invalidContentProvider = createAnswerProvider({
    env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
    fetchImpl: async () => openRouterResponse(content),
  });
  await expectProviderError(invalidContentProvider.generate(request()), "malformed_response");
}

const invalidJsonProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => new Response("{not-json", { status: 200 }),
});
await expectProviderError(invalidJsonProvider.generate(request()), "malformed_response");

const truncatedProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => openRouterResponse("Cedar Laboratory has 11 analysts [[s.1]].", { finishReason: "length" }),
});
await expectProviderError(truncatedProvider.generate(request()), "malformed_response");

const oversizedProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => openRouterResponse("x".repeat(50_000)),
});
await expectProviderError(oversizedProvider.generate(request()), "malformed_response");

const missingCredentialProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter" },
  fetchImpl: async () => {
    throw new Error("a request must not start without credentials");
  },
});
assert.equal(missingCredentialProvider.configured, false);
await expectProviderError(missingCredentialProvider.generate(request()), "missing_credentials");

const timeoutProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  timeoutMs: 5,
});
await expectProviderError(timeoutProvider.generate(request()), "timeout");

for (const status of [401, 402]) {
  let calls = 0;
  const nonRetryingProvider = createAnswerProvider({
    env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "provider-secret-echo" } }), { status });
    },
    sleepImpl: async () => {
      throw new Error("non-retryable responses must not sleep");
    },
  });
  await expectProviderError(nonRetryingProvider.generate(request()), "provider_request_failed", status);
  assert.equal(calls, 1, `HTTP ${status} must not retry`);
}

let rateLimitCalls = 0;
const rateLimitDelays = [];
const rateLimitProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => {
    rateLimitCalls += 1;
    return rateLimitCalls < 3
      ? new Response(JSON.stringify({ error: { message: "provider-secret-echo" } }), {
          headers: { "Retry-After": "999" },
          status: 429,
        })
      : openRouterResponse("Cedar Laboratory has 11 analysts [[s.1]].");
  },
  sleepImpl: async (delayMs) => {
    rateLimitDelays.push(delayMs);
  },
});
const rateLimitResult = await rateLimitProvider.generate(request());
assert.equal(rateLimitResult.text.includes("11 analysts"), true);
assert.equal(rateLimitResult.requestCount, 3, "provider results must expose the exact HTTP-attempt count");
assert.equal(rateLimitCalls, 3, "HTTP 429 retries must have a strict two-retry cap");
assert.deepEqual(rateLimitDelays, [2_000, 2_000], "Retry-After must be honored subject to the strict delay cap");

let exhaustedRateLimitCalls = 0;
const exhaustedRateLimitProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => {
    exhaustedRateLimitCalls += 1;
    return new Response(null, { headers: { "Retry-After": "0" }, status: 429 });
  },
  sleepImpl: async () => {},
});
await expectProviderError(exhaustedRateLimitProvider.generate(request()), "rate_limited", 429);
assert.equal(exhaustedRateLimitCalls, 3, "exhausted HTTP 429 responses must stop after two retries");

for (const status of [500, 502, 503, 504]) {
  let calls = 0;
  const delays = [];
  const failingProvider = createAnswerProvider({
    env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "provider-secret-echo" } }), { status });
    },
    sleepImpl: async (delayMs) => {
      delays.push(delayMs);
    },
  });
  await expectProviderError(failingProvider.generate(request()), "upstream_error", status);
  assert.equal(calls, 3, `HTTP ${status} must stop after two retries`);
  assert.deepEqual(delays, [250, 500], `HTTP ${status} must use bounded backoff`);
}

const cancellationController = new AbortController();
let cancellationCalls = 0;
const cancellationProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async (_url, init) => {
    cancellationCalls += 1;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  },
});
const cancellation = cancellationProvider.generate(request(), { signal: cancellationController.signal });
cancellationController.abort();
await expectProviderError(cancellation, "cancelled");
assert.equal(cancellationCalls, 1, "caller cancellation must not retry");

let concurrentCalls = 0;
const concurrentProvider = createAnswerProvider({
  env: { ANSWER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "mock-openrouter-key" },
  fetchImpl: async () => {
    concurrentCalls += 1;
    return openRouterResponse("Cedar Laboratory has 11 analysts [[s.1]].");
  },
});
const concurrentResults = await Promise.all(Array.from({ length: 20 }, () => concurrentProvider.generate(request())));
assert.equal(concurrentCalls, 20);
assert.equal(concurrentResults.every((result) => !validateCitations(result.text, [source]).rejectedAnswer), true);

let anthropicCalls = 0;
const anthropicProvider = createAnswerProvider({
  anthropicClientFactory: () => ({
    messages: {
      create: async (payload) => {
        anthropicCalls += 1;
        assert.deepEqual(payload, request("claude-test-model"));
        return {
          content: [{ text: "Anthropic remains manually selectable [[s.1]].", type: "text" }],
          model: "claude-test-model",
          usage: { input_tokens: 12, output_tokens: 7 },
        };
      },
    },
  }),
  env: { ANSWER_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "mock-anthropic-key" },
  fetchImpl: async () => {
    throw new Error("OpenRouter must not be used when Anthropic is selected");
  },
});
const anthropic = await anthropicProvider.generate(request("claude-test-model"));
assert.equal(anthropicProvider.name, "anthropic");
assert.equal(anthropic.text, "Anthropic remains manually selectable [[s.1]].");
assert.equal(anthropic.requestCount, 1);
assert.equal(anthropicCalls, 1, "manual Anthropic selection must not invoke any fallback");

let fallbackAnthropicCalls = 0;
let failedOpenRouterCalls = 0;
const noFallbackProvider = createAnswerProvider({
  anthropicClientFactory: () => ({
    messages: {
      create: async () => {
        fallbackAnthropicCalls += 1;
        return { content: [{ text: "must never be used", type: "text" }] };
      },
    },
  }),
  env: {
    ANSWER_PROVIDER: "openrouter",
    ANTHROPIC_API_KEY: "mock-anthropic-key",
    OPENROUTER_API_KEY: "mock-openrouter-key",
  },
  fetchImpl: async () => {
    failedOpenRouterCalls += 1;
    return new Response(null, { status: 503 });
  },
  sleepImpl: async () => {},
});
await expectProviderError(noFallbackProvider.generate(request()), "upstream_error", 503);
assert.equal(failedOpenRouterCalls, 3);
assert.equal(fallbackAnthropicCalls, 0, "OpenRouter failures must never trigger Anthropic fallback");

const emptyAnthropicProvider = createAnswerProvider({
  anthropicClientFactory: () => ({
    messages: {
      create: async () => ({ content: [], model: "claude-test-model", usage: { input_tokens: 1, output_tokens: 0 } }),
    },
  }),
  env: { ANSWER_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "mock-anthropic-key" },
});
assert.equal(
  (await emptyAnthropicProvider.generate(request("claude-test-model"))).text,
  "",
  "Anthropic empty content must preserve the route's existing safe no-context handling"
);

console.log("Answer-provider mocked contract tests passed.");
