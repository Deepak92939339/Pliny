import assert from "node:assert/strict";
import { selectPromptChunks, selectRelevantPassage } from "../src/lib/ai/contextSelection.ts";

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

console.log("Context selection tests passed.");
