import assert from "node:assert/strict";
import { estimateRequestCostUsd, getAiConfig, INR_PER_USD_ESTIMATE } from "../src/lib/ai/budgetGuard.ts";

delete process.env.AI_MODEL_PRICING_JSON;
assert.equal(estimateRequestCostUsd("openai/gpt-6-luna", 1_000_000, 1_000_000), 0.6);
// WP9 (audit-r1): unknown models fail safe at the most expensive known rate (3/15).
assert.equal(estimateRequestCostUsd("unknown/model", 1_000_000, 1_000_000), 18);

process.env.AI_MODEL_PRICING_JSON = JSON.stringify({
  "openai/gpt-6-luna": { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 },
});
process.env.AI_DAILY_BUDGET_INR = "100";
process.env.AI_MAX_REQUESTS_PER_DAY = "600";
assert.equal(estimateRequestCostUsd("openai/gpt-6-luna", 1_000_000, 1_000_000), 0.6);
assert.equal(getAiConfig().dailyBudgetInr, 100);
assert.equal(getAiConfig().maxRequestsPerDay, 600);
assert.equal(INR_PER_USD_ESTIMATE, 85);

// WP9 (audit-r1): invalid pricing config no longer THROWS (it used to break every
// chat request) — it safe-logs and falls back to the most expensive known rate.
process.env.AI_MODEL_PRICING_JSON = "not-json";
assert.equal(estimateRequestCostUsd("openai/gpt-6-luna", 1_000_000, 1_000_000), 18);
process.env.AI_MODEL_PRICING_JSON = JSON.stringify({ "openai/gpt-6-luna": { inputUsdPerMillion: -1, outputUsdPerMillion: 0.5 } });
assert.equal(estimateRequestCostUsd("openai/gpt-6-luna", 1_000_000, 1_000_000), 18);
process.env.AI_MODEL_PRICING_JSON = JSON.stringify(["not", "an", "object"]);
assert.equal(estimateRequestCostUsd("openai/gpt-6-luna", 1_000_000, 1_000_000), 18);
delete process.env.AI_MODEL_PRICING_JSON;
assert.equal(estimateRequestCostUsd("unknown-model-x", 1_000_000, 1_000_000), 18);

console.log("AI budget pricing and limit tests passed.");
