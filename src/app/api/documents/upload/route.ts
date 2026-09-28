import { NextResponse } from "next/server";
import { z } from "zod";
import { getUnsupportedFileRejection, getFileExtension } from "@/lib/document-processing/fileKinds";
import { getProcessorForFile, normalizeDocumentMimeType, supportedFileExtensions } from "@/lib/document-processing/registry";
import { DUPLICATE_UPLOAD_MESSAGE, computeDocumentHash, shouldBlockDuplicateUpload } from "@/lib/documents/duplicateDetection";
import { computeResetRetryAfterSeconds } from "@/lib/limits/retryAfter";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import { logSafeStageError } from "@/lib/privacy/safeLogging";
import { captureDocumentPrivacyPolicy } from "@/lib/privacy/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uploadSchema = z.object({
  collection_id: z.string().uuid("Invalid project id."),
  allow_duplicate: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});
const MAX_MULTIPART_BODY_BYTES = 16 * 1024 * 1024;

function logUploadError(step: string, error: unknown, details?: Record<string, unknown>) {
  logSafeStageError("documents-upload", step, error, details as Record<string, string | number | boolean | null | undefined>);
}

function getErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === "number" && Number.isInteger(status)) {
      return status;
    }
  }

  return 422;
}

function getDisplayFilename(filename: string) {
  const originalName = filename.split(/[\\/]/).pop()?.trim() || "document";
  const normalized = originalName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);

  return normalized || "document";
}

function getSafeFilename(filename: string) {
  const displayName = getDisplayFilename(filename);
  const normalizedName = displayName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return normalizedName || "document";
}

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      logUploadError("auth user check failed", userError);
    }

    return NextResponse.json({ error: "You must be logged in to upload documents." }, { status: 401 });
  }

  const uploadLimit = await checkRouteRateLimit({
    identifier: user.id,
    limit: getNumberEnv("UPLOAD_MAX_REQUESTS_PER_HOUR", 5, 1, 100),
    prefix: "documents-upload-hour",
    window: "1 h",
  });

  if (uploadLimit.status === "blocked") {
    const status = uploadLimit.reason === "rate_limited" ? 429 : 503;
    const error =
      uploadLimit.reason === "rate_limited"
        ? "You have reached the upload limit for now."
        : "Upload rate limiting is not configured.";

    // WP3 (audit-r1): 429s carry Retry-After (seconds until the limiter window resets).
    const headers = status === 429 ? { "Retry-After": String(computeResetRetryAfterSeconds(uploadLimit.resetAt, Date.now())) } : undefined;

    return NextResponse.json({ error }, { headers, status });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    return NextResponse.json({ error: "The upload request is too large to process safely." }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const parsedFields = uploadSchema.safeParse({
    collection_id: formData.get("collection_id"),
    allow_duplicate: formData.get("allow_duplicate") ?? undefined,
  });

  if (!parsedFields.success) {
    return NextResponse.json({ error: parsedFields.error.issues[0]?.message ?? "Invalid upload request." }, { status: 400 });
  }

  const file = formData.get("file");

  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: "Choose a supported file to upload." }, { status: 400 });
  }

  const collectionId = parsedFields.data.collection_id;

  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id,default_processing_mode")
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (collectionError) {
    logUploadError("collection ownership lookup failed", collectionError, { collectionId, userId: user.id });
    return NextResponse.json({ error: "Unable to verify this project." }, { status: 500 });
  }

  if (!collection) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const displayFilename = getDisplayFilename(file.name);
  const capturedPrivacyPolicy = captureDocumentPrivacyPolicy(collection.default_processing_mode);
  const mimeType = normalizeDocumentMimeType(file.type || "application/octet-stream");
  const fileData = new Uint8Array(await file.arrayBuffer());
  const processor = getProcessorForFile({
    bytes: fileData,
    filename: displayFilename,
    mimeType,
  });

  if (!processor) {
    // WP7 (audit-r1): .xls now returns 415 with the client's message;
    // .xlsm keeps its specific 400. Other unsupported files fall through.
    const legacyRejection = getUnsupportedFileRejection(displayFilename);

    if (legacyRejection) {
      return NextResponse.json({ error: legacyRejection.error }, { status: legacyRejection.status });
    }

    return NextResponse.json(
      {
        error: `Unsupported file type. Supported formats: ${supportedFileExtensions.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  try {
    await processor.validate({
      bytes: fileData,
      filename: displayFilename,
      mimeType,
    });
  } catch (error) {
    logUploadError("file validation failed", error, { collectionId, processor: processor.id, userId: user.id });
    return NextResponse.json(
      { error: "This file could not be validated safely. Try a supported file." },
      { status: getErrorStatus(error) }
    );
  }

  const storagePath = `${user.id}/${collectionId}/${crypto.randomUUID()}-${getSafeFilename(displayFilename)}`;

  // WP5 (audit-r1, PLN-006): duplicate detection — hash the received bytes and
  // block a re-upload of identical content into the same collection unless the
  // previous document failed or the user chose "Upload anyway".
  const contentSha256 = computeDocumentHash(fileData);
  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id,status")
    .eq("collection_id", collectionId)
    .eq("content_sha256", contentSha256)
    .limit(1)
    .maybeSingle();

  if (shouldBlockDuplicateUpload({ allowDuplicate: parsedFields.data.allow_duplicate, existingStatus: existingDocument?.status ?? null }) === "block") {
    return NextResponse.json(
      {
        error: DUPLICATE_UPLOAD_MESSAGE,
        existingDocumentId: existingDocument?.id ?? null,
      },
      { status: 409 }
    );
  }

  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, fileData, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    logUploadError("storage upload failed", uploadError, { collectionId, userId: user.id });
    return NextResponse.json({ error: "Unable to upload this file. Please try again." }, { status: 500 });
  }

  const { data: insertedDocument, error: insertError } = await supabase
    .from("documents")
    .insert({
      collection_id: collectionId,
      content_sha256: contentSha256,
      file_size: file.size,
      filename: displayFilename,
      processing_stage: "uploading",
      processing_mode: capturedPrivacyPolicy.mode,
      privacy_policy_version: capturedPrivacyPolicy.mode === "privacy_minimised" ? capturedPrivacyPolicy.policyVersion : null,
      status: "processing",
      storage_path: storagePath,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (insertError || !insertedDocument) {
    logUploadError("document row insert failed", insertError, { collectionId, userId: user.id });
    await supabase.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "The file uploaded, but the document record could not be saved. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    document: {
      id: insertedDocument.id as string,
    },
  });
}
