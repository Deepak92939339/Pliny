import assert from "node:assert/strict";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";

const source = ({ content, filename = "report.pdf", keywordScore, relevanceScore, retrievalMode = "keyword", semanticSimilarity }) => ({
  id: `${filename}-${content.slice(0, 8)}`,
  documentId: filename,
  collectionId: "collection",
  content,
  filename,
  pageNumber: 1,
  chunkIndex: 0,
  keywordScore,
  relevanceScore,
  retrievalMode,
  semanticSimilarity,
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

const crossSources = [
  source({
    content: "The long-document workflow preserves context through bounded source passages.",
    filename: "claude.pdf",
    keywordScore: 7,
    relevanceScore: 7,
  }),
  source({
    content: "The expense table records Cloud at 42000 and Sales at 17000.",
    filename: "expenses.csv",
    keywordScore: 6,
    relevanceScore: 6,
  }),
];
const validCrossCitations = validateCitations("The workflow preserves context [[s.1]], while Cloud exceeds Sales [[s.2]].", crossSources);
const supportedCrossDocument = assessEvidenceSufficiency({
  citedDocumentIds: ["claude.pdf", "expenses.csv"],
  citationValidation: validCrossCitations,
  question: "Compare the long-document context workflow with Cloud and Sales expenses.",
  requiredDocumentIds: ["claude.pdf", "expenses.csv"],
  retrievalReason: "hybrid_match",
  sources: crossSources,
});
assert.equal(supportedCrossDocument.sufficient, true, "supported cross-document answers must retain evidence and citations from both documents");

const missingCrossCitation = assessEvidenceSufficiency({
  citedDocumentIds: ["claude.pdf"],
  citationValidation: validateCitations("The workflow preserves context [[s.1]].", crossSources),
  question: "Compare the long-document context workflow with Cloud and Sales expenses.",
  requiredDocumentIds: ["claude.pdf", "expenses.csv"],
  retrievalReason: "hybrid_match",
  sources: crossSources,
});
assert.equal(missingCrossCitation.sufficient, false, "missing citations from a required document must reject a one-sided answer");
assert.deepEqual(missingCrossCitation.missingCitationDocumentIds, ["expenses.csv"]);

const invalidCrossCitation = assessEvidenceSufficiency({
  citedDocumentIds: ["claude.pdf"],
  citationValidation: validateCitations("The workflow preserves context [[s.9]].", crossSources),
  question: "Compare the long-document context workflow with Cloud and Sales expenses.",
  requiredDocumentIds: ["claude.pdf", "expenses.csv"],
  retrievalReason: "hybrid_match",
  sources: crossSources,
});
assert.equal(invalidCrossCitation.sufficient, false, "invalid cross-document citations must be rejected");

const irrelevantRequiredDocument = assessEvidenceSufficiency({
  question: "Compare the long-document context workflow with Cloud and Sales expenses.",
  requiredDocumentIds: ["claude.pdf", "expenses.csv"],
  retrievalReason: "hybrid_match",
  sources: [
    crossSources[0],
    source({
      content: "This unrelated document contains office hours and contact details only.",
      filename: "expenses.csv",
      keywordScore: 0,
      relevanceScore: 0.2,
      retrievalMode: "semantic",
      semanticSimilarity: 0.2,
    }),
  ],
});
assert.equal(irrelevantRequiredDocument.sufficient, false, "an explicitly selected but irrelevant document must fail evidence coverage");
assert.deepEqual(irrelevantRequiredDocument.missingSourceDocumentIds, ["expenses.csv"]);

const unbounded = assessEvidenceSufficiency({
  question: "What is the renewal term?",
  retrievalReason: "direct_keyword_match",
  sources: [source({ content: `${"renewal term ".repeat(400)}` })],
});
assert.equal(unbounded.sufficient, false, "unbounded evidence must not reach the model");

console.log("Evidence sufficiency tests passed.");
