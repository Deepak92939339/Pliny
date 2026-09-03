import type { SearchChunkResult } from "../../types/index.ts";
import { expandKnownRoleTerms } from "./queryEquivalents.ts";

const STOP_WORDS = new Set(["a", "an", "and", "both", "document", "explain", "file", "for", "from", "how", "is", "of", "the", "to", "using", "with"]);

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function getSearchTerms(query: string) {
  return Array.from(new Set(normalizeText(expandKnownRoleTerms(query)).split(" ").filter((term) => term.length > 1 && !STOP_WORDS.has(term)))).slice(0, 24);
}

export function normalizeScores(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  return values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    if (!Number.isFinite(minimum) || maximum === minimum) return 1;
    return (value - minimum) / (maximum - minimum);
  });
}

function getDeterministicRerankBoost(result: SearchChunkResult, query: string) {
  const normalizedQuery = normalizeText(expandKnownRoleTerms(query));
  const normalizedFilename = normalizeText(result.filename);
  const normalizedContent = normalizeText(result.content);
  const exactFilename = normalizedFilename.length > 2 && normalizedQuery.includes(normalizedFilename) ? 1 : 0;
  const uncommonToken = getSearchTerms(query).some((term) => term.length >= 6 && normalizedContent.includes(term)) ? 0.5 : 0;
  return Math.min(1, exactFilename * 0.7 + uncommonToken * 0.3);
}

export function fuseAndRerankCandidates({
  keywordResults,
  limit,
  query,
  semanticResults,
}: {
  keywordResults: SearchChunkResult[];
  limit: number;
  query: string;
  semanticResults: SearchChunkResult[];
}) {
  const candidates = new Map<string, { keywordScore: number | null; result: SearchChunkResult; semanticSimilarity: number | null }>();
  for (const result of [...keywordResults, ...semanticResults]) {
    const current = candidates.get(result.id);
    candidates.set(result.id, {
      keywordScore: typeof result.keywordScore === "number" ? Math.max(current?.keywordScore ?? -Infinity, result.keywordScore) : current?.keywordScore ?? null,
      result: current?.result ?? result,
      semanticSimilarity: typeof result.semanticSimilarity === "number" ? Math.max(current?.semanticSimilarity ?? -Infinity, result.semanticSimilarity) : current?.semanticSimilarity ?? null,
    });
  }
  const ranked = Array.from(candidates.values());
  const semanticNormalized = normalizeScores(ranked.map((candidate) => candidate.semanticSimilarity));
  const lexicalNormalized = normalizeScores(ranked.map((candidate) => candidate.keywordScore));
  return ranked
    .map((candidate, index) => ({
      ...candidate.result,
      fusionScore: semanticNormalized[index] * 0.55 + lexicalNormalized[index] * 0.35 + getDeterministicRerankBoost(candidate.result, query) * 0.1,
      keywordScore: candidate.keywordScore,
      relevanceScore: candidate.semanticSimilarity ?? candidate.keywordScore ?? candidate.result.relevanceScore,
      retrievalMode: candidate.keywordScore !== null && candidate.semanticSimilarity !== null ? "hybrid" as const : candidate.result.retrievalMode,
      semanticSimilarity: candidate.semanticSimilarity,
    }))
    .sort((left, right) => (right.fusionScore ?? 0) - (left.fusionScore ?? 0) || left.filename.localeCompare(right.filename) || left.chunkIndex - right.chunkIndex)
    .slice(0, limit);
}
