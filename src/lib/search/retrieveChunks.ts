import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, getEmbeddingConfig, isEmbeddingsEnabled } from "@/lib/embeddings/embedText";
import { ensureDocumentCoverage } from "@/lib/search/documentCoverage";
import type { RetrievalReason, SearchChunkResult } from "@/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "document",
  "file",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "listed",
  "me",
  "of",
  "on",
  "or",
  "pdf",
  "please",
  "show",
  "that",
  "the",
  "these",
  "this",
  "those",
  "tell",
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

const MIN_MEANINGFUL_CONTENT_CHARS = 40;
const MAX_RESULTS_PER_DOCUMENT_SOFT = 2;

type DocumentMeta = {
  filename?: string | null;
  status?: string | null;
};

type SearchChunkRow = {
  id: string;
  document_id: string;
  collection_id: string;
  content: string;
  page_number: number;
  chunk_index: number;
  file_kind?: string | null;
  location_label?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  documents: DocumentMeta | DocumentMeta[] | null;
};

type SemanticChunkRow = {
  id: string;
  document_id: string;
  collection_id: string;
  content: string;
  page_number: number;
  chunk_index: number;
  file_kind?: string | null;
  location_label?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  similarity: number;
};

type RetrieveRelevantChunksOptions = {
  collectionId: string;
  documentIds?: string[];
  limit?: number;
  query: string;
  scanLimit?: number;
  userId?: string;
};

