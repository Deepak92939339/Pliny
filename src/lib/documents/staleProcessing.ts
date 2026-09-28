// WP1 (PLN-003 / PLN-009): staleness decision for documents stuck in a
// non-terminal state. Pure functions with an injectable clock so they can be
// unit tested without a database.

export const STALE_PROCESSING_MESSAGE = "Processing timed out. Retry this document.";

export type StaleProcessingDocumentLike = {
  status: string;
  processing_started_at?: string | null;
  created_at: string;
};

export function getStaleProcessingTimeoutMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.STALE_PROCESSING_MINUTES);

  if (!Number.isFinite(value)) {
    return 10;
  }

  return Math.min(Math.max(Math.floor(value), 1), 120);
}

/**
 * Documents whose processing started (or, if never started, whose upload
 * happened) more than `timeoutMinutes` before `now`. These will never reach a
 * terminal state on their own: the platform may have killed the processing
 * function, or processing was never started after upload (429 path).
 */
export function findStaleProcessingDocuments<T extends StaleProcessingDocumentLike>(
  rows: readonly T[],
  now: Date,
  timeoutMinutes: number = getStaleProcessingTimeoutMinutes()
): T[] {
  const cutoff = now.getTime() - timeoutMinutes * 60_000;

  return rows.filter((row) => {
    if (row.status !== "processing") {
      return false;
    }

    const startedAt = row.processing_started_at ?? row.created_at;
    const startedTime = new Date(startedAt).getTime();

    return Number.isFinite(startedTime) && startedTime < cutoff;
  });
}
