import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, getEmbeddingConfig, isEmbeddingsEnabled } from "@/lib/embeddings/embedText";
import { selectDocumentAwareResults } from "@/lib/search/documentCoverage";
import { fuseAndRerankCandidates } from "@/lib/search/fusion";
import { expandKnownRoleTerms, getKnownRoleConcepts } from "@/lib/search/queryEquivalents";
import {
  assertProviderPayloadExcludes,
  collectOriginalDeterministicIdentifiers,
  getPrivacyScopeId,
  getPrivacyScopeSecret,
  toProviderSafeQuery,
} from "@/lib/privacy/providerSafeText";
import type { PrivacyMode, RetrievalReason, SearchChunkResult } from "@/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "both",
  "by",
  "compare",
  "conclusion",
  "csv",
  "document",
  "docx",
  "explain",
  "fact",
  "facts",
  "file",
  "for",
  "from",
  "give",
  "grounded",
  "handles",
  "how",
  "important",
  "in",
  "is",
  "it",
  "its",
  "listed",
  "me",
  "of",
  "on",
  "one",
  "or",
  "pdf",
  "please",
  "requires",
  "using",
  "show",
  "that",
  "the",
  "these",
  "this",
  "those",
  "tell",
  "to",
  "was",
  "way",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "xlsx",
]);

const MIN_MEANINGFUL_CONTENT_CHARS = 40;
const MAX_RESULTS_PER_DOCUMENT_SOFT = 2;
const MAX_CANDIDATES_PER_DOCUMENT = 10;
const MIN_CANDIDATES_PER_DOCUMENT = 3;
const MAX_GLOBAL_CANDIDATES = 60;
const CTO_SEARCH_TERMS = new Set(["cto", "chief", "technology", "officer"]);

type DocumentMeta = {
  filename?: string | null;
  processing_mode?: PrivacyMode | null;
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
  provider_safe_content?: string | null;
  provider_safe_metadata?: Record<string, string | number | boolean | null> | null;
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

type LexicalChunkRow = Omit<SemanticChunkRow, "similarity"> & {
  lexical_rank: number;
  processing_mode?: PrivacyMode | null;
  provider_safe_content?: string | null;
  provider_safe_metadata?: Record<string, string | number | boolean | null> | null;
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
  missingRequiredDocumentIds: string[];
  retrievalReason: RetrievalReason;
  results: SearchChunkResult[];
  searchTerms: string[];
  privacyBoundary: boolean;
  providerSafeQuery: string;
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
  const matches = normalizeText(expandKnownRoleTerms(query)).split(" ").filter(Boolean);
  const terms = matches.filter((term) => term.length > 1 && !STOP_WORDS.has(term));

  return Array.from(new Set(terms)).slice(0, 24);
}

function getLexicalQueryVariants(query: string) {
  if (!getKnownRoleConcepts(query).includes("chief_technology_officer")) {
    return query.trim().length > 0 ? [query] : [];
  }

  const pseudonymTokens = query.match(/\[[A-Z][A-Z0-9_]*\]/g) ?? [];
  const queryWithoutPseudonyms = pseudonymTokens.reduce((value, token) => value.replaceAll(token, " "), query);
  const terms = getSearchTerms(queryWithoutPseudonyms);
  const nonRoleTerms = terms.filter((term) => !CTO_SEARCH_TERMS.has(term));
  const retainedTerms = [...pseudonymTokens, ...nonRoleTerms];

  return [
    [...retainedTerms, "cto"].join(" "),
    [...retainedTerms, "chief", "technology", "officer"].join(" "),
  ];
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
  const normalizedQuery = normalizeText(expandKnownRoleTerms(query));
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
    processingMode: documentMeta?.processing_mode ?? "standard",
    providerSafeContent: row.provider_safe_content ?? null,
    providerSafeMetadata: row.provider_safe_metadata ?? null,
    retrievalMode: "keyword",
  };
}

function mapSemanticChunk(
  row: SemanticChunkRow,
  filenamesByDocumentId: Map<string, string>,
  projectionsByChunkId: Map<string, Pick<SearchChunkResult, "processingMode" | "providerSafeContent" | "providerSafeMetadata">> = new Map()
): SearchChunkResult {
  const filename = filenamesByDocumentId.get(row.document_id);
  const projection = projectionsByChunkId.get(row.id);

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
    processingMode: projection?.processingMode ?? "standard",
    providerSafeContent: projection?.providerSafeContent ?? null,
    providerSafeMetadata: projection?.providerSafeMetadata ?? null,
    relevanceScore: row.similarity,
    retrievalMode: "semantic",
    semanticSimilarity: row.similarity,
  };
}

