"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", { digest: error.digest ?? "unavailable" });
  }, [error.digest]);

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-6 py-10 text-[#17202A]">
      <section className="mx-auto max-w-md rounded-[18px] border border-[#E8E2D9] bg-white p-6 text-center shadow-[0_24px_70px_rgba(72,48,31,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BA5C3D]">Dashboard error</p>
        <h1 className="dm-editorial-display mt-3 text-[30px] font-semibold tracking-[-0.035em] text-[#17202A]">Unable to load workspaces</h1>
        <p className="mt-3 text-sm leading-6 text-[#6B7280]">Refresh the dashboard and try again.</p>
        <Button className="mt-6 border-[#BA5C3D] bg-[#BA5C3D] text-white hover:bg-[#A8421F]" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
