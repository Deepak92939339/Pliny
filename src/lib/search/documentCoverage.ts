import type { SearchChunkResult } from "../../types/index.ts";

const MIN_MEANINGFUL_CONTENT_CHARS = 40;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocationDedupKey(result: SearchChunkResult) {
  const location = result.locationLabel?.trim() || `${result.pageNumber}:${result.chunkIndex}`;

  return `${result.documentId}:${result.fileKind ?? "unknown"}:${location}:${result.chunkIndex}`;
}

function getContentDedupKey(result: SearchChunkResult) {
  const normalizedContent = normalizeText(result.content);

  if (normalizedContent.length < MIN_MEANINGFUL_CONTENT_CHARS) {
    return null;
  }

  return `${result.documentId}:${normalizedContent.slice(0, 600)}`;
}

function hasMeaningfulContent(result: SearchChunkResult) {
  return normalizeText(result.content).length >= MIN_MEANINGFUL_CONTENT_CHARS;
}

function dedupeResults(results: SearchChunkResult[]) {
  const seenIds = new Set<string>();
  const seenLocations = new Set<string>();
  const seenContent = new Set<string>();
  const deduped: SearchChunkResult[] = [];

  for (const result of results) {
    const locationKey = getLocationDedupKey(result);
    const contentKey = getContentDedupKey(result);

    if (seenIds.has(result.id) || seenLocations.has(locationKey) || (contentKey !== null && seenContent.has(contentKey))) {
      continue;
    }

    seenIds.add(result.id);
    seenLocations.add(locationKey);

    if (contentKey !== null) {
      seenContent.add(contentKey);
    }

    deduped.push(result);
  }

  return deduped;
}

export function ensureDocumentCoverage(
  results: SearchChunkResult[],
  fallbackResults: SearchChunkResult[],
  requiredDocumentIds: string[],
  limit: number
) {
  const uniqueRequiredDocumentIds = Array.from(new Set(requiredDocumentIds));

  if (uniqueRequiredDocumentIds.length < 2 || limit < uniqueRequiredDocumentIds.length) {
    return results.slice(0, limit);
  }

  const selected = results.slice(0, limit);
  const candidates = dedupeResults([...results, ...fallbackResults]).filter(hasMeaningfulContent);

  for (const documentId of uniqueRequiredDocumentIds) {
    if (selected.some((result) => result.documentId === documentId)) {
      continue;
    }

    const candidate = candidates.find(
      (result) => result.documentId === documentId && !selected.some((selectedResult) => selectedResult.id === result.id)
    );

    if (!candidate) {
      continue;
    }

    const removableIndex = [...selected.keys()]
      .reverse()
      .find((index) => {
        const selectedDocumentId = selected[index].documentId;
        const selectedCount = selected.filter((selectedResult) => selectedResult.documentId === selectedDocumentId).length;

        return selectedCount > 1 || !uniqueRequiredDocumentIds.includes(selectedDocumentId);
      });

    if (removableIndex === undefined) {
      continue;
    }

    selected.splice(removableIndex, 1, candidate);
  }

  return selected.slice(0, limit);
}
