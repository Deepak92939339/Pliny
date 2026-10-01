import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { summarizeAudits } from "./ui-audit-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "artifacts/ui-unification");
mkdirSync(dir, { recursive: true });
const expected = ["landing", "login", "signup", "about", "privacy", "security", "file-support", "does-not-exist", "preview-workspace", "preview-dashboard", "preview-refusal", "preview-inspector", "preview-chart"];
let evidence = { pages: {}, timestamp: "not collected" };
try { evidence = JSON.parse(readFileSync(resolve(dir, "audit-results.json"), "utf8")); } catch { /* Missing evidence cannot pass. */ }
const summary = summarizeAudits(evidence.pages, expected);
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const paths = ["auth/AuthView", "dashboard/DashboardView", "workspace/WorkspaceView", "workspace/DocumentsSurface", "workspace/AskSurface"].map((p) => "src/components/" + p + ".module.css");
let before = 0, after = 0;
for (const file of paths) {
  before += execFileSync("git", ["show", "da124a4:" + file], { cwd: root, encoding: "utf8" }).trimEnd().split("\n").length;
  after += readFileSync(resolve(root, file), "utf8").trimEnd().split("\n").length;
}
const reduction = (100 * (before - after) / before).toFixed(2);
const rows = Object.entries(summary).filter(([key]) => key.endsWith("Pass")).map(([key, pass]) => `<tr><td>${escape(key)}</td><td>${summary.complete ? pass ? "PASS" : "FAIL" : "INCOMPLETE"}</td></tr>`).join("");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pliny — evidence review</title>
<style>body{font:16px/1.6 system-ui;background:#f7f5f0;color:#241e18;margin:0}main{max-width:900px;margin:auto;padding:32px}h1,h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #cfc5b8;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<main><h1>Pliny UI — evidence, not promises</h1><p>Commit: ${escape(sha)}. Browser collection: ${escape(evidence.timestamp)}.</p>
<p>DOM coverage: <strong>${summary.completedAudits}/${summary.expectedAudits}</strong>. Verdict: <strong>${summary.pass ? "PASS" : summary.complete ? "FAIL" : "INCOMPLETE"}</strong>.</p>
<table><tr><th>Measured requirement</th><th>Result</th></tr>${rows}</table>
<h2>Limitations</h2><ul><li>CSS: ${before} → ${after} lines; ${reduction}% reduction. The ≥40% goal is ${Number(reduction) >= 40 ? "met" : "NOT met"}.</li>
<li>Complete axe scan: PENDING unless separately recorded. This DOM collector does not establish complete accessibility.</li>
<li>60fps/performance traces: NOT measured. Transform/opacity code alone does not prove a frame rate.</li>
<li>Hosted authenticated retrieval, OCR and provider acceptance: PENDING; local fixtures are not backend tests.</li>
<li>Historical Gemini screenshots are references, not independently accepted breakpoint evidence.</li></ul>
<h2>Details</h2><pre>${escape(JSON.stringify(summary, null, 2))}</pre></main></html>`;
writeFileSync(resolve(dir, "UI_ROUND_REPORT.html"), html);
console.log(`Report: ${summary.completedAudits}/${summary.expectedAudits}; ${summary.pass ? "PASS" : "NOT APPROVED"}; CSS reduction ${reduction}%.`);
