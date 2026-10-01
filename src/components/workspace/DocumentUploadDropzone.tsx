"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  DuplicateUploadError,
  createFailedUploadItem,
  createUploadQueue,
  MAX_UPLOAD_FILES,
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

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;
const ACTIVE_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".markdown", ".html", ".htm", ".csv"];

type DocumentUploadDropzoneProps = {
  className?: string;
  collectionId: string;
};

type InsertedDocument = {
  id: string;
};

type UploadDocumentResponse = {
  document?: InsertedDocument;
  error?: string;
};

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
    return "Select a supported file under 15 MB.";
  }

  if (rejection.errors.some((error) => error.code === "file-too-large")) {
    return "File must be 15 MB or less.";
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

async function readUploadResponse(response: Response): Promise<UploadDocumentResponse> {
  try {
    return (await response.json()) as UploadDocumentResponse;
  } catch {
    return {};
  }
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
          onChange: (items) => {
            setUploadItems(items);
          },
          process: async (documentId) => {
            let processResponse: Response;

            try {
              processResponse = await fetch("/api/process-document", {
                body: JSON.stringify({ document_id: documentId }),
                headers: {
                  "Content-Type": "application/json",
                },
                method: "POST",
              });
            } catch {
              // network error / timeout before any server response
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
          upload: async (file, item) => {
            if (!isSupportedFile(file)) {
              throw new Error("Only PDF, DOCX, XLSX, CSV, MD, HTML, and TXT files can be uploaded. Legacy .xls files are not supported.");
            }

            if (file.size > MAX_UPLOAD_SIZE_BYTES) {
              throw new Error("File must be 15 MB or less.");
            }

            const uploadFormData = new FormData();
            uploadFormData.append("collection_id", collectionId);
            uploadFormData.append("file", file);
            if (item.allowDuplicate) {
              uploadFormData.append("allow_duplicate", "true");
            }

            const uploadResponse = await fetch("/api/documents/upload", {
              body: uploadFormData,
              method: "POST",
            });
            const uploadResult = await readUploadResponse(uploadResponse);

            if (uploadResponse.status === 409) {
              // WP5 (audit-r1): duplicate content in this workspace — surface
              // the message and offer "Upload anyway" on the file item.
              throw new DuplicateUploadError(
                uploadResult.error ?? "This file is already in the workspace."
              );
            }

            if (uploadResponse.status === 429) {
              const retryAfterSeconds = getRetryAfterHeaderSeconds(uploadResponse.headers);

              if (retryAfterSeconds !== null) {
                setUploadRateLimitedUntil(Date.now() + retryAfterSeconds * 1_000);
              }
            }

            if (!uploadResponse.ok || !uploadResult.document) {
              throw new Error(uploadResult.error ?? "Unable to upload this file. Please try again.");
            }

            return { documentId: uploadResult.document.id };
          },
        });
      } finally {
        router.refresh();
        setIsBusy(false);
      }
    },
    [collectionId, router]
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
        <p className="text-[var(--text-xs)] font-medium text-[var(--ink-500)]">
          {isUploadRateLimited
            ? "Upload limit reached — waiting for the limit window"
            : isBusy
              ? "Processing selected files"
              : "Drop files or click to upload"}
        </p>
        <p className="mt-1 text-[var(--text-2xs)] leading-5 text-[var(--ink-500)]">
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
              className="rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--paper-1)] px-2.5 py-2 text-[var(--text-2xs)] leading-4"
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
                </span>
              </span>
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
                  onClick={() => uploadAnyway(item.id)}
                  className="mt-1.5 rounded-[var(--radius-sm)] border border-[var(--rule)] px-2 py-1 text-[var(--text-2xs)] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--accent)]/45 hover:text-[var(--ink-900)]"
                >
                  Upload anyway
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
