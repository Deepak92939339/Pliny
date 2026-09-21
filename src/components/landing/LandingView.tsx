'use client';

import Link from "next/link";
import { ArrowUpRight, CheckCircle, ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { BrandMark } from "@/components/shared/BrandMark";
import { LandingInfoDialog } from "@/components/landing/LandingInfoDialog";
import { landingInfoPages } from "@/components/landing/infoContent";

type ScenarioId = "sufficient" | "refusal" | "masked";

const SCENARIOS: {
  id: ScenarioId;
  label: string;
  badge: string;
  badgeDot: string;
  gate: string;
  gateDot: string;
  pill: string;
}[] = [
  {
    id: "sufficient",
    label: "Sufficient",
    badge: "STANDARD PROCESSING",
    badgeDot: "bg-[#8A7D70]",
    gate: "sufficient · 3/3 citations resolved",
    gateDot: "bg-[#AE4E24]",
    pill: "3 cited sources",
  },
  {
    id: "refusal",
    label: "Refusal",
    badge: "STANDARD PROCESSING",
    badgeDot: "bg-[#8A7D70]",
    gate: "insufficient · 0/3 above threshold",
    gateDot: "bg-[#8A7D70]",
    pill: "0 cited sources",
  },
  {
    id: "masked",
    label: "Masked",
    badge: "PRIVACY-MINIMISED",
    badgeDot: "bg-[#8D3F28]",
    gate: "masked · HMAC projection active",
    gateDot: "bg-[#8D3F28]",
    pill: "3 masked sources",
  },
];

const EVIDENCE = [
  {
    id: 1,
    file: "Q2 Board Deck.pdf",
    loc: "Page 7",
    chunk: "Operating margin improved to 18.7% in Q2, driven by productivity gains and lower operating costs.",
    passage: "Operating margin improved to 18.7% in Q2, driven by productivity gains and lower operating costs.",
    highlight: "18.7% in Q2",
    aria: "Citation 1: Q2 Board Deck.pdf, page 7. Open in Source Inspector.",
  },
  {
    id: 2,
    file: "Financials.xlsx",
    loc: "Sheet: P&L",
    chunk: "Total operating expenses decreased 6.3% QoQ to $142.1M.",
    passage: "Total operating expenses decreased 6.3% QoQ to $142.1M.",
    highlight: "6.3% QoQ to $142.1M",
    aria: "Citation 2: Financials.xlsx, sheet P&L. Open in Source Inspector.",
  },
  {
    id: 3,
    file: "Management Memo.pdf",
    loc: "Page 3",
    chunk: "Productivity initiatives delivered $12.4M in annualized savings, while SG&A growth and FX headwinds offset roughly 60 bps of the gain.",
    passage: "Productivity initiatives delivered $12.4M in annualized savings, while SG&A growth and FX headwinds offset roughly 60 bps of the gain.",
    highlight: "$12.4M in annualized savings",
    aria: "Citation 3: Management Memo.pdf, page 3. Open in Source Inspector.",
  },
];

const PROVENANCE = [
  { quarter: "Q2 FY24", margin: "12.4", doc: "PLINY-DEMO-02", version: "v1", loc: "Sheet P&L, row 8", cite: "2" },
  { quarter: "Q3 FY24", margin: "15.1", doc: "PLINY-DEMO-02", version: "v1", loc: "Sheet P&L, row 9", cite: "2" },
  { quarter: "Q4 FY24", margin: "13.8", doc: "PLINY-DEMO-02", version: "v1", loc: "Sheet P&L, row 10", cite: "2" },
  { quarter: "Q1 FY25", margin: "13.2", doc: "PLINY-DEMO-02", version: "v1", loc: "Sheet P&L, row 11", cite: "2" },
  { quarter: "Q2 FY25", margin: "18.7", doc: "PLINY-DEMO-02", version: "v1", loc: "Sheet P&L, row 12", cite: "1, 2" },
];

const TAKEAWAYS = [
  "Productivity initiatives reduced costs by $12.4M.",
  "Operating costs decreased 6.3% QoQ.",
  "SG&A increased 4.1% due to investments in growth.",
  "FX headwinds reduced margin by ~60 bps.",
];

const CAPTIONS = [
  ["Workspace Indexing", "Bring compliance files, financial sheets, and engineering docs into owner-isolated private workspaces."],
  ["Evidence-linked data visualizations", "Turn supported figures from documents and spreadsheets into charts whose values trace to their source."],
  ["Passage-level Attribution", "Link every accepted answer to its document, page, sheet, row, or passage — one click inspects the exact span."],
];

const STRIP = [
  ["01 // INGEST", "Ingest → retrieve", "Upload batches of working files; extraction preserves page, sheet, and row provenance."],
  ["02 // VERIFY", "Answer → verify", "Answers render only after retrieved passages pass the evidence-sufficiency gate."],
  ["03 // REVIEW", "Built for review", "Inspect citations, export evidence-backed summaries, and review conflicts in the open."],
];

function MaskedToken({ token }: { token: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-[4px] border border-[#D5D2C8] bg-[#F5F0E8] px-1.5 py-0.5 font-mono text-[12px] text-[#596170]">
      {token}
    </span>
  );
}

function MarginChart() {
  const grid = [
    { y: 18, label: "24%" },
    { y: 42, label: "20%" },
    { y: 66, label: "16%" },
    { y: 90, label: "12%" },
    { y: 114, label: "8%" },
  ];
  const points = [
    { x: 52, y: 87.6, value: "12.4", quarter: "Q2 FY24" },
    { x: 145, y: 71.4, value: "15.1", quarter: "Q3 FY24" },
    { x: 238, y: 79.2, value: "13.8", quarter: "Q4 FY24" },
    { x: 331, y: 82.8, value: "13.2", quarter: "Q1 FY25" },
    { x: 424, y: 49.8, value: "18.7", quarter: "Q2 FY25" },
  ];
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L424 114 L52 114 Z`;
  return (
    <div className="min-w-0 rounded-[8px] border border-[#E5E0D8] bg-[#FFFEFA] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Operating Margin (Quarterly)</h3>
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#8A7D70]">UNITS: % OF REVENUE</span>
      </div>
      <svg
        viewBox="0 0 460 158"
        fill="none"
        role="img"
        aria-label="Operating margin by quarter: Q2 FY24 12.4, Q3 FY24 15.1, Q4 FY24 13.8, Q1 FY25 13.2, Q2 FY25 18.7 percent of revenue."
        className="mt-3 h-auto w-full"
      >
        <g stroke="#E5E0D8" strokeWidth="1">
          {grid.map((row) => (
            <path key={row.label} d={`M40 ${row.y}H440`} />
          ))}
        </g>
        <g fill="#8A7D70" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="end">
          {grid.map((row) => (
            <text key={row.label} x="34" y={row.y + 3}>
              {row.label}
            </text>
          ))}
        </g>
        <path d={area} fill="#AE4E24" opacity="0.06" />
        <path d={line} stroke="#AE4E24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.quarter} cx={point.x} cy={point.y} r="3.2" fill="#AE4E24" stroke="#FFFEFA" strokeWidth="1.6" />
        ))}
        <g fill="#596170" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="middle">
          {points.map((point) => (
            <text key={point.quarter} x={point.x} y={point.y - 9}>
              {point.value}
            </text>
          ))}
        </g>
        <g fill="#8A7D70" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="middle">
          {points.map((point) => (
            <text key={point.quarter} x={point.x} y="142">
              {point.quarter}
            </text>
          ))}
        </g>
      </svg>
      <div className="sr-only">
        <table>
          <caption>Operating margin by quarter with provenance</caption>
          <thead>
            <tr>
              <th scope="col">Quarter</th>
              <th scope="col">Margin (% of revenue)</th>
              <th scope="col">Document ID</th>
              <th scope="col">Version</th>
              <th scope="col">Location</th>
              <th scope="col">Citation</th>
            </tr>
          </thead>
          <tbody>
            {PROVENANCE.map((row) => (
              <tr key={row.quarter}>
                <th scope="row">{row.quarter}</th>
                <td>{row.margin}</td>
                <td>{row.doc}</td>
                <td>{row.version}</td>
                <td>{row.loc}</td>
                <td>{row.cite}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceInspectorBody({
  selected,
  scenario,
  onSelect,
  onStep,
}: {
  selected: number | null;
  scenario: ScenarioId;
  onSelect: (id: number) => void;
  onStep: (delta: number) => void;
}) {
  const item = EVIDENCE.find((entry) => entry.id === selected) ?? null;
  const [before, after] = item ? item.passage.split(item.highlight) : ["", ""];
  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Source Inspector</h3>
        <span className="font-mono text-[10px] text-[#8A7D70]">{EVIDENCE.length} sources</span>
      </div>
      {item ? (
        <div className="mt-4 rounded-[8px] border border-[#D5D2C8] border-t-2 border-t-[#AE4E24] bg-[#FFFEFA] p-4">
          <span className="inline-flex rounded-full border border-[#D5D2C8] bg-[#F5F0E8] px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-[#8D3F28]">
            CITATION {item.id}
          </span>
          <p className="mt-3 break-words text-[12px] font-semibold">{item.file}</p>
          <p className="mt-1 text-[11px] font-medium text-[#8D3F28]">{item.loc}</p>
          <p className="mt-3 rounded-[6px] bg-[#FBF8F3] p-3 text-[12px] leading-5 text-[#394152]">
            {before}
            <mark className="rounded-[2px] bg-[#AE4E24]/15 px-0.5 text-inherit">{item.highlight}</mark>
            {after}
          </p>
          <Link href="/dashboard" className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#8D3F28] hover:text-[#AE4E24]">
            Open original
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
          <div className="mt-4 flex items-center justify-between border-t border-[#E5E0D8] pt-3">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={item.id === 1}
              className="text-[12px] font-semibold text-[#394152] hover:text-[#8D3F28] disabled:opacity-50"
            >
              ← Previous
            </button>
            <span className="font-mono text-[10px] text-[#8A7D70]">
              {item.id} / {EVIDENCE.length}
            </span>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={item.id === EVIDENCE.length}
              className="text-[12px] font-semibold text-[#394152] hover:text-[#8D3F28] disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-[#D5D2C8] p-4 text-[12px] leading-5 text-[#8A7D70]">
          Select a citation or evidence item to inspect the exact retrieved passage.
        </div>
      )}
      <ul className="mt-5 space-y-2">
        {EVIDENCE.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-pressed={selected === entry.id}
              className={`flex w-full items-start gap-3 rounded-[8px] border p-3 text-left transition-colors ${
                selected === entry.id ? "border-[#AE4E24]/60 bg-[#AE4E24]/10" : "border-transparent hover:bg-[#F5F0E8]"
              }`}
            >
              <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#EFE5D8] font-mono text-[10px] font-semibold text-[#8D3F28]">
                {entry.id}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold">{entry.file}</span>
                <span className="mt-0.5 block text-[11px] text-[#8D3F28]">{entry.loc}</span>
                <span className="mt-1.5 inline-flex rounded-[4px] border border-[#D5D2C8] bg-[#F5F0E8] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-[#596170]">
                  {scenario === "masked" ? "MASKED" : "STANDARD"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-[#E5E0D8] pt-3 text-[11px] leading-5 text-[#6B665F]">
        Selecting a citation highlights its sentence and opens the matching passage here.
      </p>
    </>
  );
}

export function LandingView() {
  const [scenario, setScenario] = useState<ScenarioId>("sufficient");
  const [selected, setSelected] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const wsTriggerRef = useRef<HTMLButtonElement>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const active = SCENARIOS.find((entry) => entry.id === scenario) ?? SCENARIOS[0];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (sheetOpen) {
        setSheetOpen(false);
        evidenceTriggerRef.current?.focus();
        return;
      }
      if (wsOpen) {
        setWsOpen(false);
        wsTriggerRef.current?.focus();
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (selected !== null) setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, wsOpen, menuOpen, selected]);

  useEffect(() => {
    if (!menuOpen && !wsOpen) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuOpen && !menuPanelRef.current?.contains(target) && !menuTriggerRef.current?.contains(target)) setMenuOpen(false);
      if (wsOpen && !wsMenuRef.current?.contains(target) && !wsTriggerRef.current?.contains(target)) setWsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen, wsOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  function toggleCitation(id: number) {
    const next = selected === id ? null : id;
    setSelected(next);
    if (next !== null && window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  }

  function selectFromInspector(id: number) {
    setSelected(id);
  }

  function step(delta: number) {
    if (selected === null) return;
    setSelected(Math.min(EVIDENCE.length, Math.max(1, selected + delta)));
  }

  function closeSheet() {
    setSheetOpen(false);
    evidenceTriggerRef.current?.focus();
  }

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const count = SCENARIOS.length;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % count;
    if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = count - 1;
    setScenario(SCENARIOS[next].id);
    tabRefs.current[next]?.focus();
  }

  function scrollToStage(event: ReactMouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const target = document.getElementById("stage");
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }

  return (
    <main className="min-h-screen bg-[#FCFBF8] text-[#0C1427]">
      <header className="sticky top-0 z-40 border-b border-[#E5E0D8] bg-[#FCFBF8]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-3 px-5 sm:px-8">
          <Link href="/" aria-label="Pliny home" className="shrink-0 text-[#0C1427] hover:text-[#8D3F28]">
            <BrandMark className="h-14" textClassName="dm-editorial-display text-[20px] font-semibold" />
          </Link>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-5 whitespace-nowrap text-[12px] font-semibold text-[#394152] xl:flex" aria-label="Main navigation">
            {landingInfoPages.map((page) => (
              <LandingInfoDialog key={page.key} page={page} />
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href="/login" className="text-[13px] font-semibold text-[#8D3F28] hover:text-[#AE4E24]">
              Sign in
            </Link>
            <Link
              href="/access"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[7px] bg-[#0C1427] px-4 text-[13px] font-semibold text-[#FCFBF8] transition-colors hover:bg-[#17213A] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
            >
              Request access
            </Link>
            <button
              ref={menuTriggerRef}
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-[7px] text-[#394152] hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="landing-menu-panel"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
          {menuOpen ? (
            <div
              ref={menuPanelRef}
              id="landing-menu-panel"
              className="absolute right-5 top-14 z-50 grid w-64 gap-1 border border-[#D5D2C8] bg-[#FFFEFA] p-2 shadow-[0_16px_40px_rgba(72,48,31,0.14)] sm:right-8"
            >
              {landingInfoPages.map((page) => (
                <LandingInfoDialog key={page.key} page={page} triggerClassName="w-full px-3 py-2 text-left hover:bg-[#F5F0E8]" />
              ))}
              <Link href="/login" className="px-3 py-2 text-[13px] font-semibold text-[#8D3F28] hover:bg-[#F5F0E8]" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link
                href="/access"
                className="mx-1 mt-1 inline-flex h-10 items-center justify-center rounded-[7px] bg-[#0C1427] text-[13px] font-semibold text-[#FCFBF8] hover:bg-[#17213A]"
                onClick={() => setMenuOpen(false)}
              >
                Request access
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <section className="mx-auto max-w-[900px] px-5 pb-16 pt-16 text-center sm:pb-20 sm:pt-24">
        <h1 className="dm-editorial-display mx-auto max-w-[820px] text-balance text-[clamp(34px,6.6vw,76px)] font-semibold leading-[1.05]">
          Intelligence, traced to its exact source.
        </h1>
        <p className="mx-auto mt-6 max-w-[680px] text-[15px] leading-7 text-[#394152] sm:text-[16px]">
          Pliny parses complex enterprise documents, extracts verifiable evidence, and locks the final answer directly to the original passage. When the available evidence is insufficient, Pliny withholds the answer.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/access"
            className="inline-flex h-11 min-w-[200px] items-center justify-center rounded-[7px] bg-[#0C1427] px-6 text-[14px] font-semibold text-[#FCFBF8] transition-colors hover:bg-[#17213A] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
          >
            Request access
          </Link>
          <a
            href="#stage"
            onClick={scrollToStage}
            className="inline-flex h-11 min-w-[200px] items-center justify-center gap-2 rounded-[7px] border border-[#D5D2C8] bg-[#FFFEFA] px-6 text-[14px] font-semibold text-[#0C1427] transition-colors hover:border-[#BA5C3D]/50 hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
          >
            Explore the workspace
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-5 text-[12px] font-medium text-[#6B665F]">Source-grounded answers · Visible citations · Private workspaces</p>
      </section>

      <section id="stage" tabIndex={-1} aria-label="Pliny application preview, interactive demonstration" className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="overflow-hidden rounded-[10px] border border-[#D5D2C8] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(72,48,31,0.09)]">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E5E0D8] bg-[#FBF8F3] px-4 sm:px-5">
            <span className="flex min-w-0 items-center gap-3">
              <span className="dm-editorial-display text-[17px] font-semibold">Pliny</span>
              <span aria-hidden="true" className="h-4 w-px bg-[#D5D2C8]" />
              <span className="truncate text-[12px] font-medium text-[#6B665F]">Q2 Board Pack</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D5D2C8] bg-[#F5F0E8] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#596170]">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${active.badgeDot}`} />
                {active.badge}
              </span>
              <span aria-hidden="true" className="hidden size-7 rounded-full bg-[#E7DDD0] sm:block" />
            </span>
          </div>

          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_290px]">
            <aside className="hidden border-r border-[#D5D2C8] bg-[#F5F0E8] p-5 lg:block">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Workspace</p>
              <p className="mt-3 text-[14px] font-semibold">Q2 Board Pack</p>
              <p className="mt-1 text-[12px] text-[#6B665F]">12 documents</p>
              <div className="mt-6 space-y-1 text-[13px]">
                <p className="flex items-center gap-2 rounded-[6px] border border-[#D5D2C8] bg-[#FFFEFA] px-3 py-2 font-semibold">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-[#AE4E24]" />
                  Q2 Board Pack
                </p>
                <p className="px-3 py-2 text-[#596170]">Contracts</p>
                <p className="px-3 py-2 text-[#596170]">Market Research</p>
              </div>
              <div className="mt-6 space-y-1 border-t border-[#D5D2C8] pt-4 text-[13px] font-medium">
                <Link href="/dashboard" className="flex items-center justify-between px-3 py-2 text-[#394152] hover:bg-[#EBE1D6] hover:text-[#0C1427]">
                  Upload documents
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
                <Link href="/dashboard" className="flex items-center justify-between px-3 py-2 text-[#394152] hover:bg-[#EBE1D6] hover:text-[#0C1427]">
                  Open library
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-8 text-[11px] leading-5 text-[#6B665F]">A private workspace for source-backed review.</p>
            </aside>

            <div className="min-w-0 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    ref={wsTriggerRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={wsOpen}
                    aria-controls="ws-menu"
                    onClick={() => setWsOpen((open) => !open)}
                    className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#D5D2C8] bg-[#FFFEFA] px-3 text-[12px] font-semibold text-[#394152] hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
                  >
                    Q2 Board Pack · 12 documents
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  </button>
                  {wsOpen ? (
                    <div
                      ref={wsMenuRef}
                      id="ws-menu"
                      role="menu"
                      aria-label="Workspaces"
                      className="absolute left-0 top-10 z-30 grid w-64 gap-1 border border-[#D5D2C8] bg-[#FFFEFA] p-1.5 shadow-[0_16px_40px_rgba(72,48,31,0.14)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        aria-current="true"
                        className="flex items-center justify-between rounded-[6px] px-3 py-2 text-left text-[12px] font-semibold hover:bg-[#F5F0E8]"
                        onClick={() => setWsOpen(false)}
                      >
                        Q2 Board Pack
                        <span className="font-mono text-[10px] font-normal text-[#8A7D70]">synthetic</span>
                      </button>
                      <button type="button" role="menuitem" disabled className="flex items-center justify-between rounded-[6px] px-3 py-2 text-left text-[12px] font-semibold text-[#8A7D70] opacity-70">
                        Contracts
                        <span className="font-mono text-[10px] font-normal">live product</span>
                      </button>
                      <button type="button" role="menuitem" disabled className="flex items-center justify-between rounded-[6px] px-3 py-2 text-left text-[12px] font-semibold text-[#8A7D70] opacity-70">
                        Market Research
                        <span className="font-mono text-[10px] font-normal">live product</span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  ref={evidenceTriggerRef}
                  type="button"
                  className="inline-flex h-9 items-center rounded-[7px] border border-[#D5D2C8] bg-[#FFFEFA] px-3 text-[12px] font-semibold text-[#8D3F28] hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 lg:hidden"
                  aria-expanded={sheetOpen}
                  aria-controls="inspector-sheet"
                  onClick={() => setSheetOpen(true)}
                >
                  Evidence
                </button>
              </div>

              <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Example question</p>
              <h2 className="dm-editorial-display mt-3 text-[26px] font-semibold sm:text-[30px]">What changed operating margin in Q2?</h2>
              <span className="mt-4 inline-flex rounded-full border border-[#D5D2C8] bg-[#F5F0E8] px-3 py-1 text-[11px] font-semibold text-[#8D3F28]">{active.pill}</span>
              <div aria-hidden="true" className="mb-6 mt-6 border-t border-[#E5E0D8]" />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Answer</p>
              <p className="mt-3 flex items-center gap-2 text-[12px] font-medium text-[#596170]" aria-live="polite">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${active.gateDot}`} />
                Evidence gate: {active.gate}
              </p>

              <div role="tablist" aria-label="Example scenario" className="mt-4 inline-flex flex-wrap gap-1 rounded-[8px] border border-[#D5D2C8] bg-[#F5F0E8] p-1">
                {SCENARIOS.map((entry, index) => (
                  <button
                    key={entry.id}
                    ref={(element) => {
                      tabRefs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`tab-${entry.id}`}
                    aria-selected={scenario === entry.id}
                    aria-controls={`panel-${entry.id}`}
                    tabIndex={scenario === entry.id ? 0 : -1}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                    onClick={() => setScenario(entry.id)}
                    className={`rounded-[6px] px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 ${
                      scenario === entry.id ? "border border-[#D5D2C8] bg-[#FFFEFA] text-[#0C1427] shadow-sm" : "border border-transparent text-[#596170] hover:text-[#0C1427]"
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 max-w-[640px] text-[12px] leading-5 text-[#8A7D70]">
                Example scenarios for this synthetic workspace. Switching between them illustrates possible outcomes; it does not change how a real answer is validated.
              </p>

              <div role="tabpanel" id={`panel-${scenario}`} aria-labelledby={`tab-${scenario}`} className="mt-6">
                {scenario === "sufficient" ? (
                  <>
                    <p className="max-w-[720px] text-[15px] leading-7 text-[#394152]">
                      {EVIDENCE.map((entry) => (
                        <span key={entry.id} className={selected === entry.id ? "rounded-[3px] bg-[#AE4E24]/10 px-0.5" : undefined}>
                          {entry.chunk}
                          <button
                            type="button"
                            onClick={() => toggleCitation(entry.id)}
                            aria-label={entry.aria}
                            aria-pressed={selected === entry.id}
                            aria-expanded={selected === entry.id}
                            className={`ml-1 inline-flex size-5 items-center justify-center rounded-[4px] border font-mono text-[11px] align-middle transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25 ${
                              selected === entry.id ? "border-[#AE4E24] bg-[#AE4E24] text-[#FCFBF8]" : "border-[#D5D2C8] bg-[#FFFEFA] text-[#8D3F28] hover:border-[#AE4E24]"
                            }`}
                          >
                            {entry.id}
                          </button>{" "}
                        </span>
                      ))}
                    </p>
                    <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
                      <MarginChart />
                      <div className="border-t border-[#E5E0D8] pt-5 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
                        <h3 className="text-[13px] font-semibold">Key takeaways</h3>
                        <ul className="mt-4 space-y-3">
                          {TAKEAWAYS.map((takeaway) => (
                            <li key={takeaway} className="flex gap-2 text-[12px] leading-5 text-[#596170]">
                              <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#AE4E24]" aria-hidden="true" />
                              <span>{takeaway}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                ) : null}

                {scenario === "refusal" ? (
                  <div className="rounded-[8px] border border-[#D5D2C8] bg-[#FBF8F3] p-5">
                    <h3 className="dm-editorial-display text-[18px] font-semibold">Evidence Insufficient — Generation Withheld</h3>
                    <p className="mt-3 max-w-[680px] text-[14px] leading-6 text-[#394152]">
                      Pliny scanned 12 documents in the Q2 Board Pack workspace. The retrieval engine executed hybrid lexical and semantic search across all indexed chunks. No passage met the minimum evidence-sufficiency threshold required to generate a verifiable answer to this question.
                    </p>
                    <div className="mt-4 rounded-[6px] border border-[#D5D2C8] bg-[#F5F0E8] p-3 font-mono text-[11px] leading-5 tracking-[0.08em] text-[#596170]">
                      <p>RETRIEVAL PATHS: LEXICAL + SEMANTIC</p>
                      <p>CHUNKS EVALUATED: 347</p>
                      <p>ABOVE THRESHOLD: 0</p>
                      <p>DECISION: REFUSE · DO NOT GENERATE</p>
                    </div>
                    <p className="mt-4 max-w-[680px] text-[13px] leading-6 text-[#596170]">
                      This is not an error. Pliny does not fabricate answers when evidence is missing. You can upload additional documents or refine the question.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button type="button" disabled aria-label="Escalate to Human Review — planned capability" className="inline-flex h-10 items-center rounded-[7px] border border-[#D5D2C8] bg-[#F5F0E8] px-4 text-[13px] font-semibold text-[#8A7D70]">Escalate to Human Review</button>
                      <span className="rounded-[4px] border border-[#D5D2C8] bg-[#FFFEFA] px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#8A7D70]">PLANNED</span>
                    </div>
                  </div>
                ) : null}

                {scenario === "masked" ? (
                  <>
                    {/* Masked projection tokens: [FLOAT_MASKED_9A2], [FLOAT_MASKED_4C1], [USD_MASKED_8F9], [USD_MASKED_3D7]. */}
                    <p className="max-w-[720px] text-[15px] leading-7 text-[#394152]">
                      Operating margin improved to <MaskedToken token="[FLOAT_MASKED_9A2]" /> in Q2, driven by productivity gains and lower operating costs. Total operating expenses decreased{" "}
                      <MaskedToken token="[FLOAT_MASKED_4C1]" /> QoQ to <MaskedToken token="[USD_MASKED_8F9]" />. Productivity initiatives delivered{" "}
                      <MaskedToken token="[USD_MASKED_3D7]" /> in annualized savings.
                    </p>
                    <p className="mt-4 max-w-[680px] rounded-[6px] border border-[#D5D2C8] bg-[#F5F0E8] p-3 text-[12px] leading-5 text-[#596170]">
                      Privacy projection active in this scenario. The answer above was generated from HMAC-masked source material. Deterministic identifiers and financial figures were pseudonymised before any content reached the external LLM provider. Original values are retained in your private Supabase storage and are visible only to workspace owners.
                    </p>
                    <div className="mt-4 rounded-[6px] border border-[#D5D2C8] bg-[#FBF8F3] p-3 font-mono text-[11px] leading-5 tracking-[0.08em] text-[#596170]">
                      <p>PROCESSING MODE: PRIVACY-MINIMISED</p>
                      <p>MASKING: DOCUMENT-SCOPED HMAC</p>
                      <p>IDENTIFIERS MASKED: 4</p>
                      <p>PROVIDER PAYLOAD: CLEAN</p>
                      <p>CHART: WITHHELD · PLOTTED VALUES ARE MASKED IN THIS PROJECTION</p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <aside aria-label="Source Inspector" className="hidden border-l border-[#D5D2C8] bg-[#FBF8F3] p-5 lg:block">
              <SourceInspectorBody selected={selected} scenario={scenario} onSelect={selectFromInspector} onStep={step} />
            </aside>
          </div>
        </div>
        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.14em] text-[#8A7D70]">Interactive demonstration · synthetic documents</p>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8" aria-label="Pliny capabilities">
        <div className="grid gap-10 md:grid-cols-3">
          {CAPTIONS.map(([title, body]) => (
            <div key={title}>
              <span aria-hidden="true" className="block h-4 w-px bg-[#D5D2C8]" />
              <h2 className="mt-4 text-[14px] font-semibold">{title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#596170]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#E5E0D8] bg-[#F5F0E8]" aria-label="How Pliny works">
        <div className="mx-auto grid max-w-[1240px] divide-y divide-[#D5D2C8] md:grid-cols-3 md:divide-x md:divide-y-0">
          {STRIP.map(([number, title, body]) => (
            <article key={number} className="px-5 py-8 sm:px-8">
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[#8A7D70]">{number}</p>
              <h2 className="mt-3 text-[14px] font-semibold">{title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#596170]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-8 text-[12px] text-[#6B665F] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Intelligence, traced to its exact source.</p>
        <a
          href="https://github.com/Deepak92939339/Pliny"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-semibold text-[#0C1427] hover:text-[#8D3F28]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M6 8.5v7M18 8.5c0 4-6 3.5-9 5" /></svg>
          View source and technical documentation
        </a>
      </footer>

      {sheetOpen ? (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-[#0C1427]/45 lg:hidden" onClick={closeSheet} />
          <div
            id="inspector-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Source Inspector"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-[14px] border-t border-[#D5D2C8] bg-[#FFFEFA] p-5 pb-8 lg:hidden"
          >
            <div className="flex items-center justify-between">
              <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[#D5D2C8]" />
              <button
                ref={sheetCloseRef}
                type="button"
                onClick={closeSheet}
                aria-label="Close Source Inspector"
                className="inline-flex size-11 items-center justify-center rounded-[7px] text-[#394152] hover:bg-[#F5F0E8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2">
              <SourceInspectorBody selected={selected} scenario={scenario} onSelect={selectFromInspector} onStep={step} />
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
