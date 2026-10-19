import { NextResponse } from "next/server";
import { z } from "zod";
import { chunkExtractedDocument, type ExtractedDocumentChunk } from "@/lib/document-processing/chunkExtractedDocument";
import { assertExtractedDocumentLimits } from "@/lib/document-processing/limits";
import { getDocumentProcessor, getProcessorForExtension, normalizeDocumentMimeType } from "@/lib/document-processing/registry";
import { prepareChunkRowsWithEmbeddings } from "@/lib/document-processing/prepareChunkRowsWithEmbeddings";
import { sanitizeExtractedDocument } from "@/lib/document-processing/sanitizeExtractedDocument";
import { DocumentProcessingError, type DocumentProcessingMetadata, type DocumentProcessingStage, type SupportedFileKind } from "@/lib/document-processing/types";
import { computeDocumentHash } from "@/lib/documents/duplicateDetection";
import { markDocumentFailed } from "@/lib/documents/processingTerminalState";
import { isEmbeddingsEnabled } from "@/lib/embeddings/embedText";
import { getEmbeddingFailureMessage } from "@/lib/embeddings/failureMessage";
import { computeResetRetryAfterSeconds } from "@/lib/limits/retryAfter";
import { DOCUMENTS_BUCKET, isProcessingStalled } from "@/lib/documents/lifecycle";
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
import { getMaxUploadBytes, getProcessRequestsPerHour, getProcessingStallMinutes } from "@/lib/uploads/config";
import { describeContentMismatch } from "@/lib/uploads/contentCheck";
import type { DocumentStatus, PrivacyMode } from "@/types";

const documentIdSchema = z.string().uuid("Invalid document id.");

const PROCESSING_LOCK_MESSAGE = "Processing started.";
const DOCUMENT_SELECT_FIELDS =
  "id,collection_id,user_id,filename,storage_path,status,error_message,page_count,file_size,created_at,processing_stage,processing_stage_updated_at,processing_started_at,processing_mode,privacy_policy_version";

