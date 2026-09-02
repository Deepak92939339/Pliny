import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertPrivacyGenerationPayload,
  buildCitationRepairProviderPayload,
  buildGenerationProviderPayload,
  buildPrivacyGenerationPrompt,
  preparePrivacyGenerationBoundary,
} from "../src/lib/ai/providerBoundary.ts";
import { prepareChunkRowsWithEmbeddings } from "../src/lib/document-processing/prepareChunkRowsWithEmbeddings.ts";
import { embedTexts } from "../src/lib/embeddings/embedBatch.ts";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import {
  getPrivacySafeExportAnswer,
  getPrivacySafeExportQuestion,
  getPrivacySafeExportSource,
  getPrivacySafeExportWorkspaceName,
} from "../src/lib/export/privacyExport.ts";
import {
  assertProviderPayloadExcludes,
  getPrivacyScopeId,
  getPseudonyms,
  PrivacyBoundaryError,
  toProviderSafeQuery,
  toProviderSafeText,
} from "../src/lib/privacy/providerSafeText.ts";
import { logSafeStageError } from "../src/lib/privacy/safeLogging.ts";
import { captureDocumentPrivacyPolicy } from "../src/lib/privacy/types.ts";

const SECRET = "phase-4b-provider-free-test-secret-1234567890";
const ORIGINAL_EMAIL = "owner@example.com";
const ORIGINAL_ACCOUNT = "123456789012";
const originalText = `Contact ${ORIGINAL_EMAIL}. Bank account number ${ORIGINAL_ACCOUNT}.`;
const scopeA = { scopeId: getPrivacyScopeId("tenant-a", "document-a"), scopeSecret: SECRET };
const scopeB = { scopeId: getPrivacyScopeId("tenant-a", "document-b"), scopeSecret: SECRET };
const otherTenant = { scopeId: getPrivacyScopeId("tenant-b", "document-a"), scopeSecret: SECRET };

const maskedA = toProviderSafeText(originalText, scopeA);
const maskedAgain = toProviderSafeText(`Repeat ${ORIGINAL_EMAIL}.`, scopeA);
const emailToken = getPseudonyms(maskedA.text).find((token) => token.startsWith("[EMAIL_"));
assert.ok(emailToken, "privacy projections must use typed email pseudonyms");
assert.equal(maskedAgain.text.includes(emailToken), true, "pseudonyms must remain stable across chunks");
assert.notEqual(toProviderSafeText(originalText, scopeB).text, maskedA.text, "document scopes must be unlinkable");
assert.notEqual(toProviderSafeText(originalText, otherTenant).text, maskedA.text, "tenant scopes must be isolated");

const multiDocumentQuery = toProviderSafeQuery(`Find ${ORIGINAL_EMAIL}`, [scopeA, scopeB]);
assert.equal(multiDocumentQuery.text.includes(ORIGINAL_EMAIL), false);
assert.equal(multiDocumentQuery.tokens.length, 2, "one identifier must fan out only to the bounded document scopes");
assert.equal(multiDocumentQuery.tokens.every((token) => multiDocumentQuery.text.includes(token)), true);
assert.equal(maskedA.text.includes(multiDocumentQuery.tokens[0]) || maskedA.text.includes(multiDocumentQuery.tokens[1]), true);

process.env.EMBEDDINGS_ENABLED = "true";
process.env.EMBEDDINGS_PROVIDER = "voyage";
process.env.EMBEDDING_MODEL = "voyage-4";
process.env.EMBEDDING_DIMENSIONS = "1024";
process.env.VOYAGE_API_KEY = "mock-key";
const vector = Array.from({ length: 1024 }, () => 0.01);
const voyagePayloads = [];
const privacyRows = [{ content: originalText, provider_safe_content: maskedA.text }];
await prepareChunkRowsWithEmbeddings(privacyRows, {
  fetchImpl: async (_url, init) => {
    voyagePayloads.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: [{ embedding: vector }], model: "voyage-4" }), { status: 200 });
  },
  getEmbeddingText: (row) => row.provider_safe_content,
  inputType: "document",
});
assert.equal(JSON.stringify(voyagePayloads).includes(ORIGINAL_EMAIL), false, "original PII must never enter mocked Voyage payloads");
assert.equal(JSON.stringify(voyagePayloads).includes(ORIGINAL_ACCOUNT), false);
await embedTexts([multiDocumentQuery.text], {
  fetchImpl: async (_url, init) => {
    voyagePayloads.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: [{ embedding: vector }], model: "voyage-4" }), { status: 200 });
  },
  inputType: "query",
});
assert.equal(JSON.stringify(voyagePayloads).includes(ORIGINAL_EMAIL), false, "original queries must never enter mocked Voyage payloads");

