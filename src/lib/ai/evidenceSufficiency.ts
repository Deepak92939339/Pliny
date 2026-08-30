import type { CitationValidationResult } from "../citations/validateCitations.ts";
import type { EvidenceStatus, RetrievalReason, SearchChunkResult } from "../../types/index.ts";

const MIN_MEANINGFUL_CONTENT_CHARS = 40;
const MAX_EVIDENCE_SOURCES = 10;
const MAX_EVIDENCE_CHARS_PER_SOURCE = 3_000;
const MIN_SEMANTIC_SIMILARITY = 0.55;

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "please",
  "tell",
  "that",
  "the",
  "these",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

export type EvidenceSufficiencyResult = {
  evidenceStatus: EvidenceStatus;
  sufficient: boolean;
  reason: string;
  meaningfulSourceCount: number;
  matchedTermCount: number;
  requiredTermCount: number;
  validCitationCount: number;
};

type EvidenceSufficiencyOptions = {
  citationValidation?: CitationValidationResult | null;
  question: string;
  retrievalReason: RetrievalReason;
  sources: readonly SearchChunkResult[];
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTerms(question: string) {
  return Array.from(
    new Set(
      normalize(question)
        .split(" ")
        .filter((term) => term.length >= 4 && !STOP_WORDS.has(term))
    )
  ).slice(0, 12);
}

function termMatchesContent(term: string, content: string) {
  const tokens = new Set(normalize(content).split(" ").filter(Boolean));

  if (tokens.has(term)) {
    return true;
  }

  return Array.from(tokens).some((token) => token.length >= 5 && (token.startsWith(term) || term.startsWith(token)));
}

function getSemanticScore(source: SearchChunkResult) {
  return source.retrievalMode === "semantic" && typeof source.relevanceScore === "number" && Number.isFinite(source.relevanceScore)
    ? source.relevanceScore
    : null;
}

export function assessEvidenceSufficiency({
  citationValidation,
  question,
  retrievalReason,
  sources,
}: EvidenceSufficiencyOptions): EvidenceSufficiencyResult {
  const meaningfulSources = sources.filter((source) => normalize(source.content).length >= MIN_MEANINGFUL_CONTENT_CHARS);
  const terms = meaningfulTerms(question);
  const matchedTerms = new Set(terms.filter((term) => meaningfulSources.some((source) => termMatchesContent(term, source.content))));
  const requiredTermCount = terms.length >= 4 ? 2 : terms.length > 0 ? 1 : 0;
  const topSemanticScore = Math.max(...sources.map(getSemanticScore).filter((score): score is number => score !== null), -1);
  const hasLexicalSupport = requiredTermCount > 0 && matchedTerms.size >= requiredTermCount;
  const hasSemanticSupport = topSemanticScore >= MIN_SEMANTIC_SIMILARITY;
  const evidenceIsBounded = sources.length > 0 && sources.length <= MAX_EVIDENCE_SOURCES && sources.every((source) => source.content.length <= MAX_EVIDENCE_CHARS_PER_SOURCE);
  const retrievalIsUseful = retrievalReason !== "no_chunks_found" && retrievalReason !== "broad_context_fallback";
  const citationIsValid = !citationValidation || !citationValidation.rejectedAnswer;
  const sufficient = evidenceIsBounded && meaningfulSources.length > 0 && retrievalIsUseful && (hasLexicalSupport || hasSemanticSupport) && citationIsValid;

  let reason = "Evidence is sufficiently bounded, relevant, and citation-valid.";

  if (!evidenceIsBounded) {
    reason = "Retrieved evidence exceeded the bounded source limits.";
  } else if (meaningfulSources.length === 0) {
    reason = "Retrieved passages do not contain meaningful source text.";
  } else if (!retrievalIsUseful) {
    reason = "Retrieval returned only broad or empty context.";
  } else if (!hasLexicalSupport && !hasSemanticSupport) {
    reason = "Retrieved passages do not provide enough lexical or semantic support for the question.";
  } else if (!citationIsValid) {
    reason = "The generated answer contained invalid or missing citations.";
  }

  return {
    evidenceStatus: sufficient ? "strong" : meaningfulSources.length > 0 ? "weak" : "none",
    sufficient,
    reason,
    meaningfulSourceCount: meaningfulSources.length,
    matchedTermCount: matchedTerms.size,
    requiredTermCount,
    validCitationCount: citationValidation?.validMarkers.length ?? 0,
  };
}
