import { getFileExtension } from "./filename.ts";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (docx / xlsx are OOXML zip containers)
const TEXT_SAMPLE_BYTES = 8192;

function startsWith(bytes: Uint8Array, magic: number[]) {
  return bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value);
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, TEXT_SAMPLE_BYTES);

  if (sample.length === 0) {
    return false;
  }

  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }

    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length < 0.02;
}

/**
 * Compares the leading bytes of an uploaded object with what its extension claims.
 * Returns a user-facing message on mismatch, or null when the content is consistent.
 */
export function describeContentMismatch(bytes: Uint8Array, filename: string): string | null {
  const extension = getFileExtension(filename);

  if (extension === ".pdf") {
    return startsWith(bytes, PDF_MAGIC) ? null : "This file is named .pdf but its contents are not a PDF. Upload a genuine PDF.";
  }

  if (extension === ".docx" || extension === ".xlsx") {
    return startsWith(bytes, ZIP_MAGIC)
      ? null
      : `This file is named ${extension} but its contents are not a valid ${extension.slice(1).toUpperCase()} document. Upload a genuine file.`;
  }

  if ([".txt", ".md", ".markdown", ".csv", ".html", ".htm"].includes(extension)) {
    return looksLikeText(bytes) ? null : `This file is named ${extension} but its contents are binary, not text. Upload a genuine ${extension} file.`;
  }

  return `Unsupported file type ${extension || "(none)"}.`;
}
