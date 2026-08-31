import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chunkExtractedDocument } from "../src/lib/document-processing/chunkExtractedDocument.ts";
import { csvProcessor } from "../src/lib/document-processing/plugins/csv.ts";
import { docxProcessor } from "../src/lib/document-processing/plugins/docx.ts";
import { htmlProcessor } from "../src/lib/document-processing/plugins/html.ts";
import { markdownProcessor } from "../src/lib/document-processing/plugins/markdown.ts";
import { getPdfOcrPageNumbers, pdfProcessor } from "../src/lib/document-processing/plugins/pdf.ts";
import { xlsxProcessor } from "../src/lib/document-processing/plugins/xlsx.ts";

const fixture = Buffer.from(
  "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",
  "base64"
);

const input = {
  bytes: fixture,
  filename: "quarterly-expenses.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

assert.equal(xlsxProcessor.canProcess(input), true);
assert.equal(xlsxProcessor.canProcess({ ...input, filename: "legacy.xls" }), false);
assert.equal(xlsxProcessor.canProcess({ ...input, mimeType: "application/pdf" }), false);
assert.throws(
  () => xlsxProcessor.validate({ ...input, filename: "legacy.xls" }),
  /Only \.xlsx spreadsheet files are supported/
);
assert.throws(
  () => xlsxProcessor.validate({ ...input, bytes: Buffer.from("not-a-workbook") }),
  /valid XLSX package/
);

const extracted = await xlsxProcessor.extract(input);
assert.equal(extracted.kind, "xlsx");
assert.equal(extracted.units.length, 2);
assert.equal(extracted.units[0].sheetName, "Expenses");
assert.equal(extracted.units[1].sheetName, "Notes");
assert.equal(extracted.plainText.includes("Department=Cloud"), true);
assert.equal(extracted.plainText.includes("Owner=Finance"), true);
assert.equal(extracted.units[0].locationLabel, "Sheet: Expenses · Rows 2–2");

const csv = await csvProcessor.extract({ bytes: Buffer.from("category,amount\nCloud,42000\nSales,17000\n"), filename: "expenses.csv", mimeType: "text/csv" });
assert.equal(csv.kind, "csv");
assert.equal(csv.units[0].blockType, "table_row");
assert.equal(csv.units[0].sourceLocation, "rows:2-3");
const docxFixture = await fs.readFile("/Users/sandman/Downloads/1_Escalation_Letter_ICICI_MOT17428943.docx");
const docx = await docxProcessor.extract({ bytes: docxFixture, filename: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
assert.equal(docx.kind, "docx");
assert.equal(docx.units.every((unit) => unit.blockType === "paragraph" && typeof unit.sourceLocation === "string"), true);

const markdown = await markdownProcessor.extract({
  bytes: Buffer.from("# Runbook\n\n## Deploy\n\n- verify status\n\n| Code | Meaning |\n| --- | --- |\n| E-42 | Retry |\n\n```ts\nconst safe = true;\n```\n<script>throw new Error('nope')</script>"),
  filename: "runbook.md",
  mimeType: "text/markdown",
});
assert.equal(markdown.units.some((unit) => unit.blockType === "heading" && unit.headingPath?.includes("Deploy")), true);
assert.equal(markdown.units.some((unit) => unit.blockType === "table_row" && unit.tableContext?.includes("Markdown table")), true);
assert.equal(markdown.units.some((unit) => unit.blockType === "code" && unit.codeLanguage === "ts"), true);
assert.equal(markdown.plainText.includes("throw new Error"), false);

const safeHtml = await htmlProcessor.extract({
  bytes: Buffer.from("<!doctype html><html><head><title>QA report</title><script>bad()</script></head><body><article><h1>Summary</h1><p>Release evidence is ready.</p><table><tr><th>Code</th><th>Meaning</th></tr><tr><td>E-42</td><td>Retry</td></tr></table><iframe src='https://example.com'></iframe><form><input value='hidden'></form><p hidden>not evidence</p></article></body></html>"),
  filename: "report.html",
  mimeType: "text/html",
});
assert.equal(safeHtml.title, "QA report");
assert.equal(safeHtml.units.some((unit) => unit.blockType === "table_row" && unit.sourceLocation?.includes("tr")), true);
assert.equal(safeHtml.plainText.includes("bad()"), false);
assert.equal(safeHtml.plainText.includes("not evidence"), false);
await assert.rejects(
  htmlProcessor.extract({ bytes: Buffer.from("<!DOCTYPE data SYSTEM 'https://example.com/x'><data>unsafe</data>"), filename: "hostile.html", mimeType: "text/html" }),
  /unsafe external declaration/
);
const malformedHtml = await htmlProcessor.extract({ bytes: Buffer.from("<html><body><article><h1>Broken title<p>Still usable"), filename: "broken.htm", mimeType: "text/html" });
assert.equal(malformedHtml.units.length > 0 && malformedHtml.plainText.includes("Still usable"), true);
await assert.rejects(
  htmlProcessor.extract({ bytes: Buffer.from("<html><body><iframe src='https://example.com'></iframe><img src='https://example.com/t.png'></body></html>"), filename: "external-only.html", mimeType: "text/html" }),
  /safe, readable content/
);

const chunks = chunkExtractedDocument(markdown, { targetTokens: 8, overlapTokens: 1, maxChunks: 20 });
assert.deepEqual(chunks.map((chunk) => chunk.chunkIndex), chunks.map((_, index) => index));
assert.equal(chunks.every((chunk) => typeof chunk.metadata.sourceLocation === "string"), true);
assert.throws(
  () => chunkExtractedDocument({ ...markdown, units: [{ locationLabel: "Lines 1-1", text: "word ".repeat(500) }] }, { targetTokens: 2, overlapTokens: 0, maxChunks: 2 }),
  /chunk indexing limit/
);

assert.deepEqual(getPdfOcrPageNumbers([{ pageNumber: 1, text: "searchable text ".repeat(30) }, { pageNumber: 2, text: "single sparse label" }]), [2]);
const tenderPath = "/Users/sandman/Desktop/RAG intelligence/Tender — QA & DevOps Session Report (TDR-QA-2026-0830).pdf";
const tenderBytes = await fs.readFile(tenderPath);
const tender = await pdfProcessor.extract({ bytes: tenderBytes, filename: "Tender.pdf", mimeType: "application/pdf" });
assert.equal(tender.extractionMethod, "pdf_native");
assert.equal((tender.pageCount ?? 0) > 1, true);
assert.equal(tender.units.every((unit, index) => unit.pageNumber === index + 1 && unit.sourceLocation === `page:${index + 1}`), true);

console.log("Ingestion regression tests passed.");
