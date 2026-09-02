import { embedTexts, type EmbedTextsOptions } from "../embeddings/embedBatch.ts";

export type EmbeddableChunkRow = {
  content: string;
  embedding?: number[];
  embedding_created_at?: string;
  embedding_model?: string;
};

export async function prepareChunkRowsWithEmbeddings<T extends EmbeddableChunkRow>(
  rows: T[],
  options: EmbedTextsOptions & { getEmbeddingText?: (row: T) => string } = {}
) {
  const { getEmbeddingText = (row: T) => row.content, ...embeddingOptions } = options;
  const results = await embedTexts(rows.map(getEmbeddingText), embeddingOptions);

  if (results.length !== rows.length || results.some((result) => result.embedding.length !== 1024)) {
    throw new Error("Embedding provider returned incomplete vectors.");
  }

  const embeddedAt = new Date().toISOString();
  return rows.map((row, index) => ({
    ...row,
    embedding: results[index].embedding,
    embedding_created_at: embeddedAt,
    embedding_model: results[index].model,
  }));
}
