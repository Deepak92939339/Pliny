import type { createClient } from "@/lib/supabase/server";
import {
  computeDailyRetryAfterSeconds,
  computeMinuteRetryAfterSeconds,
  computeResetRetryAfterSeconds,
} from "@/lib/limits/retryAfter";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_INPUT_TOKENS = 6_000;
export const INR_PER_USD_ESTIMATE = 85;

type MinuteBucket = {
  count: number;
  resetAt: number;
};

type DailyBucket = {
  count: number;
  dayKey: string;
  estimatedSpendInr: number;
};

export type AiConfig = {
  dailyBudgetInr: number;
  enabled: boolean;
  maxCharsPerChunk: number;
  maxChunks: number;
  maxContextCharacters: number;
  maxOutputTokens: number;
  maxRequestsPerDay: number;
  maxRequestsPerMinute: number;
};

export type AiBudgetDecision = {
  estimatedCostUsd: number;
  inputTokens: number;
  maxOutputTokens: number;
  message?: string;
  outputTokens: number;
  reason: string;
  retryAfterSeconds?: number;
  status: "allowed" | "blocked";
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AiUsageEventForBudget = {
  created_at: string;
  estimated_cost_usd: number | string | null;
  model: string | null;
  status: string | null;
};

type BudgetEstimate = Pick<AiBudgetDecision, "estimatedCostUsd" | "inputTokens" | "maxOutputTokens" | "outputTokens">;

const minuteBuckets = new Map<string, MinuteBucket>();
const dailyBuckets = new Map<string, DailyBucket>();

function getNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function getDayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function getDailyBucket(userId: string, now: Date) {
  const dayKey = getDayKey(now);
  const bucket = dailyBuckets.get(userId);

  if (!bucket || bucket.dayKey !== dayKey) {
    const nextBucket = {
      count: 0,
      dayKey,
      estimatedSpendInr: 0,
    };
    dailyBuckets.set(userId, nextBucket);
    return nextBucket;
  }

  return bucket;
}

function getStartOfUtcDay(now: Date) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return startOfDay;
}

function estimateTokenCount(characters: number) {
  return Math.ceil(characters / 4);
}

function getModelRates(model: string) {
  const configuredRates = process.env.AI_MODEL_PRICING_JSON;
  if (configuredRates) {
    let pricing: unknown;
    try {
      pricing = JSON.parse(configuredRates);
    } catch {
      throw new Error("AI_MODEL_PRICING_JSON must be valid JSON.");
    }
    if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
      throw new Error("AI_MODEL_PRICING_JSON must map model IDs to token rates.");
    }
    const entry = Object.hasOwn(pricing, model) ? (pricing as Record<string, unknown>)[model] : undefined;
    if (entry !== undefined) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("AI_MODEL_PRICING_JSON contains invalid token rates.");
      }
      const { inputUsdPerMillion, outputUsdPerMillion } = entry as Record<string, unknown>;
      if (
        typeof inputUsdPerMillion !== "number" || !Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion < 0 ||
        typeof outputUsdPerMillion !== "number" || !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion < 0
      ) {
        throw new Error("AI_MODEL_PRICING_JSON contains invalid token rates.");
      }
      return { inputUsdPerMillion, outputUsdPerMillion };
    }
  }

  if (model === "openai/gpt-6-luna") {
    return { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 };
  }

  if (model.toLowerCase().includes("sonnet")) {
    return {
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
    };
  }

  return {
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
  };
}

export function getAiConfig(): AiConfig {
  return {
    dailyBudgetInr: getNumberEnv("AI_DAILY_BUDGET_INR", 50, 1, 100_000),
    enabled: process.env.AI_ENABLED === "true",
    maxCharsPerChunk: getNumberEnv("AI_MAX_CHARS_PER_CHUNK", 3_000, 200, 3_000),
    maxChunks: getNumberEnv("AI_MAX_CHUNKS", 5, 1, 10),
    maxContextCharacters: getNumberEnv("AI_MAX_CONTEXT_CHARS", 12_000, 1_000, 20_000),
    maxOutputTokens: getNumberEnv("AI_MAX_OUTPUT_TOKENS", 700, 100, 1_500),
    maxRequestsPerDay: getNumberEnv("AI_MAX_REQUESTS_PER_DAY", 30, 1, 1_000),
    maxRequestsPerMinute: getNumberEnv("AI_MAX_REQUESTS_PER_MINUTE", 5, 1, 60),
  };
}

