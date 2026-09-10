import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(resolve(import.meta.dirname, "../.github/workflows/preview-quality-gate.yml"), "utf8");
const configuredNodeMajor = Number(workflow.match(/node-version:\s*["']?(\d+)/)?.[1]);

assert.equal(
  Number.isInteger(configuredNodeMajor) && configuredNodeMajor >= 22,
  true,
  "the CI runtime must support the --experimental-strip-types flag used by committed test commands",
);
assert.equal(/\b(?:OPENROUTER_API_KEY|VOYAGE_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN)\b/.test(workflow), false);

console.log("CI workflow runtime and provider-free boundary tests passed.");
