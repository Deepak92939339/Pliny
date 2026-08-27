import * as XLSX from "xlsx";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  hasZipMagicBytes,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type DocumentProcessingMetadata,
  type ExtractedUnit,
} from "@/lib/document-processing/types";

const MAX_SPREADSHEET_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_SHEETS_PROCESSED = 20;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_CELL_CHARACTERS = 500;
const SPREADSHEET_ROWS_PER_UNIT = 40;
const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

type SpreadsheetRow = {
  rowNumber: number;
  values: string[];
};

type SheetExtraction = {
  dataRows: SpreadsheetRow[];
  headers: string[];
  metadata: DocumentProcessingMetadata;
  sheetName: string;
};

function hasSpreadsheetExtension(filename: string) {
  const normalizedName = filename.toLowerCase();

  return normalizedName.endsWith(".xlsx") || normalizedName.endsWith(".xls");
}

function isLegacyXls(filename: string) {
  return filename.toLowerCase().endsWith(".xls");
}

function hasOleMagicBytes(bytes: Uint8Array) {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

function trimCellValue(value: string, warnings: Set<string>) {
  const normalizedValue = normalizeExtractedText(value);

  if (normalizedValue.length <= MAX_CELL_CHARACTERS) {
    return normalizedValue;
  }

  warnings.add("Some spreadsheet cells were shortened for processing.");

  return `${normalizedValue.slice(0, MAX_CELL_CHARACTERS).trimEnd()}...`;
}

function getCellText(cell: XLSX.CellObject | undefined, warnings: Set<string>) {
  if (!cell) {
    return "";
  }

  const rawValue = cell.w ?? cell.v;

  if (rawValue === undefined || rawValue === null) {
    return "";
  }

  if (rawValue instanceof Date) {
    return rawValue.toISOString().slice(0, 10);
  }

  return trimCellValue(String(rawValue), warnings);
}

function getSheetRange(sheet: XLSX.WorkSheet) {
  if (!sheet["!ref"]) {
    return null;
  }

  try {
    return XLSX.utils.decode_range(sheet["!ref"]);
  } catch {
    return null;
  }
}

function extractRowsFromSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  warnings: Set<string>
): {
  metadata: DocumentProcessingMetadata;
  rows: SpreadsheetRow[];
} {
  const range = getSheetRange(sheet);

  if (!range) {
    return {
      metadata: {
        columnCount: 0,
        rowCount: 0,
        sheetName,
        sourceType: "spreadsheet",
      },
      rows: [] satisfies SpreadsheetRow[],
    };
  }

  const totalRows = range.e.r - range.s.r + 1;
  const totalColumns = range.e.c - range.s.c + 1;
  const rowEnd = Math.min(range.e.r, range.s.r + MAX_ROWS_PER_SHEET - 1);
  const columnEnd = Math.min(range.e.c, range.s.c + MAX_COLUMNS_PER_SHEET - 1);
  const rows: SpreadsheetRow[] = [];

  if (totalRows > MAX_ROWS_PER_SHEET) {
    warnings.add(`Sheet "${sheetName}" was limited to the first ${MAX_ROWS_PER_SHEET} rows.`);
  }

  if (totalColumns > MAX_COLUMNS_PER_SHEET) {
    warnings.add(`Sheet "${sheetName}" was limited to the first ${MAX_COLUMNS_PER_SHEET} columns.`);
  }

  for (let rowIndex = range.s.r; rowIndex <= rowEnd; rowIndex += 1) {
    const values: string[] = [];

    for (let columnIndex = range.s.c; columnIndex <= columnEnd; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;

      values.push(getCellText(cell, warnings));
    }

    if (values.some((value) => value.length > 0)) {
      rows.push({
        rowNumber: rowIndex + 1,
        values,
      });
    }
  }

  return {
    metadata: {
      columnCount: Math.min(totalColumns, MAX_COLUMNS_PER_SHEET),
      originalColumnCount: totalColumns,
      originalRowCount: totalRows,
      rowCount: rows.length,
      sheetName,
      sourceType: "spreadsheet",
      truncatedColumns: totalColumns > MAX_COLUMNS_PER_SHEET,
      truncatedRows: totalRows > MAX_ROWS_PER_SHEET,
    },
    rows,
  };
}

function normalizeHeaders(row: SpreadsheetRow, fallbackColumnCount: number) {
  const columnCount = Math.max(fallbackColumnCount, row.values.length);

  return Array.from({ length: columnCount }, (_, index) => row.values[index]?.trim() || `Column ${index + 1}`);
}

