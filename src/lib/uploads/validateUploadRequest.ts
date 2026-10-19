import { getUnsupportedFileRejection } from "@/lib/document-processing/fileKinds";
import { getProcessorForExtension, normalizeDocumentMimeType, supportedFileExtensions } from "@/lib/document-processing/registry";
import { getFileTooLargeMessage, getMaxUploadBytes } from "./config.ts";
import { getDisplayFilename, getFileExtension } from "./filename.ts";

export type UploadRequestInput = {
  filename: string;
  mimeType: string;
  size: number;
};

export type UploadRequestValidation =
  | { displayFilename: string; mimeType: string; ok: true; processorId: string }
  | { error: string; ok: false; status: 400 | 413 | 415 };

/**
 * Validates what the browser *declares* about a file before any signed URL is issued. The
 * declaration is untrusted: the bucket enforces a hard size limit and /process re-checks the
 * real size and leading bytes from Storage before anything is extracted.
 */
export function validateUploadRequest(input: UploadRequestInput, maxBytes = getMaxUploadBytes()): UploadRequestValidation {
  const displayFilename = getDisplayFilename(input.filename);
  const extension = getFileExtension(displayFilename);

  if (!Number.isInteger(input.size) || input.size <= 0) {
    return { error: "This file is empty. Choose a file with content.", ok: false, status: 400 };
  }

  if (input.size > maxBytes) {
    return { error: getFileTooLargeMessage(maxBytes), ok: false, status: 413 };
  }

  const processor = getProcessorForExtension(displayFilename);

  if (!processor) {
    // WP7 (audit-r1): .xls returns 415 with the client's message; .xlsm keeps its specific 400.
    const legacyRejection = getUnsupportedFileRejection(displayFilename);

    if (legacyRejection) {
      return { error: legacyRejection.error, ok: false, status: legacyRejection.status as 400 | 415 };
    }

    return { error: `Unsupported file type. Supported formats: ${supportedFileExtensions.join(", ")}.`, ok: false, status: 400 };
  }

  const mimeType = normalizeDocumentMimeType(input.mimeType || "application/octet-stream");

  if (!processor.canProcess({ bytes: new Uint8Array(0), filename: displayFilename, mimeType })) {
    return { error: `The file type "${mimeType}" does not match a ${extension} file.`, ok: false, status: 400 };
  }

  if (input.size > processor.maxBytes) {
    return {
      error: `${processor.label} files must be ${Math.floor(processor.maxBytes / (1024 * 1024))} MB or less.`,
      ok: false,
      status: 413,
    };
  }

  return { displayFilename, mimeType, ok: true, processorId: processor.id };
}
