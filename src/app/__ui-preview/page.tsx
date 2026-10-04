"use client";

import { notFound, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DashboardLoadingView } from "@/components/dashboard/DashboardLoadingView";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";
import { SourceInspector } from "@/components/workspace/SourceInspector";
import { ChartBlock } from "@/components/chart/ChartBlock";
import { BrandMark } from "@/components/shared/BrandMark";
import type {
  CollectionListItem,
  DocumentListItem,
  WorkspaceSearchResult,
  SearchChunkResult,
  ChatCitation,
} from "@/types";
import type { ChartData } from "@/lib/chart/types";

export const dynamic = "force-dynamic";

function UiPreviewContent() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") as
    | "dashboard"
    | "workspace"
    | "refusal"
    | "inspector"
    | "chart"
    | null;

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "workspace" | "refusal" | "inspector" | "chart"
  >(tabParam && ["dashboard", "workspace", "refusal", "inspector", "chart"].includes(tabParam) ? tabParam : "workspace");

  useEffect(() => {
    if (tabParam && ["dashboard", "workspace", "refusal", "inspector", "chart"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const setTab = (tab: "dashboard" | "workspace" | "refusal" | "inspector" | "chart") => {
    setActiveTab(tab);
    router.replace(`/__ui-preview?tab=${tab}`);
  };

  const syntheticCollections: CollectionListItem[] = [
    {
      id: "coll-1",
      name: "Q3 Strategic Audit",
      description: "Financial performance, operating margins and risk register.",
      documentCount: 4,
      defaultProcessingMode: "standard",
      createdAt: "2026-09-15T10:00:00.000Z",
      updatedAt: "2026-09-28T14:30:00.000Z",
    },
    {
      id: "coll-2",
      name: "Personnel & Security Roster",
      description: "Employee records and access ledger.",
      documentCount: 2,
      defaultProcessingMode: "privacy_minimised",
      createdAt: "2026-09-20T08:00:00.000Z",
      updatedAt: "2026-09-29T11:15:00.000Z",
    },
  ];

  const syntheticDocuments: DocumentListItem[] = [
    {
      id: "doc-1",
      collectionId: "coll-1",
      filename: "financial-performance-q3.pdf",
      storagePath: "coll-1/financial-performance-q3.pdf",
      pageCount: 14,
      fileSize: 1048576,
      status: "ready",
      processingStage: null,
      errorMessage: null,
      processingMode: "standard",
      createdAt: "2026-09-28T10:00:00.000Z",
    },
    {
      id: "doc-2",
      collectionId: "coll-1",
      filename: "scanned-contract-appendix.pdf",
      storagePath: "coll-1/scanned-contract-appendix.pdf",
      pageCount: 6,
      fileSize: 3145728,
      status: "processing",
      processingStage: "ocr_fallback",
      errorMessage: null,
      processingMode: "standard",
      createdAt: "2026-09-30T09:00:00.000Z",
    },
    {
      id: "doc-3",
      collectionId: "coll-1",
      filename: "incident-ledger-2026.csv",
      storagePath: "coll-1/incident-ledger-2026.csv",
      pageCount: 1,
      fileSize: 524288,
      status: "failed",
      processingStage: "failed",
      errorMessage: "Processing timed out. Retry this document.",
      processingMode: "standard",
      createdAt: "2026-09-30T08:30:00.000Z",
    },
  ];

  const chunk1: SearchChunkResult = {
    id: "chunk-1",
    documentId: "doc-1",
    collectionId: "coll-1",
    filename: "financial-performance-q3.pdf",
    pageNumber: 4,
    chunkIndex: 0,
    fileKind: "pdf",
    locationLabel: "Page 4 · Executive Summary",
    content:
      "Operating margin expanded to 18.7% in Q3 2026, driven by recurring SaaS leverage and improved cloud infrastructure efficiency. Total gross profit reached $88.2M against revenues of $142.1M.",
    relevanceScore: 0.94,
    fusionScore: 0.94,
    retrievalMode: "hybrid",
  };

  const chunk2: SearchChunkResult = {
    id: "chunk-2",
    documentId: "doc-1",
    collectionId: "coll-1",
    filename: "financial-performance-q3.pdf",
    pageNumber: 7,
    chunkIndex: 1,
    fileKind: "pdf",
    locationLabel: "Page 7 · Divisional Contribution",
    content:
      "Enterprise Platform delivered $42.6M in operating contribution, up 22% year-over-year. International business units contributed $18.4M while consumer segments remained flat.",
    relevanceScore: 0.89,
    fusionScore: 0.89,
    retrievalMode: "hybrid",
  };

  const syntheticSources: SearchChunkResult[] = [chunk1, chunk2];

  const citation1: ChatCitation = {
    id: "cite-1",
    marker: "[[s.1]]",
    pageNumber: 4,
    chunkId: "chunk-1",
    documentId: "doc-1",
    filename: "financial-performance-q3.pdf",
    locationLabel: "Page 4",
    source: chunk1,
  };

  const citation2: ChatCitation = {
    id: "cite-2",
    marker: "[[s.2]]",
    pageNumber: 7,
    chunkId: "chunk-2",
    documentId: "doc-1",
    filename: "financial-performance-q3.pdf",
    locationLabel: "Page 7",
    source: chunk2,
  };

  const syntheticMessagesAnswer: WorkspaceSearchResult[] = [
    {
      id: "msg-1",
      collectionId: "coll-1",
      question: "What was the operating margin trend in Q3 and which division led profitability?",
      answer:
        "The operating margin reached 18.7% in Q3 2026, marking a 3.4 percentage point expansion over the previous quarter [[s.1]]. Enterprise Platform services led divisional profitability with an operating contribution of $42.6M [[s.2]].",
      status: "answered",
      citations: [citation1, citation2],
      sources: syntheticSources,
      retrievalReason: "hybrid_match",
      createdAt: "2026-09-30T09:05:00.000Z",
      metadata: {
        maxOutputTokens: 1024,
        model: "openai/gpt-6-luna",
        modelReason: "standard_grounded_answer",
        retrievalReason: "hybrid_match",
        evidenceStatus: "strong",
      },
    },
  ];

  const syntheticMessagesRefusal: WorkspaceSearchResult[] = [
    {
      id: "msg-2",
      collectionId: "coll-1",
      question: "What is the confidential CEO compensation package for 2027?",
      answer:
        "I don't have sufficient evidence in the uploaded documents to answer this question. The provided records cover Q3 2026 operating performance and historical incident logs, but do not contain 2027 executive compensation terms.",
      status: "insufficient_evidence",
      reason: "No evidence matching query found in collection documents",
      missingEvidence: ["2027 executive compensation contract", "Board compensation minutes"],
      closestMatches: [chunk1],
      citations: [],
      sources: [],
      retrievalReason: "no_chunks_found",
      createdAt: "2026-09-30T09:10:00.000Z",
      metadata: {
        maxOutputTokens: 1024,
        model: "openai/gpt-6-luna",
        modelReason: "honest_refusal",
        retrievalReason: "no_chunks_found",
        evidenceStatus: "none",
      },
    },
  ];

  const syntheticChartData: ChartData = {
    type: "line",
    title: "Operating margin trend (% of revenue)",
    xKey: "quarter",
    yAxisLabel: "%",
    series: [
      { key: "margin", label: "Operating Margin %", color: "primary" },
    ],
    data: [
      { quarter: "Q3 25", margin: 14.2 },
      { quarter: "Q4 25", margin: 15.8 },
      { quarter: "Q1 26", margin: 15.1 },
      { quarter: "Q2 26", margin: 15.3 },
      { quarter: "Q3 26", margin: 18.7 },
    ],
    insight: "Sustained leverage driven by recurring SaaS gross margins.",
  };

  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);

  return (
    <div className="min-h-screen bg-[var(--paper-0)] text-[var(--ink-900)]">
      {/* Dev-only harness toolbar */}
      <header data-harness className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-strong)] bg-[var(--paper-1)] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <BrandMark markClassName="size-6" textClassName="text-sm font-semibold" />
          <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-ink)]">
            UI PREVIEW HARNESS (DEV ONLY)
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setTab("workspace")}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              activeTab === "workspace" ? "bg-[var(--ink-900)] text-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]"
            }`}
          >
            Workspace & Docs
          </button>
          <button
            onClick={() => setTab("refusal")}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              activeTab === "refusal" ? "bg-[var(--ink-900)] text-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]"
            }`}
          >
            Refusal State
          </button>
          <button
            onClick={() => setTab("inspector")}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              activeTab === "inspector" ? "bg-[var(--ink-900)] text-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]"
            }`}
          >
            Source Inspector
          </button>
          <button
            onClick={() => setTab("chart")}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              activeTab === "chart" ? "bg-[var(--ink-900)] text-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]"
            }`}
          >
            Chart Block
          </button>
          <button
            onClick={() => setTab("dashboard")}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              activeTab === "dashboard" ? "bg-[var(--ink-900)] text-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]"
            }`}
          >
            Dashboard
          </button>
        </nav>
      </header>

      {/* Render active section */}
      <main className="p-0">
        {activeTab === "dashboard" && (
          searchParams.get("state") === "loading" ? <DashboardLoadingView /> : <DashboardView
            userEmail="qa.analyst@example.test"
            collections={searchParams.get("state") === "empty" || searchParams.get("state") === "error" ? [] : searchParams.get("state") === "long" ? [
              { ...syntheticCollections[0], name: "PLINY-QA-SYNTHETIC-20261004T120000Z-PRIVATE-OPERATIONS-AND-COMPLIANCE", documentCount: 0 },
              { ...syntheticCollections[1], name: "International Customer Operations — Evidence Review and Source Verification Workspace" },
            ] : syntheticCollections}
            collectionsError={searchParams.get("state") === "error" ? "Synthetic workspace-list failure." : null}
          />
        )}

        {activeTab === "workspace" && (
          <WorkspaceView
            userEmail="qa.analyst@example.test"
            userId="user-synthetic-1"
            collection={syntheticCollections[0]}
            collections={syntheticCollections}
            documents={searchParams.get("state") === "no-documents" ? [] : syntheticDocuments}
            initialMessages={searchParams.get("state") ? [] : syntheticMessagesAnswer}
          />
        )}

        {activeTab === "refusal" && (
          <WorkspaceView
            userEmail="qa.analyst@example.test"
            userId="user-synthetic-1"
            collection={syntheticCollections[0]}
            collections={syntheticCollections}
            documents={syntheticDocuments}
            initialMessages={syntheticMessagesRefusal}
          />
        )}

        {activeTab === "inspector" && (
          <div className="flex h-[calc(100vh-45px)]">
            <div className="min-w-0 flex-1 overflow-auto p-8">
              <h2 className="mb-4 text-xl font-semibold">Active Conversation With Source Selection</h2>
              <p className="mb-6 max-w-xl text-sm text-[var(--ink-700)]">
                Clicking citation <span className="font-semibold text-[var(--accent-ink)]">[[s.1]]</span> opens the Source Inspector panel alongside the conversation without obscuring the reading column.
              </p>
              <div className="max-w-2xl rounded-xl border border-[var(--rule)] bg-[var(--paper-1)] p-6 shadow-sm">
                <p className="text-base leading-relaxed">
                  The operating margin reached 18.7% in Q3 2026, marking a 3.4 percentage point expansion over the previous quarter{" "}
                  <span className="inline-flex items-center rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-ink)]">
                    s.1
                  </span>
                  .
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 min-[900px]:block">
              <SourceInspector
                sources={syntheticSources}
                selectedSourceIndex={selectedSourceIndex}
                selectedSource={syntheticSources[selectedSourceIndex]}
                onSelectSource={(source) => {
                  const idx = syntheticSources.findIndex((s) => s.id === source.id);
                  if (idx >= 0) setSelectedSourceIndex(idx);
                }}
                onClose={() => {}}
                workspaceName="Q3 Strategic Audit"
                retrievalReason="hybrid_match"
              />
            </div>
          </div>
        )}

        {activeTab === "chart" && (
          <div className="mx-auto max-w-3xl p-8">
            <h2 className="mb-2 text-2xl font-semibold">Operating Margin Quarterly Trend</h2>
            <p className="mb-6 text-sm text-[var(--ink-700)]">Quarterly percentage performance synthesized from financial disclosures.</p>
            <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper-1)] p-6 shadow-sm">
              <ChartBlock chart={syntheticChartData} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function UiPreviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--ink-500)]">Loading UI Preview...</div>}>
      <UiPreviewContent />
    </Suspense>
  );
}
