/**
 * WP5 (audit-r1, PLN-006): duplicate upload detection.
 *
 * The audit saw re-uploading the same file silently create parallel document
 * rows (10 rows for 8 files), duplicating citations. The server now hashes
 * the received bytes (SHA-256, Node crypto) and blocks a re-upload of the
 * same content into the same collection unless the previous document failed
 * or the user explicitly chose "Upload anyway" (allowDuplicate).
 */
import { createHash } from "node:crypto";

export function computeDocumentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type DuplicateDecision = "allow" | "block";

export function shouldBlockDuplicateUpload({
  allowDuplicate,
  existingStatus,
}: {
  allowDuplicate: boolean;
  existingStatus: string | null;
}): DuplicateDecision {
  if (allowDuplicate) {
    return "allow";
  }

  // A failed previous upload never blocks a retry of the same content.
  if (existingStatus === null || existingStatus === "failed") {
    return "allow";
  }

  return "block";
}

export const DUPLICATE_UPLOAD_MESSAGE = "This file is already in the workspace.";
