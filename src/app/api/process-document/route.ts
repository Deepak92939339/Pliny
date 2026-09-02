import { NextResponse } from "next/server";
import { z } from "zod";
import { chunkExtractedDocument, type ExtractedDocumentChunk } from "@/lib/document-processing/chunkExtractedDocument";
import { assertExtractedDocumentLimits } from "@/lib/document-processing/limits";
import { getDocumentProcessor, getProcessorForExtension } from "@/lib/document-processing/registry";
import { prepareChunkRowsWithEmbeddings } from "@/lib/document-processing/prepareChunkRowsWithEmbeddings";
import { sanitizeExtractedDocument } from "@/lib/document-processing/sanitizeExtractedDocument";
import { DocumentProcessingError, type DocumentProcessingMetadata, type DocumentProcessingStage, type SupportedFileKind } from "@/lib/document-processing/types";
import { isEmbeddingsEnabled } from "@/lib/embeddings/embedText";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import {
  assertProviderPayloadExcludes,
  collectOriginalDeterministicIdentifiers,
  getPrivacyScopeId,
  getPrivacyScopeSecret,
  PrivacyBoundaryError,
  toProviderSafeJsonValue,
  toProviderSafeText,
} from "@/lib/privacy/providerSafeText";
import { logSafeStageError } from "@/lib/privacy/safeLogging";
import { createClient } from "@/lib/supabase/server";
import type { DocumentStatus, PrivacyMode } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const processDocumentSchema = z.object({
  document_id: z.string().uuid("Invalid document id."),
});

const PROCESSING_LOCK_MESSAGE = "Processing started.";
const STUCK_PROCESSING_RETRY_MINUTES = 15;
const DOCUMENT_SELECT_FIELDS = "id,collection_id,user_id,filename,storage_path,status,error_message,page_count,created_at,processing_stage,processing_started_at,processing_mode,privacy_policy_version";

type DocumentRow = {
  created_at: string;
  error_message: string | null;
  filename: string;
  id: string;
  collection_id: string;
  page_count: number;
  processing_stage: DocumentProcessingStage;
  processing_started_at: string | null;
  processing_mode: PrivacyMode;
  privacy_policy_version: string | null;
  status: DocumentStatus;
  user_id: string;
  storage_path: string;
};

class ProcessingError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "ProcessingError";
    this.status = status;
  }
}

type ChunkInsertRow = {
  chunk_index: number;
  collection_id: string;
  content: string;
  document_id: string;
  embedding?: number[];
  embedding_created_at?: string;
  embedding_model?: string;
  file_kind: SupportedFileKind;
  location_label: string;
  metadata: DocumentProcessingMetadata;
  page_number: number;
  provider_safe_content?: string | null;
  provider_safe_metadata?: DocumentProcessingMetadata | null;
  privacy_policy_version?: string | null;
  embedding_projection: "original" | "privacy_minimised";
};

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function getEmbeddingMaxChunksPerDocument() {
  return getNumberEnv("EMBEDDING_MAX_CHUNKS_PER_DOCUMENT", 200, 0, 200);
}

function getEmbeddingBatchSize() {
  return getNumberEnv("EMBEDDING_BATCH_SIZE", 10, 1, 25);
}

function logProcessStep(step: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[process-document]", step, details ?? {});
}

function logProcessError(step: string, error: unknown, details?: Record<string, unknown>) {
  logSafeStageError("process-document", step, error, details as Record<string, string | number | boolean | null | undefined>);
}

function getReadableError(error: unknown) {
  if (error instanceof PrivacyBoundaryError) {
    return {
      message: "Privacy processing could not be completed safely. No provider request was sent.",
      status: 500,
    };
  }
  if (error instanceof ProcessingError || error instanceof DocumentProcessingError) {
    return {
      message: getUserSafeProcessingMessage(error.message),
      status: error.status,
    };
  }

  if (error instanceof Error && /fake worker|pdf\.worker|worker/i.test(error.message)) {
    return {
      message: "Could not read this file. Try again or use another file.",
      status: 500,
    };
  }

  return {
    message: "Could not read this file. It may be protected, unsupported, or unreadable.",
    status: 500,
  };
}

function getUserSafeProcessingMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("too large") || normalizedMessage.includes("mb or less") || normalizedMessage.includes("file is larger")) {
    return "The file is too large to process safely.";
  }

  if (
    normalizedMessage.includes("no readable") ||
    normalizedMessage.includes("readable text") ||
    normalizedMessage.includes("too little extractable text") ||
    normalizedMessage.includes("did not produce readable text chunks") ||
    normalizedMessage.includes("does not contain enough readable text")
  ) {
    return "No readable text was found.";
  }

  if (normalizedMessage.includes("saving chunks failed") || normalizedMessage.includes("chunks could not be saved")) {
    return "Text was extracted, but chunks could not be saved.";
  }

  if (normalizedMessage.includes("embedding")) {
    return "Embeddings could not be generated. Try again.";
  }

  if (normalizedMessage.includes("storage") || normalizedMessage.includes("read the uploaded document")) {
    return "Could not read this file.";
  }

  if (normalizedMessage.includes("unsupported")) {
    return "This file type is not supported.";
  }

  if (message.trim().length > 0 && message.length <= 140) {
    return message;
  }

  return "Could not read this file.";
}

function getStageLabel(stage: DocumentProcessingStage) {
  return stage === "ocr_fallback" ? "OCR fallback" : stage.replace(/_/g, " ");
}

function throwSupabaseProcessingError(step: string, error: unknown, message: string): never {
  logProcessError(step, error);
  throw new ProcessingError(message, 500);
}

async function markDocumentFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  userId: string,
  message: string,
  pageCount?: number
) {
  const updateValues: {
    error_message: string;
    page_count?: number;
    processing_stage: "failed";
    status: "failed";
  } = {
    error_message: message,
    processing_stage: "failed",
    status: "failed",
  };

  if (typeof pageCount === "number" && Number.isFinite(pageCount)) {
    updateValues.page_count = pageCount;
  }

  const { error } = await supabase.from("documents").update(updateValues).eq("id", documentId).eq("user_id", userId);

  if (error) {
    logProcessError("failed status update error", error, { documentId });
  } else {
    logProcessStep("document marked failed", { documentId, pageCount: pageCount ?? null });
  }
}

