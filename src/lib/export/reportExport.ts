import { parseResponseWithCharts } from "@/lib/chart/parseResponseWithCharts";
import { buildRiskEvidenceReportSpec, formatRiskEvidenceReport } from "@/lib/export/riskEvidenceReport";
import type { ChartData } from "@/lib/chart/types";
import type { GeneratedReport, ReportSource, ReportTemplate, SearchChunkResult, WorkspaceSearchResult } from "@/types";

export const STANDARD_VERIFICATION_NOTE =
  "This report is generated from uploaded document sources. Citations point to retrieved passages used by Pliny AI. Review source excerpts before relying on the output for legal, financial, audit, medical, or compliance decisions.";

export const SPREADSHEET_VERIFICATION_NOTE =
  "Spreadsheet reasoning depends on parsed table data. Review source rows and the original spreadsheet before relying on calculations.";

export const INSUFFICIENT_EVIDENCE_NOTE =
  "The uploaded documents did not provide enough evidence to generate a source-supported report.";

type ReportBuildInput = {
  generatedAt?: string;
  result: WorkspaceSearchResult;
  workspaceName?: string;
};

type TranscriptBuildInput = {
  generatedAt?: string;
  results: WorkspaceSearchResult[];
  workspaceName?: string;
};

type SourceBundle = {
  markerToIndex: Map<string, number>;
  sources: ReportSource[];
};

const TEMPLATE_LABELS: Record<ReportTemplate, string> = {
  chat_transcript: "Chat Transcript",
  cited_answer: "Cited Answer Report",
  due_diligence_summary: "Due Diligence Summary",
  risk_report: "Risk Review Report",
  table_summary: "Table Summary Report",
};

export function buildCitedAnswerReport({ generatedAt, result, workspaceName }: ReportBuildInput): GeneratedReport {
  const bundle = getSourceBundle(result);
  const hasSourceSupport = isSourceSupportedResult(result);
  const sources = hasSourceSupport ? bundle.sources : [];

  return {
    content: hasSourceSupport ? formatAnswerForReport(result.answer, bundle) : formatInsufficientEvidenceContent(result),
    generatedAt: generatedAt ?? new Date().toISOString(),
    question: result.question,
    sources,
    template: "cited_answer",
    title: hasSourceSupport ? TEMPLATE_LABELS.cited_answer : "Insufficient Evidence Report",
    verificationNote: hasSourceSupport ? STANDARD_VERIFICATION_NOTE : INSUFFICIENT_EVIDENCE_NOTE,
    workspaceName,
  };
}

export function buildDueDiligenceReport({ generatedAt, result, workspaceName }: ReportBuildInput): GeneratedReport {
  const bundle = getSourceBundle(result);
  const hasSourceSupport = isSourceSupportedResult(result);
  const answer = hasSourceSupport ? formatAnswerForReport(result.answer, bundle) : formatInsufficientEvidenceContent(result);
  const sources = hasSourceSupport ? bundle.sources : [];

  return {
    content: hasSourceSupport
      ? [
          "## Executive Summary",
          "",
          answer,
          "",
          "## Key Findings",
          "",
          formatFindings(answer),
          "",
          "## Open Questions / Evidence Gaps",
          "",
          "- Review the cited source excerpts before relying on this summary.",
          "- Treat uncited or broad statements as evidence gaps.",
        ].join("\n")
      : answer,
    generatedAt: generatedAt ?? new Date().toISOString(),
    question: result.question,
    sources,
    template: "due_diligence_summary",
    title: hasSourceSupport ? TEMPLATE_LABELS.due_diligence_summary : "Insufficient Evidence Report",
    verificationNote: hasSourceSupport ? STANDARD_VERIFICATION_NOTE : INSUFFICIENT_EVIDENCE_NOTE,
    workspaceName,
  };
}

export function buildRiskReport({ generatedAt, result, workspaceName }: ReportBuildInput): GeneratedReport {
  const bundle = getSourceBundle(result);
  const hasSourceSupport = isSourceSupportedResult(result);
  const answer = hasSourceSupport ? formatAnswerForReport(result.answer, bundle) : formatInsufficientEvidenceContent(result);
  const sources = hasSourceSupport ? bundle.sources : [];
  const verificationNote = hasSourceSupport ? "Risk findings are AI-assisted and source-grounded. Review each cited passage before making a decision." : INSUFFICIENT_EVIDENCE_NOTE;
  const artifact = hasSourceSupport ? buildRiskEvidenceReportSpec(result.answer, bundle, verificationNote) : null;

  return {
    artifact: artifact ?? undefined,
    content: artifact
      ? formatRiskEvidenceReport(artifact)
      : hasSourceSupport
        ? [
            "## Risk Summary",
            "",
            answer,
            "",
            "## Missing Evidence / Caveats",
            "",
            "- The cited answer did not contain enough structured claims to build the risk register.",
            "- Review the original documents before making legal, financial, audit, medical, or compliance decisions.",
          ].join("\n")
        : answer,
    generatedAt: generatedAt ?? new Date().toISOString(),
    question: result.question,
    sources,
    template: "risk_report",
    title: hasSourceSupport ? TEMPLATE_LABELS.risk_report : "Insufficient Evidence Report",
    verificationNote,
    workspaceName,
  };
}

