const DEFAULT_EMBEDDING_MODEL = "voyage-4";
const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_EMBEDDING_BATCH_SIZE = 10;
const MAX_EMBEDDING_BATCH_SIZE = 25;
const DEFAULT_QUERY_MAX_CHARS = 2000;
const DEFAULT_DOCUMENT_MAX_CHARS = 8000;
const MAX_EMBEDDING_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 30_000;

type EmbeddingProvider = "voyage";
export type EmbeddingInputType = "document" | "query";
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type EmbedTextsOptions = {
  batchSize?: number;
  fetchImpl?: FetchLike;
  inputType?: EmbeddingInputType;
  maxAttempts?: number;
  maxCharacters?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export type EmbedTextResult = {
  dimensions: number;
  embedding: number[];
  estimatedTokens?: number;
  model: string;
};

export type EmbeddingConfig = {
  batchSize: number;
  dimensions: number;
  enabled: boolean;
  model: string;
  provider: EmbeddingProvider;
  queryMaxCharacters: number;
};

export class EmbeddingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigError";
  }
}

export class EmbeddingProviderError extends Error {
  readonly retryAfter: string | null;
  readonly retryAfterMs: number | null;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, details: { retryAfter?: string | null; retryAfterMs?: number | null; retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.retryAfter = details.retryAfter ?? null;
    this.retryAfterMs = details.retryAfterMs ?? null;
    this.retryable = details.retryable ?? false;
    this.status = details.status ?? null;
  }
}

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), min), max) : fallback;
}

function normalizeEmbeddingInput(text: string, maxCharacters: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxCharacters);
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds * 1000), MAX_RETRY_DELAY_MS);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(Math.max(timestamp - now, 0), MAX_RETRY_DELAY_MS) : null;
}

