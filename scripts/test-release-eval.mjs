import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { selectPromptChunks } from "../src/lib/ai/contextSelection.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import { chunkExtractedDocument } from "../src/lib/document-processing/chunkExtractedDocument.ts";
import { getDocumentProcessor } from "../src/lib/document-processing/registry.ts";
import { sanitizeExtractedDocument } from "../src/lib/document-processing/sanitizeExtractedDocument.ts";
import { rankKeywordResultsForEvaluation } from "../src/lib/search/retrieveChunks.ts";
import { toProviderSafeText } from "../src/lib/privacy/providerSafeText.ts";
import { buildSyntheticDocxFixture, buildSyntheticPdfFixture } from "./fixtures/synthetic-files.mjs";

const dataset = JSON.parse(
  await readFile(new URL("./fixtures/release-assurance-golden-v1.json", import.meta.url), "utf8")
);
const HOLDOUT_SHA256 = "1e8b287e73e90299b4f91d33df2d2b3d62db66e710e9265e8bf3e6d1ebac852f";
const LARGE_METADATA_BYTES = 8_192;
const LIMIT = 5;

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function getInput(document) {
  if (document.format === "pdf_fixture") {
    return { bytes: buildSyntheticPdfFixture(), mimeType: "application/pdf" };
  }
  if (document.format === "docx_fixture") {
    return {
      bytes: buildSyntheticDocxFixture(),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  const content = document.passages.map((passage) => passage.text).join("\n\n");
  if (document.format === "csv") return { bytes: Buffer.from(content), mimeType: "text/csv" };
  if (document.filename.endsWith(".md")) return { bytes: Buffer.from(content), mimeType: "text/markdown" };
  return { bytes: Buffer.from(content), mimeType: "text/plain" };
}

function chunkSupportsPassage(chunk, passage) {
  const chunkTokens = new Set(normalize(chunk.content).split(" ").filter(Boolean));
  const passageTokens = normalize(passage.text).split(" ").filter((token) => token.length >= 4);
  const matched = passageTokens.filter((token) => chunkTokens.has(token)).length;
  return passageTokens.length > 0 && matched / passageTokens.length >= 0.7;
}

async function ingestCorpus() {
  const rows = [];
  const ingestion = [];

  for (const document of dataset.documents) {
    const input = { ...getInput(document), filename: document.filename };
    const processor = getDocumentProcessor(input);
    assert.ok(processor, `A processor must exist for ${document.filename}`);
    await processor.validate(input);
    const extracted = await processor.extract(input);
    const sanitization = sanitizeExtractedDocument(extracted, document.id);
    const chunks = chunkExtractedDocument(sanitization.document, { overlapTokens: 12, targetTokens: 90 });
    assert.ok(chunks.length > 0, `${document.filename} must produce chunks`);

    for (const [index, chunk] of chunks.entries()) {
      const sourceMetadata =
        document.id === "metadata-large"
          ? { ...(document.metadata ?? {}), note: "m".repeat(LARGE_METADATA_BYTES) }
          : document.metadata;
      rows.push({
        chunkIndex: chunk.chunkIndex,
        collectionId: "release-assurance-synthetic",
        content: chunk.content,
        documentId: document.id,
        fileKind: chunk.fileKind,
        filename: document.filename,
        id: `${document.id}:chunk:${index}`,
        locationLabel: chunk.locationLabel,
        metadata: sourceMetadata ?? null,
        pageNumber: chunk.pageNumber,
        passageIds: document.passages.filter((passage) => chunkSupportsPassage(chunk, passage)).map((passage) => passage.id),
        processingMode: document.processingMode ?? "standard",
        retrievalMode: "keyword",
      });
    }

    ingestion.push({
      documentId: document.id,
      extractionMethod: sanitization.document.extractionMethod,
      format: document.format,
      sanitizedEventCount: sanitization.events.length,
      chunkCount: chunks.length,
    });
  }

  return { ingestion, rows };
}

function relevanceForCase(row, testCase) {
  return Math.max(
    0,
    ...testCase.support
      .filter((support) => support.documentId === row.documentId && row.passageIds.includes(support.passageId))
      .map((support) => support.grade)
  );
}

function dcg(grades) {
  return grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const QUESTION_STOP_WORDS = new Set([
  "about",
  "company",
  "does",
  "invented",
  "state",
  "their",
  "which",
]);

function getMissingQuestionTerms(question, rows) {
  const corpusText = normalize(rows.map((row) => row.content).join(" "));
  const corpusTokens = new Set(corpusText.split(" ").filter(Boolean));
  return Array.from(
    new Set(
      normalize(question)
        .split(" ")
        .filter((term) => term.length >= 5 && !QUESTION_STOP_WORDS.has(term) && !corpusTokens.has(term))
    )
  );
}

const holdoutCases = dataset.cases.filter((testCase) => testCase.split === "holdout");
assert.equal(holdoutCases.length, 12, "The frozen holdout must contain exactly 12 untouched cases.");
const holdoutDigest = createHash("sha256").update(JSON.stringify(holdoutCases)).digest("hex");
assert.equal(holdoutDigest, HOLDOUT_SHA256, "Frozen holdout expectations changed; create a new dataset version instead.");

const { ingestion, rows } = await ingestCorpus();
assert.equal(rows.some((row) => row.content.includes("Ignore previous instructions")), false, "prompt injection must be removed during real sanitization");
assert.equal(rows.some((row) => row.content.includes("contractor notice at 21 days")), true, "sanitization must preserve the evidentiary sentence");
const privacyRow = rows.find((row) => row.documentId === "privacy-ledger");
assert.ok(privacyRow);
const privacySafe = toProviderSafeText(privacyRow.content, {
  scopeId: "release-assurance-privacy",
  scopeSecret: "synthetic-release-assurance-secret-00000000",
});
assert.equal(privacySafe.text.includes("elena@example.test"), false);
assert.equal(privacySafe.text.includes("123456789012"), false);
const largeMetadata = rows.find((row) => row.documentId === "metadata-large")?.metadata;
assert.ok(largeMetadata);
assert.ok(JSON.stringify(largeMetadata).length >= LARGE_METADATA_BYTES);
assert.ok(JSON.stringify(largeMetadata).length < 10_000, "large metadata fixture must stay explicitly bounded");

const caseResults = dataset.cases.map((testCase) => {
  const scopedRows = (testCase.requiredDocumentIds ?? []).length > 0
    ? rows.filter((row) => testCase.requiredDocumentIds.includes(row.documentId))
    : rows;
  const retrieved = rankKeywordResultsForEvaluation(scopedRows, testCase.question, LIMIT);
  const promptChunks = selectPromptChunks(retrieved, {
    maxCharactersPerChunk: 3_000,
    maxTotalCharacters: 12_000,
    question: testCase.question,
  });
  const grades = promptChunks.map((row) => relevanceForCase(row, testCase));
  const relevantIndexes = grades.map((grade, index) => (grade > 0 ? index : -1)).filter((index) => index >= 0);
  const supportCoverage = testCase.support.map((support) =>
    promptChunks.some(
      (row) => row.documentId === support.documentId && row.passageIds.includes(support.passageId)
    )
  );
  const requiredDocumentsPresent = (testCase.requiredDocumentIds ?? []).every((documentId) =>
    promptChunks.some((row) => row.documentId === documentId)
  );
  const retrievalReason = retrieved.length > 0 ? "direct_keyword_match" : "broad_context_fallback";
  const evidence = assessEvidenceSufficiency({
    question: testCase.question,
    requiredDocumentIds: testCase.requiredDocumentIds ?? [],
    retrievalReason,
    sources: promptChunks,
  });
  const allSupportFound = supportCoverage.length > 0 && supportCoverage.every(Boolean);
  const missingQuestionTerms = getMissingQuestionTerms(testCase.question, promptChunks);
  const shouldRefuse = testCase.answerable
    ? !allSupportFound || !requiredDocumentsPresent || !evidence.sufficient
    : missingQuestionTerms.length > 0 || !requiredDocumentsPresent || !evidence.sufficient;
  const markers = Array.from(
    new Set(
      testCase.support.flatMap((support) => {
        const index = promptChunks.findIndex(
          (row) => row.documentId === support.documentId && row.passageIds.includes(support.passageId)
        );
        return index >= 0 ? [`[[s.${index + 1}]]`] : [];
      })
    )
  );
  const citationValidation = validateCitations(
    markers.length > 0 ? `Synthetic supported answer ${markers.join(" ")}` : "INSUFFICIENT_EVIDENCE",
    promptChunks
  );
  const idealGrades = testCase.support.map((support) => support.grade).sort((left, right) => right - left).slice(0, LIMIT);
  const idealDcg = dcg(idealGrades);

  return {
    answerable: testCase.answerable,
    category: testCase.category,
    citationIdentifierValid: testCase.answerable ? !citationValidation.rejectedAnswer && markers.length > 0 : true,
    hitAt5: testCase.answerable ? relevantIndexes.length > 0 : null,
    id: testCase.id,
    mrr: testCase.answerable && relevantIndexes.length > 0 ? 1 / (relevantIndexes[0] + 1) : testCase.answerable ? 0 : null,
    missingQuestionTerms: testCase.answerable ? [] : missingQuestionTerms,
    ndcgAt5: testCase.answerable ? (idealDcg > 0 ? dcg(grades) / idealDcg : null) : null,
    precisionAt5: testCase.answerable && promptChunks.length > 0 ? relevantIndexes.length / promptChunks.length : testCase.answerable ? 0 : null,
    recallAt5: testCase.answerable && supportCoverage.length > 0 ? supportCoverage.filter(Boolean).length / supportCoverage.length : null,
    refusalCorrect: testCase.answerable ? null : shouldRefuse,
    retrievedChunkIds: promptChunks.map((row) => row.id),
    split: testCase.split,
    supportedAnswerCorrect: testCase.answerable ? !shouldRefuse && !citationValidation.rejectedAnswer : null,
  };
});

const positives = caseResults.filter((result) => result.answerable);
const refusals = caseResults.filter((result) => !result.answerable);
const contradictionCases = caseResults.filter((result) => result.category === "contradiction");
const metrics = {
  caseCount: caseResults.length,
  citationIdentifierValidity: mean(positives.map((result) => Number(result.citationIdentifierValid))),
  contradictionRecognition: mean(contradictionCases.map((result) => Number(result.supportedAnswerCorrect))),
  hitAt5: mean(positives.map((result) => Number(result.hitAt5))),
  holdoutCaseCount: holdoutCases.length,
  mrr: mean(positives.map((result) => result.mrr)),
  ndcgAt5: mean(positives.map((result) => result.ndcgAt5)),
  precisionAt5: mean(positives.map((result) => result.precisionAt5)),
  recallAt5: mean(positives.map((result) => result.recallAt5)),
  refusalAccuracy: mean(refusals.map((result) => Number(result.refusalCorrect))),
  supportedAnswerCorrectness: mean(positives.map((result) => Number(result.supportedAnswerCorrect))),
  unsupportedAnswers: refusals.filter((result) => !result.refusalCorrect).length,
};

const thresholds = {
  citationIdentifierValidity: 1,
  hitAt5: 6 / 6,
  mrr: 0.95,
  ndcgAt5: 0.95,
  precisionAt5: 0.45,
  recallAt5: 0.9,
  refusalAccuracy: 1,
  supportedAnswerCorrectness: 7 / 7,
  unsupportedAnswers: 0,
};
const gates = Object.fromEntries(
  Object.entries(thresholds).map(([name, threshold]) => [
    name,
    name === "unsupportedAnswers" ? metrics[name] === threshold : metrics[name] >= threshold,
  ])
);
const result = {
  dataset: { id: dataset.datasetId, schemaVersion: dataset.schemaVersion, holdoutSha256: holdoutDigest },
  evidenceClass: "provider-free actual extraction, sanitization, chunking, deterministic lexical ranking, evidence and citation contracts",
  gates,
  ingestion,
  metrics,
  cases: caseResults,
  thresholds,
};

if (process.env.PLINY_EVAL_OUTPUT) {
  await mkdir(dirname(process.env.PLINY_EVAL_OUTPUT), { recursive: true });
  await writeFile(process.env.PLINY_EVAL_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
assert.equal(Object.values(gates).every(Boolean), true, "Deterministic release evaluation thresholds must pass.");
