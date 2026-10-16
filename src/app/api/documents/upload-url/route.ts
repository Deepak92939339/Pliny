import { NextResponse } from "next/server";
import { z } from "zod";
import { DUPLICATE_UPLOAD_MESSAGE, shouldBlockDuplicateUpload } from "@/lib/documents/duplicateDetection";
import { DOCUMENTS_BUCKET } from "@/lib/documents/lifecycle";
import { computeResetRetryAfterSeconds } from "@/lib/limits/retryAfter";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import { logSafeStageError } from "@/lib/privacy/safeLogging";
import { captureDocumentPrivacyPolicy } from "@/lib/privacy/types";
import { createClient } from "@/lib/supabase/server";
import { getMaxUploadBytes, getUploadRequestsPerHour } from "@/lib/uploads/config";
import { buildStoragePath } from "@/lib/uploads/filename";
import { validateUploadRequest } from "@/lib/uploads/validateUploadRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The body is a few hundred bytes of metadata. File bytes never pass through this function:
// the browser uploads straight to Supabase Storage with the signed URL returned here.
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const uploadUrlSchema = z.object({
  collection_id: z.string().uuid("Invalid project id."),
  /** WP5 (audit-r1): re-upload of identical content is blocked unless the user chose "Upload anyway". */
  allow_duplicate: z.boolean().optional().default(false),
  /** SHA-256 of the file, computed in the browser. A dedupe hint only: /process stores the verified hash. */
  content_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Invalid file fingerprint.")
    .optional(),
  /** Re-issue a URL for an earlier, still-awaiting row (a client retry) instead of creating a new one. */
  document_id: z.string().uuid().optional(),
  filename: z.string().min(1, "Choose a file to upload.").max(512),
  mime_type: z.string().max(255).optional().default(""),
  size: z.number({ error: "File size is required." }).int("File size is invalid."),
});

function logUploadError(step: string, error: unknown, details?: Record<string, unknown>) {
  logSafeStageError("documents-upload-url", step, error, details as Record<string, string | number | boolean | null | undefined>);
}

function getErrorStatus(error: unknown) {
  const { status, statusCode } = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  const code = Number(status ?? statusCode);

  return Number.isInteger(code) ? code : null;
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

  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 413 });
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = uploadUrlSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload request." }, { status: 400 });
  }

  const {
    allow_duplicate: allowDuplicate,
    collection_id: collectionId,
    content_sha256: contentSha256,
    document_id: retryDocumentId,
    filename,
    mime_type: declaredMimeType,
    size,
  } = parsed.data;
  const validation = validateUploadRequest({ filename, mimeType: declaredMimeType, size });

  // Rejected before the rate limiter on purpose: a refused file costs nothing and must not use up quota.
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const uploadLimit = await checkRouteRateLimit({
    identifier: user.id,
    limit: getUploadRequestsPerHour(),
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

  const capturedPrivacyPolicy = captureDocumentPrivacyPolicy(collection.default_processing_mode);
  let documentId: string = crypto.randomUUID();
  let reusedRow = false;

  if (retryDocumentId) {
    const { data: existing, error: existingError } = await supabase
      .from("documents")
      .select("id")
      .eq("id", retryDocumentId)
      .eq("user_id", user.id)
      .eq("collection_id", collectionId)
      .eq("status", "awaiting_upload")
      .maybeSingle();

    if (existingError) {
      logUploadError("retry document lookup failed", existingError, { collectionId, userId: user.id });
      return NextResponse.json({ error: "Unable to prepare this upload. Please try again." }, { status: 500 });
    }

    // A document that is not the caller's, not awaiting upload, or in another project is silently
    // treated as "no retry": a fresh row is created and nothing about the other row is revealed.
    if (existing) {
      documentId = existing.id as string;
      reusedRow = true;
    }
  }

  // WP5 (audit-r1, PLN-006): block a re-upload of identical content into the same collection unless
  // the previous document failed or the user chose "Upload anyway". The row being retried is excluded.
  if (contentSha256) {
    let duplicateQuery = supabase
      .from("documents")
      .select("id,status")
      .eq("collection_id", collectionId)
      .eq("user_id", user.id)
      .eq("content_sha256", contentSha256)
      .neq("status", "awaiting_upload");

    if (reusedRow) {
      duplicateQuery = duplicateQuery.neq("id", documentId);
    }

    const { data: existingDocument } = await duplicateQuery.limit(1).maybeSingle();

    if (shouldBlockDuplicateUpload({ allowDuplicate, existingStatus: existingDocument?.status ?? null }) === "block") {
      return NextResponse.json({ error: DUPLICATE_UPLOAD_MESSAGE, existingDocumentId: existingDocument?.id ?? null }, { status: 409 });
    }
  }

  const storagePath = buildStoragePath({ collectionId, documentId, filename: validation.displayFilename, userId: user.id });

  if (reusedRow) {
    const { error: updateError } = await supabase
      .from("documents")
      .update({ content_sha256: contentSha256 ?? null, file_size: size, filename: validation.displayFilename, storage_path: storagePath })
      .eq("id", documentId)
      .eq("user_id", user.id)
      .eq("status", "awaiting_upload");

    if (updateError) {
      logUploadError("retry document update failed", updateError, { collectionId, documentId, userId: user.id });
      return NextResponse.json({ error: "Unable to prepare this upload. Please try again." }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("documents").insert({
      collection_id: collectionId,
      content_sha256: contentSha256 ?? null,
      file_size: size,
      filename: validation.displayFilename,
      id: documentId,
      privacy_policy_version: capturedPrivacyPolicy.mode === "privacy_minimised" ? capturedPrivacyPolicy.policyVersion : null,
      processing_mode: capturedPrivacyPolicy.mode,
      processing_stage: "uploading",
      status: "awaiting_upload",
      storage_path: storagePath,
      user_id: user.id,
    });

    if (insertError) {
      logUploadError("document row insert failed", insertError, { collectionId, userId: user.id });
      return NextResponse.json({ error: "Unable to prepare this upload. Please try again." }, { status: 500 });
    }
  }

  // Signed with the caller's own session, so Storage evaluates the own-prefix INSERT policy:
  // a path outside {userId}/ cannot be signed. No service-role key is involved.
  const { data: signed, error: signedError } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(storagePath);

  if (signedError || !signed) {
    // 409: the object is already there (an earlier attempt finished but its response was lost).
    if (reusedRow && getErrorStatus(signedError) === 409) {
      return NextResponse.json({ alreadyUploaded: true, document: { id: documentId }, limits: { maxBytes: getMaxUploadBytes() } });
    }

    logUploadError("signed upload url failed", signedError, { collectionId, documentId, userId: user.id });

    if (!reusedRow) {
      await supabase.from("documents").delete().eq("id", documentId).eq("user_id", user.id).eq("status", "awaiting_upload");
    }

    return NextResponse.json({ error: "Unable to prepare this upload. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    alreadyUploaded: false,
    document: { id: documentId },
    limits: { maxBytes: getMaxUploadBytes() },
    upload: {
      bucket: DOCUMENTS_BUCKET,
      contentType: validation.mimeType,
      path: signed.path,
      signedUrl: signed.signedUrl,
      token: signed.token,
    },
  });
}
