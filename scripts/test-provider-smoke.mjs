import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import nextEnv from "@next/env";
import { embedText } from "@/lib/embeddings/embedText";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const syntheticText = "SYNTHETIC_STAGING_PROBE: Cedar has 11 analysts. This text contains no user or customer data.";
let providerRequestsStarted = 0;

function describeProviderFailure(error) {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
  if (status === 401 || status === 403) return "authentication failure";
  if (status === 429) return "rate limit";
  if (status !== null) return `HTTP ${status}`;
  return error instanceof Error ? error.name : "unknown failure";
}

assert.ok(process.env.VOYAGE_API_KEY, "VOYAGE_API_KEY is required for the live provider smoke test.");
assert.ok(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is required for the live provider smoke test.");

process.env.EMBEDDINGS_ENABLED = "true";

try {
  providerRequestsStarted += 1;
  const embedding = await embedText(syntheticText, { inputType: "document", maxAttempts: 1 });
  assert.equal(embedding.dimensions, 1024, "Voyage must return the configured 1024-dimensional contract.");
  assert.equal(embedding.embedding.length, 1024, "Voyage embedding length must match the configured contract.");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  providerRequestsStarted += 1;
  const response = await client.messages.create({
    max_tokens: 24,
    messages: [
      {
        content: "Reply with exactly SYNTHETIC_STAGING_OK and no other text.",
        role: "user",
      },
    ],
    model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5",
  });
  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  assert.equal(answer, "SYNTHETIC_STAGING_OK", "Anthropic response did not satisfy the minimal text contract.");
  console.log("Live provider smoke passed: 2 synthetic provider requests; no database writes.");
} catch (error) {
  console.error(`Live provider smoke failed after ${providerRequestsStarted} request(s): ${describeProviderFailure(error)}; no retries were attempted.`);
  process.exitCode = 1;
}
