import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle, GitBranch } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { LandingInfoDialog } from "@/components/landing/LandingInfoDialog";
import { landingInfoPages } from "@/components/landing/infoContent";

const evidenceSources = [
  { file: "Q2 Board Deck.pdf", location: "Page 7", text: "Operating margin improved to 18.7% in Q2, driven by productivity and lower operating costs." },
  { file: "Financials.xlsx", location: "Sheet: P&L", text: "Total operating expenses decreased 6.3% QoQ to $142.1M." },
  { file: "Management Memo.pdf", location: "Page 3", text: "Productivity initiatives delivered $12.4M in annualized savings." },
];

const takeaways = [
  "Productivity initiatives reduced costs by $12.4M.",
  "Operating costs decreased 6.3% QoQ.",
  "SG&A increased 4.1% due to investments in growth.",
  "FX headwinds reduced margin by ~60 bps.",
];

export function LandingView() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FCFBF8] text-[#0C1427]">
      <LandingNav />

      <section className="mx-auto max-w-[1240px] px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28 lg:pt-24">
        <div className="grid min-w-0 items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,0.78fr)] lg:gap-20">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BA5C3D]">FROM COMPLEX DOCUMENTS TO VERIFIABLE DECISIONS.</p>
            <h1 className="dm-editorial-display mt-7 max-w-[680px] break-words text-[49px] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[72px] lg:text-[86px]">
              Knowledge,
              <br />
              traced to its<span className="sm:hidden"><br /></span><span className="hidden sm:inline"> </span>source.
            </h1>
            <p className="mt-7 max-w-[570px] break-words text-[17px] leading-8 text-[#394152] sm:text-[18px]">
              Pliny turns long documents into searchable evidence, then keeps the answer close to the passage that supports it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#0C1427] px-6 text-sm font-semibold text-[#FCFBF8] shadow-[0_14px_28px_rgba(12,20,39,0.14)] transition-colors hover:bg-[#17213A] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/30 sm:w-auto">
                Start workspace <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a href="#evidence" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-[#D5D2C8] bg-[#FFFEFA] px-6 text-sm font-semibold text-[#0C1427] transition-colors hover:border-[#BA5C3D]/60 hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 sm:w-auto">
                See the workspace <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-5 text-[12px] font-medium tracking-[0.01em] text-[#6B665F]">Source-grounded answers · Visible citations · Private workspaces</p>
          </div>

          <HeroEtchingIllustration />
        </div>

        <EvidenceDemo />
      </section>

      <section className="border-y border-[#E5E0D8] bg-[#F5F0E8]" aria-label="Pliny capabilities">
        <div className="mx-auto grid max-w-[1240px] gap-0 px-5 sm:grid-cols-3 sm:px-8 lg:px-10">
          {[
            ["01", "Ingest → retrieve", "Bring working files into a private workspace and find the passages that matter."],
            ["02", "Answer → verify", "Keep each answer close to its filename, location and source evidence."],
            ["03", "Built for review", "Semantic and lexical retrieval support both concepts and exact terms."],
          ].map(([number, title, body]) => (
            <article key={number} className="border-b border-[#D5D2C8] py-6 last:border-0 sm:border-b-0 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
              <span className="font-mono text-[10px] font-semibold tracking-[0.15em] text-[#BA5C3D]">{number}</span>
              <h2 className="mt-2 text-[13px] font-semibold">{title}</h2>
              <p className="mt-2 text-[12px] leading-5 text-[#596170]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-8 text-[12px] text-[#6B665F] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <BrandMark className="h-8 gap-2" markClassName="size-8" textClassName="text-[15px] font-semibold text-[#0C1427]" />
        <p>Knowledge, traced to its source.</p>
        <a href="https://github.com/Deepak92939339/Pliny" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[#0C1427] hover:text-[#8D3F28]"><GitBranch className="size-4" aria-hidden="true" /> Feedback or a star</a>
      </footer>
    </main>
  );
}
function LandingNav() {
  return (
    <header className="relative sticky top-0 z-20 border-b border-[#E5E0D8]/90 bg-[#FCFBF8]/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] w-full min-w-0 max-w-[1240px] items-center justify-between gap-3 px-5 sm:gap-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Pliny home" className="shrink-0 text-[#0C1427] hover:text-[#8D3F28]"><BrandMark markClassName="size-9 sm:size-10" textClassName="dm-editorial-display text-[23px] font-semibold" /></Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-5 whitespace-nowrap text-[12px] font-semibold text-[#394152] xl:flex" aria-label="Main navigation">
          {landingInfoPages.map((page) => <LandingInfoDialog key={page.key} page={page} />)}
        </nav>
        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-5">
          <details className="relative xl:hidden">
            <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#394152] hover:text-[#8D3F28] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">Menu</summary>
            <nav className="absolute right-0 top-9 z-30 grid w-56 gap-1 border border-[#D5D2C8] bg-[#FFFEFA] p-2 text-[13px] font-semibold text-[#394152] shadow-[0_16px_40px_rgba(72,48,31,0.14)]" aria-label="Mobile navigation">
              {landingInfoPages.map((page) => <LandingInfoDialog key={page.key} page={page} triggerClassName="w-full px-3 py-2 hover:bg-[#F5F0E8]" />)}
            </nav>
          </details>
          <Link href="/login" className="text-[13px] font-semibold text-[#394152] hover:text-[#8D3F28]">Sign in</Link>
          <Link href="/signup" className="inline-flex h-10 items-center justify-center rounded-[5px] bg-[#BA5C3D] px-3 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(186,92,61,0.15)] hover:bg-[#A8421F] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 sm:px-5"><span className="sm:hidden">Start</span><span className="hidden sm:inline">Start workspace</span></Link>
        </div>
      </div>
    </header>
  );
}

function HeroEtchingIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[580px]">
      <Image
        src="/images/pliny-hero-etching.png"
        alt="Engraved stack of books and documents with a magnifying glass"
        width={1448}
        height={1086}
        priority
        className="h-auto w-full object-contain mix-blend-multiply"
      />
    </div>
  );
}

function EvidenceDemo() {
  return (
    <section id="evidence" className="mt-20 overflow-hidden border border-[#D5D2C8] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(72,48,31,0.09)] lg:mt-28" aria-label="Evidence and citation demonstration">
      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)_300px]">
        <aside className="border-b border-[#D5D2C8] bg-[#F5F0E8] p-5 lg:border-b-0 lg:border-r">
          <BrandMark className="h-8 gap-2" markClassName="size-7 border-[#BA5C3D]/45 bg-transparent text-[#BA5C3D]" textClassName="text-[15px] font-semibold" />
          <div className="mt-8 border-t border-[#D5D2C8] pt-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Workspace</p>
            <p className="mt-3 text-[14px] font-semibold">Q2 Board Pack</p>
            <p className="mt-1 text-[12px] text-[#6B665F]">12 documents</p>
          </div>
          <div className="mt-8 space-y-2 text-[12px] text-[#596170]">
            <p className="rounded-[4px] bg-[#E7DDD0] px-3 py-2 font-semibold text-[#0C1427]">Q2 Board Pack</p>
            <p className="px-3 py-2">Contracts</p>
            <p className="px-3 py-2">Market Research</p>
          </div>
          <p className="mt-10 border-t border-[#D5D2C8] pt-4 text-[11px] leading-5 text-[#6B665F]">A private workspace for source-backed review.</p>
        </aside>
        <div className="min-w-0 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E0D8] pb-6">
            <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BA5C3D]">Example question</p><h2 className="dm-editorial-display mt-3 text-[28px] font-semibold tracking-[-0.035em]">What changed operating margin in Q2?</h2></div>
            <span className="rounded-full border border-[#D5D2C8] bg-[#F5F0E8] px-3 py-1.5 text-[11px] font-semibold text-[#8D3F28]">3 cited sources</span>
          </div>
          <div className="mt-7"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Answer</p><p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#394152]">Operating margin improved to 18.7%, driven by productivity gains and lower operating costs, with SG&amp;A growth and FX headwinds offsetting part of the change.</p></div>
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_minmax(220px,0.78fr)]">
            <StaticMarginChart />
            <div className="border-t border-[#E5E0D8] pt-5 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
              <h3 className="text-[13px] font-semibold">Key takeaways</h3>
              <ul className="mt-4 space-y-3">
                {takeaways.map((takeaway) => (
                  <li key={takeaway} className="flex gap-2 text-[12px] leading-5 text-[#596170]">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#BA5C3D]" aria-hidden="true" />
                    <span>{takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {evidenceSources.map((source) => <div key={source.file} className="border-t-2 border-[#BA5C3D] pt-3"><p className="truncate text-[12px] font-semibold" title={source.file}>{source.file}</p><p className="mt-1 text-[11px] font-medium text-[#8D3F28]">{source.location}</p><p className="mt-3 text-[12px] leading-5 text-[#596170]">{source.text}</p></div>)}
          </div>
        </div>
        <aside className="border-t border-[#D5D2C8] bg-[#FBF8F3] p-6 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">Evidence</h2><span className="font-mono text-[10px] text-[#8A7D70]">03</span></div>
          <div className="mt-6 space-y-4">{evidenceSources.map((source, index) => <div key={source.file} className="flex gap-3"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#EFE5D8] font-mono text-[10px] font-semibold text-[#8D3F28]">{index + 1}</span><div className="min-w-0"><p className="truncate text-[12px] font-semibold" title={source.file}>{source.file}</p><p className="mt-1 text-[11px] text-[#8D3F28]">{source.location}</p></div></div>)}</div>
          <p className="mt-10 border-t border-[#E5E0D8] pt-4 text-[11px] leading-5 text-[#6B665F]">Open a citation to inspect the exact retrieved passage.</p>
        </aside>
      </div>
    </section>
  );
}

function StaticMarginChart() {
  const points = [
    { x: 56, y: 137, label: "Q2 FY24" },
    { x: 142, y: 100, label: "Q3 FY24" },
    { x: 228, y: 118, label: "Q4 FY24" },
    { x: 314, y: 118, label: "Q1 FY25" },
    { x: 400, y: 95, label: "Q2 FY25" },
  ];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");

  return (
    <div className="min-w-0 rounded-[8px] border border-[#E5E0D8] bg-[#FFFEFA] p-3.5">
      <h3 className="text-[13px] font-semibold">Operating Margin (Quarterly)</h3>
      <svg className="mt-2 h-auto min-h-[166px] w-full" viewBox="0 0 460 190" fill="none" role="img" aria-label="Operating margin line chart">
        <g stroke="#E5E0D8" strokeWidth="1">
          <path d="M56 34H418" />
          <path d="M56 72H418" />
          <path d="M56 110H418" />
          <path d="M56 148H418" />
        </g>
        <g fill="#6B665F" fontSize="11" fontFamily="var(--font-ibm-plex), Arial, sans-serif">
          <text x="14" y="38">24%</text>
          <text x="20" y="76">18%</text>
          <text x="20" y="114">12%</text>
          <text x="26" y="152">0%</text>
        </g>
        <path d={path} stroke="#BA5C3D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="3.5" fill="#BA5C3D" stroke="#FFFFFF" strokeWidth="2" />
        ))}
        <text x="397" y="83" fill="#BA5C3D" fontSize="14" fontWeight="700" fontFamily="var(--font-ibm-plex), Arial, sans-serif">18.7%</text>
        <g fill="#6B665F" fontSize="11" fontFamily="var(--font-ibm-plex), Arial, sans-serif" textAnchor="middle">
          {points.map((point) => <text key={point.label} x={point.x} y="176">{point.label}</text>)}
        </g>
      </svg>
    </div>
  );
}
