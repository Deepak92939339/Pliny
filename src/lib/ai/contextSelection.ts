import { expandKnownRoleTerms } from "../search/queryEquivalents.ts";
import type { SearchChunkResult } from "../../types/index.ts";

const MIN_PASSAGE_CHARACTERS = 160;
const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "from",
  "have",
  "into",
  "that",
  "the",
  "their",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
]);

type ContextSelectionOptions = {
  maxCharactersPerChunk: number;
  maxTotalCharacters: number;
  providerSafeQuestion?: string;
  question: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuestionTerms(question: string) {
  return Array.from(
    new Set(
      normalize(expandKnownRoleTerms(question))
        .split(" ")
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  );
}

function scorePassage(passage: string, terms: string[]) {
  const normalized = normalize(passage);

  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function addOmissionMarkers(value: string, omittedBefore: boolean, omittedAfter: boolean, maxCharacters: number) {
  const prefix = omittedBefore ? "… " : "";
  const suffix = omittedAfter ? " …" : "";
  const availableCharacters = Math.max(1, maxCharacters - prefix.length - suffix.length);
  const boundedValue = value.length <= availableCharacters ? value : value.slice(0, availableCharacters).trimEnd();

  return `${prefix}${boundedValue}${suffix}`.slice(0, maxCharacters);
}

function selectWordBoundedWindow(content: string, terms: string[], maxCharacters: number) {
  const lowerContent = content.toLowerCase();
  const matchOffsets = terms.map((term) => lowerContent.indexOf(term)).filter((offset) => offset >= 0);
  const anchor = matchOffsets.length > 0 ? Math.min(...matchOffsets) : 0;
  let start = Math.max(0, Math.min(anchor - Math.floor(maxCharacters / 3), content.length - maxCharacters));
  let end = Math.min(content.length, start + maxCharacters);

  if (start > 0) {
    const nextSpace = content.indexOf(" ", start);
    if (nextSpace > start && nextSpace < end) start = nextSpace + 1;
  }
  if (end < content.length) {
    const previousSpace = content.lastIndexOf(" ", end);
    if (previousSpace > start) end = previousSpace;
  }

  return addOmissionMarkers(content.slice(start, end).trim(), start > 0, end < content.length, maxCharacters);
}

export function selectRelevantPassage(content: string, question: string, maxCharacters: number) {
  const trimmedContent = content.trim();
  if (trimmedContent.length <= maxCharacters) return trimmedContent;

  const terms = getQuestionTerms(question);
  const passages = trimmedContent
    .match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|\n+|$)/g)
    ?.map((passage) => passage.trim())
    .filter(Boolean) ?? [];

  if (passages.length < 2 || passages.some((passage) => passage.length > maxCharacters)) {
    return selectWordBoundedWindow(trimmedContent, terms, maxCharacters);
  }

  const scores = passages.map((passage) => scorePassage(passage, terms));
  let startIndex = scores.reduce((best, score, index) => (score > scores[best] ? index : best), 0);
  let endIndex = startIndex;
  let selectedLength = passages[startIndex].length;

  while (true) {
    const leftIndex = startIndex - 1;
    const rightIndex = endIndex + 1;
    const candidates = [
      leftIndex >= 0 ? { index: leftIndex, side: "left" as const } : null,
      rightIndex < passages.length ? { index: rightIndex, side: "right" as const } : null,
    ]
      .filter((candidate): candidate is { index: number; side: "left" | "right" } => candidate !== null)
      .sort((left, right) => scores[right.index] - scores[left.index] || passages[left.index].length - passages[right.index].length);
    const candidate = candidates.find(({ index }) => selectedLength + 1 + passages[index].length <= maxCharacters - 4);

    if (!candidate) break;
    if (candidate.side === "left") startIndex = candidate.index;
    else endIndex = candidate.index;
    selectedLength += 1 + passages[candidate.index].length;
  }

  return addOmissionMarkers(
    passages.slice(startIndex, endIndex + 1).join(" "),
    startIndex > 0,
    endIndex < passages.length - 1,
    maxCharacters
  );
}

export function selectPromptChunks(chunks: readonly SearchChunkResult[], options: ContextSelectionOptions) {
  const maxCharactersPerChunk = Math.max(MIN_PASSAGE_CHARACTERS, Math.floor(options.maxCharactersPerChunk));
  let remainingCharacters = Math.max(MIN_PASSAGE_CHARACTERS, Math.floor(options.maxTotalCharacters));
  const selected: SearchChunkResult[] = [];

  for (const chunk of chunks) {
    if (remainingCharacters < MIN_PASSAGE_CHARACTERS) break;

    const chunkBudget = Math.min(maxCharactersPerChunk, remainingCharacters);
    const content = selectRelevantPassage(chunk.content, options.question, chunkBudget);
    if (!content) continue;

    const providerSafeContent = chunk.providerSafeContent
      ? selectRelevantPassage(chunk.providerSafeContent, options.providerSafeQuestion ?? options.question, chunkBudget)
      : chunk.providerSafeContent;

    selected.push({ ...chunk, content, providerSafeContent });
    remainingCharacters -= Math.max(content.length, providerSafeContent?.length ?? 0);
  }

  return selected;
}
