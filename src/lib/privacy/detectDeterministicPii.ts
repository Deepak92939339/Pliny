import type { CustomPiiPattern, PiiDetection, PiiDetectionOptions, PiiEntityType } from "./types.ts";

type Candidate = PiiDetection & { priority: number };

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi;
const PAYMENT_CARD_PATTERN = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_PATTERN = /(?<![A-F0-9:])(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{0,4}(?![A-F0-9:])/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
const AADHAAR_PATTERN = /(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)/g;
const IFSC_PATTERN = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const BANK_ACCOUNT_PATTERN = /\b(?:bank\s+)?account(?:\s+(?:number|no\.?))?\s*[:#-]?\s*([0-9][0-9 -]{7,20}[0-9])\b/gi;
const INTERNATIONAL_PHONE_PATTERN = /(?<!\w)\+\d{1,3}[\s.-]?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{3,4}(?!\w)/g;
const CONTEXT_PHONE_PATTERN = /\b(?:phone|mobile|telephone|tel)\s*[:#-]?\s*(\+?\d[\d\s().-]{7,20}\d)\b/gi;

const PRIORITY: Record<PiiEntityType, number> = {
  sensitive_url: 110,
  custom: 105,
  government_id: 105,
  payment_card: 100,
  aadhaar: 95,
  email: 90,
  pan: 85,
  ifsc: 80,
  bank_account: 75,
  phone: 70,
  ip_address: 65,
};

const SENSITIVE_QUERY_KEY = /(?:access[_-]?token|api[_-]?key|auth|authorization|credential|email|key|password|phone|secret|session|signature|token)/i;

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function passesLuhn(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

export function isValidAadhaarCandidate(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 12 || !/^[2-9]/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let checksum = 0;
  const reversed = [...digits].reverse().map(Number);
  reversed.forEach((digit, index) => {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][digit]];
  });
  return checksum === 0;
}

function isValidIpv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && (part === "0" || !part.startsWith("0")));
}

function isSensitiveUrl(value: string) {
  try {
    const url = new URL(value.replace(/[),.;]+$/, ""));
    return Boolean(url.username || url.password || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key)));
  } catch {
    return false;
  }
}

function addMatches(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  type: PiiEntityType,
  ruleId: string,
  validate: (value: string, match: RegExpExecArray) => boolean = () => true,
  selectValue: (match: RegExpExecArray) => string = (match) => match[0]
) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(matcher)) {
    const value = selectValue(match);
    if (!value || !validate(value, match)) continue;
    const relativeStart = match[0].indexOf(value);
    const start = (match.index ?? 0) + Math.max(relativeStart, 0);
    candidates.push({
      confidence: "high",
      end: start + value.length,
      normalizedValue: type === "email" ? value.toLowerCase() : type === "sensitive_url" ? value : value.replace(/[\s().-]/g, "").toUpperCase(),
      priority: PRIORITY[type],
      ruleId,
      start,
      type,
      value,
    });
  }
}

function resolveOverlaps(candidates: Candidate[]) {
  const ranked = [...candidates].sort((left, right) => left.start - right.start || right.priority - left.priority || right.end - right.start - (left.end - left.start));
  const accepted: Candidate[] = [];
  for (const candidate of ranked) {
    const overlapping = accepted.find((current) => candidate.start < current.end && candidate.end > current.start);
    if (!overlapping) {
      accepted.push(candidate);
      continue;
    }
    if (candidate.priority > overlapping.priority) {
      accepted.splice(accepted.indexOf(overlapping), 1, candidate);
    }
  }
  return accepted
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((candidate) => ({
      confidence: candidate.confidence,
      end: candidate.end,
      normalizedValue: candidate.normalizedValue,
      ruleId: candidate.ruleId,
      start: candidate.start,
      type: candidate.type,
      value: candidate.value,
    }));
}

function validateCustomPattern(pattern: CustomPiiPattern) {
  if (!pattern.id.trim()) throw new Error("Custom PII patterns require a non-empty id.");
  if (pattern.pattern.source === "" || pattern.pattern.test("")) throw new Error(`Custom PII pattern ${pattern.id} must not match an empty string.`);
}

export function detectDeterministicPii(text: string, options: PiiDetectionOptions = {}) {
  const candidates: Candidate[] = [];

  addMatches(candidates, text, URL_PATTERN, "sensitive_url", "sensitive_url", isSensitiveUrl, (match) => match[0].replace(/[),.;]+$/, ""));
  addMatches(candidates, text, EMAIL_PATTERN, "email", "email");
  addMatches(candidates, text, PAYMENT_CARD_PATTERN, "payment_card", "payment_card_luhn", passesLuhn);
  addMatches(candidates, text, IPV4_PATTERN, "ip_address", "ipv4", isValidIpv4);
  addMatches(candidates, text, IPV6_PATTERN, "ip_address", "ipv6");
  addMatches(candidates, text, PAN_PATTERN, "pan", "india_pan_format");
  addMatches(candidates, text, AADHAAR_PATTERN, "aadhaar", "aadhaar_verhoeff", isValidAadhaarCandidate);
  addMatches(candidates, text, IFSC_PATTERN, "ifsc", "india_ifsc_format");
  addMatches(candidates, text, BANK_ACCOUNT_PATTERN, "bank_account", "bank_account_context", (value) => {
    const digits = normalizeDigits(value);
    return digits.length >= 9 && digits.length <= 18 && !/^(\d)\1+$/.test(digits);
  }, (match) => match[1]);
  addMatches(candidates, text, INTERNATIONAL_PHONE_PATTERN, "phone", "international_phone", (value) => {
    const digits = normalizeDigits(value);
    return digits.length >= 10 && digits.length <= 15;
  });
  addMatches(candidates, text, CONTEXT_PHONE_PATTERN, "phone", "phone_context", (value) => {
    const digits = normalizeDigits(value);
    return digits.length >= 10 && digits.length <= 15;
  }, (match) => match[1]);

  for (const customPattern of options.customPatterns ?? []) {
    validateCustomPattern(customPattern);
    addMatches(candidates, text, customPattern.pattern, customPattern.type, `custom:${customPattern.id}`);
  }

  return resolveOverlaps(candidates);
}

export const deterministicPiiDetector = { detect: detectDeterministicPii };
