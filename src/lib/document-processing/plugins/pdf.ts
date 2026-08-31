import { PDFParse } from "pdf-parse";
import type { PageText } from "../../chunker.ts";
import { extractPdfWithOcr } from "../../ocr/extractPdfWithOcr.ts";
import { MAX_PDF_PAGES } from "../limits.ts";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedDocument,
} from "../types.ts";

const MIN_EXTRACTED_WORDS = 20;
const MIN_EXTRACTED_CHARACTERS = 80;
const MIN_AVERAGE_CHARACTERS_PER_PAGE = 100;
const MIN_PAGE_CHARACTERS = 80;
const MIN_PAGE_WORDS = 12;
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

export function hasTooLittleExtractableText(extracted: ExtractedPdfText, quality = getTextQuality(extracted)) {
  return (
    quality.textLength < MIN_EXTRACTED_CHARACTERS ||
    quality.wordCount < MIN_EXTRACTED_WORDS ||
    (extracted.pageCount > 3 && quality.averageCharactersPerPage < MIN_AVERAGE_CHARACTERS_PER_PAGE)
  );
}

export function getPdfOcrPageNumbers(pages: PageText[]) {
  return pages
    .filter((page) => {
      const text = normalizeExtractedText(page.text);
      return text.length > 0 && (text.length < MIN_PAGE_CHARACTERS || countWords(text) < MIN_PAGE_WORDS);
    })
    .map((page) => page.pageNumber);
}

async function extractNativePdfText(pdfData: Uint8Array): Promise<ExtractedPdfText> {
  const parser = new PDFParse({ data: Uint8Array.from(pdfData) });

  try {
    const result = await parser.getText();
    const pages: PageText[] =
      result.pages.length > 0
        ? result.pages.map((page) => ({
            pageNumber: page.num,
            text: normalizeExtractedText(page.text),
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
    if (info.total > MAX_PDF_PAGES) {
      throw new DocumentProcessingError(`This PDF exceeds the supported ${MAX_PDF_PAGES}-page limit.`, 413);
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
      blockType: "paragraph",
      locationLabel: `Page ${page.pageNumber}`,
      pageNumber: page.pageNumber,
      sourceLocation: `page:${page.pageNumber}`,
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
    const sparsePageNumbers = getPdfOcrPageNumbers(extracted.pages);

    if (!hasTooLittleExtractableText(extracted, extractedQuality) && sparsePageNumbers.length === 0) {
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

    const pagesNeedingOcr = sparsePageNumbers.length > 0 ? sparsePageNumbers : extracted.pages.map((page) => page.pageNumber);
    if (pagesNeedingOcr.length > ocrConfig.maxPages) {
      throw new DocumentProcessingError(`This PDF requires OCR on ${pagesNeedingOcr.length} pages, above the supported ${ocrConfig.maxPages}-page OCR limit.`, 413);
    }

    try {
      await input.onStage?.("ocr_fallback");
      const ocrExtracted = await extractPdfWithOcr(Uint8Array.from(input.bytes), { pageNumbers: pagesNeedingOcr });
      const ocrByPage = new Map(ocrExtracted.pages.map((page) => [page.pageNumber, page.text]));
      extracted = {
        pageCount: extracted.pageCount,
        pages: extracted.pages.map((page) => ({ ...page, text: ocrByPage.get(page.pageNumber) ?? page.text })),
        text: "",
      };
      extracted.text = normalizeExtractedText(extracted.pages.map((page) => page.text).join("\n"));

      if (hasTooLittleExtractableText(extracted)) {
        throw new DocumentProcessingError("This PDF does not contain enough readable text. OCR could not recover enough content.");
      }

      return toExtractedDocument({
        extracted,
        extractionMethod: sparsePageNumbers.length > 0 ? "pdf_hybrid_ocr" : "ocr",
        filename: input.filename,
        warnings: [`Text recovered with OCR for ${ocrExtracted.pagesOcred} page${ocrExtracted.pagesOcred === 1 ? "" : "s"}. Review sources for accuracy.`],
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
