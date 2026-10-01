/**
 * WP2 — TABLE RETRIEVAL TESTS (spec: PLINY FIX R1, WP2 step 1)
 *
 * Tests-first: these tests MUST fail on the pre-WP2 code. They use the same
 * pure functions the app uses (csv/xlsx plugins, chunkExtractedDocument,
 * buildLexicalWebsearchQuery, extractIdentifiers, rankKeywordResultsForEvaluation,
 * fuseAndRerankCandidates / fuseCandidatesRrf).
 *
 * Synthetic corpus: a 60-row incident CSV (INC-5501..INC-5560) and an
 * XLSX-equivalent unit set. Exact-ID questions must rank the target row's
 * chunk in the top 3.
 */
import assert from "node:assert/strict";
import { csvProcessor } from "../src/lib/document-processing/plugins/csv.ts";
import { chunkExtractedDocument } from "../src/lib/document-processing/chunkExtractedDocument.ts";
import * as limits from "../src/lib/document-processing/limits.ts";
import * as retrieveChunks from "../src/lib/search/retrieveChunks.ts";
import * as fusion from "../src/lib/search/fusion.ts";

const getTableRowsPerUnit = limits.getTableRowsPerUnit;
const TABLE_ROWS_PER_UNIT = limits.TABLE_ROWS_PER_UNIT ?? 8;
const MAX_TABLE_UNITS = limits.MAX_TABLE_UNITS ?? 150;

process.env.EMBEDDINGS_ENABLED = "false";

const { buildLexicalWebsearchQuery, rankKeywordResultsForEvaluation } = retrieveChunks;
const { fuseAndRerankCandidates } = fusion;
const extractIdentifiers = retrieveChunks.extractIdentifiers;
const fuseCandidatesRrf = fusion.fuseCandidatesRrf;
const getDeterministicRerankBoost = fusion.getDeterministicRerankBoost;

const OWNER_CYCLE = ["Rivera", "Chen", "Okafor", "Sokolova", "Patel"];
const SEVERITY_CYCLE = ["High", "Medium", "Low"];

function buildIncidentCsv(rowCount) {
  const header = "incident_id,date,severity,system,rto_minutes,rpo_minutes,owner";
  const lines = [header];
  for (let i = 1; i <= rowCount; i += 1) {
    const id = `INC-${5500 + i}`;
    const severity = SEVERITY_CYCLE[i % SEVERITY_CYCLE.length];
    const owner = OWNER_CYCLE[i % OWNER_CYCLE.length];
    lines.push(`${id},2026-01-${String((i % 28) + 1).padStart(2, "0")},${severity},billing-api,${30 + i},${5 + (i % 9)},${owner}`);
  }
  return lines.join("\n");
}

function toSearchRows(chunks, { filename = "incidents.csv" } = {}) {
  return chunks.map((chunk, index) => ({
    id: `chunk-${index}`,
    documentId: "doc-1",
    collectionId: "col-1",
    content: chunk.content,
    fileKind: "csv",
    pageNumber: 1,
    chunkIndex: index,
    filename,
    locationLabel: chunk.locationLabel,
    metadata: chunk.metadata,
    processingMode: "standard",
    retrievalMode: "keyword",
  }));
}

function makeSemanticLane(rows, { targetId, targetSimilarity = 0.1, base = 0.3, step = 0.05 }) {
  let decoyIndex = 0;
  return rows.map((row) => ({
    ...row,
    keywordScore: undefined,
    relevanceScore: undefined,
    retrievalMode: "semantic",
    semanticSimilarity: row.id === targetId ? targetSimilarity : Math.min(0.95, base + step * decoyIndex++),
  }));
}

function containsTargetChunk(results, targetId, within) {
  return results.slice(0, within).some((result) => result.id === targetId);
}

function findTargetRowId(rows, identifier) {
  const hit = rows.find((row) => row.content.includes(identifier));
  return hit ? hit.id : null;
}

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

