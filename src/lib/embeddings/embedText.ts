const DEFAULT_EMBEDDING_MODEL = "voyage-4";
const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_QUERY_MAX_CHARS = 2000;
const DEFAULT_DOCUMENT_MAX_CHARS = 8000;

type EmbeddingProvider = "voyage";
type EmbeddingInputType = "document" | "query";

type EmbedTextOptions = {
  inputType?: EmbeddingInputType;
  maxCharacters?: number;
};

export type EmbedTextResult = {
  dimensions: number;
  embedding: number[];
  estimatedTokens?: number;
  model: string;
};

export type EmbeddingConfig = {
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
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function normalizeEmbeddingInput(text: string, maxCharacters: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxCharacters);
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? "voyage";

  if (provider !== "voyage") {
    throw new EmbeddingConfigError("Only the Voyage embedding provider is configured for this environment.");
  }

  return {
    dimensions: getNumberEnv("EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS, 256, 2048),
    enabled: process.env.EMBEDDINGS_ENABLED === "true",
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    provider,
    queryMaxCharacters: getNumberEnv("EMBEDDING_QUERY_MAX_CHARS", DEFAULT_QUERY_MAX_CHARS, 128, DEFAULT_DOCUMENT_MAX_CHARS),
  };
}

export function isEmbeddingsEnabled() {
  return process.env.EMBEDDINGS_ENABLED === "true";
}

export async function embedText(text: string, options: EmbedTextOptions = {}): Promise<EmbedTextResult> {
  const config = getEmbeddingConfig();

  if (!config.enabled) {
    throw new EmbeddingConfigError("Embeddings are disabled for this environment.");
  }

  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    throw new EmbeddingConfigError("Voyage embeddings are enabled, but VOYAGE_API_KEY is missing.");
  }

  const input = normalizeEmbeddingInput(text, options.maxCharacters ?? DEFAULT_DOCUMENT_MAX_CHARS);

  if (input.length === 0) {
    throw new EmbeddingConfigError("Cannot embed empty text.");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    body: JSON.stringify({
      input,
      input_type: options.inputType ?? "document",
      model: config.model,
      output_dimension: config.dimensions,
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
    throw new EmbeddingProviderError(`Embedding provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
    embeddings?: number[][];
    model?: string;
    total_tokens?: number;
    usage?: { total_tokens?: number };
  };
  const embedding = payload.data?.[0]?.embedding ?? payload.embeddings?.[0];

  if (!Array.isArray(embedding) || embedding.length !== config.dimensions) {
    throw new EmbeddingProviderError("Embedding provider returned an unexpected vector shape.");
  }

  return {
    dimensions: embedding.length,
    embedding,
    estimatedTokens: payload.usage?.total_tokens ?? payload.total_tokens ?? estimateTokens(input),
    model: payload.model ?? config.model,
  };
}
