import {
  assertMaxBytes,
  assertReadableText,
  countWords,
  decodeUtf8,
  DocumentProcessingError,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedUnit,
} from "@/lib/document-processing/types";

const MAX_TEXT_SIZE_BYTES = 5 * 1024 * 1024;
const TEXT_LINES_PER_UNIT = 80;
const TEXT_MIN_CHARACTERS = 10;
const TEXT_MIN_WORDS = 2;

function stripNullBytes(text: string) {
  return text.replace(/\u0000/g, "");
}

function splitLines(text: string) {
  return stripNullBytes(text).replace(/\r\n?/g, "\n").split("\n");
}

export function buildLineUnits(text: string, linesPerUnit = TEXT_LINES_PER_UNIT): ExtractedUnit[] {
  const lines = splitLines(text);
  const units: ExtractedUnit[] = [];

  for (let index = 0; index < lines.length; index += linesPerUnit) {
    const slice = lines.slice(index, index + linesPerUnit);
    const unitText = normalizeExtractedText(slice.join("\n"));

    if (!unitText) {
      continue;
    }

    const lineStart = index + 1;
    const lineEnd = index + slice.length;

    units.push({
      lineEnd,
      lineStart,
      locationLabel: `Lines ${lineStart}-${lineEnd}`,
      text: unitText,
    });
  }

  return units;
}

function validateReadablePlainText(input: { bytes: Uint8Array; filename: string }) {
  assertMaxBytes(input.bytes, MAX_TEXT_SIZE_BYTES, "TXT");
  assertReadableText(input.bytes, "TXT");

  const text = normalizeExtractedText(decodeUtf8(input.bytes, { fatal: false }));

  if (text.length < TEXT_MIN_CHARACTERS || countWords(text) < TEXT_MIN_WORDS) {
    throw new DocumentProcessingError("This text file does not contain enough readable content.");
  }
}

export const textProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    const filename = input.filename.toLowerCase();

    if (filename.endsWith(".txt")) {
      return input.mimeType === "text/plain" || input.mimeType === "application/octet-stream" || input.mimeType === "";
    }

    return false;
  },
  extensions: [".txt"],
  async extract(input) {
    const rawText = decodeUtf8(input.bytes, { fatal: false });
    const plainText = normalizeExtractedText(stripNullBytes(rawText));

    return {
      charCount: plainText.length,
      extractionMethod: "plain_text",
      kind: "text",
      plainText,
      title: input.filename,
      units: buildLineUnits(rawText),
      warnings: [],
      wordCount: countWords(plainText),
    };
  },
  id: "text",
  kind: "text",
  label: "Plain text",
  maxBytes: MAX_TEXT_SIZE_BYTES,
  mimeTypes: ["text/plain", "application/octet-stream"],
  validate(input) {
    if (!input.filename.toLowerCase().endsWith(".txt")) {
      throw new DocumentProcessingError("Only .txt files are supported by the text processor.", 400);
    }

    validateReadablePlainText(input);
  },
};
