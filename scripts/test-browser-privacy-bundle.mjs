import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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
for (const forbidden of [
  "PRIVACY_PSEUDONYM_KEY",
  "phase-4b-provider-free-test-secret",
  "scopeSecret",
  "originalValue",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "ANSWER_PROVIDER",
]) {
  assert.equal(bundle.includes(forbidden), false, `browser bundles must not contain ${forbidden}`);
}
const openRouterCredential = process.env.OPENROUTER_API_KEY;
assert.ok(openRouterCredential, "The server-side OpenRouter credential must be configured for this bundle check.");
assert.equal(bundle.includes(openRouterCredential), false, "browser bundles must not contain the OpenRouter credential");
console.log("Browser privacy-bundle test passed.");
