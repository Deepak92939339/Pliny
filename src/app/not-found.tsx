import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { buttonVariants } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper-0)] text-[var(--ink-900)]">
      <SiteHeader variant="info" />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <section
          className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--rule-strong)] bg-[var(--paper-1)] p-8 text-center shadow-[var(--shadow-2)]"
          aria-labelledby="not-found-heading"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-2)]">
            <FileQuestion className="size-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            404 Error
          </p>
          <h1
            id="not-found-heading"
            className="font-serif mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-900)] sm:text-3xl"
          >
            Page not found
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-500)]">
            The document or view you were looking for doesn’t exist or has moved.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/"
              className={buttonVariants({ variant: "primary", size: "md", className: "gap-2" })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span>Back home</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
