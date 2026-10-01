"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteCollection } from "@/lib/collections/actions";

type DeleteCollectionButtonProps = {
  collectionId: string;
  collectionName: string;
};

function toWorkspaceCopy(message: string) {
  return message.replaceAll("Project", "Workspace").replaceAll("project", "workspace");
}

export function DeleteCollectionButton({ collectionId, collectionName }: DeleteCollectionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setError(null);
  }

  function handleDelete() {
    setError(null);

    startTransition(async () => {
      const result = await deleteCollection(collectionId);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 p-0 text-[var(--ink-500)] hover:text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
            aria-label={`Delete ${collectionName}`}
          />
        }
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workspace</DialogTitle>
          <DialogDescription className="text-[var(--ink-500)]">This removes the workspace from your dashboard.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-[var(--rule)] bg-[var(--paper-0)] p-3">
          <p className="text-sm font-medium text-[var(--ink-900)]">{collectionName}</p>
        </div>

        {error ? (
          <div className="rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
            {toWorkspaceCopy(error)}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" loading={isPending} onClick={handleDelete}>
            Delete workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
