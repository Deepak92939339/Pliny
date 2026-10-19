import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNED_UPLOAD_URL_TTL_MINUTES, getProcessingStallMinutes, getUploadExpiryMinutes } from "../uploads/config.ts";

export const DOCUMENTS_BUCKET = "documents";
export const UPLOAD_EXPIRED_MESSAGE = "Upload did not complete. Upload the file again.";

/** Extra minutes after the signed URL's lifetime before late-arriving objects are swept. */
const LATE_OBJECT_MARGIN_MINUTES = 5;

const MINUTE_MS = 60_000;

export type LifecycleRow = {
  created_at: string;
  processing_stage: string | null;
  processing_stage_updated_at: string | null;
  status: string;
};

function minutesAgo(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * MINUTE_MS);
}

/** True when an 'awaiting_upload' row has waited longer than the upload window. */
export function isUploadExpired(row: Pick<LifecycleRow, "created_at" | "status">, now = new Date(), expiryMinutes = getUploadExpiryMinutes()) {
  return row.status === "awaiting_upload" && new Date(row.created_at).getTime() < minutesAgo(now, expiryMinutes).getTime();
}

/** True when a 'processing' row has not advanced its stage within the stall window. */
export function isProcessingStalled(
  row: Pick<LifecycleRow, "processing_stage_updated_at" | "status" | "created_at">,
  now = new Date(),
  stallMinutes = getProcessingStallMinutes()
) {
  if (row.status !== "processing") {
    return false;
  }

  const lastAdvance = new Date(row.processing_stage_updated_at ?? row.created_at).getTime();

  return lastAdvance < minutesAgo(now, stallMinutes).getTime();
}

export function getStalledMessage(stage: string | null | undefined) {
  const label = stage ? stage.replace(/_/g, " ") : "processing";

  return `${label}: Processing stopped making progress. Retry to try again.`;
}

export type ReapScope = {
  /** Restrict to one collection (the lazy, per-page path). */
  collectionId?: string;
  now?: Date;
  /** Restrict to one user. Omit only for the service-role maintenance job. */
  userId?: string;
  /** Include the late-object sweep (maintenance job only). */
  sweepLateObjects?: boolean;
};

export type ReapResult = {
  expiredUploads: number;
  lateObjectsRemoved: number;
  objectsRemoved: number;
  stalledDocuments: number;
};

type ReapedRow = { id: string; processing_stage?: string | null; storage_path: string };

async function removeObjects(client: SupabaseClient, paths: string[]) {
  if (paths.length === 0) {
    return 0;
  }

  const { data, error } = await client.storage.from(DOCUMENTS_BUCKET).remove(paths);

  if (error) {
    console.error("[document-lifecycle] object removal failed", { count: paths.length, message: error.message });
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Server-side watchdog. Each transition is a compare-and-swap (the status/age predicate is part
 * of the UPDATE), so concurrent callers and a legitimately advancing processor cannot be raced.
 *
 *  1. awaiting_upload older than the upload window -> failed, and its (partial/late) object removed.
 *  2. processing that has not advanced its stage within the stall window -> failed ("Needs attention").
 *  3. (maintenance only) expired uploads whose signed URL has now died -> remove any object that
 *     arrived after step 1, then clear the marker.
 */
export async function reapStaleDocuments(client: SupabaseClient, scope: ReapScope = {}): Promise<ReapResult> {
  const now = scope.now ?? new Date();
  const result: ReapResult = { expiredUploads: 0, lateObjectsRemoved: 0, objectsRemoved: 0, stalledDocuments: 0 };

  const scoped = <T>(query: T): T => {
    type Filterable = { eq: (column: string, value: string) => Filterable };
    let next = query as unknown as Filterable;
    if (scope.userId) next = next.eq("user_id", scope.userId);
    if (scope.collectionId) next = next.eq("collection_id", scope.collectionId);
    return next as unknown as T;
  };

  const uploadCutoff = minutesAgo(now, getUploadExpiryMinutes()).toISOString();
  const { data: expired, error: expiredError } = await scoped(
    client
      .from("documents")
      .update({
        error_message: UPLOAD_EXPIRED_MESSAGE,
        processing_stage: "failed",
        status: "failed",
        upload_expired_at: now.toISOString(),
      })
      .eq("status", "awaiting_upload")
      .lt("created_at", uploadCutoff)
  ).select("id,storage_path");

  if (expiredError) {
    console.error("[document-lifecycle] expiring uploads failed", { message: expiredError.message });
  } else {
    const rows = (expired ?? []) as ReapedRow[];
    result.expiredUploads = rows.length;
    result.objectsRemoved += await removeObjects(client, rows.map((row) => row.storage_path));
  }

  const stallCutoff = minutesAgo(now, getProcessingStallMinutes()).toISOString();
  const { data: stalled, error: stalledError } = await scoped(
    client
      .from("documents")
      .select("id,processing_stage")
      .eq("status", "processing")
      .lt("processing_stage_updated_at", stallCutoff)
  );

  if (stalledError) {
    console.error("[document-lifecycle] stalled lookup failed", { message: stalledError.message });
  } else {
    for (const row of (stalled ?? []) as { id: string; processing_stage: string | null }[]) {
      // Predicate repeated in the UPDATE so a document that advanced since the SELECT is untouched.
      const { data: updated, error: updateError } = await client
        .from("documents")
        .update({ error_message: getStalledMessage(row.processing_stage), processing_stage: "failed", status: "failed" })
        .eq("id", row.id)
        .eq("status", "processing")
        .lt("processing_stage_updated_at", stallCutoff)
        .select("id");

      if (updateError) {
        console.error("[document-lifecycle] failing stalled document failed", { message: updateError.message });
      } else {
        result.stalledDocuments += updated?.length ?? 0;
      }
    }
  }

  if (scope.sweepLateObjects) {
    const lateCutoff = minutesAgo(now, SIGNED_UPLOAD_URL_TTL_MINUTES + LATE_OBJECT_MARGIN_MINUTES).toISOString();
    const { data: late, error: lateError } = await scoped(
      client
        .from("documents")
        .update({ upload_expired_at: null })
        .eq("status", "failed")
        .not("upload_expired_at", "is", null)
        .lt("created_at", lateCutoff)
    ).select("id,storage_path");

    if (lateError) {
      console.error("[document-lifecycle] late-object sweep failed", { message: lateError.message });
    } else {
      const rows = (late ?? []) as ReapedRow[];
      result.lateObjectsRemoved = await removeObjects(client, rows.map((row) => row.storage_path));
    }
  }

  return result;
}
