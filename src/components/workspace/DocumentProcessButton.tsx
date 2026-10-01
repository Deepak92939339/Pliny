"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ProcessDocumentResponse = {
  error?: string;
  ok?: boolean;
  status?: "processing" | "ready" | "failed";
};

type DocumentProcessButtonProps = {
  className?: string;
  documentId: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "link" | "destructive";
  size?: "sm" | "md" | "lg";
};

async function readProcessResponse(response: Response): Promise<ProcessDocumentResponse> {
  try {
    return (await response.json()) as ProcessDocumentResponse;
  } catch {
    return {};
  }
}

export function DocumentProcessButton({
  className,
  documentId,
  label = "Retry",
  variant,
  size,
}: DocumentProcessButtonProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleProcess() {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/process-document", {
        body: JSON.stringify({ document_id: documentId }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = await readProcessResponse(response);

      router.refresh();

      if (!response.ok || result.ok === false) {
        setErrorMessage(result.error ? "Still needs retry." : "Unable to process this document. Please try again.");
      }
    } catch {
      setErrorMessage("Unable to process this document. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  if (variant) {
    return (
      <div>
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={handleProcess}
          disabled={isProcessing}
          loading={isProcessing}
          className={className}
        >
          {label}
        </Button>
        {errorMessage ? (
          <p className="mt-1 text-[var(--text-2xs)] leading-5 text-[var(--danger-ink)]">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleProcess}
        disabled={isProcessing}
        className={cn(
          "rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--text-2xs)] font-medium text-[var(--accent-ink)] underline-offset-2 hover:bg-[var(--accent)]/10 hover:text-[var(--accent-ink)] hover:underline disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        {isProcessing ? "Processing…" : label}
      </button>
      {errorMessage ? (
        <p className="mt-1 text-[var(--text-2xs)] leading-5 text-[var(--danger-ink)]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
