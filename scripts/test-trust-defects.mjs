import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAuthErrorMessage, getSafeAuthErrorMetadata } from "../src/lib/auth/errors.ts";
import { PROCESSING_BOUNDARY_PARAGRAPHS, PROCESSING_BOUNDARY_TITLE } from "../src/lib/privacy/disclosure.ts";
import { expandKnownRoleTerms, getKnownRoleConcepts } from "../src/lib/search/queryEquivalents.ts";
import { createFailedUploadItem, createUploadQueue, MAX_UPLOAD_FILES, runSequentialUploadBatch } from "../src/lib/uploads/uploadBatch.ts";

const files = [
  { name: "alpha.txt", size: 10 },
  { name: "beta.txt", size: 20 },
  { name: "gamma.txt", size: 30 },
];
let nextId = 0;
const queue = createUploadQueue(files, () => `upload-${++nextId}`);
const operationOrder = [];
const transitions = new Map(files.map((file) => [file.name, ["queued"]]));
const rejectedItem = createFailedUploadItem({ name: "unsupported.exe", size: 4 }, "Unsupported file.", () => "upload-rejected");
transitions.set(rejectedItem.filename, ["failed"]);
const finalItems = await runSequentialUploadBatch([...queue, rejectedItem], {
  onChange: (items, changedItem) => {
    assert.equal(items.length, files.length + 1, "no selected file may disappear during the batch");
    transitions.get(changedItem.filename).push(changedItem.status);
  },
  process: async (documentId, file) => {
    operationOrder.push(`process:${file.name}`);
    if (file.name === "beta.txt") throw new Error("Synthetic processing failure.");
    return { pageCount: 1, status: "ready" };
  },
  upload: async (file) => {
    operationOrder.push(`upload:${file.name}`);
    return { documentId: `document-${file.name}` };
  },
});
assert.deepEqual(operationOrder, [
  "upload:alpha.txt",
  "process:alpha.txt",
  "upload:beta.txt",
  "process:beta.txt",
  "upload:gamma.txt",
  "process:gamma.txt",
], "the bounded batch must execute files sequentially");
assert.deepEqual(finalItems.map((item) => item.status), ["ready", "failed", "ready", "failed"], "partial success and rejected files must remain explicit per file");
assert.deepEqual(transitions.get("alpha.txt"), ["queued", "uploading", "processing", "ready"]);
assert.deepEqual(transitions.get("beta.txt"), ["queued", "uploading", "processing", "failed"]);
assert.throws(
  () => createUploadQueue(Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, index) => ({ name: `${index}.txt`, size: 1 }))),
  RangeError,
  "batches larger than five must fail explicitly"
);

assert.equal(getAuthErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, "login"), "Email or password is incorrect.");
assert.equal(getAuthErrorMessage({ message: "provider internal detail" }, "login"), "Unable to sign in right now. Please try again.");
const authMetadata = getSafeAuthErrorMetadata({ code: "invalid_credentials", message: "provider body", name: "AuthApiError", status: 400 });
assert.deepEqual(authMetadata, { code: "invalid_credentials", name: "authapierror", status: 400 });
assert.equal(JSON.stringify(authMetadata).includes("provider body"), false, "safe auth logs must omit provider messages and bodies");

assert.equal(PROCESSING_BOUNDARY_TITLE, "How your data is processed");
assert.equal(PROCESSING_BOUNDARY_PARAGRAPHS[1], "Privacy-minimised does not mean local-only processing.");
assert.equal(PROCESSING_BOUNDARY_PARAGRAPHS[0].includes("Provider zero-retention is not verified"), true);
const privacyContentSource = readFileSync("src/components/landing/infoContent.ts", "utf8");
assert.equal(privacyContentSource.includes("paragraphs: PROCESSING_BOUNDARY_PARAGRAPHS"), true, "the Data Privacy detail page must reuse the exact disclosure copy");
const workspaceHeaderSource = readFileSync("src/components/workspace/WorkspaceHeader.tsx", "utf8");
assert.equal(workspaceHeaderSource.includes("Processing boundary"), true, "the workspace toolbar must expose the processing boundary control");
assert.equal(workspaceHeaderSource.includes("PROCESSING_BOUNDARY_PARAGRAPHS[0]"), true, "the toolbar must reuse the exact disclosure copy");

assert.equal(expandKnownRoleTerms("Who is the CTO?").includes("chief technology officer"), true);
assert.deepEqual(getKnownRoleConcepts("Who serves as Chief Technology Officer?"), ["chief_technology_officer"]);
assert.deepEqual(getKnownRoleConcepts("What happened in October?"), [], "unrelated embedded letters must remain a negative control");

const uploadSource = readFileSync("src/components/workspace/DocumentUploadDropzone.tsx", "utf8");
assert.equal(uploadSource.includes("maxFiles: MAX_UPLOAD_FILES"), true);
assert.equal(uploadSource.includes("multiple: true"), true);
assert.equal(uploadSource.includes("files[0]"), false, "the UI must not silently select only the first file");

console.log("Phase 5A trust-defect regression tests passed.");
