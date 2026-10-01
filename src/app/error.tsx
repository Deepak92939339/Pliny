"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/shared/BrandMark";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", { digest: error.digest ?? "unavailable" });
  }, [error.digest]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
      <section
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--rule-strong)] bg-[var(--paper-1)] p-8 text-center shadow-[var(--shadow-2)]"
        aria-labelledby="app-error-heading"
      >
        <div className="mx-auto flex justify-center">
          <BrandMark textClassName="font-serif text-2xl font-semibold" />
        </div>
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-2)]">
          <AlertCircle className="size-6 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <h1
          id="app-error-heading"
          className="font-serif mt-5 text-2xl font-semibold tracking-tight text-[var(--ink-900)]"
        >
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-500)]">
          The app hit an unexpected error. Try again, or reload the page if the problem continues.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={reset}
            className="gap-2"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            <span>Try again</span>
          </Button>
        </div>
      </section>
    </main>
  );
}
