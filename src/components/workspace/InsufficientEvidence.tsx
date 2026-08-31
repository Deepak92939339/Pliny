import type { SearchChunkResult } from "@/types";

type InsufficientEvidenceProps = {
  closestMatches: SearchChunkResult[];
  missingEvidence: string[];
  reason: string;
};

function getLocation(source: SearchChunkResult) {
  if (source.locationLabel && source.locationLabel !== "Source passage") {
    return source.locationLabel;
  }

  return source.pageNumber > 0 ? `Page ${source.pageNumber}` : `Chunk ${source.chunkIndex + 1}`;
}

export function InsufficientEvidence({ closestMatches, missingEvidence, reason }: InsufficientEvidenceProps) {
  return (
    <section
      aria-label="Insufficient evidence"
      className="rounded-2xl border border-[#D9CBBB] bg-[#FBF8F3] p-5 shadow-[0_8px_22px_rgba(72,48,31,0.04)]"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFE5D8] text-[#8F3F28]">
          <span aria-hidden="true">!</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-[color:var(--editorial-ink)]">Insufficient evidence</h3>
          <p className="mt-1 text-sm leading-6 text-[color:var(--editorial-ink-soft)]">{reason}</p>
        </div>
      </div>

      {missingEvidence.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--editorial-muted)]">What is missing</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[color:var(--editorial-ink-soft)]">
            {missingEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {closestMatches.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--editorial-border-soft)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--editorial-muted)]">Closest retrieved matches</p>
          <ul className="mt-2 space-y-2">
            {closestMatches.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3 text-sm text-[color:var(--editorial-ink-soft)]">
                <span className="truncate">{source.filename}</span>
                <span className="shrink-0 text-xs text-[color:var(--editorial-muted)]">{getLocation(source)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-xs leading-5 text-[color:var(--editorial-muted)]">No report or chart was generated because the available evidence could not be verified for this question.</p>
    </section>
  );
}
