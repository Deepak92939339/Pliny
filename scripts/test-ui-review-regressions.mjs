import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { auditDOMInBrowser } from "./audit-dom-design.mjs";
import { getEvaluationValue, summarizeAudits } from "./ui-audit-contract.mjs";
import { isSafeArtifactPath } from "./package-ui-deliverable.mjs";

const empty = () => ({ radii: [], fontSizes: [], blueUsages: [], flaggedTouchTargets: [], flaggedDesktopControls: [], conversationColumnWidth: null, overflow: false });
assert.throws(() => getEvaluationValue({ exceptionDetails: {} }, "failed/mobile"), /failed browser audit/);
assert.throws(() => getEvaluationValue({ result: {} }, "missing/mobile"), /Missing/);
assert.equal(summarizeAudits({ landing: {} }, ["landing"]).pass, false);
assert.equal(summarizeAudits({ landing: { mobile: empty(), desktop: empty() } }, ["landing"]).pass, true);
const desktop = empty(); desktop.flaggedDesktopControls = [{ height: 24, text: "small" }];
assert.equal(summarizeAudits({ landing: { mobile: empty(), desktop } }, ["landing"]).desktopControlsPass, false);
const mobile = empty(); mobile.flaggedTouchTargets = [{ height: 40, width: 40 }];
assert.equal(summarizeAudits({ landing: { mobile, desktop: empty() } }, ["landing"]).touchTargetsPass, false);

function measure(width, height, citation = false) {
  const element = { tagName: "BUTTON", className: "", textContent: "Test", childNodes: [], parentElement: null,
    matches: () => true, closest: () => null, hasAttribute: () => citation,
    getBoundingClientRect: () => ({ width, height }), getAttribute: () => null };
  return runInNewContext(`(${auditDOMInBrowser.toString()})("mobile")`, {
    document: { styleSheets: [], querySelectorAll: () => [element], documentElement: { scrollWidth: 390 } },
    window: { innerWidth: 390, getComputedStyle: () => ({ display: "block", borderTopLeftRadius: "0", fontSize: "14px" }) },
    Node: { TEXT_NODE: 3 },
  });
}
assert.equal(measure(44, 44).flaggedTouchTargets.length, 0);
assert.equal(measure(44, 40).flaggedTouchTargets.length, 1);
assert.equal(measure(40, 44).flaggedTouchTargets.length, 1);
assert.equal(measure(20, 20, true).flaggedTouchTargets.length, 0);
for (const unsafe of ["pliny/.env.local", "pliny/.vercel/project.json", "supabase/.temp/project-ref", "node_modules/a.js", "credentials.json", "storageState.json", "PROJECT_STATE.md"]) assert.equal(isSafeArtifactPath(unsafe), false);
assert.equal(isSafeArtifactPath("src/components/ui/Button.tsx"), true);

function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) scan(path);
    else if (item.name.endsWith(".tsx")) assert.doesNotMatch(readFileSync(path, "utf8"), /text-\[var\(--text-/, `Ambiguous font-size utility in ${path}`);
  }
}
scan(resolve(import.meta.dirname, "../src"));
assert.match(readFileSync("src/app/global-error.tsx", "utf8"), /import "\.\/globals\.css"/);
for (const script of ["check-a11y.mjs", "check-csp.mjs"]) assert.match(readFileSync(`scripts/${script}`, "utf8"), /process\.exit\(2\)/);
console.log("UI review regressions passed: failed/missing audits, dimensions, typography, safe packaging and standalone error CSS.");
