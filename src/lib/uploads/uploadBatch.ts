export const MAX_UPLOAD_FILES = 5;

export type UploadCandidate = {
  name: string;
  size: number;
};

export type UploadItemStatus = "queued" | "uploading" | "processing" | "ready" | "failed";

export type UploadBatchItem<TFile extends UploadCandidate = UploadCandidate> = {
  documentId?: string;
  file: TFile;
  filename: string;
  id: string;
  message?: string;
  pageCount?: number;
  status: UploadItemStatus;
};

type UploadResult = {
  documentId: string;
};

type ProcessResult = {
  message?: string;
  pageCount?: number;
  status: "processing" | "ready";
};

type UploadBatchHandlers<TFile extends UploadCandidate> = {
  onChange: (items: UploadBatchItem<TFile>[], changedItem: UploadBatchItem<TFile>) => void;
  process: (documentId: string, file: TFile) => Promise<ProcessResult>;
  upload: (file: TFile) => Promise<UploadResult>;
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
    status: "failed",
  };
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

    transition(queuedItem.id, { message: undefined, status: "uploading" });

    try {
      const uploaded = await upload(queuedItem.file);
      transition(queuedItem.id, {
        documentId: uploaded.documentId,
        message: "Uploaded. Extracting text now.",
        status: "processing",
      });
      const processed = await process(uploaded.documentId, queuedItem.file);
      transition(queuedItem.id, {
        documentId: uploaded.documentId,
        message:
          processed.message ??
          (processed.status === "ready" ? "File processed and ready." : "File is still processing."),
        pageCount: processed.pageCount,
        status: processed.status,
      });
    } catch (error) {
      transition(queuedItem.id, {
        message: getFailureMessage(error),
        status: "failed",
      });
    }
  }

  return items;
}
