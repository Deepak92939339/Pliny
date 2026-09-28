"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { ChartBlock } from "@/components/chart/ChartBlock";
import {
  buildChatTranscriptMarkdown,
  buildReportForTemplate,
  formatAnswerWithCitations,
  getReportMarkdownFilename,
  getTranscriptMarkdownFilename,
  isSourceSupportedResult,
} from "@/lib/export/reportExport";
import { downloadMarkdownFile, openPrintReport } from "@/lib/export/browserReportExport";
import { tokenizeSafeInlineMarkdown } from "@/lib/markdown/safeInline";
import { parseResponseWithCharts } from "@/lib/chart/parseResponseWithCharts";
import { RiskEvidenceReportPreview } from "@/components/workspace/RiskEvidenceReportPreview";
import { type DocumentListItem, type SearchChunkResult, type WorkspaceSearchResult } from "@/types";
import { formatRetryWaitDuration } from "@/lib/limits/retryAfter";
import styles from "./AskSurface.module.css";

type AskSurfaceProps = {
  chatError?: string | null;
  chatNotice?: string | null;
  collectionId: string;
  collectionName: string;
  documents: DocumentListItem[];
  documentsError?: string | null;
  isSearching: boolean;
  pendingQuestion: string | null;
  rateLimitedUntil?: number | null;
  results: WorkspaceSearchResult[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  searchError?: string | null;
  selectedSourceId?: string;
  onAsk: (query: string) => void;
  onOpenDocuments: () => void;
  onSelectSource: (source: SearchChunkResult) => void;
};

type Citation = WorkspaceSearchResult["citations"][number];
type ReportTemplate = Parameters<typeof buildReportForTemplate>[0];
type CopyStatus = "idle" | "copied" | "failed";

type AnswerBlock =
  | { level: 1 | 2 | 3; text: string; type: "heading" }
  | { lines: string[]; type: "paragraph" }
  | { items: string[]; type: "bulleted-list" }
  | { items: string[]; type: "numbered-list" };

const REPORT_TEMPLATES: { label: string; template: ReportTemplate }[] = [
  { label: "Cited answer report", template: "cited_answer" },
  { label: "Due diligence summary", template: "due_diligence_summary" },
  { label: "Risk report", template: "risk_report" },
  { label: "Table summary", template: "table_summary" },
];

const PREPARE_STAGES = ["FINDING RELEVANT PASSAGES.", "CHECKING AVAILABLE EVIDENCE.", "PREPARING A SOURCE-BACKED ANSWER."];

function isUsableSource(source: SearchChunkResult | null | undefined): source is SearchChunkResult {
  return (
    Boolean(source) &&
    typeof source?.id === "string" &&
    typeof source.filename === "string" &&
    typeof source.content === "string" &&
    source.content.trim().length > 0
  );
}

function getSafeFilename(filename: string | null | undefined) {
  return typeof filename === "string" && filename.trim().length > 0 ? filename.trim() : "Untitled document";
}

function dedupeSources(result: WorkspaceSearchResult): SearchChunkResult[] {
  const cited = (Array.isArray(result.citations) ? result.citations : [])
    .map((citation) => citation.source)
    .filter((source): source is SearchChunkResult => isUsableSource(source));
  const base =
    cited.length > 0
      ? cited
      : (Array.isArray(result.sources) ? result.sources : []).filter((source): source is SearchChunkResult => isUsableSource(source));
  const seen = new Set<string>();
  return base.filter((source) => {
    if (seen.has(source.id)) {
      return false;
    }
    seen.add(source.id);
    return true;
  });
}

function citationNumber(citation: Citation, sources: SearchChunkResult[]) {
  const index = sources.findIndex((source) => source.id === citation.source.id);
  if (index >= 0) {
    return index + 1;
  }
  const match = typeof citation.marker === "string" ? citation.marker.match(/\[\[(?:s|p)\.(\d+)\]\]/) : null;
  return match ? Number(match[1]) : 1;
}

function getSourceMeta(source: SearchChunkResult) {
  const kind = typeof source.fileKind === "string" && source.fileKind.trim().length > 0 ? source.fileKind.trim() : "FILE";
  let location = "Source passage";
  if (typeof source.locationLabel === "string" && source.locationLabel.trim().length > 0 && source.locationLabel !== "Source passage") {
    location = source.locationLabel;
  } else if (source.pageNumber > 0) {
    location = `Page ${source.pageNumber}`;
  } else if (source.chunkIndex >= 0) {
    location = `Chunk ${source.chunkIndex + 1}`;
  }
  return `${kind} · ${location}`;
}

function formatTimestamp(value: string) {
  if (value === "Just now") {
    return "Just now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  const day =
    difference === 0
      ? "Today"
      : difference === 1
        ? "Yesterday"
        : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
  return `${day} · ${time}`;
}

function getGateChip(result: WorkspaceSearchResult, sourceCount: number) {
  const citationCount = Array.isArray(result.citations) ? result.citations.length : 0;
  const suffix = result.privacyMode === "privacy_minimised" ? " · masked presentation" : "";
  if (result.status === "insufficient_evidence") {
    return { label: `Evidence insufficient · ${citationCount} citations resolved${suffix}`, tone: "warn" as const };
  }
  const evidenceStatus = result.metadata?.evidenceStatus;
  if (!evidenceStatus) {
    return { label: `Evidence gate · ${sourceCount} sources${suffix}`, tone: "warn" as const };
  }
  if (evidenceStatus === "strong") {
    return { label: `Evidence sufficient · ${citationCount}/${sourceCount} citations resolved${suffix}`, tone: "ok" as const };
  }
  if (evidenceStatus === "partial") {
    return { label: `Evidence partial · ${citationCount}/${sourceCount} citations resolved${suffix}`, tone: "warn" as const };
  }
  if (evidenceStatus === "weak") {
    return { label: `Evidence weak · ${citationCount}/${sourceCount} citations resolved${suffix}`, tone: "warn" as const };
  }
  return { label: `Evidence not sufficient · ${citationCount}/${sourceCount} citations resolved${suffix}`, tone: "warn" as const };
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
  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ lines: [...paragraphLines], type: "paragraph" });
    paragraphLines.length = 0;
  }
  function flushList() {
    if (!activeList) {
      return;
    }
    blocks.push(activeList);
    activeList = null;
  }
  for (const rawLine of normalizeAnswerText(answer).split("\n")) {
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
      blocks.push({ level: headingMatch[1].length as 1 | 2 | 3, text: headingMatch[2].trim(), type: "heading" });
      continue;
    }
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (activeList?.type !== "bulleted-list") {
        flushList();
        activeList = { items: [], type: "bulleted-list" };
      }
      activeList.items.push(bulletMatch[1].trim());
      continue;
    }
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      if (activeList?.type !== "numbered-list") {
        flushList();
        activeList = { items: [], type: "numbered-list" };
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

function renderMaskedText(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\[[A-Z0-9_]+\])/g)
    .filter((part) => part.length > 0)
    .map((part, index) =>
      /^\[[A-Z0-9_]+\]$/.test(part) ? (
        <span key={`${keyPrefix}-m-${index}`} className={styles.masked} aria-label="Masked value">
          {part}
        </span>
      ) : (
        <span key={`${keyPrefix}-m-${index}`}>{part}</span>
      )
    );
}