type DocumentRow = {
  created_at: string;
  error_message: string | null;
  filename: string;
  id: string;
  collection_id: string;
  page_count: number;
  file_size: number;
  processing_stage: DocumentProcessingStage;
  processing_stage_updated_at: string | null;
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

/**
 * Test seam for the watchdog: PLINY_TEST_EXTRACTION_DELAY_MS="hang" never returns, a number
 * waits that many milliseconds. It is inert in production builds (NODE_ENV === "production").
 */
async function simulateSlowExtractionForTests() {
  const directive = process.env.PLINY_TEST_EXTRACTION_DELAY_MS;

  if (process.env.NODE_ENV === "production" || !directive) {
    return;
  }

  if (directive === "hang") {
    await new Promise<never>(() => {});
  }

  const delayMs = Number(directive);

  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
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

function getStallCutoff(now: Date) {
  return new Date(now.getTime() - getProcessingStallMinutes() * 60_000).toISOString();
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

  const now = new Date();
  const startValues = {
    error_message: PROCESSING_LOCK_MESSAGE,
    processing_stage: "validating" as const,
    processing_stage_updated_at: now.toISOString(),
    processing_started_at: now.toISOString(),
    status: "processing",
    upload_expired_at: null,
  };
  const stalled = isProcessingStalled(document, now);

  const baseUpdate = () =>
    supabase
      .from("documents")
      .update(startValues)
      .eq("id", document.id)
      .eq("user_id", userId)
      .select(DOCUMENT_SELECT_FIELDS);

  // Every branch is a compare-and-swap on the status the row was read in, so two concurrent
  // callers cannot both acquire the lock and therefore cannot both write chunks.
  const startResult =
    document.status === "awaiting_upload"
      ? await baseUpdate().eq("status", "awaiting_upload").maybeSingle()
      : document.status === "failed"
        ? await baseUpdate().eq("status", "failed").maybeSingle()
        : stalled
          ? await baseUpdate().eq("status", "processing").lt("processing_stage_updated_at", getStallCutoff(now)).maybeSingle()
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
    stalledRetry: stalled,
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
    throw new ProcessingError(getEmbeddingFailureMessage(error));
  }

  return {
    embeddedCount: rows.length,
    rows,
    skippedCount: 0,
  };
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { message, status, statusCode } = error as { message?: unknown; status?: unknown; statusCode?: unknown };
  const code = Number(status ?? statusCode);

  return code === 400 || code === 404 || (typeof message === "string" && /not found/i.test(message));
}

type StoredObjectCheck = { ok: true; size: number } | { ok: false; response: NextResponse };

/**
 * Confirms the uploaded object exists in the caller's own prefix and that its *actual* size
 * matches the declared size and the configured limit. Runs before the processing lock so a
 * document that is merely still uploading is not consumed.
 */
async function inspectStoredObject({
  document,
  supabase,
  userId,
}: {
  document: DocumentRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<StoredObjectCheck> {
  if (!document.storage_path.startsWith(`${userId}/`) || document.storage_path.split("/").includes("..")) {
    logProcessError("document storage path outside owner prefix", new Error("path ownership mismatch"), { documentId: document.id });
    return { ok: false, response: NextResponse.json({ error: "This document's file location is not valid.", ok: false }, { status: 403 }) };
  }

  const { data: info, error: infoError } = await supabase.storage.from(DOCUMENTS_BUCKET).info(document.storage_path);

  if (infoError || !info) {
    if (!infoError || isMissingObjectError(infoError)) {
      if (document.status === "awaiting_upload") {
        return {
          ok: false,
          response: NextResponse.json(
            { documentId: document.id, error: "The file has not finished uploading yet.", ok: false, status: "awaiting_upload" },
            { status: 409 }
          ),
        };
      }

      await markDocumentFailed(supabase, document.id, userId, "The uploaded file is missing. Upload it again.");
      return {
        ok: false,
        response: NextResponse.json(
          { documentId: document.id, error: "The uploaded file is missing. Upload it again.", ok: false, status: "failed" },
          { status: 409 }
        ),
      };
    }

    throwSupabaseProcessingError("storage object lookup failed", infoError, "Unable to verify the uploaded file. Please try again.");
  }

  const actualSize = Number((info as { size?: unknown }).size);
  const maxBytes = getMaxUploadBytes();
  const declaredSize = document.file_size;
  const mismatch =
    !Number.isFinite(actualSize) || actualSize <= 0
      ? "The uploaded file is empty. Upload it again."
      : actualSize > maxBytes
        ? `The uploaded file (${formatMegabytes(actualSize)}) is over the ${formatMegabytes(maxBytes)} limit.`
        : declaredSize > 0 && actualSize !== declaredSize
          ? `The uploaded file's size (${formatMegabytes(actualSize)}) does not match the declared size (${formatMegabytes(declaredSize)}). Upload it again.`
          : null;

  if (mismatch) {
    await markDocumentFailed(supabase, document.id, userId, `validating: ${mismatch}`);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.storage_path]);
    return {
      ok: false,
      response: NextResponse.json({ documentId: document.id, error: mismatch, ok: false, status: "failed" }, { status: 422 }),
    };
  }

  return { ok: true, size: actualSize };
}

/**
 * Shared by POST /api/documents/{id}/process and the legacy POST /api/process-document.
 * Idempotent: a ready document returns immediately, an active run is never re-entered, and
 * chunks are upserted on (document_id, chunk_index) with stale tail chunks removed.
 */
export async function handleProcessDocument(rawDocumentId: unknown) {
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
    limit: getProcessRequestsPerHour(),
    prefix: "process-document-hour",
    window: "1 h",
  });

  if (processLimit.status === "blocked") {
    const status = processLimit.reason === "rate_limited" ? 429 : 503;
    const error =
      processLimit.reason === "rate_limited"
        ? "You have reached the document processing limit for now."
        : "Document processing rate limiting is not configured.";

    // WP3 (audit-r1): 429s carry Retry-After (seconds until the limiter window resets).
    const headers = status === 429 ? { "Retry-After": String(computeResetRetryAfterSeconds(processLimit.resetAt, Date.now())) } : undefined;

    return NextResponse.json({ error }, { headers, status });
  }

  let document: DocumentRow | null = null;
  let extractedPageCount: number | undefined;
  let processingStage: DocumentProcessingStage = "validating";

  try {
    const parsedId = documentIdSchema.safeParse(rawDocumentId);

    if (!parsedId.success) {
      logProcessStep("request validation failed", { issues: parsedId.error.issues.map((issue) => issue.message) });
      return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
    }

    const documentId = parsedId.data;
    logProcessStep("looking up owned document", { documentId });

    // Ownership check. The row is filtered by user_id (and by RLS), so another user's document
    // is indistinguishable from a missing one: 404, never 403, never a hint that it exists.
    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT_FIELDS)
      .eq("id", documentId)
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
      logProcessStep("owned document not found", { documentId });
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const ownedDocument = documentData as DocumentRow;
    document = ownedDocument;

    logProcessStep("owned document found", {
      collectionId: ownedDocument.collection_id,
      documentId: ownedDocument.id,
      status: ownedDocument.status,
    });

    if (ownedDocument.status === "ready") {
      return getAlreadyReadyResponse(ownedDocument);
    }

    if (ownedDocument.status === "processing" && ownedDocument.error_message !== null && !isProcessingStalled(ownedDocument)) {
      return getAlreadyProcessingResponse(ownedDocument.id);
    }

    const storedObject = await inspectStoredObject({ document: ownedDocument, supabase, userId: user.id });

    if (!storedObject.ok) {
      return storedObject.response;
    }

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

    const { data: documentBlob, error: downloadError } = await supabase.storage.from(DOCUMENTS_BUCKET).download(processingDocument.storage_path);

    if (downloadError || !documentBlob) {
      throwSupabaseProcessingError("storage download failed", downloadError, "Unable to read the uploaded document from storage.");
    }

    const documentBytes = new Uint8Array(await documentBlob.arrayBuffer());
    const mimeType = normalizeDocumentMimeType(documentBlob.type || getMimeTypeForDocument(processingDocument));
    logProcessStep("document downloaded", { byteLength: documentBytes.byteLength, documentId: processingDocument.id });

    if (documentBytes.byteLength !== storedObject.size) {
      throw new ProcessingError("The uploaded file changed while it was being read. Upload it again.", 409);
    }

    // WP5: the browser's fingerprint was only a hint for the duplicate check; store the verified one.
    const { error: hashError } = await supabase
      .from("documents")
      .update({ content_sha256: computeDocumentHash(documentBytes) })
      .eq("id", processingDocument.id)
      .eq("user_id", user.id);

    if (hashError) {
      logProcessError("content hash update failed", hashError, { documentId: processingDocument.id });
    }

    const contentMismatch = describeContentMismatch(documentBytes, processingDocument.filename);

    if (contentMismatch) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([processingDocument.storage_path]);
      throw new ProcessingError(contentMismatch, 422);
    }

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

    await simulateSlowExtractionForTests();

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
