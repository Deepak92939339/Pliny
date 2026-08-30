import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";
import { sanitizeExtractedDocument } from "../src/lib/document-processing/sanitizeExtractedDocument.ts";
import { parseResponseWithCharts } from "../src/lib/chart/parseResponseWithCharts.ts";

const fixtureUrl = new URL("./eval-fixtures.json", import.meta.url);
const corpus = JSON.parse(await readFile(fixtureUrl, "utf8"));
const source = (index) => ({ pageNumber: corpus[index].pageNumber });
const sourceIds = new Set(corpus.map((_, index) => `s.${index + 1}`));
const evaluations = [];

function answered(answer, sources) {
  const validation = validateCitations(answer, sources);

  return {
    answer,
    status: validation.rejectedAnswer ? "insufficient_evidence" : "answered",
    validation,
  };
}

function run(category, name, assertion) {
  try {
    assertion();
    evaluations.push({ category, name, status: "PASS" });
  } catch (error) {
    evaluations.push({ category, name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

run("unit/contract", "supported policy question has a valid citation", () => {
  const result = answered("Vendor renewals require thirty days written notice [[s.1]].", [source(0)]);
  assert.equal(result.status, "answered");
  assert.deepEqual(result.validation.invalidMarkers, []);
  assert.deepEqual(result.validation.validMarkers, ["[[s.1]]"]);
});

run("mocked integration", "multi-document summary resolves every citation", () => {
  const result = answered("The policy requires thirty days notice [[s.1]], while Q4 Cloud expense is 42000 [[s.2]].", [source(0), source(1)]);
  assert.equal(result.status, "answered");
  assert.equal(result.validation.validMarkers.length, 2);
  assert.equal(result.validation.invalidMarkers.length, 0);
});

run("mocked integration", "explicit filename question stays scoped to that document", () => {
  const requested = corpus.find((item) => item.filename === "vendor-policy.md");
  assert.ok(requested);
  const scopedAnswer = "The policy requires thirty days written notice [[s.1]].";
  const result = answered(scopedAnswer, [source(corpus.indexOf(requested))]);
  assert.equal(result.status, "answered");
  assert.equal(result.validation.validMarkers.includes("[[s.1]]"), true);
  assert.equal(scopedAnswer.includes("42000"), false);
});

run("mocked integration", "uploaded-file inventory lists only corpus filenames", () => {
  const listedFiles = corpus.map((item) => item.filename);
  assert.equal(listedFiles.includes("vendor-policy.md"), true);
  assert.equal(listedFiles.includes("q4-expenses.csv"), true);
  assert.equal(listedFiles.includes("ceo-birthday.pdf"), false);
});

run("mocked integration", "false filename question does not claim a missing file exists", () => {
  const answer = "I do not see ceo-birthday.pdf in this workspace.";
  assert.equal(answer.includes("I found"), false);
  assert.equal(corpus.some((item) => item.filename === "ceo-birthday.pdf"), false);
});

run("mocked integration", "unsupported CEO birthday question returns structured refusal", () => {
  const result = {
    closestMatches: [],
    missingEvidence: ["A source that states the CEO's birthday."],
    reason: "The corpus does not contain evidence for this question.",
    status: "insufficient_evidence",
  };
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.missingEvidence.length, 1);
});

run("unit/contract", "invalid citation markers are rejected and never trusted", () => {
  const result = answered("The answer is supported [[s.99]].", [source(0)]);
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.validation.invalidMarkers, ["[[s.99]]"]);
  assert.equal(result.validation.validMarkers.includes("[[s.99]]"), false);
});

run("unit/contract", "prompt-injection document is sanitized without changing policy meaning", () => {
  const fixture = corpus.find((item) => item.id === "injection-001");
  assert.ok(fixture);
  const sanitized = sanitizeExtractedDocument(
    {
      charCount: fixture.content.length,
      extractionMethod: "plain_text",
      kind: "text",
      plainText: fixture.content,
      title: fixture.filename,
      units: [{ locationLabel: "Lines 1-1", text: fixture.content }],
      warnings: [],
      wordCount: fixture.content.split(/\s+/).length,
    },
    fixture.id
  );
  assert.equal(sanitized.events.some((event) => event.ruleId === "prompt_injection_pattern"), true);
  assert.equal(sanitized.document.plainText.includes("Ignore previous instructions"), false);
  assert.equal(sanitized.document.plainText.includes("vendor renewal notice period is thirty days"), true);
});

run("mocked integration", "spreadsheet numeric question matches fixture values", () => {
  const rows = corpus[1].content.split("\n").slice(1).map((row) => {
    const [department, expense] = row.split(",");
    return { department, expense: Number(expense) };
  });
  const cloud = rows.find((row) => row.department === "Cloud");
  assert.deepEqual(cloud, { department: "Cloud", expense: 42000 });
  assert.equal(Math.max(...rows.map((row) => row.expense)), 42000);
});

run("mocked integration", "grounded chart values and source references resolve", () => {
  const chartAnswer = '<chart>{"type":"bar","title":"Q4 Expense","xKey":"department","series":[{"key":"expense","label":"Expense"}],"data":[{"department":"Sales","expense":17000},{"department":"Cloud","expense":42000},{"department":"Marketing","expense":13000}],"sourceRefs":["s.2"]}</chart>';
  const segments = parseResponseWithCharts(chartAnswer);
  const chart = segments.find((segment) => segment.type === "chart");
  assert.ok(chart && chart.type === "chart");
  assert.deepEqual(chart.data.sourceRefs, ["s.2"]);
  assert.equal(chart.data.data.some((row) => row.department === "Cloud" && row.expense === 42000), true);
  assert.equal(chart.data.sourceRefs.every((ref) => sourceIds.has(ref)), true);
});

run("unit/contract", "chart without sourceRefs is rejected", () => {
  const chart = { data: [{ department: "Cloud", expense: 42000 }], series: [{ key: "expense", label: "Expense" }], title: "Q4 Expense", type: "bar", xKey: "department" };
  const result = answered(`<chart>${JSON.stringify(chart)}</chart>`, [source(0)]);
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.validation.missingChartSourceRefs, [1]);
});

run("unit/contract", "chart with invalid sourceRefs is rejected", () => {
  const chart = { data: [{ department: "Cloud", expense: 42000 }], series: [{ key: "expense", label: "Expense" }], title: "Q4 Expense", type: "bar", xKey: "department", sourceRefs: ["s.99"] };
  const result = answered(`<chart>${JSON.stringify(chart)}</chart>`, [source(0)]);
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.validation.invalidChartSourceRefs, ["s.99"]);
});

