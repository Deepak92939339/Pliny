import {
  assertMaxBytes,
  assertReadableText,
  countWords,
  decodeUtf8,
  DocumentProcessingError,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedUnit,
} from "../types.ts";

const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024;
const CSV_ROWS_PER_UNIT = 50;
const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"]);

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field.trim());
      field = "";

      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  row.push(field.trim());

  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function getCell(headers: string[], row: string[], index: number) {
  const header = headers[index]?.trim() || `Column ${index + 1}`;
  const value = row[index]?.trim() ?? "";

  return `${header}: ${value || "[blank]"}`;
}

function buildCsvUnits(rows: string[][]): ExtractedUnit[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const dataRows = rows.slice(1);
  const units: ExtractedUnit[] = [];

  for (let index = 0; index < dataRows.length; index += CSV_ROWS_PER_UNIT) {
    const slice = dataRows.slice(index, index + CSV_ROWS_PER_UNIT);

    if (slice.length === 0) {
      continue;
    }

    const rowStart = index + 2;
    const rowEnd = index + slice.length + 1;
    const rowsText = slice
      .map((row, rowIndex) => {
        const absoluteRow = rowStart + rowIndex;
        const cells = Array.from({ length: Math.max(headers.length, row.length) }, (_, cellIndex) => getCell(headers, row, cellIndex));

        return `Row ${absoluteRow}: ${cells.join("; ")}`;
      })
      .join("\n");

    units.push({
      blockType: "table_row",
      locationLabel: `Rows ${rowStart}-${rowEnd}`,
      metadata: {
        columnCount: headers.length,
        parser: "internal-basic-csv",
      },
      rowEnd,
      rowStart,
      sourceLocation: `rows:${rowStart}-${rowEnd}`,
      tableContext: `CSV columns: ${headers.join(" | ")}`,
      text: `Columns: ${headers.join(" | ")}\n${rowsText}`,
    });
  }

  return units;
}

export const csvProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    const filename = input.filename.toLowerCase();

    if (!filename.endsWith(".csv")) {
      return false;
    }

    return CSV_MIME_TYPES.has(input.mimeType) || input.mimeType === "application/octet-stream" || input.mimeType === "";
  },
  extensions: [".csv"],
  async extract(input) {
    const rawText = stripBom(decodeUtf8(input.bytes, { fatal: false }));
    const rows = parseCsvRows(rawText);
    const units = buildCsvUnits(rows);
    const plainText = normalizeExtractedText(units.map((unit) => unit.text).join("\n\n"));

    if (units.length === 0 || plainText.length < 10) {
      throw new DocumentProcessingError("This CSV does not contain enough readable rows.");
    }

    return {
      charCount: plainText.length,
      extractionMethod: "csv",
      kind: "csv",
      plainText,
      title: input.filename,
      units,
      warnings: [],
      wordCount: countWords(plainText),
    };
  },
  id: "csv",
  kind: "csv",
  label: "CSV",
  maxBytes: MAX_CSV_SIZE_BYTES,
  mimeTypes: Array.from(CSV_MIME_TYPES),
  validate(input) {
    if (!input.filename.toLowerCase().endsWith(".csv")) {
      throw new DocumentProcessingError("Only .csv files are supported by the CSV processor.", 400);
    }

    assertMaxBytes(input.bytes, MAX_CSV_SIZE_BYTES, "CSV");
    assertReadableText(input.bytes, "CSV");
  },
};
