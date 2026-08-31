import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";

const navLinks = [
  { href: "#security", label: "Trust & Security" },
  { href: "#privacy", label: "Data & Privacy" },
  { href: "#access", label: "Access" },
  { href: "#about", label: "About" },
];

const supportedFormats = ["PDF", "DOCX", "XLSX", "CSV", "Markdown", "HTML", "TXT"];

const evidenceSources = [
  { file: "Q2 Board Deck.pdf", location: "Page 7", text: "Operating margin improved to 18.7% in Q2, driven by productivity and lower operating costs." },
  { file: "Financials.xlsx", location: "Sheet: P&L", text: "Total operating expenses decreased 6.3% QoQ to $142.1M." },
  { file: "Management Memo.pdf", location: "Page 3", text: "Productivity initiatives delivered $12.4M in annualized savings." },
];

const processSteps = [
  { number: "01", title: "Ingest", body: "Bring long documents and working files into a private workspace." },
  { number: "02", title: "Retrieve", body: "Pliny combines semantic vectors with lexical relevance to find useful passages." },
  { number: "03", title: "Answer", body: "Ask a question and receive a concise answer grounded in the material you supplied." },
  { number: "04", title: "Verify", body: "Follow each citation to its filename, location and source passage before relying on it." },
];

export function LandingView() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FCFBF8] text-[#0C1427]">
      <LandingNav />

      <section className="mx-auto max-w-[1240px] px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28 lg:pt-24">
      <div className="grid min-w-0 items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,0.78fr)] lg:gap-20">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D5D2C8] bg-[#F5F0E8] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8D3F28]">
              <span className="size-1.5 rounded-full bg-[#BA5C3D]" aria-hidden="true" />
              Portfolio / public testing release
            </div>
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
              <Link href="#how-it-works" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-[#D5D2C8] bg-[#FFFEFA] px-6 text-sm font-semibold text-[#0C1427] transition-colors hover:border-[#BA5C3D]/60 hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 sm:w-auto">
                See how it works <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-5 text-[12px] font-medium tracking-[0.01em] text-[#6B665F]">Source-grounded answers · Visible citations · Private workspaces</p>
          </div>

          <HeroMarkIllustration />
        </div>

        <EvidenceDemo />
      </section>

      <section id="how-it-works" className="border-y border-[#E5E0D8] bg-[#F5F0E8]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <SectionIntro eyebrow="How Pliny works" title="A clear path from file to evidence." body="The workflow stays legible: your documents go in, the relevant passages come back, and the answer remains accountable to them." />
          <div className="mt-12 grid gap-0 border-y border-[#D5D2C8] md:grid-cols-4 md:divide-x md:divide-[#D5D2C8]">
            {processSteps.map((step) => (
              <article key={step.number} className="border-b border-[#D5D2C8] py-7 last:border-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0">
                <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-[#BA5C3D]">{step.number}</span>
                <h3 className="dm-editorial-display mt-5 text-[28px] font-semibold tracking-[-0.03em]">{step.title}</h3>
                <p className="mt-3 text-[14px] leading-6 text-[#596170]">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
          <SectionIntro eyebrow="Built for real files" title="The formats you already work with." body="Pliny currently accepts the formats supported by the deployed ingestion pipeline. Files remain untrusted input and are handled as source material." />
          <div className="grid grid-cols-2 gap-px self-start overflow-hidden border border-[#D5D2C8] bg-[#D5D2C8] sm:grid-cols-3">
            {supportedFormats.map((format) => (
              <div key={format} className="flex min-h-28 items-end bg-[#FFFEFA] p-5 sm:min-h-32">
                <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[#394152]">{format}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="bg-[#0C1427] text-[#FCFBF8]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-24">
            <SectionIntro inverse eyebrow="Trust & Security" title="Your evidence has an owner." body="Pliny is built around authenticated workspaces, private source files and citations that make the evidence visible." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TrustItem icon={LockKeyhole} title="Private Storage" body="Documents live in a private Supabase Storage bucket." />
              <TrustItem icon={ShieldCheck} title="Owner-scoped access" body="Authenticated access and PostgreSQL RLS keep workspaces scoped to their owner." />
              <TrustItem icon={SearchCheck} title="Citation validation" body="Answers are checked against retrieved source passages before they are shown." />
              <TrustItem icon={FileCheck2} title="Insufficient evidence" body="When the source does not support an answer, Pliny can say so." />
            </div>
          </div>
        </div>
      </section>

      <section id="privacy" className="border-b border-[#E5E0D8] bg-[#F5F0E8]">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24 lg:px-10 lg:py-24">
          <SectionIntro eyebrow="Data & Privacy" title="Control the source material you bring in." body="Pliny uses authenticated, owner-scoped workspaces and private Storage for the documents you upload. Supabase documents encryption at rest and in transit for its platform." />
          <div className="border-t border-[#D5D2C8]">
            <PrivacyRow title="Active today" body="Private Storage, authenticated access, owner-scoped RLS, source citations and hybrid semantic/lexical retrieval." />
            <PrivacyRow title="Being evaluated" body="Provider zero-retention configuration is being evaluated for future releases." />
            <PrivacyRow title="Planned" body="PII pseudonymization, Google Drive and OneDrive integrations are planned and are not active here." />
          </div>
        </div>
      </section>

      <section id="access" className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          <SectionIntro eyebrow="Access" title="A public testing release." body="Pliny is currently available as a portfolio and public testing release. There is no hidden platform subscription charge at present. AI usage can still be limited by configured provider budgets." />
          <div className="border-l-2 border-[#BA5C3D] pl-6 sm:pl-8">
            <p className="text-[17px] leading-8 text-[#394152]">Paid plans are being considered, but they are not available yet. There is no promised price or launch date.</p>
            <Link href="/signup" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#8D3F28] underline-offset-4 hover:underline">Start a workspace <ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section id="about" className="border-t border-[#E5E0D8] bg-[#F5F0E8]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="max-w-[760px]">
            <SectionIntro eyebrow="About Pliny" title="Made to make careful reading easier." body="Pliny is built by Deepak as a portfolio-grade document-intelligence product. It demonstrates production-oriented RAG, evidence handling, ingestion hardening and careful QA. It is not presented as a fully supported enterprise platform." />
            <p className="mt-7 max-w-[680px] text-[15px] leading-7 text-[#596170]">The name nods quietly to Pliny the Elder and the practice of collecting and organizing knowledge. The product is designed for the practical work that follows: finding the passage, checking the claim and keeping the source close.</p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold">
              <a href="https://github.com/Deepak92939339/Pliny" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#0C1427] hover:text-[#8D3F28]">View the project <GitBranch className="size-4" aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-8 text-[12px] text-[#6B665F] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <BrandMark className="h-8 gap-2" markClassName="size-7 border-[#BA5C3D]/45 bg-transparent text-[#BA5C3D]" textClassName="text-[15px] font-semibold text-[#0C1427]" />
        <p>Knowledge, traced to its source.</p>
        <a href="https://github.com/Deepak92939339/Pliny" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[#0C1427] hover:text-[#8D3F28]"><GitBranch className="size-4" aria-hidden="true" /> Feedback or a star</a>
      </footer>
    </main>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#E5E0D8]/90 bg-[#FCFBF8]/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] w-full min-w-0 max-w-[1240px] items-center justify-between gap-3 px-5 sm:gap-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Pliny home" className="shrink-0 text-[#0C1427] hover:text-[#8D3F28]"><BrandMark textClassName="dm-editorial-display text-[23px] font-semibold" /></Link>
        <nav className="hidden items-center gap-6 text-[12px] font-semibold text-[#394152] xl:flex" aria-label="Main navigation">
          {navLinks.map((link) => <Link key={link.href} href={link.href} className="hover:text-[#8D3F28]">{link.label}</Link>)}
        </nav>
        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-5">
          <details className="relative xl:hidden">
            <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#394152] hover:text-[#8D3F28] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">Menu</summary>
            <nav className="absolute right-0 top-9 z-30 grid w-56 gap-1 border border-[#D5D2C8] bg-[#FFFEFA] p-2 text-[13px] font-semibold text-[#394152] shadow-[0_16px_40px_rgba(72,48,31,0.14)]" aria-label="Mobile navigation">
              {navLinks.map((link) => <Link key={link.href} href={link.href} className="px-3 py-2 hover:bg-[#F5F0E8] hover:text-[#8D3F28]">{link.label}</Link>)}
            </nav>
          </details>
          <Link href="/login" className="text-[13px] font-semibold text-[#394152] hover:text-[#8D3F28]">Sign in</Link>
          <Link href="/signup" className="inline-flex h-10 items-center justify-center rounded-[5px] bg-[#BA5C3D] px-3 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(186,92,61,0.15)] hover:bg-[#A8421F] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 sm:px-5"><span className="sm:hidden">Start</span><span className="hidden sm:inline">Start workspace</span></Link>
        </div>
      </div>
    </header>
  );
}

function HeroMarkIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[480px]" aria-hidden="true">
      <div className="absolute inset-8 rounded-full bg-[#F2E7DD] blur-3xl" />
      <svg viewBox="0 0 480 420" className="relative w-full" fill="none" role="presentation">
        <path d="M76 326 238 70l166 76-160 252-168-72Z" fill="#F5F0E8" stroke="#0C1427" strokeWidth="2" />
        <path d="m94 315 150-220 143 66-145 226-148-72Z" fill="#FFFEFA" stroke="#BA5C3D" strokeWidth="1.5" />
        <path d="M126 280 259 106m-112 207 139-215m-96 247 141-218" stroke="#D5D2C8" strokeWidth="1.5" />
        <path d="m111 296 148-20 94-147" stroke="#0C1427" strokeWidth="2" strokeLinecap="round" />
        <path d="m116 309 126 54 137-213" stroke="#BA5C3D" strokeWidth="2" strokeLinecap="round" />
        <circle cx="258" cy="276" r="10" fill="#BA5C3D" />
        <circle cx="258" cy="276" r="4" fill="#FCFBF8" />
        <path d="m323 54 54 248" stroke="#0C1427" strokeWidth="5" strokeLinecap="round" />
        <path d="m327 52 24-19 29 21-25 17-28-19Z" fill="#BA5C3D" stroke="#0C1427" strokeWidth="2" />
        <path d="m376 303 16 24-21-5-16-24 21 5Z" fill="#0C1427" />
        <path d="M54 345h360" stroke="#D5D2C8" />
      </svg>
      <p className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8A7D70]">Read · retrieve · verify</p>
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

function SectionIntro({ body, eyebrow, inverse = false, title }: { body: string; eyebrow: string; inverse?: boolean; title: string }) {
  return <div className="max-w-[570px]"><p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${inverse ? "text-[#D58A70]" : "text-[#BA5C3D]"}`}>{eyebrow}</p><h2 className={`dm-editorial-display mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[48px] ${inverse ? "text-[#FCFBF8]" : "text-[#0C1427]"}`}>{title}</h2><p className={`mt-5 text-[16px] leading-7 ${inverse ? "text-[#C9C2B8]" : "text-[#596170]"}`}>{body}</p></div>;
}

function TrustItem({ body, icon: Icon, title }: { body: string; icon: typeof LockKeyhole; title: string }) {
  return <article className="border border-[#26324A] bg-[#111C33] p-5"><Icon className="size-5 text-[#D58A70]" aria-hidden="true" /><h3 className="mt-8 text-[15px] font-semibold">{title}</h3><p className="mt-2 text-[13px] leading-6 text-[#C9C2B8]">{body}</p></article>;
}

function PrivacyRow({ body, title }: { body: string; title: string }) {
  return <div className="border-b border-[#D5D2C8] py-6 first:pt-0"><div className="flex gap-3"><CircleCheck className="mt-0.5 size-4 shrink-0 text-[#BA5C3D]" aria-hidden="true" /><h3 className="text-[14px] font-semibold">{title}</h3></div><p className="mt-2 pl-7 text-[14px] leading-6 text-[#596170]">{body}</p></div>;
}
