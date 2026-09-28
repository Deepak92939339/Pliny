/**
 * WP7 — .xls DEAD CODE (spec: PLINY FIX R1, WP7)
 *
 * The server's EXTENSION_TO_KIND mapped .xls to the xlsx handler while the
 * client already rejects .xls with "Legacy .xls files are not supported." and
 * docs/limitations.md says it is unsupported. This suite pins the aligned
 * behaviour: .xls is no longer a recognised kind, no processor accepts it, and
 * a direct server upload returns 415 with the client's message.
 */
import assert from "node:assert/strict";

const fileKinds = await import("../src/lib/document-processing/fileKinds.ts").catch((error) => ({ __importError: error }));
const registry = await import("../src/lib/document-processing/registry.ts").catch((error) => ({ __importError: error }));

const { getUnsupportedFileRejection, inferSupportedFileKind } = fileKinds;
const { getProcessorForFile } = registry;

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

await run(".xls is no longer a recognised file kind", () => {
  assert.equal(inferSupportedFileKind("report.xls"), "unknown", "EXTENSION_TO_KIND still maps .xls");
  assert.equal(inferSupportedFileKind("report.xlsx"), "xlsx", ".xlsx must keep working");
});

await run("no processor accepts .xls", () => {
  assert.equal(getProcessorForFile({ filename: "report.xls", mimeType: "application/vnd.ms-excel" }), null);
  assert.equal(getProcessorForFile({ filename: "report.xls", mimeType: "application/octet-stream" }), null);
});

await run("direct server upload of .xls returns 415 with the client's message", () => {
  assert.equal(typeof getUnsupportedFileRejection, "function", "getUnsupportedFileRejection does not exist yet");
  const rejection = getUnsupportedFileRejection("report.xls");
  assert.deepEqual(rejection, { status: 415, error: "Legacy .xls files are not supported." });
});

await run(".xlsm keeps its specific rejection and other kinds are unaffected", () => {
  assert.equal(typeof getUnsupportedFileRejection, "function", "getUnsupportedFileRejection does not exist yet");
  assert.deepEqual(getUnsupportedFileRejection("report.xlsm"), {
    status: 400,
    error: "Macro-enabled spreadsheets are not supported. Upload an .xlsx or CSV file instead.",
  });
  assert.equal(getUnsupportedFileRejection("report.xlsx"), null);
  assert.equal(getUnsupportedFileRejection("report.csv"), null);
  assert.equal(getUnsupportedFileRejection("notes.txt"), null);
});

const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP7 .xls dead-code tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
