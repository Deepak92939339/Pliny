import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";

export default function CollectionNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--paper-0)] px-6 text-[var(--ink-900)]">
      <section className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--rule-strong)] bg-[var(--paper-1)] p-8 text-center shadow-[var(--shadow-2)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-2)]">
          <SearchX className="size-6 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Workspace Error
        </p>
        <h1 className="font-serif mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-900)]">
          Workspace not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-500)]">
          This workspace does not exist or is not available to your account.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "secondary", size: "md", className: "gap-2" })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to dashboard</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
