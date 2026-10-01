// WP1 step 5 / WP3 step 3: maps any process-call failure to a short,
// user-readable message. Never leaves an upload item without a terminal
// explanation. Reads the Retry-After header (server-side since WP3) so the
// UI can say exactly when to retry — seconds, minutes, or after midnight UTC.

import { formatRetryWaitMessage } from "@/lib/limits/retryAfter";

export type ProcessFailureResponseLike = {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | null;
  };
};

export type ProcessFailureResultLike = {
  error?: string;
  message?: string;
};

export const PROCESS_START_FAILURE_MESSAGE = "Processing couldn't start. Retry.";

export function getProcessFailureMessage(response: ProcessFailureResponseLike, result: ProcessFailureResultLike): string {
  const serverMessage = typeof result.error === "string" && result.error.trim().length > 0 ? result.error.trim() : null;

  if (response.status === 429) {
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterRaw === null ? Number.NaN : Number(retryAfterRaw);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return `Upload limit reached. ${formatRetryWaitMessage(Math.ceil(retryAfterSeconds))}`;
    }

    return serverMessage ?? "Upload limit reached. Try again later.";
  }

  return serverMessage ?? PROCESS_START_FAILURE_MESSAGE;
}
