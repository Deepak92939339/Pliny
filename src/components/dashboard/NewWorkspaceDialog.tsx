"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { createCollection } from "@/lib/collections/actions";
import { collectionFormSchema, type CollectionFormValues } from "@/lib/collections/schema";
import { cn } from "@/lib/utils";

type NewWorkspaceDialogProps = {
  className?: string;
  label?: string;
  size?: "sm" | "default";
  tone?: "default" | "paper";
  variant?: ComponentProps<typeof Button>["variant"];
};

function toWorkspaceCopy(message?: string) {
  return message?.replaceAll("Project", "Workspace").replaceAll("project", "workspace");
}

export function NewWorkspaceDialog({ className, label = "New workspace", size = "sm", tone = "default", variant = "default" }: NewWorkspaceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      name: "",
      description: "",
      defaultProcessingMode: "standard",
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFormError(null);

    if (!nextOpen) {
      reset();
    }
  }

  function onSubmit(values: CollectionFormValues) {
    setFormError(null);

    startTransition(async () => {
      const result = await createCollection(values);

      if (result.status === "error") {
        if (result.fieldErrors?.name) {
          setError("name", {
            message: result.fieldErrors.name,
          });
        }

        if (result.fieldErrors?.description) {
          setError("description", {
            message: result.fieldErrors.description,
          });
        }

        setFormError(result.message);
        return;
      }

      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size={size === "default" ? "md" : size}
            variant={variant === "outline" ? "secondary" : variant}
            className={cn(className)}
          />
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="dm-editorial-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-900)]">
            New workspace
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--ink-500)]">
            Create a workspace for a group of documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name" className="text-sm font-semibold text-[var(--ink-900)]">
              Workspace name
            </Label>
            <Input
              id="workspace-name"
              placeholder="Acme diligence room"
              error={errors.name ? toWorkspaceCopy(errors.name.message) : undefined}
              {...register("name")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace-processing-mode" className="text-sm font-semibold text-[var(--ink-900)]">
              New document processing
            </Label>
            <select
              id="workspace-processing-mode"
              className="h-10 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--paper-0)] px-3 text-sm text-[var(--ink-900)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)]"
              {...register("defaultProcessingMode")}
            >
              <option value="standard">Standard</option>
              <option value="privacy_minimised">Privacy-minimised</option>
            </select>
            <p className="text-xs leading-relaxed text-[var(--ink-500)]">
              This default is captured by each new document and does not change existing documents.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace-description" className="text-sm font-semibold text-[var(--ink-900)]">
              Description
            </Label>
            <textarea
              id="workspace-description"
              rows={4}
              placeholder="Contracts, notes, and source material for this review."
              className="min-h-24 w-full resize-none rounded-md border border-[var(--rule-strong)] bg-[var(--paper-0)] px-3 py-2 text-sm text-[var(--ink-900)] transition-colors placeholder:text-[var(--ink-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--paper-0)] disabled:opacity-50"
              aria-invalid={errors.description ? "true" : "false"}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-xs text-[var(--danger-ink)]">{toWorkspaceCopy(errors.description.message)}</p>
            ) : null}
          </div>

          {formError ? (
            <div
              className="rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
              role="alert"
            >
              {toWorkspaceCopy(formError)}
            </div>
          ) : null}

          <DialogFooter className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--rule)] pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isPending}
            >
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
