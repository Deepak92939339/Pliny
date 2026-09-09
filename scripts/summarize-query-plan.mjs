import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const inputPath = process.argv[2];
assert.ok(inputPath, "Pass a psql query-plan output path.");
const lines = (await readFile(inputPath, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean);

function getPlan(marker) {
  const index = lines.indexOf(`${marker}_PLAN_BEGIN`);
  const endIndex = lines.indexOf(`${marker}_PLAN_END`);
  assert.ok(index >= 0, `${marker} plan marker must exist`);
  assert.ok(endIndex > index, `${marker} plan end marker must exist`);
  return JSON.parse(lines.slice(index + 1, endIndex).join("\n"))[0];
}

function flattenNodes(plan) {
  return [plan, ...(plan.Plans ?? []).flatMap(flattenNodes)];
}

function summarize(label) {
  const root = getPlan(label);
  const nodes = flattenNodes(root.Plan);
  return {
    executionTimeMs: root["Execution Time"],
    nodeTypes: nodes.map((node) => node["Node Type"]),
    indexes: nodes.map((node) => node["Index Name"]).filter(Boolean),
    actualRows: root.Plan["Actual Rows"],
    sharedHitBlocks: root.Plan["Shared Hit Blocks"],
    sharedReadBlocks: root.Plan["Shared Read Blocks"],
  };
}

const result = {
  corpusRows: 5_000,
  evidenceClass: "EXPLAIN ANALYZE against transaction-rolled-back synthetic local corpus",
  lexical: summarize("LEXICAL"),
  selectiveLexical: summarize("SELECTIVE_LEXICAL"),
  vector: summarize("VECTOR"),
};

if (process.env.PLINY_PLAN_OUTPUT) {
  await mkdir(dirname(process.env.PLINY_PLAN_OUTPUT), { recursive: true });
  await writeFile(process.env.PLINY_PLAN_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
