import { Badge } from "@/components/ui/Badge";
import { ChartBlock } from "@/components/chart/ChartBlock";
import { SafeInlineMarkdown } from "@/components/workspace/SafeInlineMarkdown";
import type { RiskEvidenceReportSpec } from "@/types";

type RiskEvidenceReportPreviewProps = {
  artifact: RiskEvidenceReportSpec;
};

function EvidenceRefs({ refs }: { refs: number[] }) {
  return <span className="text-[length:var(--text-2xs)] font-medium text-[var(--accent-ink)] font-mono">Evidence {refs.map((ref) => `[${ref}]`).join(", ")}</span>;
}

export function RiskEvidenceReportPreview({ artifact }: RiskEvidenceReportPreviewProps) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--rule)] bg-[var(--paper-1)] p-5 shadow-[var(--shadow-1)]" aria-label="Risk and evidence report preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.16em] text-[var(--accent-ink)]">Flagship artifact</p>
          <h3 className="mt-1 text-[length:var(--text-md)] font-semibold text-[var(--ink-900)]">Risk and Evidence Report</h3>
        </div>
        <Badge variant="neutral">Source-backed</Badge>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="font-mono text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">Executive summary</h4>
          <ul className="mt-2 space-y-2 text-[length:var(--text-sm)] leading-6 text-[var(--ink-700)]">
            {artifact.executiveSummary.map((claim) => (
              <li key={claim.id}>
                <SafeInlineMarkdown text={claim.text} /> <EvidenceRefs refs={claim.sourceRefs} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-mono text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">Risk register</h4>
          <ul className="mt-2 space-y-2 text-[length:var(--text-sm)] leading-6 text-[var(--ink-700)]">
            {artifact.risks.map((risk) => (
              <li key={risk.id} className="flex items-start justify-between gap-3">
                <span>
                  <SafeInlineMarkdown text={risk.text} />
                </span>
                <span className="shrink-0 font-mono text-[length:var(--text-2xs)] font-semibold uppercase text-[var(--ink-500)]">{risk.severity}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {artifact.obligations.length > 0 ? (
        <div className="mt-5 border-t border-[var(--rule)] pt-4">
          <h4 className="font-mono text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">Obligations / actions</h4>
          <ul className="mt-2 grid gap-2 text-[length:var(--text-sm)] leading-6 text-[var(--ink-700)]">
            {artifact.obligations.map((obligation) => (
              <li key={obligation.id} className="flex items-start justify-between gap-3">
                <span>
                  <SafeInlineMarkdown text={obligation.action} />
                </span>
                <EvidenceRefs refs={obligation.sourceRefs} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {artifact.tables.map((table) => (
        <div key={table.title} className="mt-5 overflow-x-auto border-t border-[var(--rule)] pt-4">
          <h4 className="font-mono text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">{table.title}</h4>
          <table className="mt-2 min-w-full text-left text-[length:var(--text-xs)]">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column} className="border-b border-[var(--rule)] px-2 py-2 font-semibold text-[var(--ink-500)]">
                    <SafeInlineMarkdown text={column} />
                  </th>
                ))}
                <th className="border-b border-[var(--rule)] px-2 py-2 font-semibold text-[var(--ink-500)]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${table.title}-${rowIndex}`}>
                  {row.values.map((value, valueIndex) => (
                    <td key={`${rowIndex}-${valueIndex}`} className="border-b border-[var(--rule)] px-2 py-2 text-[var(--ink-700)]">
                      <SafeInlineMarkdown text={String(value)} />
                    </td>
                  ))}
                  <td className="border-b border-[var(--rule)] px-2 py-2"><EvidenceRefs refs={row.sourceRefs} /></td>
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
