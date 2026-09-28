/**
 * WP3 — RATE LIMITS THAT DON'T LOCK PEOPLE OUT (spec: PLINY FIX R1, WP3 step 5)
 *
 * (a) Blocked usage events must NOT count toward the minute/daily limits —
 *     5 allowed + 10 blocked in the last minute counts 5, not 15.
 * (b) The daily snapshot ignores blocked events.
 * (c) Retry-After computation for each limiter type (pure, injectable clock):
 *     minute window (oldest allowed event + window), daily (UTC midnight
 *     boundary), Upstash/fixed-window reset timestamps, plus the human
 *     wait-message formatting shared by the Ask surface and the upload UI.
 */
import assert from "node:assert/strict";

const budgetGuard = await import("../src/lib/ai/budgetGuard.ts").catch((error) => ({ __importError: error }));
const retryAfterModule = await import("../src/lib/limits/retryAfter.ts").catch((error) => ({ __importError: error }));

const summarizeUsageEvents = budgetGuard.summarizeUsageEvents;
const {
  computeDailyRetryAfterSeconds,
  computeMinuteRetryAfterSeconds,
  computeResetRetryAfterSeconds,
  formatRetryWaitMessage,
} = retryAfterModule;

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const MINUTE_MS = 60_000;

function makeEvent({ ageMs, status, model = "openai/gpt-6-luna", cost = 0.002 }) {
  const now = Date.now();
  return {
    created_at: new Date(now - ageMs).toISOString(),
    estimated_cost_usd: cost,
    model,
    status,
  };
}

await run("minute window counts only allowed events (5 allowed + 10 blocked = 5)", () => {
  assert.equal(typeof summarizeUsageEvents, "function", "summarizeUsageEvents is not exported yet (blocked events still counted)");
  const events = [
    ...Array.from({ length: 5 }, (_, i) => makeEvent({ ageMs: (i + 1) * 3_000, status: "success" })),
    ...Array.from({ length: 10 }, (_, i) => makeEvent({ ageMs: (i + 1) * 4_000, status: "blocked", cost: 0 })),
  ];
  const snapshot = summarizeUsageEvents(events, new Date());
  assert.equal(snapshot.minuteRequestCount, 5, `expected 5, got ${snapshot.minuteRequestCount}`);
  assert.equal(snapshot.dailyRequestCount, 5, `expected 5, got ${snapshot.dailyRequestCount}`);
});

await run("daily snapshot ignores blocked events entirely", () => {
  assert.equal(typeof summarizeUsageEvents, "function", "summarizeUsageEvents is not exported yet");
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const events = [
    ...Array.from({ length: 12 }, (_, i) => ({
      created_at: hoursAgo(2 + (i % 3)),
      estimated_cost_usd: 0.004,
      model: "openai/gpt-6-luna",
      status: i % 4 === 0 ? "blocked" : i % 4 === 1 ? "failed" : "success",
    })),
  ];
  // 9 counted (success + failed = 12 minus every 4th), 3 blocked — all today (2-4h ago)
  const snapshot = summarizeUsageEvents(events, now);
  assert.equal(snapshot.dailyRequestCount, 9, `expected 9 counted, got ${snapshot.dailyRequestCount}`);
  // spend still counts only non-blocked events (unchanged behaviour)
  assert.equal(snapshot.dailySpendUsd, 9 * 0.004);
});

await run("blocked events in the previous window do not extend the current block", () => {
  assert.equal(typeof summarizeUsageEvents, "function", "summarizeUsageEvents is not exported yet");
  // 61s ago: 5 blocked retries during an expired block; 10s ago: 2 allowed.
  const events = [
    ...Array.from({ length: 5 }, () => makeEvent({ ageMs: 61_000, status: "blocked", cost: 0 })),
    makeEvent({ ageMs: 10_000, status: "success" }),
    makeEvent({ ageMs: 20_000, status: "success" }),
  ];
  const snapshot = summarizeUsageEvents(events, new Date());
  assert.equal(snapshot.minuteRequestCount, 2, `expected 2, got ${snapshot.minuteRequestCount}`);
});

