"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", { digest: error.digest ?? "unavailable" });
  }, [error.digest]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="max-w-md rounded-xl border border-white/10 bg-zinc-900/80 p-6 text-center shadow-2xl shadow-black/25">
            <p className="text-sm font-medium text-[#D27E63]">Pliny</p>
            <h1 className="mt-3 text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The app hit an unexpected error. Try again, or reload the page if the problem continues.
            </p>
            <Button className="mt-6" onClick={reset}>
              Try again
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}
