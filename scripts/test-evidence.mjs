import assert from "node:assert/strict";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";

const source = ({ content, filename = "report.pdf", relevanceScore, retrievalMode = "keyword" }) => ({
  id: `${filename}-${content.slice(0, 8)}`,
  documentId: filename,
  collectionId: "collection",
  content,
  filename,
  pageNumber: 1,
  chunkIndex: 0,
  relevanceScore,
  retrievalMode,
});

const supported = assessEvidenceSufficiency({
  question: "What is the renewal term?",
  retrievalReason: "direct_keyword_match",
  sources: [source({ content: "The renewal term is twelve months and renews automatically." })],
});
assert.equal(supported.sufficient, true, "supported questions should pass the evidence gate");
assert.equal(supported.evidenceStatus, "strong");

const unsupported = assessEvidenceSufficiency({
  question: "What is the CEO birthday?",
  retrievalReason: "semantic_match",
  sources: [source({ content: "Cloud infrastructure expenses totaled 42,000 dollars in Q4.", filename: "expenses.csv", relevanceScore: 0.19, retrievalMode: "semantic" })],
});
assert.equal(unsupported.sufficient, false, "clearly unsupported factual questions must be rejected");

const weakOverlap = assessEvidenceSufficiency({
  question: "Which strategic acquisition risk changed the forecast?",
  retrievalReason: "hybrid_match",
  sources: [source({ content: "The forecast covers annual operating expenses and quarterly cash flow." })],
});
assert.equal(weakOverlap.sufficient, false, "weak lexical overlap must not authorize an answer");

const misleadingFilename = assessEvidenceSufficiency({
  question: "What birthday is recorded?",
  retrievalReason: "direct_keyword_match",
  sources: [source({ content: "The file records quarterly expense totals and department budgets.", filename: "CEO-birthday-notes.pdf" })],
});
assert.equal(misleadingFilename.sufficient, false, "filenames must not substitute for evidence content");

const supportedSemanticParaphrase = assessEvidenceSufficiency({
  question: "How long does the yearly subscription last?",
  retrievalReason: "semantic_match",
  sources: [source({ content: "The annual subscription term lasts twelve months.", relevanceScore: 0.82, retrievalMode: "semantic" })],
});
assert.equal(supportedSemanticParaphrase.sufficient, true, "strong semantic evidence must support paraphrased questions");

const invalidCitation = validateCitations("The renewal term is twelve months [[s.9]].", [{ pageNumber: 1 }]);
const citationRejected = assessEvidenceSufficiency({
  citationValidation: invalidCitation,
  question: "What is the renewal term?",
  retrievalReason: "direct_keyword_match",
  sources: [source({ content: "The renewal term is twelve months and renews automatically." })],
});
assert.equal(citationRejected.sufficient, false, "invalid citations must reject an otherwise relevant answer");

const unbounded = assessEvidenceSufficiency({
  question: "What is the renewal term?",
  retrievalReason: "direct_keyword_match",
  sources: [source({ content: `${"renewal term ".repeat(400)}` })],
});
assert.equal(unbounded.sufficient, false, "unbounded evidence must not reach the model");

console.log("Evidence sufficiency tests passed.");