function mapLexicalChunk(row: LexicalChunkRow, filenamesByDocumentId: Map<string, string>): SearchChunkResult {
  const mapped = mapSemanticChunk(
    { ...row, similarity: row.lexical_rank },
    filenamesByDocumentId,
    new Map([
      [
        row.id,
        {
          processingMode: row.processing_mode ?? "standard",
          providerSafeContent: row.provider_safe_content ?? null,
          providerSafeMetadata: row.provider_safe_metadata ?? null,
        },
      ],
    ])
  );
  return { ...mapped, keywordScore: row.lexical_rank, relevanceScore: row.lexical_rank, retrievalMode: "keyword", semanticSimilarity: undefined };
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
  const balanced = balanceAcrossDocuments(candidates, limit);

  if (requiredDocumentIds.length < 2) {
    return {
      missingRequiredDocumentIds: [],
      results: balanced,
    };
  }

  return selectDocumentAwareResults([...balanced, ...candidates, ...fallbackResults], requiredDocumentIds, limit);
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
      keywordScore: score,
      relevanceScore: score,
      retrievalMode: "keyword" as const,
    }));
}

function getCandidateLimitPerDocument(limit: number, documentCount: number) {
  if (documentCount <= 0) {
    return Math.max(limit * 3, limit);
  }

  return Math.min(
    Math.max(Math.ceil((limit * 3) / documentCount), MIN_CANDIDATES_PER_DOCUMENT),
    MAX_CANDIDATES_PER_DOCUMENT
  );
}

function getFilenameTerms(filename: string) {
  return new Set(normalizeText(filename).split(" ").filter(Boolean));
}