export function buildTableSummaryReport({ generatedAt, result, workspaceName }: ReportBuildInput): GeneratedReport {
  const bundle = getSourceBundle(result);
  const hasSourceSupport = isSourceSupportedResult(result);
  const answer = hasSourceSupport ? formatAnswerForReport(result.answer, bundle) : formatInsufficientEvidenceContent(result);
  const chartTables = getChartTables(result.answer);
  const sources = hasSourceSupport ? bundle.sources : [];

  return {
    content: hasSourceSupport
      ? [
          "## Summary",
          "",
          answer,
          "",
          "## Table / Chart Data",
          "",
          chartTables.length > 0 ? chartTables.join("\n\n") : "No structured chart data was available in this answer.",
          "",
          "## Source Rows",
          "",
          formatSourcesForMarkdown(bundle.sources),
        ].join("\n")
      : answer,
    generatedAt: generatedAt ?? new Date().toISOString(),
    question: result.question,
    sources,
    template: "table_summary",
    title: hasSourceSupport ? TEMPLATE_LABELS.table_summary : "Insufficient Evidence Report",
    verificationNote: hasSourceSupport ? SPREADSHEET_VERIFICATION_NOTE : INSUFFICIENT_EVIDENCE_NOTE,
    workspaceName,
  };
}

export function buildReportForTemplate(template: ReportTemplate, input: ReportBuildInput): GeneratedReport {
  if (template === "due_diligence_summary") {
    return buildDueDiligenceReport(input);
  }

  if (template === "risk_report") {
    return buildRiskReport(input);
  }

  if (template === "table_summary") {
    return buildTableSummaryReport(input);
  }

  return buildCitedAnswerReport(input);
}

export function buildChatTranscriptMarkdown({ generatedAt, results, workspaceName }: TranscriptBuildInput) {
  const exportedAt = generatedAt ?? new Date().toISOString();
  const lines = [
    "# Pliny AI Chat Transcript",
    "",
    `Workspace: ${workspaceName || "Workspace"}`,
    `Exported: ${exportedAt}`,
    "",
    "---",
  ];

  if (results.length === 0) {
    lines.push("", "No chat messages were available to export.");
    return lines.join("\n");
  }

  results.forEach((result, index) => {
    const bundle = getSourceBundle(result);
    const answer = formatAnswerForReport(result.answer, bundle);
    const hasSourceSupport = isSourceSupportedResult(result);

    lines.push(
      "",
      `## Question ${index + 1}`,
      "",
      result.question || "Question unavailable.",
      "",
      `## Answer ${index + 1}`,
      "",
      answer,
      "",
      "### Sources",
      "",
      hasSourceSupport && bundle.sources.length > 0
        ? formatSourcesForMarkdown(bundle.sources)
        : "No cited sources because the answer did not rely on document evidence.",
      "",
      "---"
    );
  });

  return lines.join("\n");
}

export function formatGeneratedReportMarkdown(report: GeneratedReport) {
  const question = report.question?.trim();
  const contentHeading = getContentHeading(report.template);

  return [
    `# ${report.title}`,
    "",
    `Workspace: ${report.workspaceName || "Workspace"}`,
    `Generated: ${report.generatedAt}`,
    "",
    question ? `## ${report.template === "due_diligence_summary" || report.template === "risk_report" ? "Review Question" : "Question"}` : "",
    question ? "" : "",
    question || "",
    question ? "" : "",
    `## ${contentHeading}`,
    "",
    report.content || "No report content returned.",
    "",
    "## Sources",
    "",
    formatSourcesForMarkdown(report.sources),
    "",
    "## Verification Note",
    "",
    report.verificationNote,
    "",
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === "" && lines[index + 1] === ""))
    .join("\n");
}

export function formatSourcesForMarkdown(sources: ReportSource[]) {
  if (sources.length === 0) {
    return "No cited sources available.";
  }

  return sources.map((source) => `[${source.index}] ${formatReportSourceLabel(source)} - "${source.excerpt}"`).join("\n");
}

