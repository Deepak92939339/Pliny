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
    fileSize: row.file_size,
    filename: row.filename,
    id: row.id,
    pageCount: row.page_count,
    status: row.status,
    processingStage: row.processing_stage ?? null,
    storagePath: row.storage_path,
  };
}

export async function getDocumentsForCollection(collectionId: string, userId: string): Promise<DocumentsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,collection_id,user_id,filename,storage_path,page_count,file_size,status,error_message,created_at")
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

  return {
    documents: rows.map(mapDocumentRow),
    error: null,
  };
}