function rankScopedKeywordResults(rows: SearchChunkResult[], query: string, terms: string[], documentIds: string[], limit: number) {
  if (documentIds.length === 0) {
    return rankKeywordResults(rows, query, terms, 20);
  }

  const candidateLimit = getCandidateLimitPerDocument(limit, documentIds.length);

  return documentIds
    .flatMap((documentId) => {
      const documentRows = rows.filter((row) => row.documentId === documentId);
      const filenameTerms = getFilenameTerms(documentRows[0]?.filename ?? "");
      const documentTerms = terms.filter((term) => !filenameTerms.has(term));

      return rankKeywordResults(documentRows, query, documentTerms, candidateLimit);
    })
    .sort((left, right) => (right.keywordScore ?? 0) - (left.keywordScore ?? 0));
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

async function getRetrievalDocuments(
  supabase: SupabaseClient,
  collectionId: string,
  userId: string,
  documentIds: string[]
) {
  let query = supabase
    .from("documents")
    .select("id,processing_mode")
    .eq("collection_id", collectionId)
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (documentIds.length > 0) query = query.in("id", documentIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((document) => ({
    id: String(document.id),
    processingMode: document.processing_mode === "privacy_minimised" ? ("privacy_minimised" as const) : ("standard" as const),
  }));
}

async function retrieveSemanticResults({
  collectionId,
  documentIds,
  limit,
  query,
  originalQuery,
  privacyBoundary,
  projectionsByChunkId,
  supabase,
  userId,
}: {
  collectionId: string;
  documentIds?: string[];
  limit: number;
  query: string;
  originalQuery: string;
  privacyBoundary: boolean;
  projectionsByChunkId: Map<string, Pick<SearchChunkResult, "processingMode" | "providerSafeContent" | "providerSafeMetadata">>;
  supabase: SupabaseClient;
  userId?: string;
}) {
  if (!userId || !isEmbeddingsEnabled()) {
    return [];
  }

  const embeddingConfig = getEmbeddingConfig();
  if (privacyBoundary) {
    assertProviderPayloadExcludes(
      { input: [query], input_type: "query" },
      collectOriginalDeterministicIdentifiers([originalQuery]),
      "embedding"
    );
  }
  const queryEmbedding = await embedText(query, {
    inputType: "query",
    maxCharacters: embeddingConfig.queryMaxCharacters,
  });
  let rows: SemanticChunkRow[] = [];

  if (documentIds && documentIds.length > 0) {
    const matchCount = getCandidateLimitPerDocument(limit, documentIds.length);
    const scopedMatches = await Promise.all(
      documentIds.map((documentId) =>
        supabase.rpc("match_document_chunks_for_document", {
          match_collection_id: collectionId,
          match_count: matchCount,
          match_document_id: documentId,
          match_user_id: userId,
          query_embedding: queryEmbedding.embedding,
        })
      )
    );
    const scopedError = scopedMatches.find((match) => match.error)?.error;

    if (scopedError) {
      throw scopedError;
    }

    rows = scopedMatches
      .flatMap((match) => (match.data ?? []) as SemanticChunkRow[])
      .sort((left, right) => right.similarity - left.similarity);
  } else {
    const { data, error } = await supabase.rpc("match_document_chunks", {
      match_collection_id: collectionId,
      match_count: 20,
      match_user_id: userId,
      query_embedding: queryEmbedding.embedding,
    });

    if (error) {
      throw error;
    }

    rows = (data ?? []) as SemanticChunkRow[];
  }
  const filenamesByDocumentId = await getDocumentFilenames(
    supabase,
    rows.map((row) => row.document_id)
  );

  const mappedRows = rows.map((row) => mapSemanticChunk(row, filenamesByDocumentId, projectionsByChunkId));

  return mappedRows;
}

async function retrieveLexicalResults({
  collectionId,
  documentModes,
  documentIds,
  limit,
  originalQuery,
  providerSafeQuery,
  supabase,
  userId,
}: {
  collectionId: string;
  documentModes: Map<string, PrivacyMode>;
  documentIds?: string[];
  limit: number;
  originalQuery: string;
  providerSafeQuery: string;
  supabase: SupabaseClient;
  userId?: string;
}) {
  if (!userId) return [];
  const scopedDocumentIds = documentIds?.filter(Boolean) ?? [];
  const candidateLimit = getCandidateLimitPerDocument(limit, scopedDocumentIds.length);
  const targets =
    scopedDocumentIds.length > 0
      ? scopedDocumentIds.map((documentId) => ({ documentId, mode: documentModes.get(documentId) ?? "standard" }))
      : Array.from(new Set(documentModes.values())).map((mode) => ({ documentId: null, mode }));
  const calls = targets.flatMap(({ documentId, mode }) => {
    const query = mode === "privacy_minimised" ? providerSafeQuery : originalQuery;

    return getLexicalQueryVariants(query).map((queryVariant) =>
      supabase.rpc("match_document_chunks_lexical_by_mode", {
        match_collection_id: collectionId,
        match_count:
          documentId === null ? Math.min(MAX_GLOBAL_CANDIDATES, Math.max(limit * 3, limit)) : candidateLimit,
        match_document_id: documentId,
        match_processing_mode: mode,
        match_query: queryVariant,
        match_user_id: userId,
      })
    );
  });

  if (calls.length === 0) return [];
  const matches = await Promise.all(calls);
  const error = matches.find((match) => match.error)?.error;
  if (error) throw error;
  const rows = matches.flatMap((match) => (match.data ?? []) as LexicalChunkRow[]);
  const filenames = await getDocumentFilenames(supabase, rows.map((row) => row.document_id));
  return rows.map((row) => mapLexicalChunk(row, filenames));
}

export async function retrieveRelevantChunks(
  supabase: SupabaseClient,
  { collectionId, documentIds, limit = 5, query, scanLimit = 500, userId }: RetrieveRelevantChunksOptions
): Promise<RetrieveRelevantChunksResult> {
  const scopedDocumentIds = documentIds ? Array.from(new Set(documentIds)).filter(Boolean) : [];
  let retrievalDocuments: Awaited<ReturnType<typeof getRetrievalDocuments>> = [];
  try {
    retrievalDocuments = userId ? await getRetrievalDocuments(supabase, collectionId, userId, scopedDocumentIds) : [];
  } catch (error) {
    return {
      error,
      missingRequiredDocumentIds: scopedDocumentIds.length > 1 ? scopedDocumentIds : [],
      privacyBoundary: false,
      providerSafeQuery: query,
      retrievalReason: "no_chunks_found",
      results: [],
      searchTerms: [],
    };
  }
  const documentModes = new Map(retrievalDocuments.map((document) => [document.id, document.processingMode]));
  const privacyBoundary = retrievalDocuments.some((document) => document.processingMode === "privacy_minimised");
  const providerSafeQuery = privacyBoundary
    ? toProviderSafeQuery(
        query,
        retrievalDocuments.map((document) => ({
          scopeId: getPrivacyScopeId(userId ?? "", document.id),
          scopeSecret: getPrivacyScopeSecret(),
        }))
      ).text
    : query;
  const terms = getSearchTerms(privacyBoundary ? providerSafeQuery : query);

  let chunksQuery = supabase
    .from("document_chunks")
    .select("id,document_id,collection_id,content,provider_safe_content,provider_safe_metadata,page_number,chunk_index,file_kind,location_label,metadata,documents!inner(filename,status,processing_mode)")
    .eq("collection_id", collectionId)
    .eq("documents.status", "ready")
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(Math.min(scanLimit, MAX_GLOBAL_CANDIDATES));

  if (scopedDocumentIds.length > 0) {
    chunksQuery = chunksQuery.in("document_id", scopedDocumentIds);
  }

  const { data, error } = await chunksQuery;

  if (error) {
    return {
      error,
      missingRequiredDocumentIds: scopedDocumentIds.length > 1 ? scopedDocumentIds : [],
      privacyBoundary,
      providerSafeQuery,
      retrievalReason: "no_chunks_found",
      results: [],
      searchTerms: terms,
    };
  }

  const rows = ((data ?? []) as SearchChunkRow[]).map((row) => mapChunk(row));
  const projectionsByChunkId = new Map(
    rows.map((row) => [
      row.id,
      {
        processingMode: row.processingMode,
        providerSafeContent: row.providerSafeContent,
        providerSafeMetadata: row.providerSafeMetadata,
      },
    ])
  );

  let keywordResults: SearchChunkResult[] = [];
  try {
    keywordResults = await retrieveLexicalResults({
      collectionId,
      documentModes,
      documentIds: scopedDocumentIds,
      limit,
      originalQuery: query,
      providerSafeQuery,
      supabase,
      userId,
    });
  } catch (lexicalError) {
    console.warn("[retrieve-chunks] PostgreSQL lexical retrieval failed; using bounded local fallback", {
      error: lexicalError && typeof lexicalError === "object" && "name" in lexicalError ? String(lexicalError.name) : "RetrievalError",
    });
    const standardRows = rows.filter((row) => row.processingMode !== "privacy_minimised");
    const privacyRows = rows
      .filter((row) => row.processingMode === "privacy_minimised")
      .map((row) => ({ ...row, content: row.providerSafeContent ?? "" }));
    const fallbackRanked = [
      ...rankScopedKeywordResults(standardRows, query, getSearchTerms(query), scopedDocumentIds, limit),
      ...rankScopedKeywordResults(privacyRows, providerSafeQuery, getSearchTerms(providerSafeQuery), scopedDocumentIds, limit),
    ].sort((left, right) => (right.keywordScore ?? 0) - (left.keywordScore ?? 0));
    const originalsById = new Map(rows.map((row) => [row.id, row]));
    keywordResults = fallbackRanked.map((result) => ({ ...result, content: originalsById.get(result.id)?.content ?? result.content }));
  }
  let semanticResults: SearchChunkResult[] = [];

  try {
    semanticResults = await retrieveSemanticResults({
      collectionId,
      documentIds: scopedDocumentIds,
      limit,
      query: expandKnownRoleTerms(providerSafeQuery),
      originalQuery: query,
      privacyBoundary,
      projectionsByChunkId,
      supabase,
      userId,
    });
  } catch (semanticError) {
    console.warn("[retrieve-chunks] semantic retrieval failed; falling back to keyword retrieval", {
      error: semanticError && typeof semanticError === "object" && "name" in semanticError ? String(semanticError.name) : "RetrievalError",
    });
  }

  if (keywordResults.length > 0 && semanticResults.length > 0) {
    const selection = cleanRetrievedResults(
      fuseAndRerankCandidates({
        keywordResults,
        limit: Math.max(limit * 3, limit, scopedDocumentIds.length * MIN_CANDIDATES_PER_DOCUMENT),
        query,
        semanticResults,
      }),
      limit,
      scopedDocumentIds,
      rows
    );

    return {
      error: null,
      missingRequiredDocumentIds: selection.missingRequiredDocumentIds,
      privacyBoundary,
      providerSafeQuery,
      retrievalReason: "hybrid_match",
      results: selection.results,
      searchTerms: terms,
    };
  }

  if (semanticResults.length > 0) {
    const selection = cleanRetrievedResults(semanticResults, limit, scopedDocumentIds, rows);

    return {
      error: null,
      missingRequiredDocumentIds: selection.missingRequiredDocumentIds,
      privacyBoundary,
      providerSafeQuery,
      retrievalReason: "semantic_match",
      results: selection.results,
      searchTerms: terms,
    };
  }

  if (keywordResults.length > 0) {
    const selection = cleanRetrievedResults(keywordResults, limit, scopedDocumentIds, rows);

    return {
      error: null,
      missingRequiredDocumentIds: selection.missingRequiredDocumentIds,
      privacyBoundary,
      providerSafeQuery,
      retrievalReason: "direct_keyword_match",
      results: selection.results,
      searchTerms: terms,
    };
  }

  if (rows.length > 0) {
    const selection = cleanRetrievedResults(rows, Math.min(limit, 3), scopedDocumentIds, rows);

    return {
      error: null,
      missingRequiredDocumentIds: selection.missingRequiredDocumentIds,
      privacyBoundary,
      providerSafeQuery,
      retrievalReason: "broad_context_fallback",
      results: selection.results,
      searchTerms: terms,
    };
  }

  return {
    error: null,
    missingRequiredDocumentIds: scopedDocumentIds.length > 1 ? scopedDocumentIds : [],
    privacyBoundary,
    providerSafeQuery,
    retrievalReason: "no_chunks_found",
    results: [],
    searchTerms: terms,
  };
}
