export type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type CollectionListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
};

export type DocumentStatus = "processing" | "ready" | "failed";
export type DocumentProcessingStage = "validating" | "uploading" | "extracting" | "ocr_fallback" | "chunking" | "embedding" | "indexing" | "ready" | "failed";

export type DocumentRow = {
  id: string;
  collection_id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  page_count: number;
  file_size: number;
  status: DocumentStatus;
  processing_stage?: DocumentProcessingStage | null;
  error_message: string | null;
  created_at: string;
};

export type DocumentListItem = {
  id: string;
  collectionId: string;
  filename: string;
  storagePath: string;
  pageCount: number;
  fileSize: number;
  status: DocumentStatus;
  processingStage?: DocumentProcessingStage | null;
  errorMessage: string | null;
  createdAt: string;
};

export type DocumentChunkRow = {
  id: string;
  document_id: string;
  collection_id: string;
  content: string;
  page_number: number;
  chunk_index: number;
  file_kind?: string | null;
  location_label?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  embedding?: number[] | null;
  embedding_model?: string | null;
  embedding_created_at?: string | null;
  created_at: string;
};

export type RetrievalReason =
  | "direct_keyword_match"
  | "broad_context_fallback"
  | "semantic_match"
  | "hybrid_match"
  | "no_chunks_found";

export type RetrievalMode = "keyword" | "semantic" | "hybrid" | "fallback" | "unknown";

export type EvidenceStatus = "strong" | "partial" | "weak" | "none";

export type RetrievalSourceDebug = {
  sourceId: string;
  documentId: string;
  documentName: string;
  locationLabel?: string | null;
  pageNumber?: number | null;
  sheetName?: string | null;
  rowRange?: string | null;
  score?: number | null;
  retrievalMode?: RetrievalMode;
  excerpt: string;
};

export type CitationValidationDebug = {
  validCitationMarkers: string[];
  validCitationCount: number;
  invalidCitationMarkers: string[];
  chartCount: number;
  invalidChartSourceRefs: string[];
  missingChartSourceRefs: number[];
  rejectedChart: boolean;
  missingCitation: boolean;
  rejectedUncitedAnswer: boolean;
};

export type RetrievalDebugMetadata = {
  evidenceStatus: EvidenceStatus;
  retrievalReason: RetrievalReason;
  sourceCount: number;
  sources: RetrievalSourceDebug[];
};

export type SearchChunkResult = {
  id: string;
  documentId: string;
  collectionId: string;
  content: string;
  fileKind?: string | null;
  pageNumber: number;
  chunkIndex: number;
  filename: string;
  locationLabel?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  fusionScore?: number | null;
  keywordScore?: number | null;
  relevanceScore?: number | null;
  retrievalMode?: RetrievalMode;
  semanticSimilarity?: number | null;
};

export type SearchResponse = {
  collectionId: string;
  missingRequiredDocumentIds?: string[];
  query: string;
  retrievalReason: RetrievalReason;
  results: SearchChunkResult[];
};

export type ChatCitation = {
  id: string;
  marker: string;
  pageNumber: number;
  chunkId: string;
  documentId: string;
  filename: string;
  locationLabel?: string | null;
  source: SearchChunkResult;
};

type ChatResponseBase = {
  answer: string;
  citations: ChatCitation[];
  collectionId: string;
  metadata: {
    estimatedCostUsd?: number;
    inputTokens?: number;
    maxOutputTokens: number;
    model: string;
    modelReason: string;
    retrievalReason: RetrievalReason;
    citationValidation?: CitationValidationDebug;
    evidenceStatus?: EvidenceStatus;
    retrievalDebug?: RetrievalDebugMetadata;
  };
  question: string;
  sources: SearchChunkResult[];
};

export type AnsweredChatResponse = ChatResponseBase & {
  status: "answered";
};

export type InsufficientEvidenceChatResponse = ChatResponseBase & {
  closestMatches: SearchChunkResult[];
  missingEvidence: string[];
  reason: string;
  status: "insufficient_evidence";
};

export type ChatResponse = AnsweredChatResponse | InsufficientEvidenceChatResponse;

export type WorkspaceSearchResult = ChatResponse & {
  id: string;
  retrievalReason: RetrievalReason;
  createdAt: string;
};

export type ReportTemplate =
  | "cited_answer"
  | "due_diligence_summary"
  | "risk_report"
  | "table_summary"
  | "chat_transcript";

export type ReportExportFormat = "markdown" | "html_print";

export type ReportSource = {
  index: number;
  documentName: string;
  locationLabel?: string;
  pageNumber?: number;
  sheetName?: string;
  rowRange?: string;
  excerpt: string;
};

export type ReportClaim = {
  id: string;
  text: string;
  sourceRefs: number[];
};

export type ReportRisk = ReportClaim & {
  severity: "high" | "medium" | "low";
};

export type ReportObligation = ReportClaim & {
  action: string;
};

export type ReportTable = {
  columns: string[];
  rows: Array<{
    sourceRefs: number[];
    values: Array<string | number>;
  }>;
  title: string;
};

export type ReportChart = {
  chart: import("@/lib/chart/types").ChartData;
  seriesSourceRefs: Record<string, number[]>;
  sourceRefs: number[];
};

export type RiskEvidenceReportSpec = {
  executiveSummary: ReportClaim[];
  keyFindings: ReportClaim[];
  obligations: ReportObligation[];
  reportType: "risk_and_evidence";
  risks: ReportRisk[];
  sourceList: ReportSource[];
  tables: ReportTable[];
  charts: ReportChart[];
  verificationNote: string;
};

export type GeneratedReport = {
  title: string;
  template: ReportTemplate;
  workspaceName?: string;
  generatedAt: string;
  question?: string;
  content: string;
  artifact?: RiskEvidenceReportSpec;
  sources: ReportSource[];
  verificationNote: string;
};

export type ChatMessageRow = {
  id: string;
  collection_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[] | null;
  created_at: string;
};

export type AiUsageEventRow = {
  id: string;
  user_id: string;
  collection_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  reason: string | null;
  status: "success" | "blocked" | "failed";
  created_at: string;
};
