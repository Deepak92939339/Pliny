import { embedTexts } from "@/lib/embeddings/embedBatch";

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

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? "voyage";

  if (provider !== "voyage") {
    throw new EmbeddingConfigError("Only the Voyage embedding provider is configured for this environment.");
  }

  const dimensions = getNumberEnv("EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS, 256, 2048);
  if (dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new EmbeddingConfigError("Embedding dimensions must remain 1024 for the configured Voyage contract.");
  }

  return {
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

export async function embedText(text: string, options: EmbedTextOptions = {}): Promise<EmbedTextResult> {
  const [result] = await embedTexts([text], options);
  return result;
}
