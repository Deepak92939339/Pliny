import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";
import { SiteHeader } from "@/components/ui/SiteHeader";
import type { LandingInfoPage } from "./infoContent";

export function InfoPage({ page }: { page: LandingInfoPage }) {
  return (
    <main className="min-h-screen bg-[var(--paper-2)] text-[var(--ink-900)]">
      <SiteHeader variant="info" />
      <article className="mx-auto max-w-[var(--container-prose)] px-4 py-16 sm:px-6 sm:py-24">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Pliny / {page.label}
        </p>
        <h1 className="dm-editorial-display mt-5 max-w-[680px] text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[56px]">
          {page.title}
        </h1>
        {page.processingBoundary ? (
          <section
            className="mt-10 border-y border-[var(--rule-strong)] py-6"
            aria-labelledby="processing-boundary-heading"
          >
            <h2 id="processing-boundary-heading" className="text-sm font-semibold text-[var(--ink-900)]">
              {page.processingBoundary.title}
            </h2>
            {page.processingBoundary.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-relaxed text-[var(--ink-500)]">
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}
        {page.key === "about" ? (
          <div className="mt-10 border-t border-[var(--rule-strong)]">
            <p className="border-b border-[var(--rule)] py-6 text-base leading-relaxed text-[var(--ink-700)]">
              {page.detail[0]}
            </p>
            <p className="border-b border-[var(--rule)] py-6 text-base leading-relaxed text-[var(--ink-700)]">
              {page.detail[1]}
            </p>
            <section className="border-b border-[var(--rule)] py-8" aria-labelledby="builder-heading">
              <h2
                id="builder-heading"
                className="dm-editorial-display text-2xl font-semibold tracking-[-0.03em]"
              >
                {page.detail[2]}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--ink-700)]">
                {page.detail[3]}
              </p>
              <p className="mt-4 text-base leading-relaxed text-[var(--ink-700)]">
                {page.detail[4]}
              </p>
            </section>
          </div>
        ) : (
          <div className="mt-10 border-t border-[var(--rule-strong)]">
            {page.detail.map((paragraph) => (
              <p
                key={paragraph}
                className="border-b border-[var(--rule)] py-6 text-base leading-relaxed text-[var(--ink-700)]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--ink-900)] px-5 text-sm font-semibold text-[var(--paper-2)] transition-opacity hover:opacity-90"
          >
            Private beta sign in <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <a
            href="https://github.com/Deepak92939339/Pliny"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-900)] transition-colors hover:text-[var(--accent-ink)]"
          >
            View the project <GitBranch className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </a>
        </div>
      </article>
    </main>
  );
}
