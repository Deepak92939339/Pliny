import type { ChartColorToken, ChartData, ChartDataRow, ChartSeries, ChartType, ResponseSegment } from "@/lib/chart/types";

const CHART_BLOCK_PATTERN = /<chart>([\s\S]*?)<\/chart>/g;
const ALLOWED_CHART_TYPES = new Set<ChartType>(["bar", "line", "area"]);
const ALLOWED_COLOR_TOKENS = new Set<ChartColorToken>(["primary", "secondary"]);
const MAX_CHARTS = 1;
const MAX_DATA_ROWS = 12;
const MAX_SERIES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function validateChartType(value: unknown): ChartType | null {
  return typeof value === "string" && ALLOWED_CHART_TYPES.has(value as ChartType) ? (value as ChartType) : null;
}

function validateSeries(value: unknown): { series?: ChartSeries[]; error?: string } {
  if (!Array.isArray(value)) {
    return { error: "Chart series must be an array." };
  }

  if (value.length === 0 || value.length > MAX_SERIES) {
    return { error: "Chart must have one or two series." };
  }

  const series: ChartSeries[] = [];
  const seriesKeys = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      return { error: "Each chart series must be an object." };
    }

    const key = item.key;
    const label = item.label;

    if (!isNonEmptyString(key) || !isNonEmptyString(label)) {
      return { error: "Each chart series needs a key and label." };
    }

    if (item.color !== undefined && (!isNonEmptyString(item.color) || !ALLOWED_COLOR_TOKENS.has(item.color as ChartColorToken))) {
      return { error: "Chart series color is not supported." };
    }

    const normalizedKey = key.trim();

    if (seriesKeys.has(normalizedKey)) {
      return { error: "Chart series keys must be unique." };
    }

    seriesKeys.add(normalizedKey);

    series.push({
      color: item.color as ChartColorToken | undefined,
      key: normalizedKey,
      label: label.trim(),
    });
  }

  return { series };
}

function validateDataRows(value: unknown, xKey: string, series: ChartSeries[]): { data?: ChartDataRow[]; error?: string } {
  if (!Array.isArray(value)) {
    return { error: "Chart data must be an array." };
  }

  if (value.length === 0 || value.length > MAX_DATA_ROWS) {
    return { error: "Chart data must have between one and twelve rows." };
  }

  const data: ChartDataRow[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return { error: "Each chart data row must be an object." };
    }

    const xValue = item[xKey];

    if ((typeof xValue !== "string" && typeof xValue !== "number") || (typeof xValue === "string" && xValue.trim().length === 0)) {
      return { error: "Each chart row must include the xKey value." };
    }

    const row: ChartDataRow = {
      [xKey]: xValue,
    };

    for (const seriesItem of series) {
      const seriesValue = item[seriesItem.key];

      if (typeof seriesValue !== "number" || !Number.isFinite(seriesValue)) {
        return { error: "Chart series values must be finite JSON numbers." };
      }

      row[seriesItem.key] = seriesValue;
    }

    data.push(row);
  }

  return { data };
}

function validateSourceRefs(value: unknown, allowedSourceRefs?: readonly string[]): { error?: string; refs?: string[] } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Chart must include at least one sourceRef." };
  }

  const refs = value.filter((item): item is string => typeof item === "string" && /^s\.\d+$/.test(item));

  if (refs.length !== value.length) {
    return { error: "Chart sourceRefs must use the s.N citation format." };
  }

  if (allowedSourceRefs && refs.some((ref) => !allowedSourceRefs.includes(ref))) {
    return { error: "Chart sourceRefs must resolve to retrieved sources." };
  }

  return { refs: Array.from(new Set(refs)).slice(0, 8) };
}

function validateChart(value: unknown, allowedSourceRefs?: readonly string[]): { data?: ChartData; error?: string } {
  if (!isRecord(value)) {
    return { error: "Chart JSON must be an object." };
  }

  const type = validateChartType(value.type);

  if (!type) {
    return { error: "Chart type must be bar, line, or area." };
  }

  const seriesResult = validateSeries(value.series);

  if (!seriesResult.series) {
    return { error: seriesResult.error ?? "Chart series is invalid." };
  }

  const title = value.title;
  const xKeyValue = value.xKey;

  if (!isNonEmptyString(title) || !isNonEmptyString(xKeyValue)) {
    return { error: "Chart needs a title and xKey." };
  }

  const xKey = xKeyValue.trim();
  const dataResult = validateDataRows(value.data, xKey, seriesResult.series);

  if (!dataResult.data) {
    return { error: dataResult.error ?? "Chart data is invalid." };
  }

  const chart: ChartData = {
    data: dataResult.data,
    series: seriesResult.series,
    title: title.trim(),
    type,
    xKey,
  };

  const yAxisLabel = value.yAxisLabel;
  const insight = value.insight;

  if (isNonEmptyString(yAxisLabel)) {
    chart.yAxisLabel = yAxisLabel.trim();
  }

  if (isNonEmptyString(insight)) {
    chart.insight = insight.trim();
  }

  const sourceRefs = validateSourceRefs(value.sourceRefs, allowedSourceRefs);

  if (sourceRefs.error) {
    return { error: sourceRefs.error };
  }

  if (sourceRefs.refs) {
    chart.sourceRefs = sourceRefs.refs;
  }

  return { data: chart };
}

function parseChartBody(raw: string, allowedSourceRefs?: readonly string[]): ResponseSegment {
  const body = stripCodeFence(raw);

  try {
    const parsed = JSON.parse(body) as unknown;
    const result = validateChart(parsed, allowedSourceRefs);

    if (!result.data) {
      return {
        raw,
        reason: result.error ?? "Chart block failed validation.",
        type: "chart-error",
      };
    }

    return {
      data: result.data,
      type: "chart",
    };
  } catch {
    return {
      raw,
      reason: "Chart block contains invalid JSON.",
      type: "chart-error",
    };
  }
}

export type ParseResponseWithChartsOptions = {
  allowedSourceRefs?: readonly string[];
};

export function parseResponseWithCharts(response: string, options: ParseResponseWithChartsOptions = {}): ResponseSegment[] {
  const segments: ResponseSegment[] = [];
  let lastIndex = 0;
  let chartCount = 0;

  for (const match of response.matchAll(CHART_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const rawChart = match[1] ?? "";

    if (matchIndex > lastIndex) {
      const text = response.slice(lastIndex, matchIndex);

      if (text.trim().length > 0) {
        segments.push({ content: text, type: "text" });
      }
    }

    chartCount += 1;
    segments.push(
      chartCount > MAX_CHARTS
        ? {
            raw: rawChart,
            reason: "Only one chart block is allowed per answer.",
            type: "chart-error",
          }
        : parseChartBody(rawChart, options.allowedSourceRefs)
    );
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < response.length) {
    const text = response.slice(lastIndex);

    if (text.trim().length > 0) {
      segments.push({ content: text, type: "text" });
    }
  }

  if (segments.length === 0) {
    return [{ content: response, type: "text" }];
  }

  return segments;
}
