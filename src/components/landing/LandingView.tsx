import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle, ChevronDown, FileText, Filter, MessageSquare, Plus, Search, Table } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";

const navLinks = [
  { href: "#product", label: "Product", hasMenu: true },
  { href: "#solutions", label: "Solutions", hasMenu: true },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
  { href: "#resources", label: "Resources", hasMenu: true },
];

const sidebarWorkspaces = ["Q2 Board Pack", "Contracts", "Market Research"];

const sidebarRecents = [
  { label: "FY2025 Filing" },
  { label: "Sales Forecast Model", accent: true },
  { label: "Client Agreement" },
];

const takeaways = [
  "Productivity initiatives reduced costs by $12.4M.",
  "Operating costs decreased 6.3% QoQ.",
  "SG&A increased 4.1% due to investments in growth.",
  "FX headwinds reduced margin by ~60 bps.",
];

const citations = [
  { file: "Q2 Board Deck.pdf", meta: "p.7", icon: "PDF" },
  { file: "Financials.xlsx", meta: "Sheet: P&L", icon: "XLSX" },
  { file: "Management Memo.pdf", meta: "p.3", icon: "PDF" },
];

const sources = [
  {
    file: "Q2 Board Deck.pdf",
    kind: "PDF",
    location: "p.7",
    excerpt: "Operating margin improved to 18.7% in Q2, driven by productivity and lower operating costs...",
    active: true,
  },
  {
    file: "Financials.xlsx",
    kind: "XLSX",
    location: "Sheet: P&L",
    excerpt: "Total operating expenses decreased 6.3% QoQ to $142.1M...",
    spreadsheet: true,
  },
  {
    file: "Management Memo.pdf",
    kind: "PDF",
    location: "p.3",
    excerpt: "Productivity initiatives delivered $12.4M in annualized savings...",
  },
  {
    file: "SG&A Analysis.pdf",
    kind: "PDF",
    location: "p.5",
    excerpt: "SG&A increased 4.1% QoQ due to investments in growth...",
  },
];

const processSteps = [
  {
    body: "Upload PDFs, spreadsheets, and reports. Vector turns complex files into evidence you can verify.",
    icon: BookOpen,
    title: "Read the file",
  },
  {
    body: "Get answers, summaries, and analysis across your workspace.",
    icon: MessageSquare,
    title: "Ask the question",
  },
  {
    body: "Verify every answer against exact citations from the source.",
    icon: Search,
    title: "Check the passage",
  },
];

export function LandingView() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#FAF7F2] text-[#17202A]">
      <LandingNav />

      <section className="mx-auto w-full max-w-[1280px] px-5 pb-10 pt-8 sm:px-7 sm:pt-10 lg:px-10 lg:pb-12 lg:pt-12">
        <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.82fr)] lg:gap-12">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#BA5C3D]">From complex documents to verifiable decisions.</p>
            <h1 className="dm-editorial-display mt-4 max-w-[640px] text-[46px] font-semibold leading-[0.98] tracking-[-0.04em] text-[#102033] sm:text-[56px] lg:text-[64px] xl:text-[68px]">
              Ask your documents.
              <br />
              Trust the answer.
            </h1>
            <p className="mt-5 max-w-[610px] text-[15px] leading-7 text-[#4B5563] sm:text-base">
              Private document intelligence with traceable answers, source-backed analysis and decision-ready reports.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[#BA5C3D] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.18)] transition-colors hover:bg-[#A8421F] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
              >
                Get started for free
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-[6px] border border-[#D8D0C6] bg-white/55 px-6 text-sm font-semibold text-[#17202A] transition-colors hover:border-[#C6BAAD] hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/20"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-4 text-[12px] font-medium text-[#6B7280]">Source-cited answers · Spreadsheet charts · Private workspaces</p>
          </div>

          <HeroEtchingIllustration />
        </div>

        <ProductDemoCard />
        <ProcessStrip />
      </section>
    </main>
  );
}