function renderInlineNodes(
  text: string,
  citations: Citation[],
  sources: SearchChunkResult[],
  selectedSourceId: string | undefined,
  onSelectSource: (source: SearchChunkResult) => void,
  keyPrefix: string
): ReactNode[] {
  const tokens = tokenizeSafeInlineMarkdown(text);
  const nodes: ReactNode[] = [];
  let buffer: ReactNode[] = [];
  function flushBuffer(citation?: Citation) {
    if (buffer.length > 0) {
      const selected = citation ? citation.source.id === selectedSourceId : false;
      nodes.push(
        citation ? (
          <span key={`${keyPrefix}-chunk-${nodes.length}`} className={`${styles.chunk} ${selected ? styles.chunkHl : ""}`}>
            {buffer}
          </span>
        ) : (
          <span key={`${keyPrefix}-chunk-${nodes.length}`}>{buffer}</span>
        )
      );
      buffer = [];
    }
  }
  tokens.forEach((token, index) => {
    if (token.type === "citation") {
      const citation = citations.find(
        (item) => Boolean(item) && typeof item.marker === "string" && isUsableSource(item.source) && item.marker === token.value
      );
      if (citation) {
        flushBuffer(citation);
        const number = citationNumber(citation, sources);
        const selected = citation.source.id === selectedSourceId;
        nodes.push(
          <button
            key={`${keyPrefix}-cite-${index}`}
            type="button"
            className={`${styles.cite} ${selected ? styles.citeSel : ""}`}
            aria-label={`Citation ${number}: ${getSafeFilename(citation.source.filename)}. Open in Source Inspector.`}
            aria-pressed={selected}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelectSource(citation.source)}
          >
            {number}
          </button>
        );
        return;
      }
      buffer.push(<span key={`${keyPrefix}-tok-${index}`}>{token.value}</span>);
      return;
    }
    if (token.type === "strong") {
      buffer.push(
        <strong key={`${keyPrefix}-tok-${index}`} className={styles.strong}>
          {renderMaskedText(token.value, `${keyPrefix}-s-${index}`)}
        </strong>
      );
      return;
    }
    if (token.type === "code") {
      buffer.push(
        <code key={`${keyPrefix}-tok-${index}`} className={styles.code}>
          {token.value}
        </code>
      );
      return;
    }
    buffer.push(...renderMaskedText(token.value, `${keyPrefix}-t-${index}`));
  });
  flushBuffer();
  return nodes;
}