const standardPayloads = [];
await prepareChunkRowsWithEmbeddings([{ content: "unchanged standard evidence" }], {
  fetchImpl: async (_url, init) => {
    standardPayloads.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: [{ embedding: vector }], model: "voyage-4" }), { status: 200 });
  },
  inputType: "document",
});
assert.deepEqual(standardPayloads[0].input, ["unchanged standard evidence"], "standard-mode embeddings must remain unchanged");

const originalChunk = {
  chunkIndex: 0,
  collectionId: "collection-a",
  content: originalText,
  documentId: "document-a",
  filename: `${ORIGINAL_EMAIL}-contract.pdf`,
  id: "chunk-a",
  locationLabel: `Account ${ORIGINAL_ACCOUNT}`,
  pageNumber: 1,
};
const boundary = preparePrivacyGenerationBoundary({
  chunks: [originalChunk],
  documentIds: ["document-a"],
  question: `What belongs to ${ORIGINAL_EMAIL}?`,
  scopeSecret: SECRET,
  userId: "tenant-a",
});
const prompt = buildPrivacyGenerationPrompt({
  chunks: boundary.chunks,
  question: boundary.question,
  retrievalReason: "hybrid_match",
  requiredDocumentIds: ["document-a"],
});
const generationPayload = buildGenerationProviderPayload({
  maxTokens: 400,
  model: "mock-model",
  prompt,
  system: "Cite only supplied source IDs.",
  temperature: 0,
});
assertPrivacyGenerationPayload(generationPayload, boundary);
assert.equal(JSON.stringify(generationPayload).includes(ORIGINAL_EMAIL), false, "generation payloads must remain masked");
assert.equal(JSON.stringify(generationPayload).includes(ORIGINAL_ACCOUNT), false);
const draftAnswer = `The account is masked ${boundary.allowedPseudonyms[0]} [[s.1]].`;
const repairPayload = buildCitationRepairProviderPayload({
  draftAnswer,
  maxTokens: 300,
  model: "mock-model",
  prompt,
  system: "Repair citations only.",
});
assertPrivacyGenerationPayload(repairPayload, boundary);
assert.equal(JSON.stringify(repairPayload).includes(ORIGINAL_EMAIL), false, "citation-repair payloads must remain masked");
assert.equal(prompt.includes('"sourceId":"s.1"'), true);
assert.equal(prompt.includes('"chunkId":"chunk-a"'), true);
assert.equal(originalChunk.id, boundary.chunks[0].id, "provider-safe passages must retain the real chunk identity");
assert.equal(originalChunk.documentId, boundary.chunks[0].documentId);
assert.equal(boundary.chunks[0].content.includes(ORIGINAL_EMAIL), true, "owner-visible evidence must remain original");
assert.equal(validateCitations("Masked fact [[s.1]].", boundary.chunks).rejectedAnswer, false);
assert.equal(validateCitations("Invented source [[s.2]].", boundary.chunks).rejectedAnswer, true, "models cannot introduce citation IDs");

const standardCapture = captureDocumentPrivacyPolicy("standard");
const changedDefaultCapture = captureDocumentPrivacyPolicy("privacy_minimised");
assert.deepEqual(standardCapture, { mode: "standard", policyVersion: "standard" });
assert.equal(standardCapture.mode, "standard", "a later workspace-default change must not mutate an existing capture");
assert.equal(changedDefaultCapture.mode, "privacy_minimised");

