"use client";

import { useEffect } from "react";

export default function CollectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[collection-error]", error);
  }, [error]);

  return (
    <main className="dm-page flex h-screen w-screen items-center justify-center overflow-hidden px-6 text-[color:var(--editorial-ink)]">
      <section className="max-w-md text-center">
        <h1 className="text-base font-medium">Something went wrong</h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--editorial-muted)]">
          {error.message || "This workspace could not be loaded."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 text-[13px] font-medium text-[color:var(--editorial-ink)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
