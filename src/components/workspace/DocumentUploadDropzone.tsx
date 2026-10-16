"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StorageClient } from "@supabase/storage-js";
import { useDropzone, type FileRejection } from "react-dropzone";
import { getFileTooLargeMessage, getMaxUploadBytes } from "@/lib/uploads/config";
import { createProgressFetch, UploadStalledError } from "@/lib/uploads/progressFetch";
import {
  DuplicateUploadError,
  createFailedUploadItem,
  createUploadQueue,
  MAX_UPLOAD_FILES,
  resetUploadItemForRetry,
  runSequentialUploadBatch,
  type UploadBatchItem,
  type UploadItemStatus,
} from "@/lib/uploads/uploadBatch";
import {
  getProcessFailureMessage,
  PROCESS_START_FAILURE_MESSAGE,
} from "@/lib/uploads/processFailureMessage";
import { formatRetryWaitDuration, getRetryAfterHeaderSeconds } from "@/lib/limits/retryAfter";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_SIZE_BYTES = getMaxUploadBytes();
const UPLOAD_URL_TIMEOUT_MS = 30_000;
// Slightly longer than the process route's 300 s maxDuration.
const PROCESS_TIMEOUT_MS = 330_000;
const ACTIVE_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".markdown", ".html", ".htm", ".csv"];

type DocumentUploadDropzoneProps = {
  className?: string;
  collectionId: string;
};

type InsertedDocument = {
  id: string;
};

type UploadUrlResponse = {
  alreadyUploaded?: boolean;
  document?: InsertedDocument;
  error?: string;
  upload?: {
    bucket: string;
    contentType: string;
    path: string;
    token: string;
  };
};

class UploadRejectedError extends Error {
  retryable = false;
}

type ProcessDocumentResponse = {
  error?: string;
  message?: string;
  ok?: boolean;
  page_count?: number;
  status?: "processing" | "ready" | "failed";
};

