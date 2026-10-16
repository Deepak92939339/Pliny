// Upload and processing limits. Every value is environment-driven with a documented default
// (see docs/direct-upload-pipeline.md). NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES is read through a
// literal property access so Next.js inlines it into the browser bundle; the server uses the
// same value, so the client pre-check and the server check cannot drift apart.

/** Hard ceiling. The private bucket's own file_size_limit is set to this value in SQL. */
export const MAX_UPLOAD_BYTES_CEILING = 15 * 1024 * 1024;

export const SIGNED_UPLOAD_URL_TTL_MINUTES = 120;

function readInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

export function getMaxUploadBytes() {
  return readInteger(process.env.NEXT_PUBLIC_UPLOAD_MAX_FILE_BYTES, MAX_UPLOAD_BYTES_CEILING, 1024, MAX_UPLOAD_BYTES_CEILING);
}

export function formatByteLimit(bytes: number) {
  const mebibytes = bytes / (1024 * 1024);

  return Number.isInteger(mebibytes) ? `${mebibytes} MB` : `${mebibytes.toFixed(1)} MB`;
}

export function getFileTooLargeMessage(maxBytes = getMaxUploadBytes()) {
  return `File must be ${formatByteLimit(maxBytes)} or less.`;
}

export function getUploadRequestsPerHour() {
  return readInteger(process.env.UPLOAD_MAX_REQUESTS_PER_HOUR, 5, 1, 1000);
}

export function getProcessRequestsPerHour() {
  return readInteger(process.env.PROCESS_MAX_REQUESTS_PER_HOUR, 5, 1, 1000);
}

/**
 * Minutes a document may sit in one processing stage before the watchdog moves it to
 * "Needs attention". The process route's maxDuration is 300 s, so a live invocation can never
 * legitimately outlast 5 minutes; the floor of 6 guarantees a retry never races a live run.
 */
export function getProcessingStallMinutes() {
  return readInteger(process.env.PROCESSING_STALL_MINUTES, 6, 6, 240);
}

/** Minutes an 'awaiting_upload' row may wait for its object before it is failed (default 1 hour). */
export function getUploadExpiryMinutes() {
  return readInteger(process.env.UPLOAD_EXPIRY_MINUTES, 60, 5, SIGNED_UPLOAD_URL_TTL_MINUTES - 10);
}