export function estimateRequestCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const rates = getModelRates(model);

  return (inputTokens * rates.inputUsdPerMillion + outputTokens * rates.outputUsdPerMillion) / 1_000_000;
}

function getBaseDecision({
  config,
  inputCharacters,
  model,
}: {
  config: AiConfig;
  inputCharacters: number;
  model: string;
}): AiBudgetDecision | BudgetEstimate {
  const maxOutputTokens = config.maxOutputTokens;
  const inputTokens = estimateTokenCount(inputCharacters);
  const estimatedCostUsd = estimateRequestCostUsd(model, inputTokens, maxOutputTokens);
  const outputTokens = maxOutputTokens;

  if (!config.enabled) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "AI is disabled for this environment.",
      outputTokens,
      reason: "ai_disabled",
      status: "blocked",
    };
  }

  if (inputTokens > MAX_INPUT_TOKENS) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "This question is too large for the current cost limit.",
      outputTokens,
      reason: "prompt_too_large",
      status: "blocked",
    };
  }

  return {
    estimatedCostUsd,
    inputTokens,
    maxOutputTokens,
    outputTokens,
  };
}

function checkLocalDevBudgetFallback({
  config,
  estimatedCostUsd,
  inputTokens,
  maxOutputTokens,
  outputTokens,
  userId,
}: {
  config: AiConfig;
  estimatedCostUsd: number;
  inputTokens: number;
  maxOutputTokens: number;
  outputTokens: number;
  userId: string;
}): AiBudgetDecision {
  const now = Date.now();
  const minuteBucket = minuteBuckets.get(userId);

  if (minuteBucket && minuteBucket.resetAt > now && minuteBucket.count >= config.maxRequestsPerMinute) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "You have reached the local test request limit.",
      outputTokens,
      reason: "minute_rate_limit",
      retryAfterSeconds: computeResetRetryAfterSeconds(minuteBucket.resetAt, now),
      status: "blocked",
    };
  }

  const dailyBucket = getDailyBucket(userId, new Date(now));

  if (dailyBucket.count >= config.maxRequestsPerDay) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "You have reached the local test request limit.",
      outputTokens,
      reason: "daily_request_limit",
      retryAfterSeconds: computeDailyRetryAfterSeconds(now),
      status: "blocked",
    };
  }

  const estimatedCostInr = estimatedCostUsd * INR_PER_USD_ESTIMATE;

  if (dailyBucket.estimatedSpendInr + estimatedCostInr > config.dailyBudgetInr) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "This question is too large for the current cost limit.",
      outputTokens,
      reason: "daily_budget_limit",
      retryAfterSeconds: computeDailyRetryAfterSeconds(now),
      status: "blocked",
    };
  }

  if (!minuteBucket || minuteBucket.resetAt <= now) {
    minuteBuckets.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
  } else {
    minuteBucket.count += 1;
  }

  dailyBucket.count += 1;
  dailyBucket.estimatedSpendInr += estimatedCostInr;

  return {
    estimatedCostUsd,
    inputTokens,
    maxOutputTokens,
    outputTokens,
    reason: "allowed",
    status: "allowed",
  };
}

export function summarizeUsageEvents(events: AiUsageEventForBudget[], now: Date) {
  const startOfDay = getStartOfUtcDay(now).getTime();
  const minuteStart = now.getTime() - RATE_LIMIT_WINDOW_MS;
  let dailyRequestCount = 0;
  let minuteRequestCount = 0;
  let dailySpendUsd = 0;
  let oldestAllowedMinuteEventAt: number | null = null;

  for (const event of events) {
    if (event.model === "document_inventory") {
      continue;
    }

    const createdAt = new Date(event.created_at).getTime();

    if (!Number.isFinite(createdAt) || createdAt < startOfDay) {
      continue;
    }

    // WP3 (audit-r1, PLN-005): only ALLOWED events count toward the minute and
    // daily request limits. Blocked events stay persisted below for audit
    // history, but they must never extend a user's lockout.
    if (event.status !== "allowed") {
      continue;
    }

    dailyRequestCount += 1;

    if (createdAt >= minuteStart) {
      minuteRequestCount += 1;

      if (oldestAllowedMinuteEventAt === null || createdAt < oldestAllowedMinuteEventAt) {
        oldestAllowedMinuteEventAt = createdAt;
      }
    }

    // Spend counts allowed events only (unchanged semantics: everything that
    // reaches this line has status === "allowed").
    const estimatedCostUsd = Number(event.estimated_cost_usd);

    if (Number.isFinite(estimatedCostUsd)) {
      dailySpendUsd += estimatedCostUsd;
    }
  }

  return {
    dailyRequestCount,
    dailySpendUsd,
    minuteRequestCount,
    oldestAllowedMinuteEventAt,
  };
}

