"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RetrievalReason, SearchChunkResult } from "@/types";

type SourceInspectorProps = {
  onClose: () => void;
  onSelectSource: (source: SearchChunkResult) => void;
  retrievalReason?: RetrievalReason;
  selectedSource?: SearchChunkResult | null;
  selectedSourceIndex: number;
  sources: SearchChunkResult[];
  workspaceName?: string | null;
};

type SourceSheetProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  retrievalReason?: RetrievalReason;
  selectedSource?: SearchChunkResult | null;
  workspaceName?: string | null;
};

const sourceTextStyle = {
  fontFamily: 'var(--font-serif, Georgia, "Times New Roman", serif)',
};

const highlightMetadataKeys = ["matchedText", "matched_text", "quote", "quotedText", "excerpt", "snippet", "highlight"];

function getMetadataNumber(metadata: SearchChunkResult["metadata"], key: string) {
  const value = metadata?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMetadataString(metadata: SearchChunkResult["metadata"], key: string) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatSpreadsheetLocation(source: SearchChunkResult) {
  const sheetName = getMetadataString(source.metadata, "sheetName");
  const rowStart = getMetadataNumber(source.metadata, "rowStart");
  const rowEnd = getMetadataNumber(source.metadata, "rowEnd");

  if (!sheetName || rowStart === null || rowEnd === null) {
    return null;
  }

  return `Sheet: ${sheetName} · Rows ${rowStart}–${rowEnd}`;
}

function normalizeSourceLocationLabel(label: string) {
  return label.replace(/(Rows\s+\d+)-(\d+)/, "$1–$2");
}

function getSourceLocationLabel(source?: SearchChunkResult | null) {
  if (!source) {
    return "Location unavailable";
  }

  const spreadsheetLocation = formatSpreadsheetLocation(source);

  if (spreadsheetLocation) {
    return spreadsheetLocation;
  }

  if (source.locationLabel && source.locationLabel !== "Source passage") {
    return normalizeSourceLocationLabel(source.locationLabel);
  }

  if (source.pageNumber > 0) {
    return `Page ${source.pageNumber}`;
  }

  if (source.chunkIndex >= 0) {
    return `Chunk ${source.chunkIndex + 1}`;
  }

  return "Location unavailable";
}

function getMatchedPassage(source: SearchChunkResult) {
  const metadata = source.metadata ?? {};
  const content = getSourceContent(source);

  for (const key of highlightMetadataKeys) {
    const value = metadata[key];

    if (typeof value === "string") {
      const passage = value.trim();

      if (passage.length > 0 && content.includes(passage)) {
        return passage;
      }
    }
  }

  return null;
}

function getSourceFilename(source?: SearchChunkResult | null) {
  return typeof source?.filename === "string" && source.filename.trim().length > 0 ? source.filename.trim() : "No source selected";
}

function getSourceContent(source: SearchChunkResult) {
  return typeof source.content === "string" ? source.content : "";
}

function getRetrievalLabel(retrievalReason?: RetrievalReason) {
  switch (retrievalReason) {
    case "direct_keyword_match":
      return "document keyword search";
    case "semantic_match":
      return "semantic document search";
    case "hybrid_match":
      return "hybrid document search";
    case "broad_context_fallback":
      return "broad document context";
    case "no_chunks_found":
    case undefined:
      return "document search";
  }
}

function renderHighlightedText(text: string, highlight: string | null) {
  if (!highlight || !text.includes(highlight)) {
    return text;
  }

  const parts = text.split(highlight);

  return parts.map((part, index) => (
    <span key={`${part.slice(0, 18)}-${index}`}>
      {part}
      {index < parts.length - 1 ? (
        <mark className="box-decoration-clone rounded-[var(--radius-xs)] bg-[var(--accent-soft)] px-0.5 text-[var(--accent-ink)] font-medium">{highlight}</mark>
      ) : null}
    </span>
  ));
}

function SourceText({ source }: { source: SearchChunkResult }) {
  const highlight = getMatchedPassage(source);
  const paragraphs = getSourceContent(source).split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  if (paragraphs.length === 0) {
    return <p className="text-[length:var(--text-sm)] leading-7 text-[var(--ink-500)]">No source text available.</p>;
  }

  return (
    <div className="space-y-4 text-[16px] leading-[1.7] text-[var(--ink-900)]" style={sourceTextStyle}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph.slice(0, 28)}-${index}`} className="whitespace-pre-wrap">
          {renderHighlightedText(paragraph, highlight)}
        </p>
      ))}
    </div>
  );
}

function SourceMetadata({
  retrievalReason,
  workspaceName,
}: {
  retrievalReason?: RetrievalReason;
  workspaceName?: string | null;
}) {
  return (
    <div className="space-y-1 border-t border-[var(--rule)] pt-4 text-[length:var(--text-2xs)] leading-5 text-[var(--ink-500)]">
      {workspaceName ? (
        <p>
          <span className="text-[var(--ink-700)]">From:</span> {workspaceName}
        </p>
      ) : null}
      <p>
        <span className="text-[var(--ink-700)]">Retrieved by:</span> {getRetrievalLabel(retrievalReason)}
      </p>
    </div>
  );
}

function SourceNavigation({
  onSelectSource,
  selectedSourceIndex,
  sources,
}: {
  onSelectSource: (source: SearchChunkResult) => void;
  selectedSourceIndex: number;
  sources: SearchChunkResult[];
}) {
  const totalSources = sources.length;

  if (totalSources <= 1) {
    return <p className="text-center text-[length:var(--text-2xs)] text-[var(--ink-500)]">1 of 1 source</p>;
  }

  const canGoPrevious = selectedSourceIndex > 0;
  const canGoNext = selectedSourceIndex < totalSources - 1;

  return (
    <div className="grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-3 text-[length:var(--text-xs)]">
      <button
        type="button"
        disabled={!canGoPrevious}
        onClick={() => {
          if (canGoPrevious) {
            onSelectSource(sources[selectedSourceIndex - 1]);
          }
        }}
        className="inline-flex min-h-8 items-center gap-1 justify-self-start rounded-[var(--radius-sm)] px-2 py-1 text-[var(--ink-500)] hover:bg-[var(--paper-1)] hover:text-[var(--ink-900)] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        Previous source
      </button>
      <span className="text-[length:var(--text-2xs)] text-[var(--ink-500)]">
        {selectedSourceIndex + 1} of {totalSources} sources
      </span>
      <button
        type="button"
        disabled={!canGoNext}
        onClick={() => {
          if (canGoNext) {
            onSelectSource(sources[selectedSourceIndex + 1]);
          }
        }}
        className="inline-flex min-h-8 items-center gap-1 justify-self-end rounded-[var(--radius-sm)] px-2 py-1 text-[var(--ink-500)] hover:bg-[var(--paper-1)] hover:text-[var(--ink-900)] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        Next source
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function SourceInspector({
  onClose,
  onSelectSource,
  retrievalReason,
  selectedSource,
  selectedSourceIndex,
  sources,
  workspaceName,
}: SourceInspectorProps) {
  const safeSelectedIndex = selectedSource ? Math.min(Math.max(selectedSourceIndex, 0), Math.max(sources.length - 1, 0)) : -1;
  const selectedFilename = getSourceFilename(selectedSource);
  const selectedLocation = getSourceLocationLabel(selectedSource);

  return (
    <aside className="hidden h-full min-h-0 w-[360px] shrink-0 flex-col border-l border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink-900)] min-[900px]:flex xl:w-[420px]">
      <header className="shrink-0 border-b border-[var(--rule)] px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[length:var(--text-xs)] font-medium text-[var(--ink-900)]">Source</h2>
          <button
            type="button"
            aria-label="Close source inspector"
            onClick={onClose}
            className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-500)] hover:bg-[var(--paper-1)] hover:text-[var(--ink-900)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-[length:var(--text-xs)] font-medium text-[var(--ink-900)]" title={selectedFilename}>
            {selectedFilename}
          </p>
          <p className="mt-1 truncate text-[length:var(--text-2xs)] text-[var(--ink-500)]" title={selectedLocation}>
            {selectedLocation}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedSource ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-[length:var(--text-xs)] text-[var(--ink-500)]">Select a citation to inspect its source</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col gap-5">
            <section className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--paper-1)] p-4 shadow-[var(--shadow-1)]">
              <p className="mb-3 text-[length:var(--text-2xs)] font-semibold uppercase tracking-widest text-[var(--ink-500)]">
                Retrieved passage
              </p>
              <SourceText source={selectedSource} />
            </section>

            <div className="border-t border-[var(--rule)] pt-3">
              <SourceNavigation
                selectedSourceIndex={safeSelectedIndex}
                sources={sources.length > 0 ? sources : [selectedSource]}
                onSelectSource={onSelectSource}
              />
            </div>

            <div className="mt-auto">
              <SourceMetadata retrievalReason={retrievalReason} workspaceName={workspaceName} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function SourceSheet({ onOpenChange, open, retrievalReason, selectedSource, workspaceName }: SourceSheetProps) {
  const selectedFilename = getSourceFilename(selectedSource);
  const selectedLocation = getSourceLocationLabel(selectedSource);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[86vh] gap-0 rounded-t-[var(--radius-xl)] border-[var(--rule)] bg-[var(--paper-2)] p-0 text-[var(--ink-900)] shadow-[var(--shadow-3)] min-[900px]:hidden"
      >
        <SheetHeader className="border-b border-[var(--rule)] p-4 pr-12 text-left">
          <SheetTitle className="text-[length:var(--text-xs)] font-medium text-[var(--ink-900)]">Source</SheetTitle>
          <SheetDescription className="space-y-1">
            <span className="block truncate text-[length:var(--text-xs)] font-medium text-[var(--ink-900)]" title={selectedFilename}>
              {selectedFilename}
            </span>
            <span className="block text-[length:var(--text-2xs)] text-[var(--ink-500)]" title={selectedLocation}>
              {selectedLocation}
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto p-4">
          {selectedSource ? (
            <div className="space-y-5">
              <section className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--paper-1)] p-4 shadow-[var(--shadow-1)]">
                <p className="mb-3 text-[length:var(--text-2xs)] font-semibold uppercase tracking-widest text-[var(--ink-500)]">
                  Retrieved passage
                </p>
                <SourceText source={selectedSource} />
              </section>
              <SourceMetadata retrievalReason={retrievalReason} workspaceName={workspaceName} />
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center text-center">
              <p className="text-[length:var(--text-xs)] text-[var(--ink-500)]">Select a citation to inspect its source</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
