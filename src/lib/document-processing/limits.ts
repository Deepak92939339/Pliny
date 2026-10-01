import { DocumentProcessingError, type ExtractedDocument } from "./types.ts";

export const MAX_DOCUMENT_CHUNKS = 200;
export const MAX_EXTRACTED_CHARACTERS = 1_500_000;
export const MAX_EXTRACTED_UNITS = 20_000;
export const MAX_PDF_PAGES = 500;

/**
 * WP2 (audit-r1): row-faithful table units. Tabular rows are never split
 * across units, and each table unit becomes exactly one retrieval chunk, so
 * an exact-ID row lookup stays discoverable instead of being diluted across
 * a large 40/50-row unit. The adaptive cap bounds the unit count so the
 * MAX_DOCUMENT_CHUNKS ceiling still holds for very large sheets/CSVs.
 */
export const TABLE_ROWS_PER_UNIT = 8;
export const MAX_TABLE_UNITS = 150;

/**
 * Rows per table unit: 8 by default; when that would produce more than
 * MAX_TABLE_UNITS units, grow the rows-per-unit so the count fits. This keeps
 * chunks-per-document <= MAX_TABLE_UNITS (<= MAX_DOCUMENT_CHUNKS = 200) while
 * never splitting a row.
 */
export function getTableRowsPerUnit(totalRows: number): number {
  let rowsPerUnit = TABLE_ROWS_PER_UNIT;

  if (Math.ceil(totalRows / rowsPerUnit) > MAX_TABLE_UNITS) {
    rowsPerUnit = Math.ceil(totalRows / MAX_TABLE_UNITS);
  }

  return Math.max(1, rowsPerUnit);
}

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
