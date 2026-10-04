"use client";

import { useRouter } from "next/navigation";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DocumentDeleteDialogProps = {
  documentId: string;
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onDeleted?: () => void;
};

/**
 * WP5 (audit-r1, PLN-007): "Delete document" action with confirmation dialog.
 * Calls DELETE /api/documents/[id] (204 on success) and refreshes the list.
 */
export function DocumentDeleteDialog({ documentId, filename, open, onOpenChange, returnFocusRef, fallbackFocusRef, onDeleted }: DocumentDeleteDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (isDeleting) return;
    onOpenChange(nextOpen);
    setError(null);
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });

      if (response.status === 204) {
        onOpenChange(false);
        onDeleted?.();
        router.refresh();
        return;
      }

      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setError(result.error ?? "Unable to delete this document right now. Please try again.");
    } catch {
      setError("Unable to delete this document right now. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent finalFocus={() => {
        const trigger = returnFocusRef.current;
        return trigger?.isConnected ? trigger : fallbackFocusRef.current;
      }}>
        <DialogHeader>
          <DialogTitle>Delete document</DialogTitle>
          <DialogDescription>
            This permanently removes the document, its extracted text, and its search index. Answers can no longer cite it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-2)] p-3">
          <p className="truncate text-sm font-medium text-[var(--ink-900)]">{filename}</p>
        </div>

        {error ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--danger-soft)] bg-[var(--danger-soft)]/20 px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={isDeleting} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} loading={isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting…" : "Delete document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