export function getReportSources(result: WorkspaceSearchResult) {
  return getSourceBundle(result).sources;
}

export function isSourceSupportedResult(result: WorkspaceSearchResult) {
  if (result.status !== "answered") {
    return false;
  }

  const evidenceStatus = result.metadata?.evidenceStatus;

  if (evidenceStatus === "weak" || evidenceStatus === "none") {
    return false;
  }

  if (isInsufficientEvidenceAnswer(result.answer)) {
    return false;
  }

  return getCitationSourceBundle(result).sources.length > 0;
}

export function getReportMarkdownFilename(report: GeneratedReport) {
  const workspaceSlug = slugify(report.workspaceName || "pliny-workspace");
  const templateSlug = slugify(report.template);
  const date = report.generatedAt.slice(0, 10);

  return `${workspaceSlug}-${templateSlug}-${date}.md`;
}

export function getTranscriptMarkdownFilename(workspaceName?: string, generatedAt = new Date().toISOString()) {
  return `${slugify(workspaceName || "pliny-workspace")}-chat-transcript-${generatedAt.slice(0, 10)}.md`;
}

export function formatAnswerWithCitations(result: WorkspaceSearchResult) {
  const bundle = getSourceBundle(result);

  return `${formatAnswerForReport(result.answer, bundle)}\n\nSources:\n${formatSourcesForMarkdown(bundle.sources)}`;
}

function getCitationSourceBundle(result: WorkspaceSearchResult): SourceBundle {
  const markerToIndex = new Map<string, number>();
  const sources: ReportSource[] = [];
  const seenSourceIds = new Map<string, number>();

  for (const citation of Array.isArray(result.citations) ? result.citations : []) {
    if (!isUsableSource(citation?.source)) {
      continue;
    }

    const source = citation.source;
    const existingIndex = seenSourceIds.get(source.id);
    const sourceIndex = existingIndex ?? sources.length + 1;

    if (!existingIndex) {
      seenSourceIds.set(source.id, sourceIndex);
      sources.push(toReportSource(source, sourceIndex));
    }

    if (typeof citation.marker === "string" && citation.marker.length > 0) {
      markerToIndex.set(citation.marker, sourceIndex);
    }
  }

  return { markerToIndex, sources };
}

function getSourceBundle(result: WorkspaceSearchResult): SourceBundle {
  const citationBundle = getCitationSourceBundle(result);

  if (citationBundle.sources.length > 0) {
    return citationBundle;
  }

  const sources = (Array.isArray(result.sources) ? result.sources : []).filter(isUsableSource);
  const markerToIndex = new Map<string, number>();
  const seenSourceIds = new Set<string>();
  const reportSources: ReportSource[] = [];

  for (const source of sources) {
    if (seenSourceIds.has(source.id)) {
      continue;
    }

    seenSourceIds.add(source.id);
    reportSources.push(toReportSource(source, reportSources.length + 1));
  }

  return { markerToIndex, sources: reportSources };
}

function formatAnswerForReport(answer: string, bundle: SourceBundle) {
  let formattedAnswer = stripChartBlocks(typeof answer === "string" ? answer : "").trim();

  for (const [marker, index] of bundle.markerToIndex) {
    formattedAnswer = formattedAnswer.replaceAll(marker, `[${index}]`);
  }

  return formattedAnswer.replace(/\[\[(?:s|p)\.\d+\]\]/g, "").trim() || "No answer returned.";
}

function stripChartBlocks(answer: string) {
  return answer.replace(/<chart>[\s\S]*?<\/chart>/g, "\n\n[Chart rendered in Pliny]\n\n");
}

function formatInsufficientEvidenceContent(result: WorkspaceSearchResult) {
  const answer = stripChartBlocks(result.answer).replace(/\[\[(?:s|p)\.\d+\]\]/g, "").trim();

  return answer || "The uploaded documents did not provide enough evidence to generate a source-supported report.";
}

function isInsufficientEvidenceAnswer(answer: string) {
  const normalized = answer.replace(/\s+/g, " ").toLowerCase();
  const weakEvidencePhrases = [
    "could not produce a source-cited answer",
    "do not contain enough",
    "does not contain enough",
    "not enough direct support",
    "not enough evidence",
    "no information about",
    "none of them include",
    "retrieved documents do not directly answer",
    "uploaded documents did not provide enough evidence",
    "uploaded documents do not provide enough evidence",
    "would need access to documents",
  ];

  return weakEvidencePhrases.some((phrase) => normalized.includes(phrase));
}

