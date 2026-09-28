import type { SearchChunkResult } from "../../types/index.ts";
import { expandKnownRoleTerms } from "./queryEquivalents.ts";
import { extractIdentifiers } from "./identifiers.ts";

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

export function getDeterministicRerankBoost(result: SearchChunkResult, query: string) {
  const normalizedQuery = normalizeText(expandKnownRoleTerms(query));
  const normalizedFilename = normalizeText(result.filename);
  const normalizedContent = normalizeText(result.content);

  // WP2 (audit-r1): an exact identifier match (e.g. INC-5517 appearing in the
  // candidate content) is the strongest deterministic relevance signal we can
  // compute, so it earns the maximum boost. Identifier adjacency is checked on
  // the normalized phrase form ("inc 5517") which matches normalized content
  // ("incident id inc 5517 ...").
  const identifierPhrases = extractIdentifiers(query)
    .map((identifier) => normalizeText(identifier))
    .filter((phrase) => phrase.length > 0);
  if (identifierPhrases.length > 0 && identifierPhrases.some((phrase) => normalizedContent.includes(phrase))) {
    return 1;
  }

  const exactFilename = normalizedFilename.length > 2 && normalizedQuery.includes(normalizedFilename) ? 1 : 0;
  const uncommonToken = getSearchTerms(query).some((term) => term.length >= 6 && normalizedContent.includes(term)) ? 0.5 : 0;
  return Math.min(1, exactFilename * 0.7 + uncommonToken * 0.3);
}

type FusionCandidate = {
  keywordScore: number | null;
  result: SearchChunkResult;
  semanticSimilarity: number | null;
};

function mergeCandidates(keywordResults: SearchChunkResult[], semanticResults: SearchChunkResult[]) {
  const candidates = new Map<string, FusionCandidate>();
  for (const result of [...keywordResults, ...semanticResults]) {
    const current = candidates.get(result.id);
    candidates.set(result.id, {
      keywordScore: typeof result.keywordScore === "number" ? Math.max(current?.keywordScore ?? -Infinity, result.keywordScore) : current?.keywordScore ?? null,
      result: current?.result ?? result,
      semanticSimilarity: typeof result.semanticSimilarity === "number" ? Math.max(current?.semanticSimilarity ?? -Infinity, result.semanticSimilarity) : current?.semanticSimilarity ?? null,
    });
  }
  return Array.from(candidates.values());
}

/**
 * WP2 (audit-r1): Reciprocal Rank Fusion. score = Σ 1/(k + rank_in_lane) over
 * the lexical and semantic lanes, plus 0.001 × deterministic boost as a
 * tie-breaker term (never dominant). Ties order deterministically by filename
 * then chunkIndex. If the query carries an identifier, at least one candidate
 * containing that exact identifier is guaranteed a slot in the final result —
 * an exact-ID question can never be fused out of the context entirely.
 */
export function fuseCandidatesRrf({
  keywordResults,
  limit,
  query,
  semanticResults,
  k = 60,
}: {
  keywordResults: SearchChunkResult[];
  limit: number;
  query: string;
  semanticResults: SearchChunkResult[];
  k?: number;
}) {
  const candidates = mergeCandidates(keywordResults, semanticResults);

  const rankLane = (lane: SearchChunkResult[], scoreOf: (result: SearchChunkResult) => number | null | undefined) => {
    const ordered = lane
      .map((result, index) => ({ index, result, score: scoreOf(result) }))
      .sort((left, right) => {
        const leftScore = typeof left.score === "number" && Number.isFinite(left.score) ? left.score : -Infinity;
        const rightScore = typeof right.score === "number" && Number.isFinite(right.score) ? right.score : -Infinity;
        if (rightScore !== leftScore) return rightScore - leftScore;
        if (left.result.filename !== right.result.filename) return left.result.filename.localeCompare(right.result.filename);
        return left.result.chunkIndex - right.result.chunkIndex;
      });
    const ranks = new Map<string, number>();
    ordered.forEach((entry, position) => ranks.set(entry.result.id, position + 1));
    return ranks;
  };

  const keywordRanks = rankLane(keywordResults, (result) => result.keywordScore);
  const semanticRanks = rankLane(semanticResults, (result) => result.semanticSimilarity);

  const scored = candidates.map((candidate) => {
    let score = 0;
    const keywordRank = keywordRanks.get(candidate.result.id);
    if (keywordRank !== undefined) score += 1 / (k + keywordRank);
    const semanticRank = semanticRanks.get(candidate.result.id);
    if (semanticRank !== undefined) score += 1 / (k + semanticRank);
    score += 0.001 * getDeterministicRerankBoost(candidate.result, query);
    return { candidate, score };
  });

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.candidate.result.filename.localeCompare(right.candidate.result.filename) ||
      left.candidate.result.chunkIndex - right.candidate.result.chunkIndex
  );

  let selected = scored.slice(0, limit);

  // Guaranteed identifier slot: if the query contains an identifier and none
  // of the selected candidates contains it, promote the best-ranked
  // identifier-bearing candidate into the final slot.
  const identifierPhrases = extractIdentifiers(query)
    .map((identifier) => normalizeText(identifier))
    .filter((phrase) => phrase.length > 0);
  if (identifierPhrases.length > 0) {
    const containsIdentifier = (result: SearchChunkResult) => identifierPhrases.some((phrase) => normalizeText(result.content).includes(phrase));
    if (!selected.some(({ candidate }) => containsIdentifier(candidate.result))) {
      const rescue = scored.find(({ candidate }) => containsIdentifier(candidate.result));
      if (rescue) {
        selected = [...selected.slice(0, Math.max(0, limit - 1)), rescue];
      }
    }
  }

  return selected.map(({ candidate, score }) => ({
    ...candidate.result,
    fusionScore: score,
    keywordScore: candidate.keywordScore,
    relevanceScore: candidate.semanticSimilarity ?? candidate.keywordScore ?? candidate.result.relevanceScore,
    retrievalMode: candidate.keywordScore !== null && candidate.semanticSimilarity !== null ? ("hybrid" as const) : candidate.result.retrievalMode,
    semanticSimilarity: candidate.semanticSimilarity,
  }));
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
  const ranked = mergeCandidates(keywordResults, semanticResults);
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
