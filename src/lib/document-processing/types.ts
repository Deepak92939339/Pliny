export type SupportedFileKind =
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "markdown"
  | "text"
  | "unknown";

export type ExtractionMethod = "pdf_native" | "ocr" | "plain_text" | "markdown" | "csv" | "docx" | "xlsx";

export type DocumentProcessingMetadata = Record<string, string | number | boolean | null>;

export type ExtractedUnit = {
  cellIndex?: number;
  codeLanguage?: string;
  headingPath?: string[];
  lineEnd?: number;
  lineStart?: number;
  locationLabel: string;
  metadata?: DocumentProcessingMetadata;
  pageNumber?: number;
  rowEnd?: number;
  rowStart?: number;
  sheetName?: string;
  slideNumber?: number;
  text: string;
};

export type ExtractedDocument = {
  charCount: number;
  extractionMethod: ExtractionMethod;
  kind: SupportedFileKind;
  pageCount?: number;
  plainText: string;
  title: string;
  units: ExtractedUnit[];
  warnings: string[];
  wordCount: number;
};

export type DocumentProcessorInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

export type DocumentProcessorPlugin = {
  canProcess: (input: DocumentProcessorInput) => boolean;
  extensions: string[];
  extract: (input: DocumentProcessorInput) => Promise<ExtractedDocument>;
  id: string;
  kind: SupportedFileKind;
  label: string;
  maxBytes: number;
  mimeTypes: string[];
  validate: (input: DocumentProcessorInput) => Promise<void> | void;
};

export class DocumentProcessingError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "DocumentProcessingError";
    this.status = status;
  }
}

export function normalizeExtractedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function countWords(text: string) {
  return normalizeExtractedText(text).split(/\s+/).filter(Boolean).length;
}

export function decodeUtf8(bytes: Uint8Array, { fatal = true }: { fatal?: boolean } = {}) {
  return new TextDecoder("utf-8", { fatal }).decode(bytes);
}

export function hasZipMagicBytes(bytes: Uint8Array) {
  return bytes.byteLength >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function looksBinary(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    return false;
  }

  const sample = bytes.slice(0, Math.min(bytes.byteLength, 4096));
  let suspiciousControlCharacters = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isAllowedControl = byte === 9 || byte === 10 || byte === 13;

    if (byte < 32 && !isAllowedControl) {
      suspiciousControlCharacters += 1;
    }
  }

  return suspiciousControlCharacters / sample.byteLength > 0.03;
}

export function assertMaxBytes(bytes: Uint8Array, maxBytes: number, label: string) {
  if (bytes.byteLength > maxBytes) {
    throw new DocumentProcessingError(`${label} must be ${Math.floor(maxBytes / (1024 * 1024))} MB or less.`, 413);
  }
}

export function assertReadableText(bytes: Uint8Array, label: string) {
  if (looksBinary(bytes)) {
    throw new DocumentProcessingError(`${label} appears to be binary or unreadable text.`, 400);
  }

  try {
    decodeUtf8(bytes, { fatal: true });
  } catch {
    throw new DocumentProcessingError(`${label} must be valid UTF-8 text.`, 400);
  }
}
