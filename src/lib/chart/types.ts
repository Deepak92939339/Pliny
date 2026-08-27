export type ChartType = "bar" | "line" | "area";
export type ChartColorToken = "primary" | "secondary";

export interface ChartSeries {
  key: string;
  label: string;
  color?: ChartColorToken;
}

export interface ChartDataRow {
  [field: string]: string | number;
}

export interface ChartData {
  type: ChartType;
  title: string;
  xKey: string;
  series: ChartSeries[];
  data: ChartDataRow[];
  yAxisLabel?: string;
  insight?: string;
  sourceRefs?: string[];
}

export type ResponseSegment =
  | { type: "text"; content: string }
  | { type: "chart"; data: ChartData }
  | { type: "chart-error"; raw: string; reason: string };
