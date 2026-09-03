import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { SafeInlineMarkdown } from "../src/components/workspace/SafeInlineMarkdown.ts";
import { buildRiskEvidenceReportSpec, formatRiskEvidenceReport, riskEvidenceReportSchema } from "../src/lib/export/riskEvidenceReport.ts";

const bundle = {
  markerToIndex: new Map([["[[s.1]]", 1], ["[[s.2]]", 2]]),
  sources: [
    { documentName: "vendor-policy.md", excerpt: "Renewals require thirty days notice.", index: 1 },
    { documentName: "q4-expenses.csv", excerpt: "Cloud,42000", index: 2 },
  ],
};
const answer = "Vendor renewals require thirty days written notice [[s.1]].\nCloud is the largest listed Q4 expense [[s.2]].\n<chart>{\"type\":\"bar\",\"title\":\"Q4 Expense\",\"xKey\":\"department\",\"series\":[{\"key\":\"expense\",\"label\":\"Expense\"}],\"data\":[{\"department\":\"Cloud\",\"expense\":42000}],\"sourceRefs\":[\"s.2\"]}</chart>";
const spec = buildRiskEvidenceReportSpec(answer, bundle, "Review cited evidence before relying on this report.");

assert.ok(spec);
assert.equal(riskEvidenceReportSchema.safeParse(spec).success, true);
assert.equal(spec.executiveSummary.every((claim) => claim.sourceRefs.length > 0), true);
assert.equal(spec.tables[0].rows[0].sourceRefs.includes(2), true);
assert.equal(spec.charts[0].seriesSourceRefs.expense.includes(2), true);
assert.equal(formatRiskEvidenceReport(spec).includes("Executive Summary"), true);

const markdownMarkup = renderToStaticMarkup(createElement(SafeInlineMarkdown, { text: "Exposure is **$4.27M** and status is `verified`." }));
const markdownDom = parseFragment(markdownMarkup);
function collectText(node) {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(collectText).join("");
}
function hasNode(node, nodeName) {
  return node.nodeName === nodeName || (node.childNodes ?? []).some((child) => hasNode(child, nodeName));
}
assert.equal(collectText(markdownDom), "Exposure is $4.27M and status is verified.", "the report DOM must not display Markdown markers");
assert.equal(hasNode(markdownDom, "strong"), true, "bold report text must render as a strong DOM node");
assert.equal(hasNode(markdownDom, "code"), true, "inline code must render as a code DOM node");
const reportPreviewSource = readFileSync("src/components/workspace/RiskEvidenceReportPreview.tsx", "utf8");
assert.equal(reportPreviewSource.includes("<SafeInlineMarkdown text={claim.text} />"), true, "risk report claims must use the existing safe inline pipeline");
assert.equal(reportPreviewSource.includes("dangerouslySetInnerHTML"), false, "risk reports must never use raw HTML injection");

console.log("Risk and evidence report tests passed.");
