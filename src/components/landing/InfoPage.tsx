import Link from "next/link";
import { ArrowLeft, ArrowRight, GitBranch } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import type { LandingInfoPage } from "./infoContent";

export function InfoPage({ page }: { page: LandingInfoPage }) {
  return (
    <main className="min-h-screen bg-[#FCFBF8] text-[#0C1427]">
      <header className="border-b border-[#E5E0D8] bg-[#FCFBF8]">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[980px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="Pliny home" className="text-[#0C1427] hover:text-[#8D3F28]"><BrandMark textClassName="dm-editorial-display text-[23px] font-semibold" /></Link>
          <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#596170] hover:text-[#8D3F28]"><ArrowLeft className="size-4" aria-hidden="true" /> Back home</Link>
        </div>
      </header>
      <article className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BA5C3D]">Pliny / {page.label}</p>
        <h1 className="dm-editorial-display mt-5 max-w-[680px] text-[46px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[68px]">{page.title}</h1>
        {page.processingBoundary ? (
          <section className="mt-10 border-y border-[#D5D2C8] py-6" aria-labelledby="processing-boundary-heading">
            <h2 id="processing-boundary-heading" className="text-sm font-semibold text-[#0C1427]">{page.processingBoundary.title}</h2>
            {page.processingBoundary.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-[14px] leading-7 text-[#596170]">{paragraph}</p>
            ))}
          </section>
        ) : null}
        {page.key === "about" ? (
          <div className="mt-10 border-t border-[#D5D2C8]">
            <p className="border-b border-[#E5E0D8] py-6 text-[16px] leading-8 text-[#394152]">{page.detail[0]}</p>
            <p className="border-b border-[#E5E0D8] py-6 text-[16px] leading-8 text-[#394152]">{page.detail[1]}</p>
            <section className="border-b border-[#E5E0D8] py-8" aria-labelledby="builder-heading">
              <h2 id="builder-heading" className="dm-editorial-display text-[30px] font-semibold tracking-[-0.035em]">{page.detail[2]}</h2>
              <p className="mt-4 text-[16px] leading-8 text-[#394152]">{page.detail[3]}</p>
              <p className="mt-4 text-[16px] leading-8 text-[#394152]">{page.detail[4]}</p>
            </section>
          </div>
        ) : (
          <div className="mt-10 border-t border-[#D5D2C8]">
            {page.detail.map((paragraph) => <p key={paragraph} className="border-b border-[#E5E0D8] py-6 text-[16px] leading-8 text-[#394152]">{paragraph}</p>)}
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-[5px] bg-[#BA5C3D] px-5 text-[13px] font-semibold text-white hover:bg-[#A8421F] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">Start workspace <ArrowRight className="size-4" aria-hidden="true" /></Link>
          <a href="https://github.com/Deepak92939339/Pliny" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#0C1427] hover:text-[#8D3F28]">View the project <GitBranch className="size-4" aria-hidden="true" /></a>
        </div>
      </article>
    </main>
  );
}
