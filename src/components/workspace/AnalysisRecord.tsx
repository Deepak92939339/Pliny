"use client";

import { useState } from "react";
import { ChartBlock } from "@/components/chart/ChartBlock";
import { InsufficientEvidence } from "@/components/workspace/InsufficientEvidence";
import { RiskEvidenceReportPreview } from "@/components/workspace/RiskEvidenceReportPreview";
import { parseResponseWithCharts } from "@/lib/chart/parseResponseWithCharts";
import { downloadMarkdownFile, openPrintReport } from "@/lib/export/browserReportExport";
import {
  buildReportForTemplate,
  formatAnswerWithCitations,
  formatGeneratedReportMarkdown,
  getReportMarkdownFilename,
  isSourceSupportedResult,
} from "@/lib/export/reportExport";
import { cn } from "@/lib/utils";
import type { ChatCitation, ReportTemplate, SearchChunkResult, WorkspaceSearchResult } from "@/types";

type AnalysisRecordProps = {
  result: WorkspaceSearchResult;
  selectedSourceId?: string;
  onSelectSource: (source: SearchChunkResult) => void;
  workspaceName?: string;
};

const inlinePattern = /(\[\[(?:s|p)\.\d+\]\]|\*\*[^*]+\*\*|`[^`\n]+`)/g;

type AnswerBlock =
  | {
      level: 1 | 2 | 3;
      text: string;
      type: "heading";
    }
  | {
      lines: string[];
      type: "paragraph";
    }
  | {
      items: string[];
      type: "bulleted-list" | "numbered-list";
    };

type CopyStatus = "idle" | "copied" | "failed";

const professionalReportTemplates: Array<{ label: string; template: ReportTemplate }> = [
  { label: "Cited answer report", template: "cited_answer" },
  { label: "Due diligence summary", template: "due_diligence_summary" },
  { label: "Risk report", template: "risk_report" },
  { label: "Table summary", template: "table_summary" },
];

export function AnalysisRecord({ result, selectedSourceId, onSelectSource, workspaceName = "Workspace" }: AnalysisRecordProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [reportCopyStatus, setReportCopyStatus] = useState<CopyStatus>("idle");
  const [printError, setPrintError] = useState(false);
  const hasAnswer = result.status === "answered" && typeof result.answer === "string" && result.answer.trim().length > 0;
  const hasSourceSupport = result.status === "answered" && isSourceSupportedResult(result);
  const riskReport = hasSourceSupport ? buildReportForTemplate("risk_report", { result, workspaceName }) : null;

  async function handleCopyWithCitations() {
    setCopyStatus("idle");

    try {
      await navigator.clipboard.writeText(formatAnswerWithCitations(result));
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("failed");
    }
  }

  function handleExportMarkdown() {
    const report = buildReportForTemplate("cited_answer", { result, workspaceName });
    downloadMarkdownFile(getReportMarkdownFilename(report), formatGeneratedReportMarkdown(report));
  }

  async function handleCopyReportMarkdown() {
    setReportCopyStatus("idle");

    try {
      const report = buildReportForTemplate("cited_answer", { result, workspaceName });
      await navigator.clipboard.writeText(formatGeneratedReportMarkdown(report));
      setReportCopyStatus("copied");
      window.setTimeout(() => setReportCopyStatus("idle"), 1800);
    } catch {
      setReportCopyStatus("failed");
    }
  }

  function handleDownloadReport(template: ReportTemplate) {
    if (template !== "cited_answer" && !hasSourceSupport) {
      return;
    }

    const report = buildReportForTemplate(template, { result, workspaceName });
    downloadMarkdownFile(getReportMarkdownFilename(report), formatGeneratedReportMarkdown(report));
  }

  function handleOpenPrintReport() {
    setPrintError(false);

    const report = buildReportForTemplate("cited_answer", { result, workspaceName });
    const didOpen = openPrintReport(report);

    if (!didOpen) {
      setPrintError(true);
    }
  }

  return (
    <article className="space-y-6">
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl border border-[#D9CBBB] bg-[#EFE5D8] px-4 py-3 text-[15px] leading-6 text-[color:var(--editorial-ink)] shadow-[0_8px_22px_rgba(72,48,31,0.05)]">
          {result.question}
        </div>
      </div>

      <div className="max-w-full text-[15px] leading-7 text-[color:var(--editorial-ink-soft)] md:text-base">
        {result.status === "insufficient_evidence" ? (
          <InsufficientEvidence
            closestMatches={result.closestMatches}
            missingEvidence={result.missingEvidence}
            reason={result.reason}
          />
        ) : (
          <AnswerText
            answer={result.answer}
            citations={result.citations}
            sources={result.sources}
            selectedSourceId={selectedSourceId}
            onSelectSource={onSelectSource}
          />
        )}
        {riskReport?.artifact ? <RiskEvidenceReportPreview artifact={riskReport.artifact} /> : null}
        {hasAnswer ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--editorial-border-soft)] pt-3 text-[12px]">
            <button
              type="button"
              onClick={handleCopyWithCitations}
              className="rounded-md border border-[#D9CBBB] bg-[#FBF8F3] px-2.5 py-1 font-medium text-[#8F3F28] transition-colors hover:border-[#BA5C3D]/45 hover:bg-[#EFE5D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
            >
              {copyStatus === "copied" ? "Copied" : "Copy answer with citations"}
            </button>
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 py-1 font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
            >
              Export Markdown
            </button>
            <button
              type="button"
              onClick={handleCopyReportMarkdown}
              className="rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 py-1 font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
            >
              {reportCopyStatus === "copied" ? "Report copied" : "Copy report Markdown"}
            </button>
            <button
              type="button"
              onClick={handleOpenPrintReport}
              className="rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 py-1 font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
            >
              Open print report
            </button>
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 py-1 font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25">
                Reports
              </summary>
              <div className="absolute left-0 top-8 z-20 grid min-w-56 gap-1 rounded-lg border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] p-1.5 shadow-lg shadow-[rgba(72,48,31,0.08)]">
                {professionalReportTemplates.map((item) => {
                  const isDisabled = item.template !== "cited_answer" && !hasSourceSupport;

                  return (
                    <button
                      key={item.template}
                      type="button"
                      disabled={isDisabled}
                      title={isDisabled ? "This report needs a cited, source-supported answer." : undefined}
                      onClick={() => handleDownloadReport(item.template)}
                      className="rounded-md px-2.5 py-2 text-left text-xs font-medium text-[color:var(--editorial-ink)] transition-colors hover:bg-[var(--editorial-panel)] disabled:cursor-not-allowed disabled:text-[color:var(--editorial-muted)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </details>
            {copyStatus === "failed" ? <span className="text-[#9A5A3E]">Copy failed</span> : null}
            {reportCopyStatus === "failed" ? <span className="text-[#9A5A3E]">Report copy failed</span> : null}
            {printError ? <span className="text-[#9A5A3E]">Print window was blocked</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AnswerText({
  answer,
  citations,
  onSelectSource,
  selectedSourceId,
  sources,
}: {
  answer: string;
  citations: ChatCitation[];
  onSelectSource: (source: SearchChunkResult) => void;
  selectedSourceId?: string;
  sources: SearchChunkResult[];
}) {
  const safeAnswer = typeof answer === "string" ? answer : "";
  const safeCitations = Array.isArray(citations) ? citations : [];
  const segments = parseResponseWithCharts(safeAnswer, {
    allowedSourceRefs: sources.map((_, index) => `s.${index + 1}`),
  });

  if (segments.length === 0) {
    return <p>No answer returned.</p>;
  }

  return (
    <div className="space-y-5">
      {segments.map((segment, segmentIndex) => {
        if (segment.type === "chart") {
          return <ChartBlock key={`chart-${segmentIndex}-${segment.data.title}`} chart={segment.data} />;
        }

        if (segment.type === "chart-error") {
          return (
            <p key={`chart-error-${segmentIndex}`} className="text-[12px] leading-5 text-[color:var(--editorial-muted)]">
              A chart could not be rendered.
            </p>
          );
        }

        const blocks = parseAnswerBlocks(segment.content);

        return blocks.map((block, blockIndex) =>
          renderAnswerBlock(block, `${segmentIndex}-${blockIndex}`, safeCitations, selectedSourceId, onSelectSource)
        );
      })}
    </div>
  );
}

function normalizeAnswerText(answer: string) {
  return answer
    .replace(/\r\n/g, "\n")
    .replace(/([?!])(?=[A-Z])/g, "$1 ")
    .replace(/(\]\])(?=[A-Za-z0-9])/g, "$1 ")
    .replace(/([a-z0-9])(?=\[\[(?:s|p)\.\d+\]\])/gi, "$1 ");
}

function parseAnswerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const paragraphLines: string[] = [];
  let activeList: Extract<AnswerBlock, { items: string[] }> | null = null;
  const normalizedAnswer = normalizeAnswerText(answer);

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      lines: [...paragraphLines],
      type: "paragraph",
    });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!activeList) {
      return;
    }

    blocks.push(activeList);
    activeList = null;
  }

  for (const rawLine of normalizedAnswer.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
        type: "heading",
      });
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);

    if (bulletMatch) {
      flushParagraph();

      if (activeList?.type !== "bulleted-list") {
        flushList();
        activeList = {
          items: [],
          type: "bulleted-list",
        };
      }

      activeList.items.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

    if (numberedMatch) {
      flushParagraph();

      if (activeList?.type !== "numbered-list") {
        flushList();
        activeList = {
          items: [],
          type: "numbered-list",
        };
      }

      activeList.items.push(numberedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderAnswerBlock(
  block: AnswerBlock,
  index: string,
  citations: ChatCitation[],
  selectedSourceId: string | undefined,
  onSelectSource: (source: SearchChunkResult) => void
) {
  if (block.type === "heading") {
    return (
      <h3
        key={`${block.text.slice(0, 24)}-${index}`}
        className={cn(
          "pt-1 font-semibold leading-7 text-[color:var(--editorial-ink)]",
          block.level === 1 && "text-[17px]",
          block.level === 2 && "text-base",
          block.level === 3 && "text-[15px]"
        )}
      >
        {renderInlineContent(block.text, citations, selectedSourceId, onSelectSource)}
      </h3>
    );
  }

  if (block.type === "bulleted-list") {
    return (
      <ul key={`ul-${index}`} className="list-disc space-y-2.5 pl-5 text-[color:var(--editorial-ink-soft)] marker:text-[color:var(--editorial-muted)]">
        {block.items.map((item, itemIndex) => (
          <li key={`${item.slice(0, 20)}-${itemIndex}`} className="pl-1 leading-7">
            {renderInlineContent(item, citations, selectedSourceId, onSelectSource)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "numbered-list") {
    return (
      <ol key={`ol-${index}`} className="list-decimal space-y-2.5 pl-5 text-[color:var(--editorial-ink-soft)] marker:text-[color:var(--editorial-muted)]">
        {block.items.map((item, itemIndex) => (
          <li key={`${item.slice(0, 20)}-${itemIndex}`} className="pl-1 leading-7">
            {renderInlineContent(item, citations, selectedSourceId, onSelectSource)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "paragraph") {
    const paragraph = block.lines.join("\n");

    return (
      <p key={`${paragraph.slice(0, 24)}-${index}`} className="whitespace-pre-wrap leading-7 text-[color:var(--editorial-ink-soft)]">
        {renderInlineContent(paragraph, citations, selectedSourceId, onSelectSource)}
      </p>
    );
  }

  return null;
}

function renderInlineContent(
  text: string,
  citations: ChatCitation[],
  selectedSourceId: string | undefined,
  onSelectSource: (source: SearchChunkResult) => void
) {
  return text.split(inlinePattern).map((segment, index) => {
    const citation = citations.find((item) => isUsableCitation(item) && item.marker === segment);

    if (citation) {
      const isSelected = citation.source.id === selectedSourceId;

      return (
        <button
          key={`${citation.id}-${citation.chunkId}-${index}`}
          type="button"
          onClick={() => onSelectSource(citation.source)}
          className={cn(
            "mx-0.5 inline-flex -translate-y-px items-center rounded-full border px-1.5 py-[1px] text-[11px] font-medium leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25",
            isSelected
              ? "border-[#BA5C3D]/45 bg-[#EFE5D8] text-[#8F3F28]"
              : "border-[#D9CBBB] bg-[#EFE5D8] text-[#8F3F28] hover:border-[#BA5C3D]/45 hover:bg-[#E7DDD0]"
          )}
          title={getCitationTitle(citation)}
        >
          {getCitationLabel(citation)}
        </button>
      );
    }

    if (segment.startsWith("**") && segment.endsWith("**")) {
      const strongText = segment.slice(2, -2).trim();

      return (
        <strong key={`${strongText}-${index}`} className="font-semibold text-[color:var(--editorial-ink)]">
          {renderInlineContent(strongText, citations, selectedSourceId, onSelectSource)}
        </strong>
      );
    }

    if (segment.startsWith("`") && segment.endsWith("`")) {
      const codeText = segment.slice(1, -1).trim();

      return (
        <code
          key={`${codeText}-${index}`}
          className="rounded-[5px] border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-panel)] px-1 py-0.5 font-mono text-[0.88em] text-[color:var(--editorial-ink)]"
        >
          {codeText}
        </code>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function truncateLabel(value: string, maxLength: number) {
  const safeValue = typeof value === "string" ? value : "";

  if (!safeValue) {
    return "";
  }

  if (safeValue.length <= maxLength) {
    return safeValue;
  }

  return `${safeValue.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getFilenameLabel(filename: string) {
  const safeFilename = typeof filename === "string" && filename.trim().length > 0 ? filename.trim() : "Source";
  const dotIndex = safeFilename.lastIndexOf(".");
  const base = dotIndex > 0 ? safeFilename.slice(0, dotIndex) : safeFilename;
  const extension = dotIndex > 0 ? safeFilename.slice(dotIndex + 1).toLowerCase() : "";

  if (extension === "xlsx" || extension === "xls" || extension === "csv") {
    return truncateLabel(filename, 24);
  }

  return truncateLabel(base, 24);
}

function getShortLocationLabel(citation: ChatCitation) {
  const location =
    typeof citation.locationLabel === "string"
      ? citation.locationLabel
      : typeof citation.source.locationLabel === "string"
        ? citation.source.locationLabel
        : "";
  const rowMatch = location.match(/Rows\s+([0-9]+(?:[–-][0-9]+)?)/i);

  if (rowMatch) {
    return `Rows ${rowMatch[1].replace("-", "–")}`;
  }

  const pageMatch = location.match(/Page\s+(\d+)/i);

  if (pageMatch) {
    return `p. ${pageMatch[1]}`;
  }

  const chunkMatch = location.match(/Chunk\s+(\d+)/i);

  if (chunkMatch) {
    return `chunk ${chunkMatch[1]}`;
  }

  return null;
}

function getCitationFallback(marker: string) {
  const match = typeof marker === "string" ? marker.match(/\[\[(?:s|p)\.(\d+)\]\]/) : null;

  return match ? `Source ${match[1]}` : "Source";
}

function isUsableCitation(citation: ChatCitation | null | undefined): citation is ChatCitation {
  return (
    Boolean(citation) &&
    typeof citation?.marker === "string" &&
    Boolean(citation.source) &&
    typeof citation.source.id === "string" &&
    typeof citation.source.content === "string"
  );
}

function getCitationLabel(citation: ChatCitation) {
  const filename =
    typeof citation.filename === "string" && citation.filename.trim().length > 0
      ? citation.filename
      : typeof citation.source.filename === "string" && citation.source.filename.trim().length > 0
        ? citation.source.filename
        : "";
  const location = getShortLocationLabel(citation);

  if (!filename || !location) {
    return getCitationFallback(citation.marker);
  }

  return `${getFilenameLabel(filename)} · ${location}`;
}

function getCitationTitle(citation: ChatCitation) {
  const filename =
    typeof citation.filename === "string" && citation.filename.trim().length > 0
      ? citation.filename
      : typeof citation.source.filename === "string" && citation.source.filename.trim().length > 0
        ? citation.source.filename
        : "";
  const location =
    typeof citation.locationLabel === "string"
      ? citation.locationLabel
      : typeof citation.source.locationLabel === "string"
        ? citation.source.locationLabel
        : "";

  return [filename, location].filter(Boolean).join(" · ") || getCitationFallback(citation.marker);
}