// ---------------------------------------------------------------------------
// 1) Identifier extraction — 20 examples (positives and negatives)
// ---------------------------------------------------------------------------
const IDENTIFIER_CASES = [
  // positives (12)
  ["INC-5517", ["INC-5517"]],
  ["CTR-2026-00417-B", ["CTR-2026-00417-B"]],
  ["SKU-VX-88213", ["SKU-VX-88213"]],
  ["RISK-MATRIX-R7", ["RISK-MATRIX-R7"]],
  ["POL-IND-CAP-12", ["POL-IND-CAP-12"]],
  ["AB-12", ["AB-12"]],
  ["AB1", ["AB1"]],
  ["2026", ["2026"]],
  ["55170", ["55170"]],
  ["What is the severity of incident INC-5517?", ["INC-5517"]],
  ["ID 12345678 owner", ["12345678"]],
  ["ref: PX-9 file", ["PX-9"]],
  // negatives (8)
  ["Q3", []],
  ["v2", []],
  ["A1", []],
  ["123", []],
  ["severity", []],
  ["incident inc", []],
  ["no identifiers here", []],
  ["Roadmap for Q3 and v2", []],
];

await run("extractIdentifiers: 20 labelled examples", () => {
  assert.equal(typeof extractIdentifiers, "function", "extractIdentifiers is not implemented yet");
  for (const [input, expected] of IDENTIFIER_CASES) {
    assert.deepEqual(extractIdentifiers(input), expected, `extractIdentifiers(${JSON.stringify(input)})`);
  }
});

await run("extractIdentifiers: deduplicates and preserves order", () => {
  assert.equal(typeof extractIdentifiers, "function", "extractIdentifiers is not implemented yet");
  assert.deepEqual(extractIdentifiers("INC-5517 and INC-5517 again, plus INC-5518"), ["INC-5517", "INC-5518"]);
});

// ---------------------------------------------------------------------------
// 2) Identifier-aware lexical query
// ---------------------------------------------------------------------------
await run("buildLexicalWebsearchQuery: identifier becomes a leading quoted phrase", () => {
  const output = buildLexicalWebsearchQuery("What is the severity of incident INC-5517?");
  const parts = output.split(" OR ");
  assert.equal(parts[0], '"inc 5517"', `expected leading phrase, got: ${output}`);
  assert.equal(parts.includes("inc"), false, `generic prefix fragment "inc" must not be a loose OR term: ${output}`);
  assert.equal(parts.includes("severity"), true, output);
  assert.equal(parts.includes("incident"), true, output);
  assert.equal(parts.includes("5517"), true, `numeric tail may stay a loose term: ${output}`);
});

await run("buildLexicalWebsearchQuery: multi-segment identifier phrase", () => {
  const output = buildLexicalWebsearchQuery("Who owns POL-IND-CAP-12?");
  assert.ok(output.startsWith('"pol ind cap 12"'), `expected leading phrase, got: ${output}`);
  assert.equal(output.split(" OR ").includes("pol"), false, output);
});

await run("buildLexicalWebsearchQuery: standalone prefix word is preserved", () => {
  const output = buildLexicalWebsearchQuery("INC-5517 and the INC checklist");
  assert.ok(output.includes('"inc 5517"'), output);
  assert.equal(output.split(" OR ").includes("inc"), true, `"inc" occurs standalone, keep it: ${output}`);
});

await run("buildLexicalWebsearchQuery: no identifiers keeps plain OR query", () => {
  const output = buildLexicalWebsearchQuery("What is the refund policy window?");
  assert.equal(output.includes('"'), false, `no identifier, no quotes: ${output}`);
  assert.ok(output.includes("refund"), output);
});

// ---------------------------------------------------------------------------
// 3) Row-faithful table units (CSV)
// ---------------------------------------------------------------------------
await run("CSV chunking: 60 rows -> 8-row units, one chunk per unit, header repeated", async () => {
  const extracted = await csvProcessor.extract({
    filename: "incidents.csv",
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(buildIncidentCsv(60)),
  });
  assert.ok(extracted.units.length > 0);
  assert.equal(extracted.units.length, Math.ceil(60 / TABLE_ROWS_PER_UNIT), "one unit per 8 data rows");
  for (const unit of extracted.units) {
    const dataRowCount = unit.text.split("\n").filter((line) => line.startsWith("Row ")).length;
    assert.ok(dataRowCount <= TABLE_ROWS_PER_UNIT, `unit has ${dataRowCount} data rows, cap is ${TABLE_ROWS_PER_UNIT}`);
    assert.ok(unit.text.startsWith("Columns: "), "column header line must be repeated at the top of every unit");
    assert.ok(unit.locationLabel.startsWith("Rows "), `locationLabel must be Rows X-Y, got ${unit.locationLabel}`);
    assert.ok(unit.rowStart && unit.rowEnd, "rowStart/rowEnd metadata required");
  }
  const chunks = chunkExtractedDocument(extracted);
  assert.equal(chunks.length, extracted.units.length, "table units must bypass the word-window chunker (one chunk per unit)");
  const target = chunks.find((chunk) => chunk.content.includes("INC-5517"));
  assert.ok(target, "INC-5517 must appear in a chunk");
  assert.ok(target.content.includes("incident_id"), "target chunk must carry the column headers");
  assert.ok(/Row \d+: incident_id: INC-5517;/.test(target.content), `target row must be intact, got: ${target.content.slice(0, 200)}`);
});

