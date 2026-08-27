import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitWindow = "1 m" | "1 h" | "1 d";

type LocalBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  identifier: string;
  limit: number;
  prefix: string;
  window: RateLimitWindow;
};

export type RateLimitDecision = {
  limit: number;
  remaining: number;
  resetAt: number;
  reason: "allowed" | "local_dev_fallback" | "missing_redis_config" | "rate_limited" | "redis_error";
  status: "allowed" | "blocked";
};

const localBuckets = new Map<string, LocalBucket>();
const redisLimiters = new Map<string, Ratelimit>();

function hasRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getWindowMs(window: RateLimitWindow) {
  if (window === "1 d") {
    return 24 * 60 * 60 * 1000;
  }

  if (window === "1 h") {
    return 60 * 60 * 1000;
  }

  return 60 * 1000;
}

function getRedisLimiter({ limit, prefix, window }: Omit<RateLimitOptions, "identifier">) {
  const key = `${prefix}:${limit}:${window}`;
  const cached = redisLimiters.get(key);

  if (cached) {
    return cached;
  }

  const limiter = new Ratelimit({
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `pliny:${prefix}`,
    redis: Redis.fromEnv(),
  });

  redisLimiters.set(key, limiter);
  return limiter;
}

function checkLocalRateLimit({ identifier, limit, prefix, window }: RateLimitOptions): RateLimitDecision {
  const now = Date.now();
  const key = `${prefix}:${identifier}:${window}`;
  const bucket = localBuckets.get(key);
  const windowMs = getWindowMs(window);

  if (!bucket || bucket.resetAt <= now) {
    localBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt: now + windowMs,
      reason: "local_dev_fallback",
      status: "allowed",
    };
  }

  if (bucket.count >= limit) {
    return {
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      reason: "rate_limited",
      status: "blocked",
    };
  }

  bucket.count += 1;

  return {
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    resetAt: bucket.resetAt,
    reason: "local_dev_fallback",
    status: "allowed",
  };
}

export async function checkRouteRateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  if (!hasRedisConfig()) {
    if (process.env.NODE_ENV === "production") {
      return {
        limit: options.limit,
        remaining: 0,
        resetAt: Date.now(),
        reason: "missing_redis_config",
        status: "blocked",
      };
    }

    return checkLocalRateLimit(options);
  }

  try {
    const limiter = getRedisLimiter(options);
    const result = await limiter.limit(options.identifier);

    return {
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
      reason: result.success ? "allowed" : "rate_limited",
      status: result.success ? "allowed" : "blocked",
    };
  } catch (error) {
    console.error("[rate-limit] redis limit check failed", {
      error: error instanceof Error ? { message: error.message, name: error.name } : String(error),
      prefix: options.prefix,
    });

    if (process.env.NODE_ENV === "production") {
      return {
        limit: options.limit,
        remaining: 0,
        resetAt: Date.now(),
        reason: "redis_error",
        status: "blocked",
      };
    }

    return checkLocalRateLimit(options);
  }
}
