import readXlsxFile from "read-excel-file/node";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  hasZipMagicBytes,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type DocumentProcessingMetadata,
  type ExtractedUnit,
} from "../types.ts";

const MAX_SPREADSHEET_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_SHEETS_PROCESSED = 20;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_CELL_CHARACTERS = 500;
const SPREADSHEET_ROWS_PER_UNIT = 40;
const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

type SpreadsheetCell = string | number | boolean | Date | null;

type ParsedSheet = {
  data: SpreadsheetCell[][];
  sheet: string;
};

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

function trimCellValue(value: string, warnings: Set<string>) {
  const normalizedValue = normalizeExtractedText(value);

  if (normalizedValue.length <= MAX_CELL_CHARACTERS) {
    return normalizedValue;
  }

  warnings.add("Some spreadsheet cells were shortened for processing.");

  return `${normalizedValue.slice(0, MAX_CELL_CHARACTERS).trimEnd()}...`;
}

function getCellText(cell: SpreadsheetCell | undefined, warnings: Set<string>) {
  if (cell === undefined || cell === null) {
    return "";
  }

  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10);
  }

  return trimCellValue(String(cell), warnings);
}

function extractRowsFromSheet(
  sheet: ParsedSheet,
  sheetName: string,
  warnings: Set<string>
): {
  metadata: DocumentProcessingMetadata;
  rows: SpreadsheetRow[];
} {
  if (sheet.data.length === 0) {
    return {
      metadata: {
        columnCount: 0,
        rowCount: 0,
        sheetName,
        sourceType: "spreadsheet",
      },
      rows: [],
    };
  }

  const totalRows = sheet.data.length;
  const totalColumns = Math.max(...sheet.data.map((row) => row.length), 0);
  const rowEnd = Math.min(totalRows, MAX_ROWS_PER_SHEET);
  const columnEnd = Math.min(totalColumns, MAX_COLUMNS_PER_SHEET);
  const rows: SpreadsheetRow[] = [];

  if (totalRows > MAX_ROWS_PER_SHEET) {
    warnings.add(`Sheet "${sheetName}" was limited to the first ${MAX_ROWS_PER_SHEET} rows.`);
  }

  if (totalColumns > MAX_COLUMNS_PER_SHEET) {
    warnings.add(`Sheet "${sheetName}" was limited to the first ${MAX_COLUMNS_PER_SHEET} columns.`);
  }

  for (let rowIndex = 0; rowIndex < rowEnd; rowIndex += 1) {
    const values: string[] = [];
    const row = sheet.data[rowIndex] ?? [];

    for (let columnIndex = 0; columnIndex < columnEnd; columnIndex += 1) {
      values.push(getCellText(row[columnIndex], warnings));
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

function extractReadableSheet(sheet: ParsedSheet, sheetName: string, warnings: Set<string>): SheetExtraction | null {
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

async function parseWorkbook(bytes: Uint8Array) {
  try {
    return (await readXlsxFile(Buffer.from(bytes))) as ParsedSheet[];
  } catch {
    throw new DocumentProcessingError("Could not read spreadsheet file.", 422);
  }
}

export const xlsxProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    if (!input.filename.toLowerCase().endsWith(".xlsx")) {
      return false;
    }

    return SPREADSHEET_MIME_TYPES.has(input.mimeType) || input.mimeType === "";
  },
  extensions: [".xlsx"],
  async extract(input) {
    const workbook = await parseWorkbook(input.bytes);
    const warnings = new Set<string>();
    const sheetNames = workbook.slice(0, MAX_SHEETS_PROCESSED).map((sheet) => sheet.sheet);

    if (workbook.length > MAX_SHEETS_PROCESSED) {
      warnings.add(`Only the first ${MAX_SHEETS_PROCESSED} sheets were processed.`);
    }

    const readableSheets = sheetNames
      .map((sheetName) => {
        const sheet = workbook.find((candidate) => candidate.sheet === sheetName);

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

    if (!filename.endsWith(".xlsx")) {
      throw new DocumentProcessingError("Only .xlsx spreadsheet files are supported. Upload a CSV for other spreadsheet data.", 400);
    }

    assertMaxBytes(input.bytes, MAX_SPREADSHEET_SIZE_BYTES, "Spreadsheet");

    if (!hasZipMagicBytes(input.bytes)) {
      throw new DocumentProcessingError("This file does not appear to be a valid XLSX package.", 400);
    }
  },
};
