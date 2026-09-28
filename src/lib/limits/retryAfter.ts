/**
 * WP3 (audit-r1): Retry-After helpers — pure, client-safe, injectable clock.
 *
 * PLN-005 (S2): blocked chat requests counted toward the limits, so retrying
 * extended the block indefinitely. Blocked events no longer count, and every
 * 429 now carries a Retry-After so the Ask surface and the upload UI can say
 * exactly when to retry ("Try again in 42 seconds / 18 minutes / after
 * midnight UTC") and hold the submit button until then.
 */

export const MINUTE_WINDOW_MS = 60_000;

/** Seconds until the oldest allowed event in the sliding minute window leaves the window. */
export function computeMinuteRetryAfterSeconds(
  oldestAllowedEventAtMs: number | null,
  now: number,
  windowMs: number = MINUTE_WINDOW_MS
): number {
  if (oldestAllowedEventAtMs === null || !Number.isFinite(oldestAllowedEventAtMs)) {
    return Math.max(1, Math.ceil(windowMs / 1000));
  }

  return Math.max(1, Math.ceil((oldestAllowedEventAtMs + windowMs - now) / 1000));
}

/** Seconds until the UTC day boundary the budget guard already uses. */
export function computeDailyRetryAfterSeconds(now: number): number {
  const startOfNextUtcDay = new Date(now);
  startOfNextUtcDay.setUTCHours(0, 0, 0, 0);
  const boundary = startOfNextUtcDay.getTime() + 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((boundary - now) / 1000));
}

/** Seconds until a fixed-window/Upstash limiter's reset timestamp. */
export function computeResetRetryAfterSeconds(resetAtMs: number, now: number): number {
  return Math.max(1, Math.ceil((resetAtMs - now) / 1000));
}

/** Plain-English wait message shared by the Ask surface and the upload UI. */
export function formatRetryWaitMessage(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `Try again in ${Math.max(totalSeconds, 1)} second${totalSeconds === 1 ? "" : "s"}.`;
  }

  if (totalSeconds < 3_600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  return "Try again after midnight UTC.";
}

/** Duration fragment for live countdowns ("42 seconds" / "18 minutes" / "after midnight UTC"). */
export function formatRetryWaitDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${Math.max(totalSeconds, 1)} second${totalSeconds === 1 ? "" : "s"}`;
  }

  if (totalSeconds < 3_600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return "after midnight UTC";
}

/** Client-side parser: reads the Retry-After header from a 429 response. */
export function getRetryAfterHeaderSeconds(headers: { get: (name: string) => string | null }): number | null {
  const raw = headers.get("Retry-After");

  if (raw === null) {
    return null;
  }

  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}
