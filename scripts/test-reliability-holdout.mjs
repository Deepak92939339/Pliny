import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectPromptChunks } from "../src/lib/ai/contextSelection.ts";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import { pdfProcessor } from "../src/lib/document-processing/plugins/pdf.ts";
import { toProviderSafeText } from "../src/lib/privacy/providerSafeText.ts";
import { buildLexicalWebsearchQuery } from "../src/lib/search/retrieveChunks.ts";
import { buildSyntheticPdfFixture } from "./fixtures/synthetic-files.mjs";

const holdout = JSON.parse(
  await readFile(new URL("./fixtures/reliability-holdout.json", import.meta.url), "utf8")
);
const longTailPrefix = Array.from(
  { length: 20 },
  (_, index) => `Routine note ${index + 1} covers ordinary inventory checks and weekly scheduling.`
).join(" ");
const longTailContent = `${longTailPrefix} Imani Voss uses emergency rotation code LANTERN-47. This assignment remains active.`;
const chunks = holdout.documents.flatMap((document) =>
  document.chunks.map((chunk, chunkIndex) => ({
    chunkIndex,
    collectionId: "holdout",
    content: chunk.content === "__LONG_TAIL_CHUNK__" ? longTailContent : chunk.content,
    documentId: document.id,
    filename: document.filename,
    id: chunk.id,
    pageNumber: 1,
    retrievalMode: "keyword",
  }))
);

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function clauseMatches(content, clause) {
  const contentTokens = new Set(normalize(content).split(" ").filter(Boolean));
  return normalize(clause)
    .split(" ")
    .filter(Boolean)
    .every((term) => contentTokens.has(term));
}

function retrieveBaseline(question) {
  const terms = normalize(question).split(" ").filter(Boolean);
  const results = chunks
    .filter((chunk) => terms.every((term) => new Set(normalize(chunk.content).split(" ")).has(term)))
    .slice(0, 5)
    .map((chunk) => ({ ...chunk, keywordScore: 1, relevanceScore: 1 }));

  return {
    reason: results.length > 0 ? "direct_keyword_match" : "broad_context_fallback",
    results: results.length > 0 ? results : chunks.slice(0, 3),
  };
}

