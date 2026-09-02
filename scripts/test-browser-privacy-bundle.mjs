import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
assert.equal(existsSync(root), true, "Run the production build before the browser privacy-bundle check.");
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
const bundle = listFiles(root)
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const forbidden of ["PRIVACY_PSEUDONYM_KEY", "phase-4b-provider-free-test-secret", "scopeSecret", "originalValue"]) {
  assert.equal(bundle.includes(forbidden), false, `browser bundles must not contain ${forbidden}`);
}
console.log("Browser privacy-bundle test passed.");