type RetrieveRelevantChunksResult = {
  error: unknown | null;
  retrievalReason: RetrievalReason;
  results: SearchChunkResult[];
  searchTerms: string[];
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTerms(query: string) {
  const matches = normalizeText(query).split(" ").filter(Boolean);
  const terms = matches.filter((term) => term.length > 1 && !STOP_WORDS.has(term));

  return Array.from(new Set(terms)).slice(0, 12);
}

function countOccurrences(value: string, term: string) {
  let count = 0;
  let position = value.indexOf(term);

  while (position !== -1) {
    count += 1;
    position = value.indexOf(term, position + term.length);
  }

  return count;
}

function getTermVariants(term: string) {
  const variants = new Set([term]);

  if (term.length > 4 && term.endsWith("ies")) {
    variants.add(`${term.slice(0, -3)}y`);
  }

  if (term.length > 4 && term.endsWith("ing")) {
    variants.add(term.slice(0, -3));
  }

  if (term.length > 4 && term.endsWith("ed")) {
    variants.add(term.slice(0, -2));
  }

  if (term.length > 3 && term.endsWith("s")) {
    variants.add(term.slice(0, -1));
  }

  return Array.from(variants).filter((variant) => variant.length > 2);
}

function countPartialMatches(tokens: string[], term: string) {
  if (term.length < 4) {
    return 0;
  }

  return tokens.filter((token) => token.length >= 4 && (token.startsWith(term) || term.startsWith(token))).length;
}

function scoreContent(content: string, query: string, terms: string[]) {
  const normalizedContent = normalizeText(content);
  const normalizedQuery = normalizeText(query);
  const contentTokens = normalizedContent.split(" ").filter(Boolean);
  let score = normalizedQuery.length > 8 && normalizedContent.includes(normalizedQuery) ? 20 : 0;

  for (const term of terms) {
    const variants = getTermVariants(term);

    if (variants.length === 0) {
      continue;
    }

    const exactOccurrences = Math.max(...variants.map((variant) => countOccurrences(normalizedContent, variant)));

    if (exactOccurrences > 0) {
      score += exactOccurrences * (term.length >= 6 ? 3 : 1);
      continue;
    }

    const partialMatches = Math.max(...variants.map((variant) => countPartialMatches(contentTokens, variant)));

    if (partialMatches > 0) {
      score += partialMatches;
    }
  }

  if (terms.length > 1 && terms.every((term) => getTermVariants(term).some((variant) => normalizedContent.includes(variant)))) {
    score += 8;
  }

  return score;
}

function getDocumentMeta(documents: SearchChunkRow["documents"]) {
  if (Array.isArray(documents)) {
    return documents[0] ?? null;
  }

  return documents;
}

function mapChunk(row: SearchChunkRow): SearchChunkResult {
  const documentMeta = getDocumentMeta(row.documents);
  const filename =
    typeof documentMeta?.filename === "string" && documentMeta.filename.trim().length > 0
      ? documentMeta.filename
      : "Untitled document";

  return {
    id: row.id,
    documentId: row.document_id,
    collectionId: row.collection_id,
    content: typeof row.content === "string" ? row.content : "",
    fileKind: row.file_kind ?? null,
    pageNumber: row.page_number,
    chunkIndex: row.chunk_index,
    filename,
    locationLabel: row.location_label ?? null,
    metadata: row.metadata ?? null,
    retrievalMode: "keyword",
  };
}

function mapSemanticChunk(row: SemanticChunkRow, filenamesByDocumentId: Map<string, string>): SearchChunkResult {
  const filename = filenamesByDocumentId.get(row.document_id);

  return {
    id: row.id,
    documentId: row.document_id,
    collectionId: row.collection_id,
    content: typeof row.content === "string" ? row.content : "",
    fileKind: row.file_kind ?? null,
    pageNumber: row.page_number,
    chunkIndex: row.chunk_index,
    filename: filename && filename.trim().length > 0 ? filename : "Untitled document",
    locationLabel: row.location_label ?? null,
    metadata: row.metadata ?? null,
    relevanceScore: row.similarity,
    retrievalMode: "semantic",
  };
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

function balanceAcrossDocuments(results: SearchChunkResult[], limit: number) {
  const selected: SearchChunkResult[] = [];
  const deferred: SearchChunkResult[] = [];
  const selectedByDocumentId = new Map<string, number>();

  for (const result of results) {
    const currentCount = selectedByDocumentId.get(result.documentId) ?? 0;

    if (currentCount < MAX_RESULTS_PER_DOCUMENT_SOFT) {
      selected.push(result);
      selectedByDocumentId.set(result.documentId, currentCount + 1);
      continue;
    }

    deferred.push(result);
  }

  for (const result of deferred) {
    if (selected.length >= limit) {
      break;
    }

    selected.push(result);
  }

  return selected.slice(0, limit);
}

function cleanRetrievedResults(results: SearchChunkResult[], limit: number, requiredDocumentIds: string[] = [], fallbackResults: SearchChunkResult[] = []) {
  const deduped = dedupeResults(results);
  const meaningful = deduped.filter(hasMeaningfulContent);
  const candidates = meaningful.length > 0 ? meaningful : deduped;

  return ensureDocumentCoverage(balanceAcrossDocuments(candidates, limit), candidates.concat(fallbackResults), requiredDocumentIds, limit);
}

function rankKeywordResults(rows: SearchChunkResult[], query: string, terms: string[], limit: number) {
  if (terms.length === 0) {
    return [];
  }

  return rows
    .map((result) => ({
      result,
      score: scoreContent(result.content, query, terms),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.result.filename !== right.result.filename) {
        return left.result.filename.localeCompare(right.result.filename);
      }

      return left.result.chunkIndex - right.result.chunkIndex;
    })
    .slice(0, limit)
    .map(({ result, score }) => ({
      ...result,
      relevanceScore: score,
      retrievalMode: "keyword" as const,
    }));
}

async function getDocumentFilenames(supabase: SupabaseClient, documentIds: string[]) {
  if (documentIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase.from("documents").select("id,filename").in("id", Array.from(new Set(documentIds)));

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((document) => [String(document.id), String(document.filename)]));
}

async function retrieveSemanticResults({
  collectionId,
  documentIds,
  query,
  supabase,
  userId,
}: {
  collectionId: string;
  documentIds?: string[];
  query: string;
  supabase: SupabaseClient;
  userId?: string;
}) {
  if (!userId || !isEmbeddingsEnabled()) {
    return [];
  }

  const embeddingConfig = getEmbeddingConfig();
  const queryEmbedding = await embedText(query, {
    inputType: "query",
    maxCharacters: embeddingConfig.queryMaxCharacters,
  });
  const { data, error } = await supabase.rpc("match_document_chunks", {
    match_collection_id: collectionId,
    match_count: 20,
    match_user_id: userId,
    query_embedding: queryEmbedding.embedding,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SemanticChunkRow[];
  const filenamesByDocumentId = await getDocumentFilenames(
    supabase,
    rows.map((row) => row.document_id)
  );

  const mappedRows = rows.map((row) => mapSemanticChunk(row, filenamesByDocumentId));

  if (!documentIds || documentIds.length === 0) {
    return mappedRows;
  }

  const allowedDocumentIds = new Set(documentIds);

  return mappedRows.filter((row) => allowedDocumentIds.has(row.documentId));
}

function mergeWithReciprocalRankFusion({
  keywordResults,
  limit,
  semanticResults,
}: {
  keywordResults: SearchChunkResult[];
  limit: number;
  semanticResults: SearchChunkResult[];
}) {
  const reciprocalRankK = 60;
  const ranked = new Map<
    string,
    {
      result: SearchChunkResult;
      score: number;
    }
  >();

  function addResults(results: SearchChunkResult[]) {
    results.forEach((result, index) => {
      const current = ranked.get(result.id);
      const score = 1 / (reciprocalRankK + index + 1);

      ranked.set(result.id, {
        result,
        score: (current?.score ?? 0) + score,
      });
    });
  }

  addResults(keywordResults);
  addResults(semanticResults);

  return Array.from(ranked.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ result }) => result);
}

export async function retrieveRelevantChunks(
  supabase: SupabaseClient,
  { collectionId, documentIds, limit = 5, query, scanLimit = 500, userId }: RetrieveRelevantChunksOptions
): Promise<RetrieveRelevantChunksResult> {
  const terms = getSearchTerms(query);
  const scopedDocumentIds = documentIds ? Array.from(new Set(documentIds)).filter(Boolean) : [];

  let chunksQuery = supabase
    .from("document_chunks")
    .select("id,document_id,collection_id,content,page_number,chunk_index,file_kind,location_label,metadata,documents!inner(filename,status)")
    .eq("collection_id", collectionId)
    .eq("documents.status", "ready")
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(scanLimit);

  if (scopedDocumentIds.length > 0) {
    chunksQuery = chunksQuery.in("document_id", scopedDocumentIds);
  }

  const { data, error } = await chunksQuery;

  if (error) {
    return {
      error,
      retrievalReason: "no_chunks_found",
      results: [],
      searchTerms: terms,
    };
  }

  const rows = ((data ?? []) as SearchChunkRow[]).map((row) => mapChunk(row));

  if (rows.length === 0) {
    return {
      error: null,
      retrievalReason: "no_chunks_found",
      results: [],
      searchTerms: terms,
    };
  }

  const keywordResults = rankKeywordResults(rows, query, terms, 20);
  let semanticResults: SearchChunkResult[] = [];

  try {
    semanticResults = await retrieveSemanticResults({
      collectionId,
      documentIds: scopedDocumentIds,
      query,
      supabase,
      userId,
    });
  } catch (semanticError) {
    console.warn("[retrieve-chunks] semantic retrieval failed; falling back to keyword retrieval", {
      error: semanticError instanceof Error ? semanticError.message : String(semanticError),
    });
  }

  if (keywordResults.length > 0 && semanticResults.length > 0) {
    return {
      error: null,
      retrievalReason: "hybrid_match",
      results: cleanRetrievedResults(
        mergeWithReciprocalRankFusion({
          keywordResults,
          limit: Math.max(limit * 3, limit),
          semanticResults,
        }),
        limit,
        scopedDocumentIds,
        rows
      ),
      searchTerms: terms,
    };
  }

  if (semanticResults.length > 0) {
    return {
      error: null,
      retrievalReason: "semantic_match",
      results: cleanRetrievedResults(semanticResults, limit, scopedDocumentIds, rows),
      searchTerms: terms,
    };
  }

  if (keywordResults.length > 0) {
    return {
      error: null,
      retrievalReason: "direct_keyword_match",
      results: cleanRetrievedResults(keywordResults, limit, scopedDocumentIds, rows),
      searchTerms: terms,
    };
  }

  if (rows.length > 0) {
    return {
      error: null,
      retrievalReason: "broad_context_fallback",
      results: cleanRetrievedResults(rows, Math.min(limit, 3)),
      searchTerms: terms,
    };
  }

  return {
    error: null,
    retrievalReason: "no_chunks_found",
    results: [],
    searchTerms: terms,
  };
}
