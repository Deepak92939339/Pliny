import assert from "node:assert/strict";
import { ensureDocumentCoverage } from "../src/lib/search/documentCoverage.ts";

const result = ({ documentId, chunkIndex, content }) => ({
  id: `${documentId}-${chunkIndex}`,
  documentId,
  collectionId: "collection",
  content,
  filename: `${documentId}.pdf`,
  pageNumber: chunkIndex + 1,
  chunkIndex,
});

const claude = "Claude describes the document-analysis workflow and the supported review steps in detail.";
const csv = "The CSV records quarterly expenses, including Cloud at 42000 and Sales at 17000.";
const selected = ensureDocumentCoverage(
  [result({ documentId: "claude", chunkIndex: 0, content: claude }), result({ documentId: "claude", chunkIndex: 1, content: `${claude} Additional context.` })],
  [result({ documentId: "csv", chunkIndex: 0, content: csv })],
  ["claude", "csv"],
  2
);

assert.deepEqual(new Set(selected.map((item) => item.documentId)), new Set(["claude", "csv"]));
assert.equal(selected.length, 2, "a question requiring facts from both selected documents must retain both documents");

const unavailable = ensureDocumentCoverage(
  [result({ documentId: "claude", chunkIndex: 0, content: claude }), result({ documentId: "claude", chunkIndex: 1, content: `${claude} Additional context.` })],
  [],
  ["claude", "missing"],
  2
);
assert.deepEqual(new Set(unavailable.map((item) => item.documentId)), new Set(["claude"]));

console.log("Retrieval coverage tests passed.");
