import { z } from "zod";
import { parseResponseWithCharts } from "../chart/parseResponseWithCharts.ts";
import type { ReportChart, ReportClaim, ReportObligation, ReportRisk, ReportSource, ReportTable, RiskEvidenceReportSpec } from "@/types";

const sourceRefsSchema = z.array(z.number().int().positive()).min(1);
const reportSourceSchema = z.object({
  documentName: z.string().min(1),
  excerpt: z.string().min(1),
  index: z.number().int().positive(),
  locationLabel: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  rowRange: z.string().optional(),
  sheetName: z.string().optional(),
});
const claimSchema = z.object({ id: z.string().min(1), text: z.string().min(1), sourceRefs: sourceRefsSchema });
const riskSchema = claimSchema.extend({ severity: z.enum(["high", "medium", "low"]) });
const obligationSchema = claimSchema.extend({ action: z.string().min(1) });
const tableSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.object({ sourceRefs: sourceRefsSchema, values: z.array(z.union([z.string(), z.number()])).min(1) })).min(1),
  title: z.string().min(1),
});
const chartSchema = z.object({
  chart: z.object({
    data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(1),
    series: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(1),
    title: z.string().min(1),
    type: z.enum(["bar", "line", "area"]),
    xKey: z.string().min(1),
  }),
  seriesSourceRefs: z.record(z.string(), sourceRefsSchema),
  sourceRefs: sourceRefsSchema,
});

export const riskEvidenceReportSchema = z.object({
  executiveSummary: z.array(claimSchema),
  keyFindings: z.array(claimSchema),
  obligations: z.array(obligationSchema),
  reportType: z.literal("risk_and_evidence"),
  risks: z.array(riskSchema),
  sourceList: z.array(reportSourceSchema).min(1),
  tables: z.array(tableSchema),
  charts: z.array(chartSchema),
  verificationNote: z.string().min(1),
});

export type RiskEvidenceSourceBundle = {
  markerToIndex: Map<string, number>;
  sources: ReportSource[];
};

function getGroundedClaims(answer: string, bundle: RiskEvidenceSourceBundle): ReportClaim[] {
  const claims: ReportClaim[] = [];
  const withoutCharts = answer.replace(/<chart>[\s\S]*?<\/chart>/gi, "");

  for (const [lineIndex, rawLine] of withoutCharts.split("\n").entries()) {
    const line = rawLine.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");

    if (!line || line.startsWith("#")) {
      continue;
    }

    const markers = Array.from(line.matchAll(/\[\[(?:s|p)\.\d+\]\]/g)).map((match) => match[0]);
    const sourceRefs = Array.from(new Set(markers.map((marker) => bundle.markerToIndex.get(marker)).filter((index): index is number => index !== undefined)));

    if (sourceRefs.length === 0) {
      continue;
    }

    const text = line.replace(/\[\[(?:s|p)\.\d+\]\]/g, "").replace(/\s+/g, " ").trim();

    if (text) {
      claims.push({ id: `claim-${lineIndex + 1}`, sourceRefs, text });
    }
  }

  return claims;
}

function inferSeverity(text: string): ReportRisk["severity"] {
  const normalized = text.toLowerCase();

  if (/critical|breach|immediate|material|high risk/.test(normalized)) {
    return "high";
  }

  if (/may|could|review|unclear|missing|concern|risk/.test(normalized)) {
    return "medium";
  }

  return "low";
}

function buildRiskRegister(claims: ReportClaim[]): ReportRisk[] {
  const riskClaims = claims.filter((claim) => /risk|issue|exposure|breach|failure|missing|concern|unclear|critical/i.test(claim.text));
  const selected = riskClaims.length > 0 ? riskClaims : claims;

  return selected.slice(0, 6).map((claim, index) => ({
    ...claim,
    id: `risk-${index + 1}`,
    severity: inferSeverity(claim.text),
  }));
}

function buildObligations(claims: ReportClaim[]): ReportObligation[] {
  return claims
    .filter((claim) => /must|shall|required|obligation|notice|maintain|review|action|deadline/i.test(claim.text))
    .slice(0, 6)
    .map((claim, index) => ({
      ...claim,
      action: claim.text,
      id: `obligation-${index + 1}`,
    }));
}

