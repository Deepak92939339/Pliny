import assert from "node:assert/strict";
import { selectPromptChunks, selectRelevantPassage } from "../src/lib/ai/contextSelection.ts";
import { csvProcessor } from "../src/lib/document-processing/plugins/csv.ts";
import { sanitizeExtractedDocument } from "../src/lib/document-processing/sanitizeExtractedDocument.ts";
import { chunkExtractedDocument } from "../src/lib/document-processing/chunkExtractedDocument.ts";
import { preparePrivacyGenerationBoundary, buildPrivacyGenerationPrompt, assertPrivacyGenerationPayload } from "../src/lib/ai/providerBoundary.ts";

const earlyMaterial = Array.from(
  { length: 18 },
  (_, index) => `Background sentence ${index + 1} describes routine scheduling and ordinary warehouse maintenance.`
).join(" ");
const answerSentence = "The emergency rotation lead is Imani Voss, and the escalation code is LANTERN-47.";
const longChunk = `${earlyMaterial} ${answerSentence}`;
const selected = selectRelevantPassage(longChunk, "Who leads the emergency rotation and what is the escalation code?", 420);

assert.match(selected, /Imani Voss/);
assert.match(selected, /LANTERN-47/);
assert.equal(selected.length <= 420, true);
assert.match(selected, /[.!?…]$/);

const chunks = [
  {
    chunkIndex: 0,
    collectionId: "collection",
    content: longChunk,
    documentId: "document-a",
    filename: "rotation.txt",
    id: "chunk-a",
    pageNumber: 1,
    providerSafeContent: longChunk,
    retrievalMode: "keyword",
  },
  {
    chunkIndex: 0,
    collectionId: "collection",
    content: "A second complete passage records a verified maintenance window for the same synthetic system.",
    documentId: "document-b",
    filename: "maintenance.txt",
    id: "chunk-b",
    pageNumber: 1,
    retrievalMode: "keyword",
  },
];
const promptChunks = selectPromptChunks(chunks, {
  maxCharactersPerChunk: 420,
  maxTotalCharacters: 520,
  question: "Who leads the emergency rotation and what is the escalation code?",
});

assert.equal(promptChunks.reduce((total, chunk) => total + chunk.content.length, 0) <= 520, true);
assert.match(promptChunks[0].content, /LANTERN-47/);

// Synthetic customer data only; never copy the owner's customer CSV into tests.
const customerCsv = ["Company,City,Country,Phone 1,Phone 2,Website,Notes"];
for (let index = 0; index < 8; index++) {
  customerCsv.push(index === 7
    ? '"Cedar, Inc. PLC",Test Harbour,Testland,+12025550101,+12025550102,https://cedar.example.test/path,"Quoted comma, amount 12.50, version 1.2"'
    : `Other ${index} PLC,Other City,Otherland,555-020${index},555-030${index},https://other${index}.example.test/,Routine record`);
}
const extracted = await csvProcessor.extract({ bytes: Buffer.from(customerCsv.join("\n")), filename: "synthetic-customers.csv", mimeType: "text/csv" });
const tableChunks = chunkExtractedDocument(sanitizeExtractedDocument(extracted, "synthetic-document").document);
const tableChunk = tableChunks[0];
const question = "What are Cedar Inc PLC's city country phone numbers and website?";
const selectedRow = selectRelevantPassage(tableChunk.content, question, 900);
for (const value of ["Cedar, Inc. PLC", "Test Harbour", "Testland", "+12025550101", "+12025550102", "https://cedar.example.test/path", "12.50", "version 1.2"]) {
  assert.ok(tableChunk.content.includes(value), `Extraction/sanitization must retain ${value}`);
  assert.ok(selectedRow.includes(value), `Context must retain ${value}`);
}
assert.match(selectedRow, /Row 9:/);
assert.ok(selectedRow.length <= 900);
const urlProse = selectRelevantPassage(`${earlyMaterial} The published endpoint is https://cedar.example.test/path and its version is 1.2.`, "What is the published endpoint and version?", 420);
assert.match(urlProse, /https:\/\/cedar\.example\.test\/path/);
assert.match(urlProse, /version is 1\.2/);
// A separate oversized row must not anchor selection to the chunk header.
const oversizedNeighbour = `Columns: Company | City | Website\nRow 2: Company: Other; Notes: ${"Unrelated background ".repeat(120)}\n${tableChunk.content.split("\n").at(-1)}`;
assert.match(selectRelevantPassage(oversizedNeighbour, question, 900), /Cedar, Inc\. PLC/);
const searchRow = { ...tableChunk, id: "customer-chunk", documentId: "synthetic-document", collectionId: "synthetic-workspace", filename: "synthetic-customers.csv", retrievalMode: "keyword" };
const selectedChunks = selectPromptChunks([searchRow], { question, maxCharactersPerChunk: 900, maxTotalCharacters: 900 });
assert.match(selectedChunks[0].content, /Cedar, Inc\. PLC/);
assert.equal(selectedChunks[0].locationLabel, "Rows 2-9");
assert.equal(selectedChunks[0].id, searchRow.id);
const privateBoundary = preparePrivacyGenerationBoundary({ chunks: [searchRow], documentIds: [searchRow.documentId], question, userId: "synthetic-user", scopeSecret: "synthetic-scope-secret-not-a-credential" });
const selectedPrivateChunks = selectPromptChunks(privateBoundary.chunks, { question, providerSafeQuestion: privateBoundary.question, maxCharactersPerChunk: 900, maxTotalCharacters: 900 });
assert.match(selectedPrivateChunks[0].providerSafeContent, /Cedar, Inc\. PLC/);
assert.match(selectedPrivateChunks[0].providerSafeContent, /Test Harbour/);
const privatePrompt = buildPrivacyGenerationPrompt({ chunks: selectedPrivateChunks, question: privateBoundary.question, retrievalReason: "direct_keyword_match" });
assert.ok(!privatePrompt.includes("+12025550101"));
assert.ok(!privatePrompt.includes("+12025550102"));
assertPrivacyGenerationPayload({ prompt: privatePrompt }, privateBoundary);
// Punctuation alone must never evaporate a source into domain suffixes.
for (const text of ["https://cedar.example.test/path", "Revenue: 12.50; ratio: 0.75; version: 1.2", "Cedar, Inc. PLC is registered in Testland."]) {
  const selection = selectRelevantPassage(`${text}\n${earlyMaterial}`, "Cedar revenue ratio version", 420);
  assert.ok(selection.includes(text));
}
console.log("Context selection tests passed (prose URLs/decimals and row-faithful customer context).");
