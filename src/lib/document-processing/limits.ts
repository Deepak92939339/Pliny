import { DocumentProcessingError, type ExtractedDocument } from "./types.ts";

export const MAX_DOCUMENT_CHUNKS = 200;
export const MAX_EXTRACTED_CHARACTERS = 1_500_000;
export const MAX_EXTRACTED_UNITS = 20_000;
export const MAX_PDF_PAGES = 500;

export function assertExtractedDocumentLimits(document: ExtractedDocument) {
  if (document.pageCount && document.pageCount > MAX_PDF_PAGES) {
    throw new DocumentProcessingError(`This document exceeds the supported ${MAX_PDF_PAGES}-page limit.`, 413);
  }

  if (document.charCount > MAX_EXTRACTED_CHARACTERS) {
    throw new DocumentProcessingError(
      `This document exceeds the supported ${MAX_EXTRACTED_CHARACTERS.toLocaleString("en-US")}-character extraction limit.`,
      413
    );
  }

  if (document.units.length > MAX_EXTRACTED_UNITS) {
    throw new DocumentProcessingError(`This document exceeds the supported ${MAX_EXTRACTED_UNITS.toLocaleString("en-US")}-block limit.`, 413);
  }
}