function isSupportedFile(file: File) {
  const name = file.name.toLowerCase();

  return ACTIVE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function getRejectionMessage(rejections: FileRejection[]) {
  const rejection = rejections[0];

  if (!rejection) {
    return `Select a supported file of ${getFileTooLargeMessage().replace("File must be ", "").replace(" or less.", "")} or less.`;
  }

  if (rejection.errors.some((error) => error.code === "file-too-large")) {
    return getFileTooLargeMessage();
  }

  if (rejection.errors.some((error) => error.code === "too-many-files")) {
    return `Select no more than ${MAX_UPLOAD_FILES} files at a time.`;
  }

  if (rejection.errors.some((error) => error.code === "file-invalid-type")) {
    return "Only PDF, DOCX, XLSX, CSV, MD, HTML, and TXT files can be uploaded. Legacy .xls files are not supported.";
  }

  return "This file could not be uploaded. Please choose a supported file.";
}

function getStatusLabel(status: UploadItemStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function readUploadResponse(response: Response): Promise<UploadUrlResponse> {
  try {
    return (await response.json()) as UploadUrlResponse;
  } catch {
    return {};
  }
}

/** SHA-256 of the file as lowercase hex, for the server's duplicate check. Undefined when unavailable. */
async function computeFileSha256(file: File): Promise<string | undefined> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    // crypto.subtle is missing outside secure contexts; the duplicate check is then skipped.
    return undefined;
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describeStorageUploadFailure(error: { message?: string; originalError?: unknown }) {
  const original = error.originalError;

  if (original instanceof UploadStalledError) {
    return original.message;
  }

  if (/maximum allowed size|too large|payload/i.test(error.message ?? "")) {
    return getFileTooLargeMessage();
  }

  if (/expired|jwt|token/i.test(error.message ?? "")) {
    return "The upload link expired. Retry to get a new one.";
  }

  return "The upload did not finish. Check your connection and retry.";
}

async function readProcessResponse(response: Response): Promise<ProcessDocumentResponse> {
  try {
    return (await response.json()) as ProcessDocumentResponse;
  } catch {
    return {};
  }
}

export function DocumentUploadDropzone({ className, collectionId }: DocumentUploadDropzoneProps) {
  const router = useRouter();
  const [uploadItems, setUploadItems] = useState<UploadBatchItem<File>[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  // WP3 (audit-r1): a 429 with Retry-After from upload or process disables the
  // dropzone until the limit window clears, with a live countdown.
  const [uploadRateLimitedUntil, setUploadRateLimitedUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const uploadLimitedRemainingSeconds = uploadRateLimitedUntil ? Math.ceil((uploadRateLimitedUntil - nowMs) / 1000) : 0;
  const isUploadRateLimited = uploadLimitedRemainingSeconds > 0;

  useEffect(() => {
    if (!isUploadRateLimited) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isUploadRateLimited]);

  const uploadBatch = useCallback(
    async (initialItems: UploadBatchItem<File>[]) => {
      setIsBusy(true);

      try {
        await runSequentialUploadBatch(initialItems, {
          onChange: (_items, changedItem) => {
            // Merge by id so a single-item retry never drops the other items from the list.
            setUploadItems((current) =>
              current.some((item) => item.id === changedItem.id)
                ? current.map((item) => (item.id === changedItem.id ? changedItem : item))
                : [...current, changedItem]
            );
          },
          process: async (documentId) => {
            let processResponse: Response;

            try {
              processResponse = await fetchWithTimeout(`/api/documents/${documentId}/process`, { method: "POST" }, PROCESS_TIMEOUT_MS);
            } catch (error) {
              router.refresh();

              if (error instanceof DOMException && error.name === "AbortError") {
                return {
                  message: "Still processing. If it stalls it will move to Needs attention with a Retry.",
                  status: "processing" as const,
                };
              }

              // network error before any server response
              throw new Error(PROCESS_START_FAILURE_MESSAGE);
            }

            const processResult = await readProcessResponse(processResponse);
            router.refresh();

            if (processResponse.status === 429) {
              const retryAfterSeconds = getRetryAfterHeaderSeconds(processResponse.headers);

              if (retryAfterSeconds !== null) {
                setUploadRateLimitedUntil(Date.now() + retryAfterSeconds * 1_000);
              }
            }

            if (!processResponse.ok || processResult.ok === false || processResult.status === "failed") {
              // 429, 5xx, timeout, or any other failure must end as a failed
              // item with a readable message - never stuck in "Uploading".
              throw new Error(getProcessFailureMessage(processResponse, processResult));
            }

            return {
              message:
                processResult.status === "processing"
                  ? processResult.message ?? "File is already processing."
                  : "File processed and ready.",
              pageCount: processResult.page_count,
              status: processResult.status === "processing" ? ("processing" as const) : ("ready" as const),
            };
          },
          upload: async (file, context) => {
            if (!isSupportedFile(file)) {
              throw new UploadRejectedError("Only PDF, DOCX, XLSX, CSV, MD, HTML, and TXT files can be uploaded. Legacy .xls files are not supported.");
            }

            if (file.size > MAX_UPLOAD_SIZE_BYTES) {
              throw new UploadRejectedError(getFileTooLargeMessage());
            }

            // 1. Ask the server for a signed upload URL. Only metadata is sent; no file bytes.
            const contentSha256 = await computeFileSha256(file);
            let urlResponse: Response;

            try {
              urlResponse = await fetchWithTimeout(
                "/api/documents/upload-url",
                {
                  body: JSON.stringify({
                    allow_duplicate: context.allowDuplicate || undefined,
                    collection_id: collectionId,
                    content_sha256: contentSha256,
                    document_id: context.documentId,
                    filename: file.name,
                    mime_type: file.type,
                    size: file.size,
                  }),
                  headers: { "Content-Type": "application/json" },
                  method: "POST",
                },
                UPLOAD_URL_TIMEOUT_MS
              );
            } catch {
              throw new Error("Could not reach the server to start the upload. Check your connection and retry.");
            }

            const urlResult = await readUploadResponse(urlResponse);

            if (urlResponse.status === 409) {
              // WP5 (audit-r1): duplicate content in this workspace; the item offers "Upload anyway".
              throw new DuplicateUploadError(urlResult.error ?? "This file is already in the workspace.");
            }

            if (urlResponse.status === 429) {
              const retryAfterSeconds = getRetryAfterHeaderSeconds(urlResponse.headers);

              if (retryAfterSeconds !== null) {
                setUploadRateLimitedUntil(Date.now() + retryAfterSeconds * 1_000);
              }
            }

            if (!urlResponse.ok || !urlResult.document) {
              const message = urlResult.error ?? "Unable to prepare this upload. Please try again.";
              const retryable = urlResponse.status >= 500 || urlResponse.status === 429;

              throw retryable ? new Error(message) : new UploadRejectedError(message);
            }

            context.onDocumentId(urlResult.document.id);

            if (urlResult.alreadyUploaded || !urlResult.upload) {
              context.onProgress(100);
              return { documentId: urlResult.document.id };
            }

            // 2. Send the bytes straight to Supabase Storage with the signed token.
            // The standalone storage client (not the full supabase-js client) keeps auth, realtime and
            // postgrest out of the workspace bundle. The signed token authorises the upload itself.
            const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
            const storage = new StorageClient(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1`,
              anonKey.startsWith("eyJ") ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : { apikey: anonKey },
              createProgressFetch({
                onProgress: (loaded, total) => context.onProgress(total > 0 ? (loaded / total) * 100 : 0),
              })
            );
            const { error: uploadError } = await storage
              .from(urlResult.upload.bucket)
              .uploadToSignedUrl(urlResult.upload.path, urlResult.upload.token, new File([file], file.name, { type: urlResult.upload.contentType }), {
                contentType: urlResult.upload.contentType,
                upsert: false,
              });

            if (uploadError) {
              throw new Error(describeStorageUploadFailure(uploadError as { message?: string; originalError?: unknown }));
            }

            context.onProgress(100);
            return { documentId: urlResult.document.id };
          },
        });
      } finally {
        router.refresh();
        setIsBusy(false);
      }
    },
    [collectionId, router]
  );

  const retryItem = useCallback(
    (item: UploadBatchItem<File>) => {
      const queued = resetUploadItemForRetry(item);
      setUploadItems((current) => current.map((entry) => (entry.id === item.id ? queued : entry)));
      void uploadBatch([queued]);
    },
    [uploadBatch]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const acceptedItems = acceptedFiles.length > 0 ? createUploadQueue(acceptedFiles) : [];
      const rejectedItems = fileRejections.map((rejection) =>
        createFailedUploadItem(rejection.file, getRejectionMessage([rejection]))
      );
      setUploadItems([...acceptedItems, ...rejectedItems]);

      if (acceptedItems.length > 0) void uploadBatch([...acceptedItems, ...rejectedItems]);
    },
    [uploadBatch]
  );

  // WP5 (audit-r1): "Upload anyway" — re-run the single item with allowDuplicate.
  const uploadAnyway = useCallback(
    (itemId: string) => {
      setUploadItems((current) => {
        const item = current.find((candidate) => candidate.id === itemId);

        if (item) {
          void uploadBatch([{ ...item, allowDuplicate: true, duplicate: false, message: undefined, status: "queued" }]);
        }

        return current.map((candidate) =>
          candidate.id === itemId ? { ...candidate, allowDuplicate: true, duplicate: false, message: undefined, status: "queued" } : candidate
        );
      });
    },
    [uploadBatch]
  );

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"],
      "text/markdown": [".md", ".markdown"],
      "text/html": [".html", ".htm"],
      "text/plain": [".txt", ".md", ".markdown", ".csv"],
    },
    disabled: isBusy || isUploadRateLimited,
    maxFiles: MAX_UPLOAD_FILES,
    maxSize: MAX_UPLOAD_SIZE_BYTES,
    multiple: true,
    onDrop,
  });

  return (
    <div className={cn(className)}>
      <div
        {...getRootProps({
          className: cn(
            "group flex min-h-20 cursor-pointer flex-col justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--rule)] bg-transparent px-4 py-3 text-center transition-colors duration-150",
            "hover:border-[var(--accent)]/45 hover:bg-[var(--paper-2)]",
            isDragActive && "border-[var(--accent)]/60 bg-[var(--accent-soft)]",
            isBusy && "cursor-wait opacity-75"
          ),
        })}
      >
        <input {...getInputProps({ "aria-label": "Upload document" })} />
        <p className="text-[length:var(--text-xs)] font-medium text-[var(--ink-500)]">
          {isUploadRateLimited
            ? "Upload limit reached — waiting for the limit window"
            : isBusy
              ? "Processing selected files"
              : "Drop files or click to upload"}
        </p>
        <p className="mt-1 text-[length:var(--text-2xs)] leading-5 text-[var(--ink-500)]">
          {isUploadRateLimited
            ? `You can upload again in ${formatRetryWaitDuration(uploadLimitedRemainingSeconds)}`
            : isDragActive
              ? "Drop up to 5 files here"
              : "Up to 5 · PDF · DOCX · XLSX · CSV · MD · HTML · TXT"}
        </p>
      </div>
      {uploadItems.length > 0 ? (
        <ul className="mt-2 space-y-1.5" aria-label="Selected file progress" aria-live="polite">
          {uploadItems.map((item) => (
            <li
              key={item.id}
              data-upload-status={item.status}
              className="rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-1)] px-2.5 py-2 text-[length:var(--text-2xs)] leading-4"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-[var(--ink-700)]" title={item.filename}>
                  {item.filename}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold uppercase tracking-wide",
                    item.status === "failed" ? "text-[var(--danger-ink)]" : "text-[var(--ink-500)]"
                  )}
                >
                  {getStatusLabel(item.status)}
                  {item.status === "uploading" && typeof item.progress === "number" ? ` ${item.progress}%` : ""}
                </span>
              </span>
              {item.status === "uploading" && typeof item.progress === "number" ? (
                <span
                  role="progressbar"
                  aria-label={`Uploading ${item.filename}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={item.progress}
                  className="mt-1 block h-0.5 w-full overflow-hidden rounded bg-black/[0.07]"
                >
                  <span className="block h-full bg-[#BA5C3D] transition-[width] duration-150" style={{ width: `${item.progress}%` }} />
                </span>
              ) : null}
              {item.message ? (
                <p
                  className={cn(
                    "mt-1",
                    item.status === "failed"
                      ? "text-[var(--danger-ink)]"
                      : "text-[var(--ink-500)]"
                  )}
                >
                  {item.message}
                </p>
              ) : null}
              {item.duplicate && item.status === "failed" ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => uploadAnyway(item.id)}
                  className="mt-1.5 rounded-[var(--radius-sm)] border border-[var(--rule)] px-2 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--accent)]/45 hover:text-[var(--ink-900)] disabled:pointer-events-none disabled:opacity-50"
                >
                  Upload anyway
                </button>
              ) : null}
              {item.status === "failed" && item.retryable !== false ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => retryItem(item)}
                  className="mt-1 rounded px-1 py-0.5 text-[11px] font-medium text-[#9A5A3E] underline-offset-2 hover:bg-[#BA5C3D]/10 hover:text-[color:var(--editorial-rust-strong)] hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  Retry
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