await run("CSV chunking: adaptive cap keeps units under the ceiling", async () => {
  assert.equal(typeof getTableRowsPerUnit, "function", "getTableRowsPerUnit is not implemented yet");
  const rowsPerUnit = getTableRowsPerUnit(2000);
  assert.ok(Number.isInteger(rowsPerUnit) && rowsPerUnit >= TABLE_ROWS_PER_UNIT, `adaptive rows-per-unit, got ${rowsPerUnit}`);
  assert.equal(Math.ceil(2000 / rowsPerUnit) <= MAX_TABLE_UNITS, true, "unit count must stay <= MAX_TABLE_UNITS");
  const extracted = await csvProcessor.extract({
    filename: "big.csv",
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(buildIncidentCsv(2000)),
  });
  assert.ok(extracted.units.length <= MAX_TABLE_UNITS, `units=${extracted.units.length} must be <= ${MAX_TABLE_UNITS}`);
  const chunks = chunkExtractedDocument(extracted);
  assert.ok(chunks.length <= 200, `chunks=${chunks.length} must respect MAX_DOCUMENT_CHUNKS=200`);
  for (let i = 1; i <= 2000; i += 1) {
    if (i % 97 === 0) {
      const id = `INC-${5500 + i}`;
      assert.ok(chunks.some((chunk) => chunk.content.includes(id)), `${id} must survive chunking`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4) XLSX-equivalent table units -> one chunk per unit
// ---------------------------------------------------------------------------
function buildXlsxEquivalentUnits(dataRowCount) {
  assert.equal(typeof getTableRowsPerUnit, "function", "getTableRowsPerUnit is not implemented yet");
  const headers = ["incident_id", "severity", "owner"];
  const rowsPerUnit = getTableRowsPerUnit(dataRowCount);
  const units = [];
  for (let start = 0; start < dataRowCount; start += rowsPerUnit) {
    const slice = Array.from({ length: Math.min(rowsPerUnit, dataRowCount - start) }, (_, i) => start + i + 1);
    const rowStart = slice[0] + 1;
    const rowEnd = slice[slice.length - 1] + 1;
    const rowsText = slice
      .map((i) => `Row ${i + 1}: incident_id=INC-${5600 + i} | severity=${SEVERITY_CYCLE[i % 3]} | owner=${OWNER_CYCLE[i % 5]}`)
      .join("\n");
    units.push({
      blockType: "table_row",
      locationLabel: `Sheet: Incidents · Rows ${rowStart}–${rowEnd}`,
      metadata: { columnHeaders: headers.join(" | "), rowEnd, rowStart },
      rowEnd,
      rowStart,
      sheetName: "Incidents",
      sourceLocation: `sheet:Incidents:rows:${rowStart}-${rowEnd}`,
      tableContext: `Sheet Incidents; columns: ${headers.join(" | ")}`,
      text: `Sheet: Incidents\nRows: ${rowStart}–${rowEnd}\n\nColumns: ${headers.join(" | ")}\n\n${rowsText}`,
    });
  }
  return units;
}

await run("XLSX-equivalent units: one chunk per unit, metadata preserved", () => {
  const extracted = {
    charCount: 1,
    extractionMethod: "xlsx",
    kind: "xlsx",
    plainText: "x",
    title: "incidents.xlsx",
    units: buildXlsxEquivalentUnits(24),
    warnings: [],
    wordCount: 1,
  };
  assert.equal(extracted.units.length, Math.ceil(24 / TABLE_ROWS_PER_UNIT));
  const chunks = chunkExtractedDocument(extracted);
  assert.equal(chunks.length, extracted.units.length, "table units must not be word-window split");
  for (const chunk of chunks) {
    assert.equal(chunk.metadata.sheetName, "Incidents");
    assert.ok(chunk.metadata.rowStart && chunk.metadata.rowEnd);
    assert.ok(chunk.content.includes("Columns: incident_id | severity | owner"), "headers repeated per chunk");
  }
});

await run("non-table units still use the word-window chunker", () => {
  const longText = Array.from({ length: 3000 }, (_, i) => `word${i % 997}`).join(" ");
  const extracted = {
    charCount: longText.length,
    extractionMethod: "txt",
    kind: "txt",
    plainText: longText,
    title: "notes.txt",
    units: [{ locationLabel: "Page 1", text: longText }],
    warnings: [],
    wordCount: 3000,
  };
  const chunks = chunkExtractedDocument(extracted);
  assert.ok(chunks.length > 1, "long prose must still be split");
});

// ---------------------------------------------------------------------------
// 5) Ranking: exact-ID questions must put the target row's chunk in the top 3
// ---------------------------------------------------------------------------
const TABLE_QUERIES = [
  { query: "What is the severity of incident INC-5517?", identifier: "INC-5517" },
  { query: "What is the RTO for INC-5521?", identifier: "INC-5521" },
  { query: "Who owned INC-5543?", identifier: "INC-5543" },
];

const extracted60 = await csvProcessor.extract({
  filename: "incidents.csv",
  mimeType: "text/csv",
  bytes: new TextEncoder().encode(buildIncidentCsv(60)),
});
const chunks60 = chunkExtractedDocument(extracted60);
const rows60 = toSearchRows(chunks60);

const hits = { weighted: { hit1: 0, hit3: 0 }, rrf: { hit1: 0, hit3: 0 }, lexical: { hit1: 0, hit3: 0 } };

for (const { query, identifier } of TABLE_QUERIES) {
  const targetId = findTargetRowId(rows60, identifier);
  assert.ok(targetId, `target row ${identifier} must exist in the chunked corpus`);

  run(`lexical lane ranks ${identifier} chunk in top 3: ${query}`, () => {
    const ranked = rankKeywordResultsForEvaluation(rows60, query, 5);
    assert.ok(containsTargetChunk(ranked, targetId, 3), `top3=${ranked.slice(0, 3).map((r) => r.id).join(",")}`);
  });
  const lexical = rankKeywordResultsForEvaluation(rows60, query, 8);
  hits.lexical.hit1 += lexical[0]?.id === targetId ? 1 : 0;
  hits.lexical.hit3 += containsTargetChunk(lexical, targetId, 3) ? 1 : 0;

  const semanticLane = makeSemanticLane(rows60, { targetId });

  run(`weighted fusion documents its known asymmetry: ${query}`, () => {
    // WP2 keeps the weighted implementation UNCHANGED (spec step 4). Under
    // min-max weighted fusion a lexically-perfect row chunk can never outrank
    // the top semantic chunk — this is the audited failure mode (E.4) and the
    // reason RRF became the default. This test pins that documented behaviour
    // so any accidental change to the weighted path is caught.
    const fused = fuseAndRerankCandidates({ keywordResults: lexical, semanticResults: semanticLane, limit: 5, query });
    assert.ok(
      !containsTargetChunk(fused, targetId, 3),
      `weighted was expected to keep the target OUT of the top 3 (documented asymmetry), got top3=${fused.slice(0, 3).map((r) => r.id).join(",")}`
    );
  });
  const weightedFused = fuseAndRerankCandidates({ keywordResults: lexical, semanticResults: semanticLane, limit: 5, query });
  hits.weighted.hit1 += weightedFused[0]?.id === targetId ? 1 : 0;
  hits.weighted.hit3 += containsTargetChunk(weightedFused, targetId, 3) ? 1 : 0;

  run(`RRF fusion ranks ${identifier} chunk in top 3: ${query}`, () => {
    assert.equal(typeof fuseCandidatesRrf, "function", "fuseCandidatesRrf is not implemented yet");
    const fused = fuseCandidatesRrf({ keywordResults: lexical, semanticResults: semanticLane, limit: 5, query });
    assert.ok(containsTargetChunk(fused, targetId, 3), `top3=${fused.slice(0, 3).map((r) => r.id).join(",")}`);
  });
  if (typeof fuseCandidatesRrf === "function") {
    const rrfFused = fuseCandidatesRrf({ keywordResults: lexical, semanticResults: semanticLane, limit: 5, query });
    hits.rrf.hit1 += rrfFused[0]?.id === targetId ? 1 : 0;
    hits.rrf.hit3 += containsTargetChunk(rrfFused, targetId, 3) ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// 6) RRF unit behaviour
// ---------------------------------------------------------------------------
const SLOT_ROWS = [
  { id: "kw-decoy-1", content: "alpha beta gamma decoy one", keywordScore: 30, semanticSimilarity: undefined },
  { id: "kw-decoy-2", content: "alpha beta gamma decoy two", keywordScore: 20, semanticSimilarity: undefined },
  { id: "kw-decoy-3", content: "alpha beta gamma decoy three", keywordScore: 10, semanticSimilarity: undefined },
  { id: "kw-target", content: "incident INC-9999 confirmed by ops", keywordScore: 1, semanticSimilarity: undefined },
].map((row, index) => ({
  ...row,
  documentId: "doc-1",
  collectionId: "col-1",
  fileKind: "csv",
  pageNumber: 1,
  chunkIndex: index,
  filename: "decoys.csv",
  locationLabel: `Rows ${index * 8 + 2}-${index * 8 + 9}`,
  metadata: {},
  processingMode: "standard",
  retrievalMode: "keyword",
}));

await run("RRF: guaranteed identifier slot lifts the exact match into the final limit", () => {
  assert.equal(typeof fuseCandidatesRrf, "function", "fuseCandidatesRrf is not implemented yet");
  const keywordLane = SLOT_ROWS.map((row) => ({ ...row, keywordScore: row.keywordScore, retrievalMode: "keyword" }));
  const semanticLane = SLOT_ROWS.map((row, index) => ({
    ...row,
    keywordScore: undefined,
    retrievalMode: "semantic",
    semanticSimilarity: row.id === "kw-target" ? 0.05 : 0.9 - index * 0.05,
  }));
  const fused = fuseCandidatesRrf({
    keywordResults: keywordLane,
    semanticResults: semanticLane,
    limit: 3,
    query: "Details for incident INC-9999",
  });
  assert.equal(fused.length, 3);
  assert.ok(
    fused.some((result) => result.content.includes("INC-9999")),
    `identifier candidate must be in the final limit: ${fused.map((r) => r.id).join(",")}`
  );
});

await run("RRF: deterministic tie ordering (filename, chunkIndex)", () => {
  assert.equal(typeof fuseCandidatesRrf, "function", "fuseCandidatesRrf is not implemented yet");
  const row = (id, filename, chunkIndex) => ({
    id,
    documentId: "d",
    collectionId: "c",
    content: "shared neutral content tokens only",
    fileKind: "txt",
    pageNumber: 1,
    chunkIndex,
    filename,
    locationLabel: "Page 1",
    metadata: {},
    processingMode: "standard",
    retrievalMode: "keyword",
    keywordScore: 5,
  });
  const laneA = [row("b", "b-file.txt", 0), row("a", "a-file.txt", 0)];
  const fused = fuseCandidatesRrf({ keywordResults: [...laneA], semanticResults: [], limit: 5, query: "shared neutral content" });
  assert.equal(fused[0].filename, "a-file.txt", "equal ranks break ties by filename");
});

await run("deterministic boost: exact identifier match scores 1.0", () => {
  assert.equal(typeof getDeterministicRerankBoost, "function", "getDeterministicRerankBoost export missing");
  const result = { filename: "incidents.csv", content: "Row 18: incident_id: INC-5517; severity: High" };
  assert.equal(getDeterministicRerankBoost(result, "What is the severity of incident INC-5517?"), 1);
  const noMatch = { filename: "incidents.csv", content: "Row 19: incident_id: INC-5518; severity: Low" };
  assert.ok(getDeterministicRerankBoost(noMatch, "What is the severity of incident INC-5517?") < 1, "non-match must not get the identifier boost");
});

// ---------------------------------------------------------------------------
// Summary with Hit@1 / Hit@3 per fusion mode (3 table queries)
// ---------------------------------------------------------------------------
const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP2 table retrieval tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log("\n=== Hit@1 / Hit@3 over 3 exact-ID table queries ===");
for (const [mode, value] of Object.entries(hits)) {
  console.log(`${mode.padEnd(9)} Hit@1=${value.hit1}/3 Hit@3=${value.hit3}/3`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