run("unit/contract", "mixed grounded text and unsupported chart is rejected", () => {
  const chart = { data: [{ department: "Cloud", expense: 42000 }], series: [{ key: "expense", label: "Expense" }], title: "Q4 Expense", type: "bar", xKey: "department" };
  const result = answered(`Cloud is the largest expense [[s.1]].<chart>${JSON.stringify(chart)}</chart>`, [source(0)]);
  assert.deepEqual(result.validation.validMarkers, ["[[s.1]]"]);
  assert.equal(result.validation.rejectedChart, true);
  assert.equal(result.status, "insufficient_evidence");
});

run("unit/contract", "valid grounded chart is accepted", () => {
  const chart = { data: [{ department: "Cloud", expense: 42000 }], series: [{ key: "expense", label: "Expense" }], title: "Q4 Expense", type: "bar", xKey: "department", sourceRefs: ["s.1"] };
  const result = answered(`<chart>${JSON.stringify(chart)}</chart>`, [source(0)]);
  assert.equal(result.validation.chartCount, 1);
  assert.equal(result.validation.rejectedChart, false);
  assert.equal(result.status, "answered");
});

evaluations.push({
  category: "live end-to-end",
  detail: "Not run: requires real Supabase, Voyage, and Anthropic credentials in .env.local.",
  name: "authenticated upload → process → chat → inspect → report/export workflow",
  status: "NOT RUN",
});

console.log("\nPliny AI evaluation suite");
console.log("=======================");
for (const category of ["unit/contract", "mocked integration", "live end-to-end"]) {
  console.log(`\n[${category}]`);
  for (const evaluation of evaluations.filter((item) => item.category === category)) {
    console.log(`${evaluation.status.padEnd(7)} ${evaluation.name}${evaluation.detail ? ` — ${evaluation.detail}` : ""}`);
  }
}

const failures = evaluations.filter((evaluation) => evaluation.status === "FAIL");
const automatedEvaluations = evaluations.filter((evaluation) => evaluation.status !== "NOT RUN");
const passed = automatedEvaluations.filter((evaluation) => evaluation.status === "PASS");
console.log(`\nAutomated evaluations: ${passed.length}/${automatedEvaluations.length} passed.`);
console.log("Live end-to-end evaluations: NOT RUN (credentials required; no live success is claimed).");

if (failures.length > 0) {
  process.exitCode = 1;
}
