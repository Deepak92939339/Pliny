// WP1 (PLN-009 S1 / PLN-003 S2): guarantees that a failing processing pipeline
// still drives the document row to a terminal `failed` state, so no document
// is left in "Uploading/Processing" forever.

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DocumentFailureUpdate = {
  error_message: string;
  page_count?: number;
  processing_stage: "failed";
  status: "failed";
};

/**
 * Owner-scoped failure update for a document row. Moved from the
 * process-document route so the terminal-state guarantee can be unit tested;
 * behaviour (including the user_id scoping) is unchanged.
 */
export async function markDocumentFailed(
  supabase: SupabaseClient,
  documentId: string,
  userId: string,
  message: string,
  pageCount?: number
): Promise<void> {
  const updateValues: DocumentFailureUpdate = {
    error_message: message,
    processing_stage: "failed",
    status: "failed",
  };

  if (typeof pageCount === "number" && Number.isFinite(pageCount)) {
    updateValues.page_count = pageCount;
  }

  const { error } = await supabase.from("documents").update(updateValues).eq("id", documentId).eq("user_id", userId);

  if (error) {
    // Best effort: never mask the original processing error with this one.
    console.error("[process-document]", "failed status update error", { documentId, errorName: error.name });
  }
}

/**
 * Runs the processing pipeline and, on ANY thrown error (timeout, 5xx,
 * unexpected crash), invokes the failure callback so the document always ends
 * in a terminal state. The original error is rethrown untouched; an error
 * inside the failure callback must never mask it.
 */
export async function runProcessingWithTerminalState<T>(options: {
  run: () => Promise<T>;
  markFailed: (error: unknown) => Promise<void>;
}): Promise<T> {
  try {
    return await options.run();
  } catch (error) {
    try {
      await options.markFailed(error);
    } catch (markFailedError) {
      console.error(
        "[process-document]",
        "terminal state update itself failed",
        markFailedError instanceof Error ? { errorName: markFailedError.name } : {}
      );
    }

    throw error;
  }
}
