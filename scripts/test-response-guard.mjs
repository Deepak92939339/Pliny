/**
 * WP6 — UNVERIFIED ANSWER TEXT MUST NEVER LEAVE THE SERVER
 * (spec: PLINY FIX R1, WP6 step 3)
 *
 * The route previously leaked the generated draft for single-document scopes
 * that failed the final evidence check:
 *   responseAnswer = isInsufficientEvidence && requiredDocumentIds.length > 1
 *     ? NO_CONTEXT_ANSWER : answer
 * Tests-first: the decision now lives in a pure function; these tests fail on
 * current code because the module does not exist (the inline logic has no
 * single-doc refusal branch).
 */
import assert from "node:assert/strict";

const guardModule = await import("../src/lib/chat/responseGuard.ts").catch((error) => ({ __importError: error }));
const exportModule = await import("../src/lib/export/reportExport.ts").catch((error) => ({ __importError: error }));

const { resolveVerifiedResponseAnswer, resolveVerifiedResponseCitations } = guardModule;
const { buildChatTranscriptMarkdown } = exportModule;

const NO_CONTEXT_ANSWER =
  "I could not find relevant evidence in the uploaded documents. Try uploading the relevant files, asking a narrower question, or checking whether document processing has finished.";
const DRAFT = "Confidential draft: operating margin fell to 12.4% per the unverified excerpt.";

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

await run("single-document insufficient scope returns the refusal text", () => {
  assert.equal(typeof resolveVerifiedResponseAnswer, "function", "resolveVerifiedResponseAnswer does not exist yet (single-doc draft still leaks)");
  assert.equal(
    resolveVerifiedResponseAnswer({ isInsufficientEvidence: true, answer: DRAFT, noContextAnswer: NO_CONTEXT_ANSWER }),
    NO_CONTEXT_ANSWER
  );
});

await run("multi-document insufficient scope returns the refusal text", () => {
  assert.equal(typeof resolveVerifiedResponseAnswer, "function", "resolveVerifiedResponseAnswer does not exist yet");
  assert.equal(
    resolveVerifiedResponseAnswer({ isInsufficientEvidence: true, answer: DRAFT, noContextAnswer: NO_CONTEXT_ANSWER }),
    NO_CONTEXT_ANSWER
  );
});

await run("sufficient evidence keeps the generated answer", () => {
  assert.equal(typeof resolveVerifiedResponseAnswer, "function", "resolveVerifiedResponseAnswer does not exist yet");
  assert.equal(
    resolveVerifiedResponseAnswer({ isInsufficientEvidence: false, answer: DRAFT, noContextAnswer: NO_CONTEXT_ANSWER }),
    DRAFT
  );
});

await run("insufficient scope strips citations, sufficient keeps them", () => {
  assert.equal(typeof resolveVerifiedResponseCitations, "function", "resolveVerifiedResponseCitations does not exist yet");
  const citations = [{ documentId: "d1" }];
  assert.deepEqual(resolveVerifiedResponseCitations({ isInsufficientEvidence: true, citations }), []);
  assert.deepEqual(resolveVerifiedResponseCitations({ isInsufficientEvidence: false, citations }), citations);
});

await run("exported transcript for an insufficient entry never contains the draft", () => {
  assert.equal(typeof buildChatTranscriptMarkdown, "function", "reportExport import failed");
  const entry = {
    answer: resolveVerifiedResponseAnswer({ isInsufficientEvidence: true, answer: DRAFT, noContextAnswer: NO_CONTEXT_ANSWER }),
    citations: resolveVerifiedResponseCitations({ isInsufficientEvidence: true, citations: [{ documentId: "d1" }] }),
    createdAt: "Just now",
    id: "entry-1",
    metadata: { retrievalReason: "hybrid_match" },
    question: "What was the operating margin?",
    reason: "The generated answer could not be verified against the retrieved document evidence.",
    status: "insufficient_evidence",
  };
  const markdown = buildChatTranscriptMarkdown({ generatedAt: "2026-03-15T12:00:00.000Z", results: [entry], workspaceName: "WS" });
  assert.equal(markdown.includes(DRAFT), false, "the unverified draft must never appear in exports");
  assert.ok(markdown.includes("could not find relevant evidence"), "the refusal text must be visible in exports");
});

const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP6 response guard tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
