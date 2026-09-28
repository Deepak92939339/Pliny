"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DocumentDeleteButtonProps = {
  className?: string;
  documentId: string;
  filename: string;
  onDeleted?: () => void;
};

/**
 * WP5 (audit-r1, PLN-007): "Delete document" action with confirmation dialog.
 * Calls DELETE /api/documents/[id] (204 on success) and refreshes the list.
 */
export function DocumentDeleteButton({ className, documentId, filename, onDeleted }: DocumentDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (isDeleting) return;
    setOpen(nextOpen);
    setError(null);
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });

      if (response.status === 204) {
        setOpen(false);
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
      <button
        type="button"
        role="menuitem"
        className={cn(className)}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete document
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete document</DialogTitle>
          <DialogDescription>
            This permanently removes the document, its extracted text, and its search index. Answers can no longer cite it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-black/10 bg-black/[0.03] p-3">
          <p className="truncate text-sm font-medium">{filename}</p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting" : "Delete document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
