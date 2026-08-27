import mammoth from "mammoth";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  hasZipMagicBytes,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedUnit,
} from "@/lib/document-processing/types";

const MAX_DOCX_SIZE_BYTES = 15 * 1024 * 1024;
const DOCX_PARAGRAPHS_PER_UNIT = 12;
const DOCX_WARNING = "DOCX comments, tracked changes, and complex layout may not be fully represented.";

function splitParagraphs(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => normalizeExtractedText(paragraph))
    .filter(Boolean);
}

function buildDocxUnits(paragraphs: string[]): ExtractedUnit[] {
  const units: ExtractedUnit[] = [];

  for (let index = 0; index < paragraphs.length; index += DOCX_PARAGRAPHS_PER_UNIT) {
    const slice = paragraphs.slice(index, index + DOCX_PARAGRAPHS_PER_UNIT);
    const paragraphStart = index + 1;
    const paragraphEnd = index + slice.length;
    const text = slice.join("\n\n");

    if (!text.trim()) {
      continue;
    }

    units.push({
      locationLabel: `Paragraphs ${paragraphStart}-${paragraphEnd}`,
      metadata: {
        paragraphEnd,
        paragraphStart,
      },
      text,
    });
  }

  return units;
}

export const docxProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    return (
      input.filename.toLowerCase().endsWith(".docx") &&
      (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        input.mimeType === "application/octet-stream" ||
        input.mimeType === "")
    );
  },
  extensions: [".docx"],
  async extract(input) {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(input.bytes),
    });
    const paragraphs = splitParagraphs(result.value);
    const plainText = normalizeExtractedText(paragraphs.join("\n\n"));
    const warnings = [
      DOCX_WARNING,
      ...result.messages
        .map((message) => message.message)
        .filter((message): message is string => Boolean(message))
        .slice(0, 3),
    ];

    if (plainText.length < 20 || countWords(plainText) < 5) {
      throw new DocumentProcessingError("This DOCX does not contain enough readable text.");
    }

    return {
      charCount: plainText.length,
      extractionMethod: "docx",
      kind: "docx",
      plainText,
      title: input.filename,
      units: buildDocxUnits(paragraphs),
      warnings,
      wordCount: countWords(plainText),
    };
  },
  id: "docx",
  kind: "docx",
  label: "DOCX",
  maxBytes: MAX_DOCX_SIZE_BYTES,
  mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  validate(input) {
    const filename = input.filename.toLowerCase();

    if (filename.endsWith(".doc") || filename.endsWith(".docm")) {
      throw new DocumentProcessingError("Only .docx files are supported. Legacy .doc and macro-enabled .docm files are not supported.", 400);
    }

    if (!filename.endsWith(".docx")) {
      throw new DocumentProcessingError("Only .docx files are supported by the DOCX processor.", 400);
    }

    assertMaxBytes(input.bytes, MAX_DOCX_SIZE_BYTES, "DOCX");

    if (!hasZipMagicBytes(input.bytes)) {
      throw new DocumentProcessingError("This file does not appear to be a valid DOCX package.", 400);
    }
  },
};