function retrieveRepaired(question) {
  const lexicalQuery = buildLexicalWebsearchQuery(question);
  const clauses = lexicalQuery.split(" OR ").filter(Boolean);
  const results = chunks
    .map((chunk) => ({
      chunk,
      score: clauses.filter((clause) => clauseMatches(chunk.content, clause)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, 5)
    .map(({ chunk, score }) => ({ ...chunk, keywordScore: score, relevanceScore: score }));

  return {
    reason: results.length > 0 ? "direct_keyword_match" : "broad_context_fallback",
    results: results.length > 0 ? results : chunks.slice(0, 3),
  };
}

function baselinePromptChunks(retrievedChunks) {
  return retrievedChunks.map((chunk) => ({
    ...chunk,
    content: chunk.content.length <= 1_200 ? chunk.content : `${chunk.content.slice(0, 1_200).trim()}...`,
  }));
}

function evaluateCase(testCase, mode) {
  const retrieval = mode === "baseline" ? retrieveBaseline(testCase.question) : retrieveRepaired(testCase.question);
  const promptChunks =
    mode === "baseline"
      ? baselinePromptChunks(retrieval.results)
      : selectPromptChunks(retrieval.results, {
          maxCharactersPerChunk: 3_000,
          maxTotalCharacters: 12_000,
          question: testCase.question,
        });
  const retrievedIds = new Set(
    retrieval.reason === "broad_context_fallback" ? [] : retrieval.results.map((chunk) => chunk.id)
  );
  const hitAt5 = testCase.answerable
    ? testCase.requiredPassages.some((passage) => retrievedIds.has(passage.chunkId))
    : null;
  const coverageAt5 = testCase.answerable
    ? testCase.requiredPassages.every((passage) => retrievedIds.has(passage.chunkId))
    : null;
  const evidence = assessEvidenceSufficiency({
    question: testCase.question,
    requiredDocumentIds: testCase.requiredDocumentIds,
    retrievalReason: retrieval.reason,
    sources: promptChunks,
  });
  const passageCoverage = testCase.requiredPassages.every((passage) =>
    promptChunks.some((chunk) => chunk.id === passage.chunkId && chunk.content.includes(passage.phrase))
  );

  if (!testCase.answerable) {
    return {
      answerCorrect: !evidence.sufficient,
      citationCorrect: true,
      coverageAt5,
      evidenceSufficient: evidence.sufficient,
      hitAt5,
      id: testCase.id,
      unsupportedAnswer: evidence.sufficient,
    };
  }

  if (!evidence.sufficient || !passageCoverage) {
    return {
      answerCorrect: false,
      citationCorrect: false,
      coverageAt5,
      evidenceSufficient: evidence.sufficient,
      hitAt5,
      id: testCase.id,
      unsupportedAnswer: false,
    };
  }

  const citationIndexes = testCase.requiredPassages.map((passage) =>
    promptChunks.findIndex((chunk) => chunk.id === passage.chunkId)
  );
  const answerText =
    testCase.category === "conflict"
      ? `The sources conflict: the current policy says 30 days [[s.${citationIndexes[0] + 1}]], while the archived handbook says 45 days [[s.${citationIndexes[1] + 1}]].`
      : `${testCase.expectedAnswerParts.join("; ")} ${citationIndexes.map((index) => `[[s.${index + 1}]]`).join(" ")}`;
  const citationValidation = validateCitations(answerText, promptChunks);
  const citationCorrect =
    !citationValidation.rejectedAnswer &&
    testCase.requiredPassages.every((passage) => {
      const index = promptChunks.findIndex((chunk) => chunk.id === passage.chunkId);
      return index >= 0 && answerText.includes(`[[s.${index + 1}]]`) && promptChunks[index].content.includes(passage.phrase);
    });

  return {
    answerCorrect: testCase.expectedAnswerParts.every((part) => answerText.toLowerCase().includes(part.toLowerCase())) && citationCorrect,
    citationCorrect,
    coverageAt5,
    evidenceSufficient: evidence.sufficient,
    hitAt5,
    id: testCase.id,
    unsupportedAnswer: false,
  };
}

function summarize(results) {
  const answerable = results.filter((result) => result.hitAt5 !== null);
  return {
    answerCorrect: results.filter((result) => result.answerCorrect).length,
    answerTotal: results.length,
    citationCorrect: answerable.filter((result) => result.citationCorrect).length,
    citationTotal: answerable.length,
    coverageAt5: answerable.filter((result) => result.coverageAt5).length / answerable.length,
    hitAt5: answerable.filter((result) => result.hitAt5).length / answerable.length,
    unsupportedAnswers: results.filter((result) => result.unsupportedAnswer).length,
  };
}

const baselineCases = holdout.cases.map((testCase) => evaluateCase(testCase, "baseline"));
const repairedCases = holdout.cases.map((testCase) => evaluateCase(testCase, "repaired"));
const baseline = summarize(baselineCases);
const repaired = summarize(repairedCases);
const tailChunk = chunks.find((chunk) => chunk.id === "cedar-tail");
assert.ok(tailChunk);
const baselineTailPassage = baselinePromptChunks([tailChunk])[0].content;
const repairedTailPassage = selectPromptChunks([tailChunk], {
  maxCharactersPerChunk: 3_000,
  maxTotalCharacters: 12_000,
  question: "What emergency rotation code is assigned to Imani Voss?",
})[0].content;

assert.equal(baseline.hitAt5 < repaired.hitAt5, true);
assert.equal(baselineCases.find((result) => result.id === "H-04").answerCorrect, false);
assert.equal(baselineTailPassage.includes("LANTERN-47"), false);
assert.equal(repairedTailPassage.includes("LANTERN-47"), true);
assert.equal(repaired.hitAt5, 1);
assert.equal(repaired.coverageAt5, 1);
assert.deepEqual([repaired.answerCorrect, repaired.answerTotal], [7, 7]);
assert.equal(repaired.unsupportedAnswers, 0);

const privacyInput = "Contact synthetic reviewer at qa.person@example.invalid or +1 (555) 012-4499.";
const privacyOutput = toProviderSafeText(privacyInput, {
  scopeId: "holdout-document",
  scopeSecret: "synthetic-holdout-scope-secret-00000000",
});
assert.equal(privacyOutput.text.includes("qa.person@example.invalid"), false);
assert.equal(privacyOutput.text.includes("+1 (555) 012-4499"), false);
assert.match(privacyOutput.text, /\[EMAIL_/);
assert.match(privacyOutput.text, /\[PHONE_/);

const malformedProviderAnswers = [
  "A factual answer without a citation.",
  "A claim with an invalid marker [[s.99]].",
  "A claim with a truncated marker [[s.1 and another claim [[s.2]].",
];
assert.equal(
  malformedProviderAnswers.every((answer) => validateCitations(answer, chunks.slice(0, 2)).rejectedAnswer),
  true
);
const emptyProviderDraft = "" || "I could not find relevant evidence in the uploaded documents.";
assert.equal(validateCitations(emptyProviderDraft, chunks.slice(0, 2)).rejectedAnswer, true);

const validPdf = buildSyntheticPdfFixture();
await pdfProcessor.validate({ bytes: validPdf, filename: "holdout-valid.pdf", mimeType: "application/pdf" });
const extractedPdf = await pdfProcessor.extract({ bytes: validPdf, filename: "holdout-valid.pdf", mimeType: "application/pdf" });
assert.match(extractedPdf.plainText, /one hundred and eighty operating days/);
await assert.rejects(
  pdfProcessor.validate({ bytes: validPdf.subarray(0, 300), filename: "holdout-invalid.pdf", mimeType: "application/pdf" }),
  /could not be parsed/
);

const summary = {
  baseline,
  cases: { baseline: baselineCases, repaired: repairedCases },
  labels: {
    generation: "mocked extractive generation",
    groundTruth: "manually explicit synthetic holdout",
    providerRequests: 0,
    retrieval: "mocked deterministic PostgreSQL websearch emulation",
  },
  contextEnding: {
    baselineContainsAnswer: baselineTailPassage.includes("LANTERN-47"),
    repairedContainsAnswer: repairedTailPassage.includes("LANTERN-47"),
  },
  repaired,
};

console.log(JSON.stringify(summary, null, 2));
