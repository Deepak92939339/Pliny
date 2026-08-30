import { PDFParse } from "pdf-parse";
import type { PageText } from "@/lib/chunker";
import { extractPdfWithOcr } from "@/lib/ocr/extractPdfWithOcr";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedDocument,
} from "@/lib/document-processing/types";

const MIN_EXTRACTED_WORDS = 20;
const MIN_EXTRACTED_CHARACTERS = 80;
const MIN_AVERAGE_CHARACTERS_PER_PAGE = 100;
const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

type ExtractedPdfText = {
  pageCount: number;
  pages: PageText[];
  text: string;
};

type TextQuality = {
  averageCharactersPerPage: number;
  textLength: number;
  wordCount: number;
};

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function getOcrConfig() {
  return {
    enabled: process.env.OCR_ENABLED === "true",
    maxPages: getNumberEnv("OCR_MAX_PAGES", 5, 1, 10),
  };
}

function getTextQuality(extracted: ExtractedPdfText): TextQuality {
  const wordCount = countWords(extracted.text);

  return {
    averageCharactersPerPage: extracted.text.length / Math.max(extracted.pageCount, 1),
    textLength: extracted.text.length,
    wordCount,
  };
}

function hasTooLittleExtractableText(extracted: ExtractedPdfText, quality = getTextQuality(extracted)) {
  return (
    quality.textLength < MIN_EXTRACTED_CHARACTERS ||
    quality.wordCount < MIN_EXTRACTED_WORDS ||
    (extracted.pageCount > 3 && quality.averageCharactersPerPage < MIN_AVERAGE_CHARACTERS_PER_PAGE)
  );
}

async function extractNativePdfText(pdfData: Uint8Array): Promise<ExtractedPdfText> {
  const parser = new PDFParse({ data: Uint8Array.from(pdfData) });

  try {
    const result = await parser.getText();
    const pages: PageText[] =
      result.pages.length > 0
        ? result.pages.map((page) => ({
            pageNumber: page.num,
            text: page.text,
          }))
        : [
            {
              pageNumber: 1,
              text: result.text,
            },
          ];

    return {
      pageCount: Math.max(result.total, pages.length, 1),
      pages,
      text: normalizeExtractedText(result.text),
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function hasPdfMagicBytes(bytes: Uint8Array) {
  if (bytes.byteLength < 5) {
    return false;
  }

  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

async function validatePdfParseable(bytes: Uint8Array) {
  const parser = new PDFParse({ data: Uint8Array.from(bytes) });

  try {
    const info = await parser.getInfo();

    if (!Number.isFinite(info.total) || info.total < 1) {
      throw new DocumentProcessingError("This PDF could not be validated. Try a different file.");
    }
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function toExtractedDocument({
  extracted,
  extractionMethod,
  filename,
  warnings = [],
}: {
  extracted: ExtractedPdfText;
  extractionMethod: ExtractedDocument["extractionMethod"];
  filename: string;
  warnings?: string[];
}): ExtractedDocument {
  const plainText = normalizeExtractedText(extracted.text);

  return {
    charCount: plainText.length,
    extractionMethod,
    kind: "pdf",
    pageCount: extracted.pageCount,
    plainText,
    title: filename,
    units: extracted.pages.map((page) => ({
      locationLabel: `Page ${page.pageNumber}`,
      pageNumber: page.pageNumber,
      text: page.text,
    })),
    warnings,
    wordCount: countWords(plainText),
  };
}

export const pdfProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    return input.mimeType === "application/pdf" || input.filename.toLowerCase().endsWith(".pdf");
  },
  extensions: [".pdf"],
  async extract(input) {
    let extracted = await extractNativePdfText(new Uint8Array(input.bytes));
    const extractedQuality = getTextQuality(extracted);

    if (!hasTooLittleExtractableText(extracted, extractedQuality)) {
      return toExtractedDocument({
        extracted,
        extractionMethod: "pdf_native",
        filename: input.filename,
      });
    }

    const ocrConfig = getOcrConfig();

    if (!ocrConfig.enabled) {
      throw new DocumentProcessingError("This PDF has too little extractable text. It may be scanned or image-based.");
    }

    try {
      const ocrExtracted = await extractPdfWithOcr(Uint8Array.from(input.bytes), {
        maxPages: ocrConfig.maxPages,
      });
      const ocrQualityTarget = {
        ...ocrExtracted,
        pageCount: ocrExtracted.pagesOcred,
      };
      const ocrQuality = getTextQuality(ocrQualityTarget);

      extracted = ocrExtracted;

      if (hasTooLittleExtractableText(ocrQualityTarget, ocrQuality)) {
        throw new DocumentProcessingError("This PDF does not contain enough readable text. OCR could not recover enough content.");
      }

      return toExtractedDocument({
        extracted,
        extractionMethod: "ocr",
        filename: input.filename,
        warnings: [
          ocrExtracted.truncated
            ? `Text recovered with OCR from the first ${ocrExtracted.pagesOcred} pages. Review sources for accuracy.`
            : "Text recovered with OCR. Review sources for accuracy.",
        ],
      });
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError("OCR could not process this PDF. Please retry or use another file.", 500);
    }
  },
  id: "pdf",
  kind: "pdf",
  label: "PDF",
  maxBytes: MAX_PDF_SIZE_BYTES,
  mimeTypes: ["application/pdf"],
  async validate(input) {
    assertMaxBytes(input.bytes, MAX_PDF_SIZE_BYTES, "PDF");

    if (!input.filename.toLowerCase().endsWith(".pdf")) {
      throw new DocumentProcessingError("Only .pdf files are supported by the PDF processor.", 400);
    }

    if (input.mimeType !== "application/pdf") {
      throw new DocumentProcessingError("PDF uploads must use the application/pdf MIME type.", 400);
    }

    if (!hasPdfMagicBytes(input.bytes)) {
      throw new DocumentProcessingError("This file does not appear to be a valid PDF.", 400);
    }

    try {
      await validatePdfParseable(input.bytes);
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError("This PDF could not be parsed. Try a different file.");
    }
  },
};