async function updateProcessingStage({
  documentId,
  stage,
  supabase,
  userId,
}: {
  documentId: string;
  stage: DocumentProcessingStage;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const { error } = await supabase
    .from("documents")
    .update({ processing_stage: stage })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (error) {
    throwSupabaseProcessingError("processing stage update failed", error, "Unable to update document processing state.");
  }
}

function getMimeTypeForDocument(document: DocumentRow) {
  return getProcessorForExtension(document.filename)?.mimeTypes[0] ?? "application/octet-stream";
}

function getAlreadyProcessingResponse(documentId: string) {
  return NextResponse.json({
    documentId,
    document_id: documentId,
    message: "Document is already processing.",
    ok: true,
    status: "processing",
  });
}

function getAlreadyReadyResponse(document: DocumentRow) {
  return NextResponse.json({
    documentId: document.id,
    document_id: document.id,
    fileKind: getProcessorForExtension(document.filename)?.kind ?? "unknown",
    message: "Document is already processed.",
    ok: true,
    page_count: document.page_count,
    status: "ready",
  });
}

function getProcessingStaleCutoff() {
  return new Date(Date.now() - STUCK_PROCESSING_RETRY_MINUTES * 60 * 1000).toISOString();
}

function isProcessingStale(document: DocumentRow) {
  return document.status === "processing" && document.created_at < getProcessingStaleCutoff();
}

async function acquireProcessingLock({
  document,
  supabase,
  userId,
}: {
  document: DocumentRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  if (document.status === "ready") {
    return {
      document,
      response: getAlreadyReadyResponse(document),
      shouldProcess: false,
    };
  }

  const startValues = {
    error_message: PROCESSING_LOCK_MESSAGE,
    processing_stage: "validating" as const,
    processing_started_at: new Date().toISOString(),
    status: "processing",
  };

  const baseUpdate = () =>
    supabase
      .from("documents")
      .update(startValues)
      .eq("id", document.id)
      .eq("user_id", userId)
      .select(DOCUMENT_SELECT_FIELDS);

  const startResult =
    document.status === "failed"
      ? await baseUpdate().eq("status", "failed").maybeSingle()
      : isProcessingStale(document)
        ? await baseUpdate().eq("status", "processing").lt("created_at", getProcessingStaleCutoff()).maybeSingle()
        : document.status === "processing" && document.error_message === null
          ? await baseUpdate().eq("status", "processing").is("error_message", null).maybeSingle()
          : { data: null, error: null };

  if (startResult.error) {
    throwSupabaseProcessingError("processing lock update failed", startResult.error, "Unable to mark this document as processing.");
  }

  if (!startResult.data) {
    logProcessStep("document processing already active", { documentId: document.id, status: document.status });

    return {
      document,
      response: getAlreadyProcessingResponse(document.id),
      shouldProcess: false,
    };
  }

  logProcessStep("processing lock acquired", {
    documentId: document.id,
    previousStatus: document.status,
    staleRetry: isProcessingStale(document),
  });

  return {
    document: startResult.data as DocumentRow,
    response: null,
    shouldProcess: true,
  };
}

async function buildChunkInsertRows({
  chunks,
  collectionId,
  documentId,
  filename,
  privacyPolicyVersion,
  processingMode,
  userId,
}: {
  chunks: ExtractedDocumentChunk[];
  collectionId: string;
  documentId: string;
  filename: string;
  privacyPolicyVersion: string | null;
  processingMode: PrivacyMode;
  userId: string;
}) {
  const privacyScope =
    processingMode === "privacy_minimised"
      ? { scopeId: getPrivacyScopeId(userId, documentId), scopeSecret: getPrivacyScopeSecret() }
      : null;
  const rows: ChunkInsertRow[] = chunks.map((chunk) => {
    const metadata = { ...chunk.metadata, documentId, filename };
    return {
      document_id: documentId,
      collection_id: collectionId,
      content: chunk.content,
      page_number: chunk.pageNumber,
      chunk_index: chunk.chunkIndex,
      file_kind: chunk.fileKind,
      location_label: chunk.locationLabel,
      metadata,
      embedding_projection: processingMode === "privacy_minimised" ? "privacy_minimised" : "original",
      privacy_policy_version: processingMode === "privacy_minimised" ? privacyPolicyVersion : null,
      provider_safe_content: privacyScope ? toProviderSafeText(chunk.content, privacyScope).text : null,
      provider_safe_metadata: privacyScope ? (toProviderSafeJsonValue(metadata, privacyScope) as DocumentProcessingMetadata) : null,
    };
  });

  if (!isEmbeddingsEnabled()) {
    return {
      embeddedCount: 0,
      rows,
      skippedCount: rows.length,
    };
  }

  const maxChunks = Math.min(getEmbeddingMaxChunksPerDocument(), rows.length);

  if (maxChunks < rows.length) {
    throw new ProcessingError("Embedding limits do not allow all document chunks to be processed.");
  }

  try {
    const getEmbeddingText = (row: ChunkInsertRow) => row.provider_safe_content ?? row.content;
    if (privacyScope) {
      assertProviderPayloadExcludes(
        { input: rows.map(getEmbeddingText), input_type: "document" },
        collectOriginalDeterministicIdentifiers(chunks.map((chunk) => chunk.content)),
        "embedding"
      );
    }
    const embeddedRows = await prepareChunkRowsWithEmbeddings(rows, {
      batchSize: getEmbeddingBatchSize(),
      getEmbeddingText,
      inputType: "document",
    });
    embeddedRows.forEach((row, index) => {
      rows[index] = row;
    });
  } catch (error) {
    logProcessError("chunk embeddings failed; aborting document processing", error, {
      batchSize: getEmbeddingBatchSize(),
      chunkCount: rows.length,
      documentId,
    });
    throw new ProcessingError("Embeddings could not be generated. Try again.");
  }

  return {
    embeddedCount: rows.length,
    rows,
    skippedCount: 0,
  };
}

export async function POST(request: Request) {
  logProcessStep("request received");
  const supabase = await createClient();
  logProcessStep("checking authenticated user");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      logProcessError("auth user check failed", userError);
    } else {
      logProcessStep("auth user missing");
    }

    return NextResponse.json({ error: "You must be logged in to process documents." }, { status: 401 });
  }

  logProcessStep("authenticated user found", { userId: user.id });

  const processLimit = await checkRouteRateLimit({
    identifier: user.id,
    limit: getNumberEnv("PROCESS_MAX_REQUESTS_PER_HOUR", 5, 1, 100),
    prefix: "process-document-hour",
    window: "1 h",
  });

  if (processLimit.status === "blocked") {
    const status = processLimit.reason === "rate_limited" ? 429 : 503;
    const error =
      processLimit.reason === "rate_limited"
        ? "You have reached the document processing limit for now."
        : "Document processing rate limiting is not configured.";

    return NextResponse.json({ error }, { status });
  }

  let document: DocumentRow | null = null;
  let extractedPageCount: number | undefined;
  let processingStage: DocumentProcessingStage = "validating";

  try {
    logProcessStep("validating request body");
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = processDocumentSchema.safeParse(body);

    if (!parsedBody.success) {
      logProcessStep("request validation failed", { issues: parsedBody.error.issues.map((issue) => issue.message) });
      return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
    }

    logProcessStep("request validation passed", { documentId: parsedBody.data.document_id });
    logProcessStep("looking up owned document", { documentId: parsedBody.data.document_id });

    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT_FIELDS)
      .eq("id", parsedBody.data.document_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (documentError) {
      throwSupabaseProcessingError(
        "document ownership lookup failed",
        documentError,
        "Unable to load this document for processing. Supabase could not complete the ownership check."
      );
    }

    if (!documentData) {
      logProcessStep("owned document not found", { documentId: parsedBody.data.document_id });
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const ownedDocument = documentData as DocumentRow;
    document = ownedDocument;

    logProcessStep("owned document found", {
      collectionId: ownedDocument.collection_id,
      documentId: ownedDocument.id,
      status: ownedDocument.status,
    });

    const processingLock = await acquireProcessingLock({
      document: ownedDocument,
      supabase,
      userId: user.id,
    });

    if (!processingLock.shouldProcess) {
      return processingLock.response ?? getAlreadyProcessingResponse(ownedDocument.id);
    }

    const processingDocument = processingLock.document;
    document = processingDocument;

    logProcessStep("downloading document from storage", {
      documentId: processingDocument.id,
    });

    const { data: documentBlob, error: downloadError } = await supabase.storage.from("documents").download(processingDocument.storage_path);

    if (downloadError || !documentBlob) {
      throwSupabaseProcessingError("storage download failed", downloadError, "Unable to read the uploaded document from storage.");
    }

    const documentBytes = new Uint8Array(await documentBlob.arrayBuffer());
    const mimeType = documentBlob.type || getMimeTypeForDocument(processingDocument);
    logProcessStep("document downloaded", { byteLength: documentBytes.byteLength, documentId: processingDocument.id });

    const processor = getDocumentProcessor({
      bytes: documentBytes,
      filename: processingDocument.filename,
      mimeType,
    });

    if (!processor) {
      throw new ProcessingError("This file type is not supported for processing yet.");
    }

    await processor.validate({
      bytes: documentBytes,
      filename: processingDocument.filename,
      mimeType,
    });

    processingStage = "extracting";
    await updateProcessingStage({ documentId: processingDocument.id, stage: processingStage, supabase, userId: user.id });

    logProcessStep("starting document extraction", {
      documentId: processingDocument.id,
      processor: processor.id,
    });

    let extracted = await processor.extract({
      bytes: documentBytes,
      filename: processingDocument.filename,
      mimeType,
      onStage: async (stage) => {
        processingStage = stage;
        await updateProcessingStage({ documentId: processingDocument.id, stage, supabase, userId: user.id });
      },
    });
    extractedPageCount = extracted.pageCount ?? 0;

    logProcessStep("document extraction complete", {
      charCount: extracted.charCount,
      documentId: processingDocument.id,
      extractionMethod: extracted.extractionMethod,
      kind: extracted.kind,
      pageCount: extracted.pageCount ?? null,
      unitCount: extracted.units.length,
      warningCount: extracted.warnings.length,
      wordCount: extracted.wordCount,
    });

    const sanitization = sanitizeExtractedDocument(extracted, processingDocument.id);
    extracted = sanitization.document;
    assertExtractedDocumentLimits(extracted);

    if (sanitization.events.length > 0) {
      logProcessStep("source sanitization events recorded", {
        documentId: processingDocument.id,
        eventCount: sanitization.events.length,
        events: sanitization.events.map(({ documentId, length, offset, ruleId }) => ({ documentId, length, offset, ruleId })),
      });
    }

    processingStage = "chunking";
    await updateProcessingStage({ documentId: processingDocument.id, stage: processingStage, supabase, userId: user.id });
    const chunks = chunkExtractedDocument(extracted);
    logProcessStep("chunks created", { chunkCount: chunks.length, documentId: processingDocument.id, extractionMethod: extracted.extractionMethod });

    if (chunks.length === 0) {
      throw new ProcessingError("This document did not produce readable text chunks.");
    }

    processingStage = "embedding";
    await updateProcessingStage({ documentId: processingDocument.id, stage: processingStage, supabase, userId: user.id });
    const chunkInsertResult = await buildChunkInsertRows({
      chunks,
      collectionId: processingDocument.collection_id,
      documentId: processingDocument.id,
      filename: processingDocument.filename,
      privacyPolicyVersion: processingDocument.privacy_policy_version,
      processingMode: processingDocument.processing_mode,
      userId: user.id,
    });

    logProcessStep("chunk embeddings prepared", {
      batchCount: isEmbeddingsEnabled() ? Math.ceil(chunks.length / getEmbeddingBatchSize()) : 0,
      batchSize: isEmbeddingsEnabled() ? getEmbeddingBatchSize() : 0,
      documentId: processingDocument.id,
      embeddedCount: chunkInsertResult.embeddedCount,
      embeddingConcurrency: isEmbeddingsEnabled() ? 1 : 0,
      embeddingsEnabled: isEmbeddingsEnabled(),
      providerRequestCount: isEmbeddingsEnabled() ? Math.ceil(chunks.length / getEmbeddingBatchSize()) : 0,
      skippedCount: chunkInsertResult.skippedCount,
    });

    processingStage = "indexing";
    await updateProcessingStage({ documentId: processingDocument.id, stage: processingStage, supabase, userId: user.id });
    logProcessStep("upserting complete chunk set", {
      chunkCount: chunks.length,
      documentId: processingDocument.id,
      samplePayloadShape: {
        collection_id: "uuid",
        content: "text",
        document_id: "uuid",
        embedding: isEmbeddingsEnabled() ? "vector" : "omitted",
        chunk_index: "integer",
        file_kind: "text",
        location_label: "text",
        metadata: "jsonb",
        page_number: "integer",
        provider_safe_content: processingDocument.processing_mode === "privacy_minimised" ? "text" : "null",
      },
    });

    const { error: insertChunksError } = await supabase
      .from("document_chunks")
      .upsert(chunkInsertResult.rows, { onConflict: "document_id,chunk_index" });

    if (insertChunksError) {
      throwSupabaseProcessingError(
        "chunk insertion failed",
        insertChunksError,
        "Document text was extracted, but saving chunks failed."
      );
    }

    const { error: deleteStaleChunksError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", processingDocument.id)
      .eq("collection_id", processingDocument.collection_id)
      .gte("chunk_index", chunkInsertResult.rows.length);

    if (deleteStaleChunksError) {
      throwSupabaseProcessingError("stale chunk deletion failed", deleteStaleChunksError, "Document text was indexed, but stale chunks could not be removed.");
    }

    logProcessStep("complete chunk set indexed", { chunkCount: chunks.length, documentId: processingDocument.id });
    const readyWarning = ["ocr", "pdf_hybrid_ocr"].includes(extracted.extractionMethod) ? extracted.warnings[0] ?? "Text recovered with OCR. Review sources for accuracy." : extracted.warnings[0] ?? null;

    logProcessStep("updating document ready status", {
      documentId: processingDocument.id,
      extractionMethod: extracted.extractionMethod,
      pageCount: extracted.pageCount,
    });

    const { error: readyError } = await supabase
      .from("documents")
      .update({
        error_message: readyWarning,
        page_count: extracted.pageCount ?? 0,
        processing_stage: "ready",
        processing_started_at: null,
        status: "ready",
      })
      .eq("id", processingDocument.id)
      .eq("user_id", user.id);

    if (readyError) {
      throwSupabaseProcessingError("ready status update failed", readyError, "Document chunks were saved, but the document status could not be updated.");
    }

    logProcessStep("document processing succeeded", {
      chunkCount: chunks.length,
      documentId: processingDocument.id,
      extractionMethod: extracted.extractionMethod,
      pageCount: extracted.pageCount ?? 0,
    });

    return NextResponse.json({
      chunk_count: chunks.length,
      chunksCreated: chunks.length,
      documentId: processingDocument.id,
      document_id: processingDocument.id,
      embedded_chunk_count: chunkInsertResult.embeddedCount,
      fileKind: extracted.kind,
      ok: true,
      ocr_used: ["ocr", "pdf_hybrid_ocr"].includes(extracted.extractionMethod),
      page_count: extracted.pageCount ?? 0,
      status: "ready",
    });
  } catch (error) {
    const readableError = getReadableError(error);
    logProcessError("processing failed", error, {
      documentId: document?.id ?? null,
      pageCount: extractedPageCount ?? null,
      userId: user.id,
    });

    if (document) {
      await markDocumentFailed(supabase, document.id, user.id, `${processingStage}: ${readableError.message}`, extractedPageCount);
    }

    return NextResponse.json(
      {
        documentId: document?.id,
        document_id: document?.id,
        error: document ? `${getStageLabel(processingStage)}: ${readableError.message}` : readableError.message,
        ok: false,
        status: document ? "failed" : undefined,
        stage: document ? processingStage : undefined,
      },
      { status: readableError.status }
    );
  }
}
