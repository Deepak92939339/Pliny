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
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/30 text-zinc-500 transition-colors hover:border-red-300/30 hover:bg-red-500/10 hover:text-red-200 focus-visible:border-red-300/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-400/15"
            aria-label={`Delete ${collectionName}`}
          />
        }
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workspace</DialogTitle>
          <DialogDescription className="text-zinc-400">This removes the workspace from your dashboard.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-3">
          <p className="text-sm font-medium text-zinc-100">{collectionName}</p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
            {toWorkspaceCopy(error)}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? "Deleting" : "Delete workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
