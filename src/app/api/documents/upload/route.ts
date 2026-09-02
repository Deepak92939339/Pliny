import { NextResponse } from "next/server";
import { z } from "zod";
import { getFileExtension } from "@/lib/document-processing/fileKinds";
import { getProcessorForFile, supportedFileExtensions } from "@/lib/document-processing/registry";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import { logSafeStageError } from "@/lib/privacy/safeLogging";
import { captureDocumentPrivacyPolicy } from "@/lib/privacy/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uploadSchema = z.object({
  collection_id: z.string().uuid("Invalid project id."),
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

    return NextResponse.json({ error }, { status });
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
  const mimeType = file.type || "application/octet-stream";
  const fileData = new Uint8Array(await file.arrayBuffer());
  const processor = getProcessorForFile({
    bytes: fileData,
    filename: displayFilename,
    mimeType,
  });

  if (!processor) {
    if ([".xls", ".xlsm"].includes(getFileExtension(displayFilename))) {
      return NextResponse.json(
        { error: "Legacy and macro-enabled spreadsheets are not supported. Upload an .xlsx or CSV file instead." },
        { status: 400 }
      );
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