function extractReadableSheet(sheet: XLSX.WorkSheet, sheetName: string, warnings: Set<string>): SheetExtraction | null {
  const { metadata, rows } = extractRowsFromSheet(sheet, sheetName, warnings);

  if (rows.length === 0) {
    return null;
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const fallbackColumnCount = Math.max(...rows.map((row) => row.values.length), 0);
  const headers = normalizeHeaders(headerRow, fallbackColumnCount);

  if (dataRows.length === 0) {
    return {
      dataRows: [headerRow],
      headers,
      metadata: {
        ...metadata,
        headerRowNumber: headerRow.rowNumber,
        usedFirstRowAsData: true,
      },
      sheetName,
    };
  }

  return {
    dataRows,
    headers,
    metadata: {
      ...metadata,
      headerRowNumber: headerRow.rowNumber,
      usedFirstRowAsData: false,
    },
    sheetName,
  };
}

function formatRow(headers: string[], row: SpreadsheetRow) {
  const cells = Array.from({ length: Math.max(headers.length, row.values.length) }, (_, index) => {
    const header = headers[index] || `Column ${index + 1}`;
    const value = row.values[index] || "[blank]";

    return `${header}=${value}`;
  });

  return `Row ${row.rowNumber}: ${cells.join(" | ")}`;
}

function buildSpreadsheetUnits(sheets: SheetExtraction[]) {
  const units: ExtractedUnit[] = [];

  for (const sheet of sheets) {
    for (let index = 0; index < sheet.dataRows.length; index += SPREADSHEET_ROWS_PER_UNIT) {
      const slice = sheet.dataRows.slice(index, index + SPREADSHEET_ROWS_PER_UNIT);

      if (slice.length === 0) {
        continue;
      }

      const rowStart = slice[0].rowNumber;
      const rowEnd = slice[slice.length - 1].rowNumber;
      const locationLabel = `Sheet: ${sheet.sheetName} · Rows ${rowStart}–${rowEnd}`;
      const rowsText = slice.map((row) => formatRow(sheet.headers, row)).join("\n");

      units.push({
        locationLabel,
        metadata: {
          ...sheet.metadata,
          columnHeaders: sheet.headers.join(" | "),
          rowEnd,
          rowStart,
        },
        rowEnd,
        rowStart,
        sheetName: sheet.sheetName,
        text: `Sheet: ${sheet.sheetName}\nRows: ${rowStart}–${rowEnd}\n\nColumns: ${sheet.headers.join(" | ")}\n\n${rowsText}`,
      });
    }
  }

  return units;
}

function parseWorkbook(input: { bytes: Uint8Array; filename: string }) {
  try {
    return XLSX.read(Buffer.from(input.bytes), {
      cellDates: true,
      dense: false,
      type: "buffer",
    });
  } catch {
    throw new DocumentProcessingError("Could not read spreadsheet file.", 422);
  }
}

export const xlsxProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    if (!hasSpreadsheetExtension(input.filename)) {
      return false;
    }

    return SPREADSHEET_MIME_TYPES.has(input.mimeType) || input.mimeType === "";
  },
  extensions: [".xlsx", ".xls"],
  async extract(input) {
    const workbook = parseWorkbook(input);
    const warnings = new Set<string>();
    const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS_PROCESSED);

    if (workbook.SheetNames.length > MAX_SHEETS_PROCESSED) {
      warnings.add(`Only the first ${MAX_SHEETS_PROCESSED} sheets were processed.`);
    }

    const readableSheets = sheetNames
      .map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];

        return sheet ? extractReadableSheet(sheet, sheetName, warnings) : null;
      })
      .filter((sheet): sheet is SheetExtraction => Boolean(sheet));
    const units = buildSpreadsheetUnits(readableSheets);
    const plainText = normalizeExtractedText(units.map((unit) => unit.text).join("\n\n"));

    if (units.length === 0 || plainText.length < 10) {
      throw new DocumentProcessingError("No readable sheets found.");
    }

    return {
      charCount: plainText.length,
      extractionMethod: "xlsx",
      kind: "xlsx",
      plainText,
      title: input.filename,
      units,
      warnings: Array.from(warnings),
      wordCount: countWords(plainText),
    };
  },
  id: "xlsx",
  kind: "xlsx",
  label: "XLSX",
  maxBytes: MAX_SPREADSHEET_SIZE_BYTES,
  mimeTypes: Array.from(SPREADSHEET_MIME_TYPES),
  validate(input) {
    const filename = input.filename.toLowerCase();

    if (filename.endsWith(".xlsm")) {
      throw new DocumentProcessingError("Macro-enabled spreadsheets are not supported.", 400);
    }

    if (!hasSpreadsheetExtension(filename)) {
      throw new DocumentProcessingError("Only .xlsx and .xls spreadsheet files are supported by the XLSX processor.", 400);
    }

    assertMaxBytes(input.bytes, MAX_SPREADSHEET_SIZE_BYTES, "Spreadsheet");

    if (filename.endsWith(".xlsx") && !hasZipMagicBytes(input.bytes)) {
      throw new DocumentProcessingError("This file does not appear to be a valid XLSX package.", 400);
    }

    if (isLegacyXls(filename) && !hasOleMagicBytes(input.bytes)) {
      throw new DocumentProcessingError("This file does not appear to be a valid XLS file.", 400);
    }
  },
};
