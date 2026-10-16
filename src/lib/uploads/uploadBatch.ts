export const MAX_UPLOAD_FILES = 5;

export type UploadCandidate = {
  name: string;
  size: number;
};

export type UploadItemStatus = "queued" | "uploading" | "processing" | "ready" | "failed";

export type UploadBatchItem<TFile extends UploadCandidate = UploadCandidate> = {
  allowDuplicate?: boolean;
  documentId?: string;
  duplicate?: boolean;
  file: TFile;
  filename: string;
  id: string;
  message?: string;
  pageCount?: number;
  /** False for failures a retry cannot fix (validation rejections). */
  retryable?: boolean;
  /** Upload progress, 0-100, while status is "uploading". */
  progress?: number;
  status: UploadItemStatus;
  /** True once the object is in Storage, so a Retry after a processing failure skips the upload. */
  uploaded?: boolean;
};

/** WP5 (audit-r1): thrown on a 409 duplicate response so the item can offer "Upload anyway". */
export class DuplicateUploadError extends Error {
  /** A plain retry would be refused again; the item offers "Upload anyway" instead. */
  retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "DuplicateUploadError";
  }
}

type UploadResult = {
  documentId: string;
};

type ProcessResult = {
  message?: string;
  pageCount?: number;
  status: "processing" | "ready";
};

export type UploadContext = {
  /** The user chose "Upload anyway" for a file the server flagged as a duplicate. */
  allowDuplicate?: boolean;
  /** The document row to reuse if an earlier attempt already created one. */
  documentId?: string;
  /** Report the document id as soon as it exists so a retry can reuse the row. */
  onDocumentId: (documentId: string) => void;
  onProgress: (percent: number) => void;
};

type UploadBatchHandlers<TFile extends UploadCandidate> = {
  onChange: (items: UploadBatchItem<TFile>[], changedItem: UploadBatchItem<TFile>) => void;
  process: (documentId: string, file: TFile) => Promise<ProcessResult>;
  upload: (file: TFile, context: UploadContext) => Promise<UploadResult>;
};

function defaultIdFactory() {
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createUploadQueue<TFile extends UploadCandidate>(
  files: readonly TFile[],
  idFactory: () => string = defaultIdFactory
) {
  if (files.length < 1 || files.length > MAX_UPLOAD_FILES) {
    throw new RangeError(`Select between 1 and ${MAX_UPLOAD_FILES} files.`);
  }

  return files.map<UploadBatchItem<TFile>>((file) => ({
    file,
    filename: file.name,
    id: idFactory(),
    status: "queued",
  }));
}

export function createFailedUploadItem<TFile extends UploadCandidate>(
  file: TFile,
  message: string,
  idFactory: () => string = defaultIdFactory
): UploadBatchItem<TFile> {
  return {
    file,
    filename: file.name,
    id: idFactory(),
    message,
    retryable: false,
    status: "failed",
  };
}

/** Puts a failed item back in the queue. It keeps documentId/uploaded so Retry resumes, not restarts. */
export function resetUploadItemForRetry<TFile extends UploadCandidate>(item: UploadBatchItem<TFile>): UploadBatchItem<TFile> {
  return { ...item, message: undefined, progress: undefined, status: "queued" };
}

function getFailureMessage(error: unknown) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Unable to process this file. Please try again.";
}

export async function runSequentialUploadBatch<TFile extends UploadCandidate>(
  initialItems: UploadBatchItem<TFile>[],
  { onChange, process, upload }: UploadBatchHandlers<TFile>
) {
  let items = [...initialItems];

  function transition(id: string, patch: Partial<UploadBatchItem<TFile>>) {
    let changedItem = items.find((item) => item.id === id);
    items = items.map((item) => {
      if (item.id !== id) return item;
      changedItem = { ...item, ...patch };
      return changedItem;
    });

    if (changedItem) onChange(items, changedItem);
  }

  for (const queuedItem of initialItems) {
    if (queuedItem.status !== "queued") continue;

    transition(queuedItem.id, { message: undefined, progress: queuedItem.uploaded ? undefined : 0, status: "uploading" });

    try {
      let documentId = queuedItem.documentId;

      if (!queuedItem.uploaded || !documentId) {
        const uploaded = await upload(queuedItem.file, {
          allowDuplicate: queuedItem.allowDuplicate,
          documentId,
          onDocumentId: (id) => {
            documentId = id;
            transition(queuedItem.id, { documentId: id });
          },
          onProgress: (percent) => {
            transition(queuedItem.id, { progress: Math.max(0, Math.min(100, Math.round(percent))) });
          },
        });
        documentId = uploaded.documentId;
      }

      transition(queuedItem.id, {
        documentId,
        message: "Uploaded. Extracting text now.",
        progress: 100,
        status: "processing",
        uploaded: true,
      });
      const processed = await process(documentId, queuedItem.file);
      transition(queuedItem.id, {
        documentId,
        message:
          processed.message ??
          (processed.status === "ready" ? "File processed and ready." : "File is still processing."),
        pageCount: processed.pageCount,
        status: processed.status,
      });
    } catch (error) {
      // Every exit from "uploading" lands here, so an item can never be left spinning.
      const isDuplicate = error instanceof DuplicateUploadError;
      transition(queuedItem.id, {
        duplicate: isDuplicate || undefined,
        message: getFailureMessage(error),
        progress: undefined,
        retryable: !(error && typeof error === "object" && (error as { retryable?: unknown }).retryable === false),
        status: "failed",
      });
    }
  }

  return items;
}