async function getPersistentUsageSnapshot(supabase: SupabaseServerClient, userId: string, now: Date) {
  const { data, error } = await supabase
    .from("ai_usage_events")
    .select("created_at,estimated_cost_usd,model,status")
    .eq("user_id", userId)
    .gte("created_at", getStartOfUtcDay(now).toISOString());

  if (error) {
    throw error;
  }

  return summarizeUsageEvents((data ?? []) as AiUsageEventForBudget[], now);
}

export async function checkAiBudget({
  config,
  inputCharacters,
  model,
  supabase,
  userId,
}: {
  config: AiConfig;
  inputCharacters: number;
  model: string;
  supabase?: SupabaseServerClient;
  userId: string;
}): Promise<AiBudgetDecision> {
  const baseDecision = getBaseDecision({
    config,
    inputCharacters,
    model,
  });

  if ("status" in baseDecision) {
    return baseDecision;
  }

  const { estimatedCostUsd, inputTokens, maxOutputTokens, outputTokens } = baseDecision;
  let usageSnapshot: Awaited<ReturnType<typeof getPersistentUsageSnapshot>>;

  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      return {
        estimatedCostUsd,
        inputTokens,
        maxOutputTokens,
        message: "Unable to verify the AI budget right now.",
        outputTokens,
        reason: "budget_store_unavailable",
        status: "blocked",
      };
    }

    return checkLocalDevBudgetFallback({
      config,
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      outputTokens,
      userId,
    });
  }

  try {
    usageSnapshot = await getPersistentUsageSnapshot(supabase, userId, new Date());
  } catch (error) {
    console.error("[ai-budget] persistent usage lookup failed", {
      error: error instanceof Error ? { message: error.message, name: error.name } : String(error),
      userId,
    });

    if (process.env.NODE_ENV === "production") {
      return {
        estimatedCostUsd,
        inputTokens,
        maxOutputTokens,
        message: "Unable to verify the AI budget right now.",
        outputTokens,
        reason: "budget_lookup_failed",
        status: "blocked",
      };
    }

    return checkLocalDevBudgetFallback({
      config,
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      outputTokens,
      userId,
    });
  }

  if (usageSnapshot.minuteRequestCount >= config.maxRequestsPerMinute) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "You have reached the local test request limit.",
      outputTokens,
      reason: "minute_rate_limit",
      retryAfterSeconds: computeMinuteRetryAfterSeconds(usageSnapshot.oldestAllowedMinuteEventAt, Date.now(), RATE_LIMIT_WINDOW_MS),
      status: "blocked",
    };
  }

  if (usageSnapshot.dailyRequestCount >= config.maxRequestsPerDay) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "You have reached the local test request limit.",
      outputTokens,
      reason: "daily_request_limit",
      retryAfterSeconds: computeDailyRetryAfterSeconds(Date.now()),
      status: "blocked",
    };
  }

  const projectedSpendInr = (usageSnapshot.dailySpendUsd + estimatedCostUsd) * INR_PER_USD_ESTIMATE;

  if (projectedSpendInr > config.dailyBudgetInr) {
    return {
      estimatedCostUsd,
      inputTokens,
      maxOutputTokens,
      message: "This question is too large for the current cost limit.",
      outputTokens,
      reason: "daily_budget_limit",
      retryAfterSeconds: computeDailyRetryAfterSeconds(Date.now()),
      status: "blocked",
    };
  }

  return {
    estimatedCostUsd,
    inputTokens,
    maxOutputTokens,
    outputTokens,
    reason: "allowed",
    status: "allowed",
  };
}