const privacyResult = {
  answer: `Owner-visible answer for ${ORIGINAL_EMAIL} [[s.1]].`,
  citations: [],
  collectionId: "collection-a",
  createdAt: "now",
  id: "answer-a",
  metadata: { maxOutputTokens: 1, model: "mock", modelReason: "test", retrievalReason: "hybrid_match" },
  privacyMode: "privacy_minimised",
  providerSafeQuestion: boundary.question,
  providerSafeAnswer: "Masked answer [[s.1]].",
  question: `What belongs to ${ORIGINAL_EMAIL}?`,
  retrievalReason: "hybrid_match",
  sources: [boundary.chunks[0]],
  status: "answered",
};
const maskedExport = {
  answer: getPrivacySafeExportAnswer(privacyResult),
  question: getPrivacySafeExportQuestion(privacyResult),
  source: getPrivacySafeExportSource(boundary.chunks[0], "Document 1", true),
  workspace: getPrivacySafeExportWorkspaceName(`${ORIGINAL_EMAIL} workspace`, [privacyResult]),
};
assert.equal(JSON.stringify(maskedExport).includes(ORIGINAL_EMAIL), false, "masked exports must exclude original identifiers");
assert.equal(JSON.stringify(maskedExport).includes(ORIGINAL_ACCOUNT), false);
assert.equal(maskedExport.source.documentName, "Document 1");

const capturedLogs = [];
const originalConsoleError = console.error;
console.error = (...values) => capturedLogs.push(JSON.stringify(values));
try {
  logSafeStageError("privacy-test", "embedding failed", new Error(`provider echoed ${ORIGINAL_EMAIL}`), { documentId: "document-a" });
} finally {
  console.error = originalConsoleError;
}
assert.equal(capturedLogs.join(" ").includes(ORIGINAL_EMAIL), false, "logs must not include sensitive error messages");
assert.throws(
  () => assertProviderPayloadExcludes({ input: ORIGINAL_EMAIL }, [ORIGINAL_EMAIL], "embedding"),
  (error) => error instanceof PrivacyBoundaryError && !error.message.includes(ORIGINAL_EMAIL)
);

const migration = readFileSync("supabase/migrations/20260901044022_phase_4b_privacy_minimised_processing.sql", "utf8");
assert.equal(/security\s+definer/i.test(migration), false, "migration must not introduce SECURITY DEFINER");
assert.equal(/grant\s+[^;]+\s+to\s+anon/i.test(migration), false, "migration must not grant anonymous access");
assert.equal(
  /revoke\s+execute\s+on\s+function\s+public\.enforce_document_processing_mode_immutable\(\)\s+from\s+anon,\s*authenticated,\s*service_role/i.test(migration),
  true,
  "trigger function execution must be revoked from every Data API role"
);
assert.equal(
  /revoke\s+execute\s+on\s+function\s+public\.match_document_chunks_lexical_by_mode\([^;]+\)\s+from\s+anon,\s*service_role/i.test(migration),
  true,
  "privacy lexical RPC must not depend on service-role execution"
);
assert.equal(/disable\s+row\s+level\s+security/i.test(migration), false);
assert.equal(/alter\s+table[^;]+alter\s+column\s+embedding[^;]+vector\s*\(/i.test(migration), false, "the Phase 4B migration must not alter vector(1024)");
assert.equal(migration.includes("default 'standard'"), true, "existing rows must remain standard by default");
assert.equal(migration.includes("enforce_document_processing_mode_immutable"), true);
assert.equal(/create\s+table[^;]*(mapping|pseudonym)/i.test(migration), false, "no plaintext mapping table may be proposed");
assert.equal(migration.includes("d.user_id = (select auth.uid())"), true, "privacy lexical retrieval must enforce tenant ownership");
assert.equal(migration.includes("(match_document_id is null or dc.document_id = match_document_id)"), true, "privacy lexical retrieval must retain document bounds");

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
const clientSources = listFiles("src").filter((path) => /\.(tsx|ts)$/.test(path) && readFileSync(path, "utf8").startsWith('"use client"'));
for (const path of clientSources) {
  const source = readFileSync(path, "utf8");
  assert.equal(source.includes("PRIVACY_PSEUDONYM_KEY"), false, `${path} must not contain the privacy key name`);
  assert.equal(source.includes("providerSafeText"), false, `${path} must not import server privacy transforms`);
}

console.log("Phase 4B privacy boundary tests passed.");