function getChartArtifacts(answer: string, bundle: RiskEvidenceSourceBundle): { charts: ReportChart[]; tables: ReportTable[] } {
  const charts: ReportChart[] = [];
  const tables: ReportTable[] = [];

  for (const segment of parseResponseWithCharts(answer)) {
    if (segment.type !== "chart" || !segment.data.sourceRefs || segment.data.sourceRefs.length === 0) {
      continue;
    }

    const sourceRefs = Array.from(new Set(segment.data.sourceRefs.map((marker) => bundle.markerToIndex.get(`[[${marker}]]`)).filter((index): index is number => index !== undefined)));

    if (sourceRefs.length === 0) {
      continue;
    }

    const seriesSourceRefs = Object.fromEntries(segment.data.series.map((series) => [series.key, sourceRefs]));
    charts.push({ chart: segment.data, seriesSourceRefs, sourceRefs });
    tables.push({
      columns: [segment.data.xKey, ...segment.data.series.map((series) => series.label)],
      rows: segment.data.data.map((row) => ({
        sourceRefs,
        values: [row[segment.data.xKey], ...segment.data.series.map((series) => row[series.key])],
      })),
      title: segment.data.title,
    });
  }

  return { charts, tables };
}

export function buildRiskEvidenceReportSpec(answer: string, bundle: RiskEvidenceSourceBundle, verificationNote: string): RiskEvidenceReportSpec | null {
  const claims = getGroundedClaims(answer, bundle);

  if (claims.length === 0 || bundle.sources.length === 0) {
    return null;
  }

  const { charts, tables } = getChartArtifacts(answer, bundle);
  const candidate: RiskEvidenceReportSpec = {
    charts,
    executiveSummary: claims.slice(0, 2),
    keyFindings: claims.slice(0, 6),
    obligations: buildObligations(claims),
    reportType: "risk_and_evidence",
    risks: buildRiskRegister(claims),
    sourceList: bundle.sources,
    tables,
    verificationNote,
  };
  const parsed = riskEvidenceReportSchema.safeParse(candidate);

  return parsed.success ? parsed.data as RiskEvidenceReportSpec : null;
}

export function formatRiskEvidenceReport(spec: RiskEvidenceReportSpec) {
  const lines = [
    "## Executive Summary",
    "",
    ...formatClaims(spec.executiveSummary),
    "",
    "## Key Findings",
    "",
    ...formatClaims(spec.keyFindings),
    "",
    "## Risk Register",
    "",
    "| Severity | Risk / issue | Evidence |\n| --- | --- | --- |",
    ...spec.risks.map((risk) => `| ${risk.severity} | ${risk.text} | ${formatRefs(risk.sourceRefs)} |`),
    "",
    "## Obligations / Actions",
    "",
    spec.obligations.length > 0 ? spec.obligations.map((obligation) => `- ${obligation.action} — Evidence: ${formatRefs(obligation.sourceRefs)}`).join("\n") : "No explicit obligations or actions were identified in the cited passages.",
  ];

  for (const table of spec.tables) {
    lines.push("", `## Grounded Table: ${table.title}`, "", `| ${[...table.columns, "Evidence"].join(" | ")} |`, `| ${table.columns.map(() => "---").concat("---").join(" | ")} |`, ...table.rows.map((row) => `| ${[...row.values.map(String), formatRefs(row.sourceRefs)].join(" | ")} |`));
  }

  for (const chart of spec.charts) {
    lines.push("", `## Grounded Chart: ${chart.chart.title}`, "", `Chart type: ${chart.chart.type}`, `Chart evidence: ${formatRefs(chart.sourceRefs)}`);
    lines.push(...chart.chart.series.map((series) => `- Series **${series.label}** — Evidence: ${formatRefs(chart.seriesSourceRefs[series.key] ?? chart.sourceRefs)}`));
  }

  return lines.join("\n");
}

function formatClaims(claims: ReportClaim[]) {
  return claims.map((claim) => `- ${claim.text} — Evidence: ${formatRefs(claim.sourceRefs)}`);
}

function formatRefs(refs: number[]) {
  return refs.map((ref) => `[${ref}]`).join(", ");
}