function LandingNav() {
  return (
    <header className="border-b border-[#E8E2D9]/80 bg-[#FAF7F2]">
      <div className="mx-auto flex h-[68px] w-full max-w-[1280px] items-center justify-between px-5 sm:px-7 lg:px-10">
        <Link href="/" aria-label="Vector home" className="shrink-0 text-[#102033] transition-colors hover:text-[#BA5C3D]">
          <LandingLogo />
        </Link>

        <nav className="hidden items-center gap-8 text-[13px] font-medium tracking-[-0.01em] text-[#17202A] lg:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link key={link.label} href={link.href} className="inline-flex items-center gap-1.5 transition-colors hover:text-[#BA5C3D]">
              {link.label}
              {link.hasMenu ? <ChevronDown className="size-3.5" aria-hidden="true" /> : null}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/login" className="text-[13px] font-medium tracking-[-0.01em] text-[#17202A] transition-colors hover:text-[#BA5C3D]">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center justify-center rounded-[6px] bg-[#BA5C3D] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(186,92,61,0.16)] transition-colors hover:bg-[#A8421F] sm:px-5"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function LandingLogo() {
  return (
    <span className="flex h-9 items-center gap-[7px]">
      <svg className="size-6 shrink-0 text-[#BA5C3D]" viewBox="0 0 32 32" aria-hidden="true" fill="none">
        <path
          d="M16 3.8 25 7.2v7.2c0 6.1-3.8 10.8-9 13.6-5.2-2.8-9-7.5-9-13.6V7.2L16 3.8Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M11.2 11.2h5.2c2.5 0 4.4 1.5 4.4 3.7v5.1h-5.2c-2.5 0-4.4-1.5-4.4-3.7v-5.1Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="m13.2 15.5 2 2 4.1-4.3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="dm-editorial-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#17202A]">Vector</span>
    </span>
  );
}

function HeroEtchingIllustration() {
  return (
    <div className="pointer-events-none relative mx-auto hidden w-full max-w-[580px] items-center justify-center lg:flex" aria-hidden="true">
      <Image
        src="/images/pliny-hero-etching.png"
        alt=""
        aria-hidden="true"
        width={1448}
        height={1086}
        priority
        className="w-full object-contain opacity-[0.92] mix-blend-multiply"
      />
    </div>
  );
}

function ProductDemoCard() {
  return (
    <section id="product" aria-label="Static Vector workspace demo" className="mt-8 md:mt-8 lg:mt-7">
      <div className="overflow-hidden rounded-[20px] border border-[#E1DBD2] bg-white shadow-[0_22px_70px_rgba(42,32,24,0.12)]">
        <div className="grid min-h-[500px] grid-cols-1 lg:h-[470px] lg:min-h-0 lg:grid-cols-[210px_minmax(0,1fr)_270px]">
          <DemoSidebar />
          <DemoAnswerArea />
          <DemoSourcesPanel />
        </div>
      </div>
    </section>
  );
}

function DemoSidebar() {
  return (
    <>
      {/* DEMO SIDEBAR COLOR: #F3EDE4 */}
      <aside className="flex min-h-[410px] flex-col border-r border-[#E1D8CB] bg-[#F3EDE4] p-3.5 text-[#17202A] lg:min-h-0">
      <div className="flex items-center justify-between">
        <BrandMark
          className="h-8 gap-2"
          markClassName="size-7 border-[#BA5C3D]/45 bg-transparent text-[#BA5C3D]"
          textClassName="text-[15px] font-semibold text-[#17202A]"
        />
        <span className="rounded border border-[#D9CBBB] px-1.5 py-0.5 text-[10px] text-[#8A7D70]">||</span>
      </div>

      <button
        type="button"
        className="mt-5 inline-flex h-9 w-full items-center gap-2 rounded-[8px] border border-[#D9CBBB] bg-[#ECE3D7] px-3 text-left text-[12px] font-semibold text-[#17202A]"
      >
        <Plus className="size-4" aria-hidden="true" />
        New workspace
      </button>

      <div className="mt-5">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Workspaces</p>
        <div className="mt-2.5 space-y-1">
          {sidebarWorkspaces.map((workspace, index) => (
            <div
              key={workspace}
              className={
                index === 0
                  ? "rounded-[7px] bg-[#E7DDD0] px-3 py-1.5 text-[12px] font-semibold text-[#17202A]"
                  : "rounded-[7px] px-3 py-1.5 text-[12px] text-[#5F6875]"
              }
            >
              {workspace}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Recent</p>
        <div className="mt-2.5 space-y-1">
          {sidebarRecents.map((recent) => (
            <div key={recent.label} className="flex items-center justify-between rounded-[7px] px-3 py-1.5 text-[12px] text-[#5F6875]">
              <span>{recent.label}</span>
              {recent.accent ? <span className="size-1.5 rounded-full bg-[#22863A]" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-[#DDD2C4] pt-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#D6C6B4] text-[11px] font-semibold text-[#17202A]">DP</div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-[#17202A]">deepakpatro62</p>
          <p className="text-[11px] text-[#5F6875]">Enterprise plan</p>
        </div>
        <ArrowRight className="ml-auto size-4 text-[#8A7D70]" aria-hidden="true" />
      </div>
      </aside>
    </>
  );
}

function DemoAnswerArea() {
  return (
    <section className="min-w-0 border-y border-[#E8E2D9] bg-[#FFFEFB] lg:border-x lg:border-y-0">
      <header className="flex h-16 items-center border-b border-[#E8E2D9] px-5 sm:px-6">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#17202A]">Q2 Board Pack</h2>
          <p className="mt-1 text-[12px] text-[#6B7280]">12 documents</p>
        </div>
      </header>

      <div className="px-5 py-5 sm:px-6">
        <div className="flex justify-end">
          {/* DEMO QUESTION BUBBLE COLOR: #EFE5D8 */}
          <div className="inline-flex max-w-full items-center gap-3 rounded-[9px] border border-[#D9CBBB] bg-[#EFE5D8] px-4 py-3 text-[12px] font-medium text-[#17202A] shadow-[0_14px_34px_rgba(72,48,31,0.10)]">
            <span>What drove operating margin changes in Q2?</span>
            <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-[#BA5C3D] text-[#FFFFFF] sm:flex" aria-hidden="true">
              <Search className="size-4" />
            </span>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-[16px] font-semibold text-[#17202A]">Answer</h3>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#374151]">
            Operating margin improved to 18.7%, up 210 bps QoQ. The change was driven by productivity gains and lower operating costs, partially offset by SG&A growth and FX headwinds.
          </p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
          <StaticMarginChart />

          <div className="rounded-[12px] bg-white/45 p-1">
            <h3 className="mb-3 text-[13px] font-semibold text-[#17202A]">Key takeaways</h3>
            <ul className="space-y-2.5">
              {takeaways.map((takeaway) => (
                <li key={takeaway} className="flex gap-2 text-[12px] leading-5 text-[#374151]">
                  <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#BA5C3D]" aria-hidden="true" />
                  <span>{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-[#17202A]">Citations</h3>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {citations.map((citation) => (
              <span
                key={citation.file}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#E8E2D9] bg-white px-3 py-2 text-[12px] font-medium text-[#374151]"
              >
                <FileBadge kind={citation.icon} compact />
                <span className="truncate">{citation.file}</span>
                <span className="text-[#6B7280]">{citation.meta}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8E2D9] bg-white px-4 py-2 text-[12px] font-medium text-[#374151]">
              View all 12
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
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
    <div className="rounded-[12px] border border-[#E8E2D9] bg-white p-3.5">
      <h3 className="text-[13px] font-semibold text-[#17202A]">Operating Margin (Quarterly)</h3>
      <svg className="mt-2 h-[166px] w-full" viewBox="0 0 460 190" fill="none" role="img" aria-label="Operating margin line chart">
        <g stroke="#E8E2D9" strokeWidth="1">
          <path d="M56 34H418" />
          <path d="M56 72H418" />
          <path d="M56 110H418" />
          <path d="M56 148H418" />
        </g>
        <g fill="#6B7280" fontSize="11" fontFamily="var(--font-ibm-plex), Arial, sans-serif">
          <text x="14" y="38">24%</text>
          <text x="20" y="76">18%</text>
          <text x="20" y="114">12%</text>
          <text x="26" y="152">0%</text>
        </g>
        <path d={path} stroke="#BA5C3D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="3.5" fill="#BA5C3D" stroke="#FFFFFF" strokeWidth="2" />
        ))}
        <text x="397" y="83" fill="#BA5C3D" fontSize="14" fontWeight="700" fontFamily="var(--font-ibm-plex), Arial, sans-serif">
          18.7%
        </text>
        <g fill="#6B7280" fontSize="11" fontFamily="var(--font-ibm-plex), Arial, sans-serif" textAnchor="middle">
          {points.map((point) => (
            <text key={point.label} x={point.x} y="176">
              {point.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

function DemoSourcesPanel() {
  return (
    <aside className="bg-[#FBF8F2] p-4">
      <header className="flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-[#17202A]">Sources</h2>
        <span className="rounded-full bg-[#EDE7DF] px-2 py-0.5 text-[11px] font-semibold text-[#6B7280]">12</span>
        <button type="button" className="ml-auto flex size-8 items-center justify-center rounded-[8px] border border-[#E8E2D9] bg-white text-[#17202A]" aria-label="Filter sources">
          <Filter className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div className="mt-4 space-y-2.5">
        {sources.map((source) => (
          <article
            key={source.file}
            className={
              source.active
                ? "rounded-[10px] border border-[#E8E2D9] border-l-[#BA5C3D] border-l-2 bg-white p-3.5"
                : "rounded-[10px] border border-transparent bg-transparent p-3.5"
            }
          >
            <div className="flex items-start gap-3">
              <FileBadge kind={source.kind} spreadsheet={source.spreadsheet} />
              <div className="min-w-0 flex-1">
                <div className="flex gap-2">
                  <h3 className="truncate text-[13px] font-semibold text-[#17202A]">{source.file}</h3>
                  <span className="ml-auto shrink-0 text-[11px] text-[#374151]">{source.location}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#4B5563]">{source.excerpt}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[8px] border border-[#E8E2D9] bg-white text-[13px] font-semibold text-[#374151]"
      >
        See all sources
      </button>
    </aside>
  );
}

function FileBadge({ compact = false, kind, spreadsheet = false }: { compact?: boolean; kind: string; spreadsheet?: boolean }) {
  const Icon = spreadsheet ? Table : FileText;
  return (
    <span
      className={
        compact
          ? "flex size-5 shrink-0 items-center justify-center rounded border border-[#BA5C3D]/25 text-[#BA5C3D]"
          : spreadsheet
            ? "flex size-5 shrink-0 items-center justify-center rounded border border-[#22863A]/30 text-[#22863A]"
            : "flex size-5 shrink-0 items-center justify-center rounded border border-[#BA5C3D]/25 text-[#BA5C3D]"
      }
      title={kind}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

function ProcessStrip() {
  return (
    <section className="mx-auto mt-10 grid max-w-[1040px] gap-7 border-t border-[#E8E2D9] pt-8 md:grid-cols-3 md:divide-x md:divide-[#E8E2D9]">
      {processSteps.map((step, index) => {
        const Icon = step.icon;
        return (
          <article key={step.title} className="flex gap-5 md:px-9 first:md:pl-0 last:md:pr-0">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-[#E8E2D9] bg-white text-[#BA5C3D]">
              <Icon className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="flex size-5 items-center justify-center rounded-full bg-[#E7E0D7] text-[11px] font-semibold text-[#6B7280]">{index + 1}</span>
                <h2 className="text-[15px] font-semibold text-[#17202A]">{step.title}</h2>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-[#4B5563]">{step.body}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
