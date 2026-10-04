import { EmbeddingConfigError, EmbeddingProviderError } from "./embedBatch.ts";

/** Operator-actionable copy without exposing provider bodies, keys or document text. */
export function getEmbeddingFailureMessage(error: unknown): string {
  if (error instanceof EmbeddingConfigError) {
    return "The embedding service is not configured correctly. Ask the app administrator to check its settings.";
  }
  if (error instanceof EmbeddingProviderError) {
    if (error.status === 401 || error.status === 403) {
      return "The embedding service rejected its credentials. Ask the app administrator to check its API key and permissions.";
    }
    if (error.status === 402) {
      return "The embedding service requires available credit. Ask the app administrator to check provider billing and spending limits.";
    }
    if (error.status === 429) {
      return "The embedding service is rate-limited. Wait before retrying; ask the app administrator to check provider limits if this continues.";
    }
    if (error.retryable) {
      return "The embedding service is temporarily unavailable. Try again later.";
    }
  }
  return "Embeddings could not be generated. Ask the app administrator to check the processing logs before retrying.";
}
