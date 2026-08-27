"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProcessDocumentResponse = {
  error?: string;
  ok?: boolean;
  status?: "processing" | "ready" | "failed";
};

type DocumentProcessButtonProps = {
  documentId: string;
  label?: string;
};

async function readProcessResponse(response: Response): Promise<ProcessDocumentResponse> {
  try {
    return (await response.json()) as ProcessDocumentResponse;
  } catch {
    return {};
  }
}

export function DocumentProcessButton({ documentId, label = "Retry" }: DocumentProcessButtonProps) {
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

  return (
    <div>
      <button
        type="button"
        onClick={handleProcess}
        disabled={isProcessing}
        className="rounded px-1 py-0.5 text-[11px] font-medium text-[#9A5A3E] underline-offset-2 hover:bg-[#BA5C3D]/10 hover:text-[color:var(--editorial-rust-strong)] hover:underline disabled:pointer-events-none disabled:opacity-50 dark:text-[#D6A18D]"
      >
        {isProcessing ? "Processing" : label}
      </button>
      {errorMessage ? <p className="mt-1 text-[11px] leading-5 text-[#9A5A3E] dark:text-[#D6A18D]">{errorMessage}</p> : null}
    </div>
  );
}
