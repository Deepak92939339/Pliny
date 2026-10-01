/**
 * WP5 (audit-r1, PLN-007): single-document deletion.
 *
 * The product previously had no way to delete one document — only whole
 * workspace deletion — so stuck or unwanted documents could not be removed
 * and kept feeding retrieval. This module is the core of
 * DELETE /api/documents/[id]: verify ownership, then tear the document down
 * without leaving orphaned data.
 *
 * Order:
 *  1. Ownership-scoped select (documents.user_id; RLS also applies). A
 *     missing OR not-owned document both return 404 — existence is not
 *     revealed.
 *  2. Storage object removal (private bucket). If storage fails we stop and
 *     return 500 so the user can retry with the document fully intact.
 *  3. Explicit chunk deletion (also covered by the FK `on delete cascade`,
 *     but done explicitly so a partial failure is observable).
 *  4. Document row deletion (chunks would cascade here as a backstop).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentDeleteResult =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

export async function deleteDocumentWithDependencies(
  supabase: SupabaseClient,
  { documentId, userId }: { documentId: string; userId: string }
): Promise<DocumentDeleteResult> {
  const { data: document, error: selectError } = await supabase
    .from("documents")
    .select("id,storage_path")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, status: 500, error: "Unable to delete this document right now. Please try again." };
  }

  if (!document) {
    // Same answer for missing and not-owned — existence is not revealed.
    return { ok: false, status: 404, error: "Document not found." };
  }

  const storagePath = typeof document.storage_path === "string" ? document.storage_path : null;

  if (storagePath) {
    const { error: storageError } = await supabase.storage.from("documents").remove([storagePath]);

    if (storageError) {
      // Stop here: the document stays fully intact and the user can retry.
      return { ok: false, status: 500, error: "Unable to delete this document right now. Please try again." };
    }
  }

  const { error: chunkError } = await supabase.from("document_chunks").delete().eq("document_id", documentId);

  if (chunkError) {
    return { ok: false, status: 500, error: "Unable to delete this document right now. Please try again." };
  }

  const { error: rowError } = await supabase.from("documents").delete().eq("id", documentId);

  if (rowError) {
    return { ok: false, status: 500, error: "Unable to delete this document right now. Please try again." };
  }

  return { ok: true };
}
