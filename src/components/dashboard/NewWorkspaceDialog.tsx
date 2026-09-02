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

  const isPaperTone = tone === "paper";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size={size} variant={variant} className={cn(className)} />}>
        <Plus aria-hidden="true" />
        {label}
      </DialogTrigger>
      <DialogContent
        className={cn(
          isPaperTone &&
            "border-[#E8E2D9] bg-white text-[#17202A] shadow-[0_24px_70px_rgba(72,48,31,0.14)] ring-0"
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn(isPaperTone && "dm-editorial-display text-[24px] font-semibold tracking-[-0.035em] text-[#17202A]")}>New workspace</DialogTitle>
          <DialogDescription className={cn("text-zinc-400", isPaperTone && "text-[#6B7280]")}>
            Create a workspace for a group of documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name" className={cn(isPaperTone && "text-[13px] font-semibold text-[#17202A]")}>Workspace name</Label>
            <Input
              id="workspace-name"
              placeholder="Acme diligence room"
              className={cn(
                isPaperTone &&
                  "h-11 rounded-[7px] border-[#D9CBBB] bg-white text-[#17202A] shadow-sm shadow-[rgba(72,48,31,0.04)] placeholder:text-[#8A7D70] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20"
              )}
              aria-invalid={errors.name ? "true" : "false"}
              {...register("name")}
            />
            {errors.name ? <p className={cn("text-sm text-red-300", isPaperTone && "text-[#A13F2A]")}>{toWorkspaceCopy(errors.name.message)}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-processing-mode" className={cn(isPaperTone && "text-[13px] font-semibold text-[#17202A]")}>New document processing</Label>
            <select
              id="workspace-processing-mode"
              className={cn(
                "h-11 w-full rounded-lg border border-[color:var(--editorial-border)] bg-[var(--editorial-card)] px-3 text-sm text-[color:var(--editorial-ink)] outline-none focus-visible:border-[#BA5C3D]/45 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/15",
                isPaperTone && "rounded-[7px] border-[#D9CBBB] bg-white text-[#17202A] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20"
              )}
              {...register("defaultProcessingMode")}
            >
              <option value="standard">Standard</option>
              <option value="privacy_minimised">Privacy-minimised</option>
            </select>
            <p className="text-xs leading-5 text-[color:var(--editorial-muted)]">
              This default is captured by each new document and does not change existing documents.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-description" className={cn(isPaperTone && "text-[13px] font-semibold text-[#17202A]")}>Description</Label>
            <textarea
              id="workspace-description"
              rows={4}
              placeholder="Contracts, notes, and source material for this review."
              className={cn(
                "min-h-24 w-full resize-none rounded-lg border border-[color:var(--editorial-border)] bg-[var(--editorial-card)] px-3 py-2 text-sm text-[color:var(--editorial-ink)] shadow-inner shadow-black/10 outline-none transition-colors placeholder:text-[color:var(--editorial-muted)] focus-visible:border-[#BA5C3D]/45 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--editorial-panel)] disabled:opacity-50",
                isPaperTone &&
                  "rounded-[7px] border-[#D9CBBB] bg-white text-[#17202A] shadow-sm shadow-[rgba(72,48,31,0.04)] placeholder:text-[#8A7D70] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20 disabled:bg-[#F3EDE4]"
              )}
              aria-invalid={errors.description ? "true" : "false"}
              {...register("description")}
            />
            {errors.description ? <p className={cn("text-sm text-red-300", isPaperTone && "text-[#A13F2A]")}>{toWorkspaceCopy(errors.description.message)}</p> : null}
          </div>

          {formError ? (
            <div
              className={cn(
                "rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200",
                isPaperTone && "border-[#BA5C3D]/25 bg-[#BA5C3D]/10 text-[#A13F2A]"
              )}
              role="alert"
            >
              {toWorkspaceCopy(formError)}
            </div>
          ) : null}

          <DialogFooter className={cn(isPaperTone && "-mx-5 -mb-5 border-t border-[#E8E2D9] bg-[#FBF8F3]")}>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              className={cn(isPaperTone && "border-[#D9CBBB] bg-white text-[#17202A] hover:bg-[#F3EDE4]")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={cn(isPaperTone && "border-[#BA5C3D] bg-[#BA5C3D] text-white hover:bg-[#A8421F]")}
            >
              {isPending ? "Creating" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