await run("real persisted statuses count: 'success' and 'failed' rows hit the limits (hotfix regression guard)", () => {
  // ai_usage_events.status is constrained to 'success' | 'failed' | 'blocked'.
  const events = [
    ...Array.from({ length: 6 }, (_, i) => makeEvent({ ageMs: (i + 1) * 2_000, status: "success" })),
    makeEvent({ ageMs: 15_000, status: "failed" }),
    ...Array.from({ length: 4 }, (_, i) => makeEvent({ ageMs: (i + 1) * 5_000, status: "blocked", cost: 0 })),
  ];
  const snapshot = summarizeUsageEvents(events, new Date());
  assert.equal(snapshot.minuteRequestCount, 7, `expected 7 (6 success + 1 failed), got ${snapshot.minuteRequestCount}`);
  assert.equal(snapshot.dailyRequestCount, 7);
  assert.ok(snapshot.dailySpendUsd > 0, "spend must accumulate from real 'success' rows");
});

await run("computeMinuteRetryAfterSeconds derives wait from the oldest allowed event", () => {
  assert.equal(typeof computeMinuteRetryAfterSeconds, "function", "computeMinuteRetryAfterSeconds is not implemented yet");
  const now = 1_000_000_000_000;
  // oldest allowed event 20s into a 60s window -> 40s remaining
  assert.equal(computeMinuteRetryAfterSeconds(now - 20_000, now, MINUTE_MS), 40);
  // 59.4s in -> clamps to at least 1s
  assert.equal(computeMinuteRetryAfterSeconds(now - 59_400, now, MINUTE_MS), 1);
  // no known event -> full window
  assert.equal(computeMinuteRetryAfterSeconds(null, now, MINUTE_MS), 60);
});

await run("computeDailyRetryAfterSeconds returns seconds until the UTC day boundary", () => {
  assert.equal(typeof computeDailyRetryAfterSeconds, "function", "computeDailyRetryAfterSeconds is not implemented yet");
  const noonUtc = Date.parse("2026-03-15T12:00:00.000Z");
  assert.equal(computeDailyRetryAfterSeconds(noonUtc), 12 * 3_600);
  const oneSecondBeforeMidnight = Date.parse("2026-03-15T23:59:59.000Z");
  assert.equal(computeDailyRetryAfterSeconds(oneSecondBeforeMidnight), 1);
});

await run("computeResetRetryAfterSeconds uses the limiter reset timestamp", () => {
  assert.equal(typeof computeResetRetryAfterSeconds, "function", "computeResetRetryAfterSeconds is not implemented yet");
  const now = 5_000_000_000_000;
  assert.equal(computeResetRetryAfterSeconds(now + 90_000, now), 90);
  assert.equal(computeResetRetryAfterSeconds(now + 500, now), 1);
});

await run("formatRetryWaitMessage speaks plain English", () => {
  assert.equal(typeof formatRetryWaitMessage, "function", "formatRetryWaitMessage is not implemented yet");
  assert.equal(formatRetryWaitMessage(42), "Try again in 42 seconds.");
  assert.equal(formatRetryWaitMessage(1), "Try again in 1 second.");
  assert.equal(formatRetryWaitMessage(90), "Try again in 2 minutes.");
  assert.equal(formatRetryWaitMessage(1080), "Try again in 18 minutes.");
  assert.equal(formatRetryWaitMessage(3600), "Try again after midnight UTC.");
});

await run("formatRetryWaitMessage: upload/process limit message matches the existing contract", () => {
  assert.equal(typeof formatRetryWaitMessage, "function", "formatRetryWaitMessage is not implemented yet");
  assert.equal(`Upload limit reached. ${formatRetryWaitMessage(90)}`, "Upload limit reached. Try again in 2 minutes.");
  assert.equal(`Upload limit reached. ${formatRetryWaitMessage(45)}`, "Upload limit reached. Try again in 45 seconds.");
});

const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP3 rate-limit retry tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
