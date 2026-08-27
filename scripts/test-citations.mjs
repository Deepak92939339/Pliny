import assert from "node:assert/strict";
import { validateCitations } from "../src/lib/citations/validateCitations.ts";

const sources = [{ pageNumber: 2 }, { pageNumber: 7 }];

const valid = validateCitations("The renewal term is twelve months [[s.1]].", sources);
assert.deepEqual(valid.validMarkers, ["[[s.1]]"]);
assert.deepEqual(valid.invalidMarkers, []);
assert.equal(valid.missingCitation, false);
assert.equal(valid.rejectedAnswer, false);

const invalid = validateCitations("The answer is supported [[s.3]].", sources);
assert.deepEqual(invalid.invalidMarkers, ["[[s.3]]"]);
assert.equal(invalid.rejectedAnswer, true);

const invalidZero = validateCitations("The answer is supported [[s.0]].", sources);
assert.deepEqual(invalidZero.invalidMarkers, ["[[s.0]]"]);
assert.equal(invalidZero.allMarkers.includes("[[s.0]]"), true);

const missing = validateCitations("The renewal term is twelve months.", sources);
assert.deepEqual(missing.validMarkers, []);
assert.equal(missing.missingCitation, true);
assert.equal(missing.rejectedAnswer, true);

const pageMarker = validateCitations("See page two [[p.2]].", sources);
assert.deepEqual(pageMarker.validMarkers, ["[[p.2]]"]);
assert.equal(pageMarker.rejectedAnswer, false);

const chart = {
  data: [{ department: "Cloud", expense: 42000 }],
  series: [{ key: "expense", label: "Expense" }],
  title: "Q4 Expense",
  type: "bar",
  xKey: "department",
};

const chartWithoutRefs = validateCitations(`<chart>${JSON.stringify(chart)}</chart>`, sources);
assert.deepEqual(chartWithoutRefs.missingChartSourceRefs, [1]);
assert.equal(chartWithoutRefs.rejectedChart, true);
assert.equal(chartWithoutRefs.rejectedAnswer, true);

const chartWithInvalidRefs = validateCitations(`<chart>${JSON.stringify({ ...chart, sourceRefs: ["s.99"] })}</chart>`, sources);
assert.deepEqual(chartWithInvalidRefs.invalidChartSourceRefs, ["s.99"]);
assert.equal(chartWithInvalidRefs.rejectedChart, true);

const mixedGroundedTextAndUnsupportedChart = validateCitations(
  `Cloud is the largest expense [[s.1]].<chart>${JSON.stringify(chart)}</chart>`,
  sources
);
assert.deepEqual(mixedGroundedTextAndUnsupportedChart.validMarkers, ["[[s.1]]"]);
assert.equal(mixedGroundedTextAndUnsupportedChart.rejectedChart, true);
assert.equal(mixedGroundedTextAndUnsupportedChart.rejectedAnswer, true);

const validGroundedChart = validateCitations(`<chart>${JSON.stringify({ ...chart, sourceRefs: ["s.2"] })}</chart>`, sources);
assert.equal(validGroundedChart.chartCount, 1);
assert.equal(validGroundedChart.rejectedChart, false);
assert.equal(validGroundedChart.rejectedAnswer, false);

console.log("Citation validation tests passed.");
