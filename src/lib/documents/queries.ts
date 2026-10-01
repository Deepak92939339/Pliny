import { findStaleProcessingDocuments, STALE_PROCESSING_MESSAGE } from "@/lib/documents/staleProcessing";
import { logSafeStageError } from "@/lib/privacy/safeLogging";
import { createClient } from "@/lib/supabase/server";
import type { DocumentListItem, DocumentRow } from "@/types";

type DocumentsResult = {
  documents: DocumentListItem[];
  error: string | null;
};

function mapDocumentRow(row: DocumentRow): DocumentListItem {
  return {
    collectionId: row.collection_id,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    processingMode: row.processing_mode,
    privacyPolicyVersion: row.privacy_policy_version ?? null,
    fileSize: row.file_size,
    filename: row.filename,
    id: row.id,
    pageCount: row.page_count,
    status: row.status,
    processingStage: row.processing_stage ?? null,
    storagePath: row.storage_path,
  };
}

/**
 * WP1 (PLN-009 S1 / PLN-003 S2): stale-processing watchdog. Whenever documents
 * are read for a workspace, anything still non-terminal whose processing
 * started (or, if never started, whose upload happened) more than
 * STALE_PROCESSING_MINUTES ago is marked failed with a retryable message.
 * The update is owner-scoped (user_id), so RLS still applies.
 */
async function markStaleProcessingDocumentsFailed(supabase: Awaited<ReturnType<typeof createClient>>, rows: DocumentRow[]): Promise<void> {
  const staleRows: DocumentRow[] = findStaleProcessingDocuments<DocumentRow>(rows, new Date());

  if (staleRows.length === 0) {
    return;
  }

  await Promise.all(
    staleRows.map(async (row) => {
      const { error } = await supabase
        .from("documents")
        .update({
          error_message: STALE_PROCESSING_MESSAGE,
          processing_stage: "failed",
          status: "failed",
        })
        .eq("id", row.id)
        .eq("user_id", row.user_id);

      if (error) {
        logSafeStageError("documents", "stale processing watchdog update failed", error, { documentId: row.id });
        return;
      }

      row.status = "failed";
      row.processing_stage = "failed";
      row.error_message = STALE_PROCESSING_MESSAGE;
    })
  );
}

export async function getDocumentsForCollection(collectionId: string, userId: string): Promise<DocumentsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,collection_id,user_id,filename,storage_path,page_count,file_size,status,processing_stage,processing_started_at,error_message,processing_mode,privacy_policy_version,created_at")
    .eq("collection_id", collectionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      documents: [],
      error: "Unable to load documents right now. Please refresh and try again.",
    };
  }

  const rows = (data ?? []) as DocumentRow[];

  await markStaleProcessingDocumentsFailed(supabase, rows);

  return {
    documents: rows.map(mapDocumentRow),
    error: null,
  };
}
