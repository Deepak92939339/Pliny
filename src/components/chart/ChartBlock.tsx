"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartData, ChartSeries } from "@/lib/chart/types";

type ChartBlockProps = {
  chart: ChartData;
};

const SERIES_COLORS = {
  primary: "var(--editorial-rust)",
  secondary: "var(--chart-2)",
};

const INITIAL_CHART_DIMENSION = {
  height: 250,
  width: 640,
};

function getSeriesColor(series: ChartSeries, index: number) {
  if (series.color) {
    return SERIES_COLORS[series.color];
  }

  return index === 0 ? SERIES_COLORS.primary : SERIES_COLORS.secondary;
}

function formatValue(value: unknown) {
  if (typeof value !== "number") {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function renderChart(chart: ChartData) {
  const commonAxisProps = {
    axisLine: false,
    tickLine: false,
  };
  const tooltip = (
    <Tooltip
      cursor={{ fill: "rgba(186, 92, 61, 0.08)" }}
      formatter={(value, name) => [formatValue(value), String(name)]}
      contentStyle={{
        background: "var(--editorial-card)",
        border: "1px solid var(--editorial-border)",
        borderRadius: 10,
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.18)",
        color: "var(--editorial-ink)",
        fontSize: 12,
      }}
      labelStyle={{
        color: "var(--editorial-muted)",
        fontSize: 11,
        marginBottom: 4,
      }}
    />
  );

  if (chart.type === "bar") {
    return (
      <BarChart data={chart.data} margin={{ bottom: 0, left: 0, right: 10, top: 12 }}>
        <CartesianGrid stroke="var(--editorial-border-soft)" vertical={false} />
        <XAxis {...commonAxisProps} dataKey={chart.xKey} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} />
        <YAxis {...commonAxisProps} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} width={46} />
        {tooltip}
        {chart.series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ color: "var(--editorial-muted)", fontSize: 12, paddingTop: 8 }} /> : null}
        {chart.series.map((series, index) => (
          <Bar key={series.key} dataKey={series.key} fill={getSeriesColor(series, index)} name={series.label} radius={[5, 5, 0, 0]} />
        ))}
      </BarChart>
    );
  }

  if (chart.type === "line") {
    return (
      <LineChart data={chart.data} margin={{ bottom: 0, left: 0, right: 10, top: 12 }}>
        <CartesianGrid stroke="var(--editorial-border-soft)" vertical={false} />
        <XAxis {...commonAxisProps} dataKey={chart.xKey} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} />
        <YAxis {...commonAxisProps} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} width={46} />
        {tooltip}
        {chart.series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ color: "var(--editorial-muted)", fontSize: 12, paddingTop: 8 }} /> : null}
        {chart.series.map((series, index) => (
          <Line
            key={series.key}
            dataKey={series.key}
            dot={{ fill: getSeriesColor(series, index), r: 3, strokeWidth: 0 }}
            name={series.label}
            stroke={getSeriesColor(series, index)}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </LineChart>
    );
  }

  return (
    <AreaChart data={chart.data} margin={{ bottom: 0, left: 0, right: 10, top: 12 }}>
      <CartesianGrid stroke="var(--editorial-border-soft)" vertical={false} />
      <XAxis {...commonAxisProps} dataKey={chart.xKey} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} />
      <YAxis {...commonAxisProps} tick={{ fill: "var(--editorial-muted)", fontSize: 11 }} width={46} />
      {tooltip}
      {chart.series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ color: "var(--editorial-muted)", fontSize: 12, paddingTop: 8 }} /> : null}
      {chart.series.map((series, index) => (
        <Area
          key={series.key}
          dataKey={series.key}
          fill={getSeriesColor(series, index)}
          fillOpacity={0.12}
          name={series.label}
          stroke={getSeriesColor(series, index)}
          strokeWidth={2}
          type="monotone"
        />
      ))}
    </AreaChart>
  );
}

export function ChartBlock({ chart }: ChartBlockProps) {
  return (
    <section className="my-5 rounded-2xl border border-black/[0.08] bg-[#FFFEFA]/85 p-4 text-[color:var(--editorial-ink)] dark:border-[color:var(--editorial-border-soft)] dark:bg-[var(--editorial-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[14px] font-semibold leading-5 text-[color:var(--editorial-ink)]">{chart.title}</h4>
          {chart.yAxisLabel ? <p className="mt-1 text-[11px] text-[color:var(--editorial-muted)]">{chart.yAxisLabel}</p> : null}
        </div>
        {chart.sourceRefs && chart.sourceRefs.length > 0 ? (
          <p className="rounded-full border border-[#BA5C3D]/20 bg-[#BA5C3D]/10 px-2 py-1 text-[11px] font-medium text-[color:var(--editorial-rust-strong)]">
            {chart.sourceRefs.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="mt-3 h-[250px] min-w-[1px] w-full">
        <ResponsiveContainer height="100%" initialDimension={INITIAL_CHART_DIMENSION} minHeight={240} minWidth={1} width="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>

      {chart.insight ? (
        <p className="mt-3 border-t border-black/[0.07] pt-3 text-[12px] leading-5 text-[color:var(--editorial-muted)] dark:border-[color:var(--editorial-border-soft)]">
          {chart.insight}
        </p>
      ) : null}
    </section>
  );
}