function getRetryDelay(attempt: number, retryAfterMs: number | null, maxDelayMs: number, random: () => number) {
  if (retryAfterMs !== null) return Math.min(Math.max(retryAfterMs, 0), maxDelayMs);
  const exponentialDelay = Math.min(1000 * 2 ** (attempt - 1), maxDelayMs);
  const jitter = Math.floor(exponentialDelay * 0.25 * Math.max(0, Math.min(random(), 1)));
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function getEmbeddingBatchSize() {
  return getNumberEnv("EMBEDDING_BATCH_SIZE", DEFAULT_EMBEDDING_BATCH_SIZE, 1, MAX_EMBEDDING_BATCH_SIZE);
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? "voyage";
  if (provider !== "voyage") throw new EmbeddingConfigError("Only the Voyage embedding provider is configured for this environment.");
  const dimensions = getNumberEnv("EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS, 256, 2048);
  if (dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new EmbeddingConfigError("Embedding dimensions must remain 1024 for the configured Voyage contract.");
  }

  return {
    batchSize: getEmbeddingBatchSize(),
    dimensions,
    enabled: process.env.EMBEDDINGS_ENABLED === "true",
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    provider,
    queryMaxCharacters: getNumberEnv("EMBEDDING_QUERY_MAX_CHARS", DEFAULT_QUERY_MAX_CHARS, 128, DEFAULT_DOCUMENT_MAX_CHARS),
  };
}

export function isEmbeddingsEnabled() {
  return process.env.EMBEDDINGS_ENABLED === "true";
}

function extractEmbeddingVectors(payload: unknown, expectedCount: number, dimensions: number) {
  const typedPayload = payload as { data?: unknown[]; embeddings?: unknown };
  let vectors: unknown[] = [];
  if (Array.isArray(typedPayload.data)) {
    const items = typedPayload.data as Array<{ embedding?: unknown; index?: unknown }>;
    const indexed = items.every((item) => item !== null && typeof item === "object" && typeof item.index === "number");
    if (indexed) {
      const orderedItems = [...items].sort((left, right) => Number(left.index) - Number(right.index));
      if (orderedItems.some((item, index) => Number(item.index) !== index)) {
        throw new EmbeddingProviderError("Embedding provider returned invalid vector ordering.");
      }
      vectors = orderedItems.map((item) => item.embedding);
    } else {
      vectors = items.map((item) => (item && typeof item === "object" ? item.embedding : undefined));
    }
  } else if (Array.isArray(typedPayload.embeddings)) {
    vectors = typedPayload.embeddings;
  }
  if (vectors.length !== expectedCount) throw new EmbeddingProviderError("Embedding provider returned an unexpected number of vectors.");
  if (vectors.some((vector) => !Array.isArray(vector) || vector.length !== dimensions || vector.some((value) => typeof value !== "number"))) {
    throw new EmbeddingProviderError("Embedding provider returned an unexpected vector shape.");
  }
  return vectors as number[][];
}

async function requestEmbeddingBatch(inputs: string[], options: EmbedTextsOptions, config: EmbeddingConfig) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new EmbeddingConfigError("Voyage embeddings are enabled, but VOYAGE_API_KEY is missing.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const maxAttempts = Math.min(Math.max(Math.floor(options.maxAttempts ?? MAX_EMBEDDING_ATTEMPTS), 1), MAX_EMBEDDING_ATTEMPTS);
  const maxDelayMs = Math.min(Math.max(Math.floor(options.maxDelayMs ?? MAX_RETRY_DELAY_MS), 0), MAX_RETRY_DELAY_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl("https://api.voyageai.com/v1/embeddings", {
        body: JSON.stringify({ input: inputs, input_type: options.inputType ?? "document", model: config.model, output_dimension: config.dimensions, output_dtype: "float", truncation: true }),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        const retryAfterMs = parseRetryAfter(retryAfter);
        const error = new EmbeddingProviderError(`Embedding provider request failed with status ${response.status}.`, {
          retryAfter, retryAfterMs, retryable: isRetryableStatus(response.status), status: response.status,
        });
        if (!error.retryable || attempt === maxAttempts) throw error;
        await sleep(getRetryDelay(attempt, retryAfterMs, maxDelayMs, random));
        continue;
      }
      const payload = await response.json();
      const vectors = extractEmbeddingVectors(payload, inputs.length, config.dimensions);
      const typedPayload = payload as { model?: unknown; total_tokens?: unknown; usage?: { total_tokens?: unknown } };
      const model = typeof typedPayload.model === "string" ? typedPayload.model : config.model;
      const totalTokens = typedPayload.usage?.total_tokens ?? typedPayload.total_tokens;
      return vectors.map((embedding, index) => ({
        dimensions: embedding.length,
        embedding,
        estimatedTokens: typeof totalTokens === "number" ? Math.ceil(totalTokens / inputs.length) : estimateTokens(inputs[index]),
        model,
      }));
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      if (attempt === maxAttempts) throw new EmbeddingProviderError("Embedding provider network request failed.", { retryable: true });
      await sleep(getRetryDelay(attempt, null, maxDelayMs, random));
    }
  }
  throw new EmbeddingProviderError("Embedding provider request failed.");
}

export async function embedTexts(texts: string[], options: EmbedTextsOptions = {}): Promise<EmbedTextResult[]> {
  const config = getEmbeddingConfig();
  if (!config.enabled) throw new EmbeddingConfigError("Embeddings are disabled for this environment.");
  if (texts.length === 0) return [];
  const inputs = texts.map((text) => normalizeEmbeddingInput(text, options.maxCharacters ?? DEFAULT_DOCUMENT_MAX_CHARS));
  if (inputs.some((input) => input.length === 0)) throw new EmbeddingConfigError("Cannot embed empty text.");
  const batchSize = Math.min(Math.max(Math.floor(options.batchSize ?? config.batchSize), 1), MAX_EMBEDDING_BATCH_SIZE);
  const results: EmbedTextResult[] = [];
  for (let start = 0; start < inputs.length; start += batchSize) results.push(...await requestEmbeddingBatch(inputs.slice(start, start + batchSize), options, config));
  if (results.length !== texts.length || results.some((result) => result.embedding.length !== config.dimensions)) {
    throw new EmbeddingProviderError("Embedding provider returned incomplete vectors.");
  }
  return results;
}
