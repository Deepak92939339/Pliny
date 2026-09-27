import { embedTexts } from "@/lib/embeddings/embedBatch";

export { getEmbeddingConfig, isEmbeddingsEnabled, EmbeddingConfigError, EmbeddingProviderError } from "@/lib/embeddings/embedBatch";
export type { EmbeddingConfig } from "@/lib/embeddings/embedBatch";

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

export async function embedText(text: string, options: EmbedTextOptions = {}): Promise<EmbedTextResult> {
  const [result] = await embedTexts([text], options);
  return result;
}
