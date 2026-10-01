"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function CollectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[collection-error]", { digest: error.digest ?? "unavailable" });
  }, [error.digest]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--paper-0)] px-6 text-[var(--ink-900)]">
      <section className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--rule-strong)] bg-[var(--paper-1)] p-8 text-center shadow-[var(--shadow-2)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-2)]">
          <AlertCircle className="size-6 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Workspace Error
        </p>
        <h1 className="font-serif mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-900)]">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-500)]">
          This workspace could not be loaded. Try again without including sensitive data in support messages.
        </p>
        <div className="mt-8 flex justify-center">
          <Button variant="primary" size="md" onClick={reset} className="gap-2">
            <RefreshCw className="size-4" aria-hidden="true" />
            <span>Try again</span>
          </Button>
        </div>
      </section>
    </main>
  );
}
