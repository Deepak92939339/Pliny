import { parseResponseWithCharts } from "../chart/parseResponseWithCharts.ts";
import type { ResponseSegment } from "../chart/types.ts";

export type CitationValidationSource = {
  pageNumber?: number | null;
};

export type CitationValidationResult = {
  allMarkers: string[];
  validMarkers: string[];
  invalidMarkers: string[];
  missingCitation: boolean;
  chartCount: number;
  invalidChartSourceRefs: string[];
  missingChartSourceRefs: number[];
  rejectedChart: boolean;
  rejectedAnswer: boolean;
};

export type CitationMarkerMatch = {
  marker: string;
  type: "source" | "page";
  number: number;
  index: number;
};

const CITATION_MARKER_PATTERN = /\[\[(s|p)\.(\d+)\]\]/g;
const CHART_BLOCK_PATTERN = /<chart>[\s\S]*?<\/chart>/gi;

export function parseCitationMarkers(answer: string): CitationMarkerMatch[] {
  const matches: CitationMarkerMatch[] = [];

  for (const match of answer.matchAll(CITATION_MARKER_PATTERN)) {
    const number = Number(match[2]);

    if (match.index === undefined) {
      continue;
    }

    matches.push({
      index: match.index,
      marker: match[0],
      number,
      type: match[1] === "s" ? "source" : "page",
    });
  }

  return matches;
}

function hasFactualContent(answer: string) {
  return answer.replace(CHART_BLOCK_PATTERN, "").trim().length > 0;
}

function isResolvableMarker(match: CitationMarkerMatch, sources: readonly CitationValidationSource[]) {
  if (!Number.isSafeInteger(match.number) || match.number < 1) {
    return false;
  }

  if (match.type === "source") {
    return match.number <= sources.length;
  }

  return sources.some((source) => source.pageNumber === match.number);
}

export function validateCitations(answer: string, sources: readonly CitationValidationSource[]): CitationValidationResult {
  const matches = parseCitationMarkers(answer);
  const validMarkers: string[] = [];
  const invalidMarkers: string[] = [];
  const seenValidMarkers = new Set<string>();
  const seenInvalidMarkers = new Set<string>();

  for (const match of matches) {
    if (isResolvableMarker(match, sources)) {
      if (!seenValidMarkers.has(match.marker)) {
        seenValidMarkers.add(match.marker);
        validMarkers.push(match.marker);
      }
      continue;
    }

    if (!seenInvalidMarkers.has(match.marker)) {
      seenInvalidMarkers.add(match.marker);
      invalidMarkers.push(match.marker);
    }
  }

  const missingCitation = hasFactualContent(answer) && matches.length === 0 && sources.length > 0;
  const allowedSourceRefs = sources.map((_, index) => `s.${index + 1}`);
  const responseSegments = parseResponseWithCharts(answer, { allowedSourceRefs });
  const chartErrors = responseSegments.filter((segment): segment is Extract<ResponseSegment, { type: "chart-error" }> => segment.type === "chart-error");
  const chartCount = responseSegments.filter((segment) => segment.type === "chart" || segment.type === "chart-error").length;
  const missingChartSourceRefs: number[] = [];
  const invalidChartSourceRefs: string[] = [];

  for (const [index, segment] of chartErrors.entries()) {
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(segment.raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")) as unknown;
    } catch {
      invalidChartSourceRefs.push(`chart.${index + 1}`);
      continue;
    }

    const refs = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).sourceRefs : undefined;

    if (!Array.isArray(refs) || refs.length === 0) {
      missingChartSourceRefs.push(index + 1);
      continue;
    }

    for (const ref of refs) {
      if (typeof ref !== "string" || !allowedSourceRefs.includes(ref)) {
        invalidChartSourceRefs.push(typeof ref === "string" ? ref : `chart.${index + 1}`);
      }
    }
  }
  const rejectedChart = chartCount > 0 && (chartErrors.length > 0 || missingChartSourceRefs.length > 0 || invalidChartSourceRefs.length > 0);

  return {
    allMarkers: matches.map((match) => match.marker),
    chartCount,
    invalidChartSourceRefs: Array.from(new Set(invalidChartSourceRefs)),
    invalidMarkers,
    missingChartSourceRefs,
    missingCitation,
    rejectedAnswer: invalidMarkers.length > 0 || missingCitation || rejectedChart,
    rejectedChart,
    validMarkers,
  };
}