function toReportSource(source: SearchChunkResult, index: number): ReportSource {
  return {
    documentName: getSourceFilename(source),
    excerpt: getSourceExcerpt(source),
    index,
    locationLabel: getSourceLocation(source) || undefined,
    pageNumber: typeof source.pageNumber === "number" && source.pageNumber > 0 ? source.pageNumber : undefined,
    rowRange: getRowRange(source) || undefined,
    sheetName: getMetadataString(source.metadata, "sheetName") ?? undefined,
  };
}

function formatReportSourceLabel(source: ReportSource) {
  const locationParts = [
    source.locationLabel,
    !source.locationLabel && source.sheetName ? `Sheet: ${source.sheetName}` : "",
    !source.locationLabel && source.rowRange ? source.rowRange : "",
    !source.locationLabel && source.pageNumber ? `p. ${source.pageNumber}` : "",
  ].filter(Boolean);

  return [source.documentName, locationParts.join(" · ")].filter(Boolean).join(", ");
}

function getSourceFilename(source: SearchChunkResult) {
  return typeof source.filename === "string" && source.filename.trim().length > 0 ? source.filename.trim() : "Source";
}

function getSourceLocation(source: SearchChunkResult) {
  if (typeof source.locationLabel === "string" && source.locationLabel.trim().length > 0) {
    return source.locationLabel.trim().replace(/Rows\s+(\d+)-(\d+)/, "Rows $1-$2");
  }

  if (typeof source.pageNumber === "number" && source.pageNumber > 0) {
    return `p. ${source.pageNumber}`;
  }

  if (typeof source.chunkIndex === "number" && source.chunkIndex >= 0) {
    return `chunk ${source.chunkIndex + 1}`;
  }

  return "";
}

function getSourceExcerpt(source: SearchChunkResult) {
  const content = typeof source.content === "string" ? source.content : "";
  const collapsedContent = content.replace(/\s+/g, " ").trim();

  return truncateLabel(collapsedContent.replaceAll('"', "'"), 260) || "Source excerpt unavailable.";
}

function getMetadataString(metadata: SearchChunkResult["metadata"], key: string) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataNumber(metadata: SearchChunkResult["metadata"], key: string) {
  const value = metadata?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRowRange(source: SearchChunkResult) {
  const rowStart = getMetadataNumber(source.metadata, "rowStart");
  const rowEnd = getMetadataNumber(source.metadata, "rowEnd");

  if (rowStart !== null && rowEnd !== null) {
    return `Rows ${rowStart}-${rowEnd}`;
  }

  const location = typeof source.locationLabel === "string" ? source.locationLabel : "";
  const rowMatch = location.match(/Rows\s+([0-9]+(?:[–-][0-9]+)?)/i);

  return rowMatch ? `Rows ${rowMatch[1].replace("–", "-")}` : "";
}

function getChartTables(answer: string) {
  return parseResponseWithCharts(answer)
    .filter((segment): segment is { data: ChartData; type: "chart" } => segment.type === "chart")
    .map((segment) => formatChartDataAsMarkdown(segment.data));
}

function formatChartDataAsMarkdown(chart: ChartData) {
  const headers = [chart.xKey, ...chart.series.map((series) => series.label)];
  const headerLine = `| ${headers.join(" | ")} |`;
  const alignLine = `| ${headers.map((_, index) => (index === 0 ? "---" : "---:")).join(" | ")} |`;
  const rows = chart.data.map((row) => {
    const cells = [row[chart.xKey], ...chart.series.map((series) => row[series.key])].map((value) => String(value ?? ""));

    return `| ${cells.join(" | ")} |`;
  });

  return [`### ${chart.title}`, "", headerLine, alignLine, ...rows].join("\n");
}

function formatFindings(answer: string) {
  const findings = extractFindingLines(answer);

  if (findings.length === 0) {
    return "- Review the answer and cited source excerpts for the main findings.";
  }

  return findings.map((finding) => `- ${finding}`).join("\n");
}

function extractFindingLines(answer: string) {
  const withoutHeadings = answer
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line !== "[Chart rendered in Pliny]");
  const listItems = withoutHeadings
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean);

  if (listItems.length > 0) {
    return listItems.slice(0, 6);
  }

  return answer
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function getContentHeading(template: ReportTemplate) {
  if (template === "cited_answer") {
    return "Answer";
  }

  if (template === "table_summary") {
    return "Summary";
  }

  return "Report";
}

function isUsableSource(source: SearchChunkResult | null | undefined): source is SearchChunkResult {
  return (
    Boolean(source) &&
    typeof source?.id === "string" &&
    typeof source.filename === "string" &&
    typeof source.content === "string" &&
    source.content.trim().length > 0
  );
}

function truncateLabel(value: string, maxLength: number) {
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "pliny-export";
}
