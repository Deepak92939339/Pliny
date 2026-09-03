"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  createFailedUploadItem,
  createUploadQueue,
  MAX_UPLOAD_FILES,
  runSequentialUploadBatch,
  type UploadBatchItem,
  type UploadItemStatus,
} from "@/lib/uploads/uploadBatch";
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

  const uploadBatch = useCallback(
    async (initialItems: UploadBatchItem<File>[]) => {
      setIsBusy(true);

      try {
        await runSequentialUploadBatch(initialItems, {
          onChange: (items) => {
            setUploadItems(items);
          },
          process: async (documentId) => {
            const processResponse = await fetch("/api/process-document", {
              body: JSON.stringify({ document_id: documentId }),
              headers: {
                "Content-Type": "application/json",
              },
              method: "POST",
            });
            const processResult = await readProcessResponse(processResponse);
            router.refresh();

            if (!processResponse.ok || processResult.ok === false || processResult.status === "failed") {
              throw new Error(processResult.error ?? "File uploaded, but processing failed. You can retry from the document card.");
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
          upload: async (file) => {
            if (!isSupportedFile(file)) {
              throw new Error("Only PDF, DOCX, XLSX, CSV, MD, HTML, and TXT files can be uploaded. Legacy .xls files are not supported.");
            }

            if (file.size > MAX_UPLOAD_SIZE_BYTES) {
              throw new Error("File must be 15 MB or less.");
            }

            const uploadFormData = new FormData();
            uploadFormData.append("collection_id", collectionId);
            uploadFormData.append("file", file);

            const uploadResponse = await fetch("/api/documents/upload", {
              body: uploadFormData,
              method: "POST",
            });
            const uploadResult = await readUploadResponse(uploadResponse);

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
    disabled: isBusy,
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
            "group flex min-h-20 cursor-pointer flex-col justify-center rounded-xl border border-dashed border-black/15 bg-transparent px-4 py-3 text-center transition-colors duration-150",
            "hover:border-[#BA5C3D]/45 hover:bg-black/[0.025]",
            isDragActive && "border-[#BA5C3D]/60 bg-[#BA5C3D]/10",
            isBusy && "cursor-wait opacity-75"
          ),
        })}
      >
        <input {...getInputProps({ "aria-label": "Upload document" })} />
        <p className="text-[13px] font-medium text-[color:var(--editorial-muted)]">
          {isBusy ? "Processing selected files" : "Drop files or click to upload"}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[color:var(--editorial-muted)]">
          {isDragActive ? "Drop up to 5 files here" : "Up to 5 · PDF · DOCX · XLSX · CSV · MD · HTML · TXT"}
        </p>
      </div>
      {uploadItems.length > 0 ? (
        <ul className="mt-2 space-y-1.5" aria-label="Selected file progress" aria-live="polite">
          {uploadItems.map((item) => (
            <li
              key={item.id}
              data-upload-status={item.status}
              className="rounded-md border border-black/[0.07] bg-white/55 px-2.5 py-2 text-[11px] leading-4"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-[color:var(--editorial-ink-soft)]" title={item.filename}>
                  {item.filename}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold uppercase tracking-wide",
                    item.status === "failed" ? "text-[color:var(--editorial-destructive)]" : "text-[color:var(--editorial-muted)]"
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
                      ? "text-[color:var(--editorial-destructive)]"
                      : "text-[color:var(--editorial-muted)]"
                  )}
                >
                  {item.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
