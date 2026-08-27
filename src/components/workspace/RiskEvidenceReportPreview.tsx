import { ChartBlock } from "@/components/chart/ChartBlock";
import type { RiskEvidenceReportSpec } from "@/types";

type RiskEvidenceReportPreviewProps = {
  artifact: RiskEvidenceReportSpec;
};

function EvidenceRefs({ refs }: { refs: number[] }) {
  return <span className="text-[11px] font-medium text-[color:var(--editorial-rust-strong)]">Evidence {refs.map((ref) => `[${ref}]`).join(", ")}</span>;
}

export function RiskEvidenceReportPreview({ artifact }: RiskEvidenceReportPreviewProps) {
  return (
    <section className="rounded-2xl border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] p-5" aria-label="Risk and evidence report preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--editorial-rust-strong)]">Flagship artifact</p>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--editorial-ink)]">Risk and Evidence Report</h3>
        </div>
        <span className="rounded-full border border-[color:var(--editorial-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--editorial-muted)]">Source-backed</span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--editorial-muted)]">Executive summary</h4>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-[color:var(--editorial-ink-soft)]">
            {artifact.executiveSummary.map((claim) => (
              <li key={claim.id}>
                {claim.text} <EvidenceRefs refs={claim.sourceRefs} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--editorial-muted)]">Risk register</h4>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-[color:var(--editorial-ink-soft)]">
            {artifact.risks.map((risk) => (
              <li key={risk.id} className="flex items-start justify-between gap-3">
                <span>{risk.text}</span>
                <span className="shrink-0 text-[11px] font-semibold uppercase text-[color:var(--editorial-muted)]">{risk.severity}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {artifact.obligations.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--editorial-border-soft)] pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--editorial-muted)]">Obligations / actions</h4>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-[color:var(--editorial-ink-soft)]">
            {artifact.obligations.map((obligation) => (
              <li key={obligation.id} className="flex items-start justify-between gap-3">
                <span>{obligation.action}</span>
                <EvidenceRefs refs={obligation.sourceRefs} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {artifact.tables.map((table) => (
        <div key={table.title} className="mt-5 overflow-x-auto border-t border-[color:var(--editorial-border-soft)] pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--editorial-muted)]">{table.title}</h4>
          <table className="mt-2 min-w-full text-left text-xs">
            <thead>
              <tr>
                {table.columns.map((column) => <th key={column} className="border-b border-[color:var(--editorial-border-soft)] px-2 py-2 font-semibold text-[color:var(--editorial-muted)]">{column}</th>)}
                <th className="border-b border-[color:var(--editorial-border-soft)] px-2 py-2 font-semibold text-[color:var(--editorial-muted)]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${table.title}-${rowIndex}`}>
                  {row.values.map((value, valueIndex) => <td key={`${rowIndex}-${valueIndex}`} className="border-b border-[color:var(--editorial-border-soft)] px-2 py-2 text-[color:var(--editorial-ink-soft)]">{String(value)}</td>)}
                  <td className="border-b border-[color:var(--editorial-border-soft)] px-2 py-2"><EvidenceRefs refs={row.sourceRefs} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {artifact.charts.map((chart) => <ChartBlock key={chart.chart.title} chart={chart.chart} />)}
    </section>
  );
}