type TranscriptEntryProps = {
  collectionName: string;
  documents: DocumentListItem[];
  onSelectSource: (source: SearchChunkResult) => void;
  result: WorkspaceSearchResult;
  results: WorkspaceSearchResult[];
  selectedSourceId?: string;
};

function TranscriptEntry({
  collectionName,
  documents,
  onSelectSource,
  result,
  results,
  selectedSourceId,
}: TranscriptEntryProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [reportCopyStatus, setReportCopyStatus] = useState<CopyStatus>("idle");
  const [printError, setPrintError] = useState(false);
  const sources = dedupeSources(result);
  const hasAnswer = result.status === "answered" && typeof result.answer === "string" && result.answer.trim().length > 0;
  const hasSourceSupport = result.status === "answered" && isSourceSupportedResult(result);
  const riskReport = hasSourceSupport ? buildReportForTemplate("risk_report", { result, workspaceName: collectionName }) : null;
  const gate = getGateChip(result, sources.length);
  const isMasked = result.privacyMode === "privacy_minimised" || (typeof result.answer === "string" && /\[[A-Z0-9_]+\]/.test(result.answer));
  const citations = Array.isArray(result.citations) ? result.citations : [];

  async function handleCopyAnswer() {
    setCopyStatus("idle");
    try {
      await navigator.clipboard.writeText(formatAnswerWithCitations(result));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  async function handleCopyReport() {
    setReportCopyStatus("idle");
    try {
      const report = buildReportForTemplate("cited_answer", { result, workspaceName: collectionName });
      await navigator.clipboard.writeText(report.content);
      setReportCopyStatus("copied");
    } catch {
      setReportCopyStatus("failed");
    }
  }

  function handleExportTranscript() {
    const generatedAt = new Date().toISOString();
    const markdown = buildChatTranscriptMarkdown({ generatedAt, results, workspaceName: collectionName });
    downloadMarkdownFile(getTranscriptMarkdownFilename(collectionName, generatedAt), markdown);
  }

  function handleExportAnswer() {
    const report = buildReportForTemplate("cited_answer", { result, workspaceName: collectionName });
    downloadMarkdownFile(getReportMarkdownFilename(report), report.content);
  }

  function handlePrint() {
    setPrintError(false);
    const report = buildReportForTemplate("cited_answer", { result, workspaceName: collectionName });
    if (!openPrintReport(report)) {
      setPrintError(true);
    }
  }

  function handleDownloadReport(template: ReportTemplate) {
    if (template !== "cited_answer" && !hasSourceSupport) {
      return;
    }
    const report = buildReportForTemplate(template, { result, workspaceName: collectionName });
    downloadMarkdownFile(getReportMarkdownFilename(report), report.content);
  }

  function renderBlocks() {
    const segments = parseResponseWithCharts(result.status === "answered" ? result.answer : "", {
      allowedSourceRefs: sources.map((_, index) => `s.${index + 1}`),
    });
    if (segments.length === 0) {
      return <p className={styles.paragraph}>No answer returned.</p>;
    }
    return segments.map((segment, segmentIndex) => {
      if (segment.type === "chart") {
        return (
          <div key={`chart-${segmentIndex}-${segment.data.title}`} className={styles.chartWrap}>
            <ChartBlock chart={segment.data} />
          </div>
        );
      }
      if (segment.type === "chart-error") {
        return (
          <p key={`chart-error-${segmentIndex}`} className={styles.chartError}>
            A chart could not be rendered.
          </p>
        );
      }
      return parseAnswerBlocks(segment.content).map((block, blockIndex) => {
        const key = `${segmentIndex}-${blockIndex}`;
        if (block.type === "heading") {
          const headingClass = block.level === 1 ? styles.heading1 : block.level === 2 ? styles.heading2 : styles.heading3;
          return (
            <h3 key={key} className={headingClass}>
              {renderInlineNodes(block.text, citations, sources, selectedSourceId, onSelectSource, `${key}-h`)}
            </h3>
          );
        }
        if (block.type === "bulleted-list") {
          return (
            <ul key={key} className={styles.bulletList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className={styles.listItem}>
                  {renderInlineNodes(item, citations, sources, selectedSourceId, onSelectSource, `${key}-${itemIndex}-li`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered-list") {
          return (
            <ol key={key} className={styles.numberedList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className={styles.listItem}>
                  {renderInlineNodes(item, citations, sources, selectedSourceId, onSelectSource, `${key}-${itemIndex}-ol`)}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key} className={styles.paragraph}>
            {renderInlineNodes(block.lines.join("\n"), citations, sources, selectedSourceId, onSelectSource, `${key}-p`)}
          </p>
        );
      });
    });
  }

  const readyDocuments = documents
    .filter((document) => document.status === "ready")
    .map((document) => document.filename);
  const excludedDocuments = documents
    .filter((document) => document.status === "processing" || document.status === "failed")
    .map((document) => `${document.filename} · ${document.status}`);

  return (
    <article className={styles.entry}>
      <div className={styles.entryHead}>
        <h2 className={styles.questionTitle}>{result.question}</h2>
        <p className={styles.meta}>
          <span>{formatTimestamp(result.createdAt)}</span>
          <span className={`${styles.gate} ${gate.tone === "ok" ? styles.gateOk : styles.gateWarn}`}>
            <span className={styles.gateDot} aria-hidden="true" />
            {gate.label}
          </span>
        </p>
      </div>
      {result.status === "insufficient_evidence" ? (
        <section className={styles.refusal} aria-label="Insufficient evidence">
          <h3 className={styles.refusalTitle}>I couldn’t answer this from the available workspace evidence.</h3>
          <ul className={styles.refusalList}>
            <li>
              Searched: {readyDocuments.join(", ")} ({readyDocuments.length} ready documents).
            </li>
            {result.missingEvidence.length > 0
              ? result.missingEvidence.map((item, index) => <li key={`missing-${index}`}>{index === 0 ? `Missing: ${item}` : item}</li>)
              : <li>Missing: {result.reason}</li>}
            {excludedDocuments.map((item, index) => (
              <li key={`excluded-${index}`}>{index === 0 ? `Excluded: ${item}` : item}</li>
            ))}
          </ul>
          <p className={styles.refusalFooter}>No best guess or outside knowledge is provided. Revise the question or add the missing document.</p>
        </section>
      ) : (
        <div className={styles.answer}>
          {hasAnswer ? renderBlocks() : <p className={styles.paragraph}>No answer returned.</p>}
          {isMasked ? (
            <p className={styles.maskedNote}>
              Privacy projection active. Masked spans were pseudonymised before any provider request; original values remain in private storage and are
              visible only to workspace owners.
            </p>
          ) : null}
          {sources.length > 0 ? (
            <div className={styles.sources}>
              <p className={styles.sourcesLabel}>SOURCES</p>
              {sources.map((source, index) => {
                const selected = source.id === selectedSourceId;
                return (
                  <button
                    key={source.id}
                    type="button"
                    className={`${styles.sourceRow} ${selected ? styles.sourceRowSel : ""}`}
                    aria-current={selected ? "true" : undefined}
                    aria-pressed={selected}
                    onClick={() => onSelectSource(source)}
                  >
                    <span className={styles.sourceNum} aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className={styles.sourceBody}>
                      <b className={styles.sourceName}>{getSafeFilename(source.filename)}</b>
                      <span className={styles.sourceMeta}>{getSourceMeta(source)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {riskReport?.artifact ? (
            <div className={styles.reportWrap}>
              <RiskEvidenceReportPreview artifact={riskReport.artifact} />
            </div>
          ) : null}
          {hasAnswer ? (
            <div className={styles.actionRow}>
              <button type="button" className={styles.actionBtn} onClick={handleCopyAnswer}>
                {copyStatus === "copied" ? "Copied" : "Copy answer with citations"}
              </button>
              <button type="button" className={styles.actionBtn} onClick={handleCopyReport}>
                {reportCopyStatus === "copied" ? "Report copied" : "Copy report Markdown"}
              </button>
              <details className={styles.disclosure}>
                <summary className={styles.disclosureSummary}>Reports</summary>
                <div className={styles.menu}>
                  {REPORT_TEMPLATES.map((item) => {
                    const disabled = item.template !== "cited_answer" && !hasSourceSupport;
                    return (
                      <button
                        key={item.template}
                        type="button"
                        className={styles.menuItem}
                        disabled={disabled}
                        title={disabled ? "This report needs a cited, source-supported answer." : undefined}
                        onClick={() => handleDownloadReport(item.template)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </details>
              <details className={styles.disclosure}>
                <summary className={styles.disclosureSummary}>Export</summary>
                <div className={styles.menu}>
                  <button type="button" className={styles.menuItem} onClick={handleExportTranscript}>
                    Export transcript (Markdown)
                  </button>
                  <button type="button" className={styles.menuItem} onClick={handleExportAnswer}>
                    Export source-backed answer (Markdown)
                  </button>
                  <button type="button" className={styles.menuItem} onClick={handlePrint}>
                    Print view
                  </button>
                </div>
              </details>
              {copyStatus === "failed" ? <span className={styles.feedback}>Copy failed</span> : null}
              {reportCopyStatus === "failed" ? <span className={styles.feedback}>Report copy failed</span> : null}
              {printError ? <span className={styles.feedback}>Print window was blocked</span> : null}
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function AskSurface({
  chatError,
  chatNotice,
  collectionName,
  documents,
  documentsError,
  isSearching,
  pendingQuestion,
  rateLimitedUntil,
  results,
  scrollRef,
  searchError,
  selectedSourceId,
  onAsk,
  onOpenDocuments,
  onSelectSource,
}: AskSurfaceProps) {
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const readyDocuments = documents.filter((document) => document.status === "ready");
  const readyCount = readyDocuments.length;
  const noDocuments = documents.length === 0 && !documentsError;
  const noReady = readyCount === 0 && documents.length > 0;
  const bannerMessage = searchError ?? chatError ?? documentsError;
  const trimmedQuery = query.trim();
  // WP3 (audit-r1): a 429 with Retry-After holds the Ask button until the
  // limit window clears, with a live countdown next to the control.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rateLimitedRemainingSeconds = rateLimitedUntil ? Math.ceil((rateLimitedUntil - nowMs) / 1000) : 0;
  const isRateLimited = rateLimitedRemainingSeconds > 0;

  useEffect(() => {
    if (!isRateLimited) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isRateLimited]);

  const canSubmit = trimmedQuery.length > 0 && !isSearching && readyCount > 0 && !isRateLimited;
  const orderedResults = [...results].reverse();

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [query]);

  function submitQuestion() {
    if (!trimmedQuery || isSearching || readyCount === 0 || isRateLimited) {
      return;
    }
    onAsk(trimmedQuery);
    setQuery("");
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") {
      return;
    }
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    if (isRateLimited) {
      return;
    }
    event.preventDefault();
    submitQuestion();
  }

  return (
    <section className={styles.canvas} aria-label="Ask this workspace">
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace</p>
        {noDocuments ? (
          <>
            <h1 className={styles.title}>No documents yet</h1>
            <p className={styles.lede}>
              Pliny answers from the documents inside this workspace. Add PDFs, spreadsheets, or text files first; every answer will then cite the
              passage it relies on.
            </p>
            <div className={styles.headActions}>
              <button type="button" className={styles.primaryBtn} onClick={onOpenDocuments}>
                Add documents
              </button>
            </div>
            <p className={styles.supportedNote}>Supported: PDF · DOCX · XLSX · CSV · HTML · MD · TXT</p>
          </>
        ) : (
          <>
            <h1 className={styles.title} title={collectionName}>
              {collectionName}
            </h1>
            <p className={styles.lede}>Ask a question and Pliny will answer only from the ready documents in this workspace.</p>
            {noReady ? (
              <div className={styles.noReady}>
                <p>
                  No ready documents yet. Pliny cannot answer until at least one document completes processing. Processing and failed files are never
                  included in retrieval.
                </p>
                <button type="button" className={styles.ghostBtn} onClick={onOpenDocuments}>
                  Go to Documents
                </button>
              </div>
            ) : null}
          </>
        )}
        <p className={styles.chip}>
          <span className={styles.chipDot} aria-hidden="true" />
          {`Searching ${readyCount} ready document${readyCount === 1 ? "" : "s"}`}
        </p>
      </header>

      {bannerMessage ? (
        <div className={styles.banner} role="alert">
          {bannerMessage}
        </div>
      ) : null}
      {chatNotice ? <div className={styles.notice}>{chatNotice}</div> : null}

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.inner}>
          {readyCount >= 1 && results.length === 0 && !pendingQuestion ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Ask a question about your documents</p>
              <p className={styles.emptyCopy}>Upload files, then ask for summaries, clauses, comparisons, or citations.</p>
            </div>
          ) : null}
          {orderedResults.map((result) => (
            <TranscriptEntry
              key={`${result.id}-${result.createdAt}`}
              collectionName={collectionName}
              documents={documents}
              onSelectSource={onSelectSource}
              result={result}
              results={results}
              selectedSourceId={selectedSourceId}
            />
          ))}
          {isSearching && pendingQuestion ? (
            <div className={styles.preparing}>
              <div className={styles.bubble}>{pendingQuestion}</div>
              <span className={`${styles.gate} ${styles.gatePrep}`}>
                <span className={styles.gateDot} aria-hidden="true" />
                PREPARING
              </span>
              <ul className={styles.stageList}>
                {PREPARE_STAGES.map((stage) => (
                  <li key={stage} className={styles.stageLine}>
                    {stage}
                  </li>
                ))}
              </ul>
              <div className={styles.skeleton} aria-hidden="true">
                <span className={styles.skelBar} />
                <span className={`${styles.skelBar} ${styles.skelBarShort}`} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.composer}>
        <div className={styles.composerCard}>
          <div className={styles.composerTop}>
            <label className={styles.composerLabel} htmlFor="ask-surface-composer">
              Ask a question about the ready documents in this workspace.
            </label>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setQuery("");
                textareaRef.current?.focus();
              }}
            >
              New question
            </button>
          </div>
          <textarea
            id="ask-surface-composer"
            ref={textareaRef}
            className={styles.textarea}
            value={query}
            rows={3}
            placeholder="e.g., What changed operating margin in Q2?"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className={styles.askRow}>
            <button type="button" className={styles.askBtn} disabled={!canSubmit} onClick={submitQuestion}>
              {isRateLimited ? "Rate limited" : "Ask"}
            </button>
            <p className={styles.hint}>
              {isRateLimited
                ? `You can ask again in ${formatRetryWaitDuration(rateLimitedRemainingSeconds)}`
                : "CTRL / ⌘ + ENTER TO SUBMIT · ENTER ADDS A LINE BREAK"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
