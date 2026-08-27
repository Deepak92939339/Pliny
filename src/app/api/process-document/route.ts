import { NextResponse } from "next/server";
import { z } from "zod";
import { chunkExtractedDocument, type ExtractedDocumentChunk } from "@/lib/document-processing/chunkExtractedDocument";
import { getDocumentProcessor, getProcessorForExtension } from "@/lib/document-processing/registry";
import { sanitizeExtractedDocument } from "@/lib/document-processing/sanitizeExtractedDocument";
import { DocumentProcessingError, type DocumentProcessingMetadata, type SupportedFileKind } from "@/lib/document-processing/types";
import { embedText, isEmbeddingsEnabled } from "@/lib/embeddings/embedText";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { DocumentStatus } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const processDocumentSchema = z.object({
  document_id: z.string().uuid("Invalid document id."),
});

const PROCESSING_LOCK_MESSAGE = "Processing started.";
const STUCK_PROCESSING_RETRY_MINUTES = 15;
const DOCUMENT_SELECT_FIELDS = "id,collection_id,user_id,filename,storage_path,status,error_message,page_count,created_at";

type DocumentRow = {
  created_at: string;
  error_message: string | null;
  filename: string;
  id: string;
  collection_id: string;
  page_count: number;
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

type ErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  name?: unknown;
  stack?: unknown;
};

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

function logProcessStep(step: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[process-document]", step, details ?? {});
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }

  if (error && typeof error === "object") {
    const errorLike = error as ErrorLike;

    return {
      code: errorLike.code,
      details: errorLike.details,
      hint: errorLike.hint,
      message: errorLike.message,
      name: errorLike.name,
      stack: process.env.NODE_ENV === "production" ? undefined : errorLike.stack,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

function logProcessError(step: string, error: unknown, details?: Record<string, unknown>) {
  console.error("[process-document]", step, {
    ...details,
    error: serializeError(error),
  });
}

function getReadableError(error: unknown) {
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
    status: "failed";
  } = {
    error_message: message,
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
}: {
  chunks: ExtractedDocumentChunk[];
  collectionId: string;
  documentId: string;
}) {
  const rows: ChunkInsertRow[] = chunks.map((chunk) => ({
    document_id: documentId,
    collection_id: collectionId,
    content: chunk.content,
    page_number: chunk.pageNumber,
    chunk_index: chunk.chunkIndex,
    file_kind: chunk.fileKind,
    location_label: chunk.locationLabel,
    metadata: chunk.metadata,
  }));

  if (!isEmbeddingsEnabled()) {
    return {
      embeddedCount: 0,
      rows,
      skippedCount: rows.length,
    };
  }

  const maxChunks = Math.min(getEmbeddingMaxChunksPerDocument(), rows.length);
  let embeddedCount = 0;
  let skippedCount = rows.length - maxChunks;

  for (let index = 0; index < maxChunks; index += 1) {
    const row = rows[index];

    try {
      const result = await embedText(row.content, { inputType: "document" });

      row.embedding = result.embedding;
      row.embedding_model = result.model;
      row.embedding_created_at = new Date().toISOString();
      embeddedCount += 1;
    } catch (error) {
      skippedCount += maxChunks - index;
      logProcessError("chunk embedding failed; continuing without remaining embeddings", error, {
        chunkIndex: row.chunk_index,
        documentId,
      });
      break;
    }
  }

  return {
    embeddedCount,
    rows,
    skippedCount,
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
      filename: processingDocument.filename,
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

    logProcessStep("starting document extraction", {
      documentId: processingDocument.id,
      processor: processor.id,
    });

    let extracted = await processor.extract({
      bytes: documentBytes,
      filename: processingDocument.filename,
      mimeType,
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

    if (sanitization.events.length > 0) {
      logProcessStep("source sanitization events recorded", {
        documentId: processingDocument.id,
        eventCount: sanitization.events.length,
        events: sanitization.events.map(({ documentId, length, offset, ruleId }) => ({ documentId, length, offset, ruleId })),
      });
    }

    const chunks = chunkExtractedDocument(extracted);
    logProcessStep("chunks created", { chunkCount: chunks.length, documentId: processingDocument.id, extractionMethod: extracted.extractionMethod });

    if (chunks.length === 0) {
      throw new ProcessingError("This document did not produce readable text chunks.");
    }

    logProcessStep("deleting old chunks", { collectionId: processingDocument.collection_id, documentId: processingDocument.id });

    const { error: deleteChunksError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", processingDocument.id)
      .eq("collection_id", processingDocument.collection_id);

    if (deleteChunksError) {
      throwSupabaseProcessingError("old chunk deletion failed", deleteChunksError, "Unable to prepare existing document chunks for retry.");
    }

    const chunkInsertResult = await buildChunkInsertRows({
      chunks,
      collectionId: processingDocument.collection_id,
      documentId: processingDocument.id,
    });

    logProcessStep("chunk embeddings prepared", {
      documentId: processingDocument.id,
      embeddedCount: chunkInsertResult.embeddedCount,
      embeddingsEnabled: isEmbeddingsEnabled(),
      skippedCount: chunkInsertResult.skippedCount,
    });

    logProcessStep("inserting chunks", {
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
      },
    });

    const { error: insertChunksError } = await supabase.from("document_chunks").insert(chunkInsertResult.rows);

    if (insertChunksError) {
      throwSupabaseProcessingError(
        "chunk insertion failed",
        insertChunksError,
        "Document text was extracted, but saving chunks failed."
      );
    }

    logProcessStep("chunks inserted", { chunkCount: chunks.length, documentId: processingDocument.id });
    const readyWarning = extracted.extractionMethod === "ocr" ? extracted.warnings[0] ?? "Text recovered with OCR. Review sources for accuracy." : extracted.warnings[0] ?? null;

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
      ocr_used: extracted.extractionMethod === "ocr",
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
      await markDocumentFailed(supabase, document.id, user.id, readableError.message, extractedPageCount);
    }

    return NextResponse.json(
      {
        documentId: document?.id,
        document_id: document?.id,
        error: readableError.message,
        ok: false,
        status: document ? "failed" : undefined,
      },
      { status: readableError.status }
    );
  }
}
