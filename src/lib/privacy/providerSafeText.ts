import { createHmac } from "node:crypto";
import { detectDeterministicPii } from "./detectDeterministicPii.ts";
import type { PiiDetection, PiiEntityType, ProviderSafeProjection, PseudonymScope } from "./types.ts";

const TOKEN_LABELS: Record<PiiEntityType, string> = {
  aadhaar: "AADHAAR",
  bank_account: "ACCOUNT",
  custom: "IDENTIFIER",
  email: "EMAIL",
  government_id: "GOVERNMENT_ID",
  ifsc: "IFSC",
  ip_address: "IP_ADDRESS",
  pan: "PAN",
  payment_card: "PAYMENT_CARD",
  phone: "PHONE",
  sensitive_url: "SENSITIVE_URL",
};

export class PrivacyBoundaryError extends Error {
  readonly stage: "configuration" | "embedding" | "generation" | "query";

  constructor(stage: PrivacyBoundaryError["stage"], message: string) {
    super(message);
    this.name = "PrivacyBoundaryError";
    this.stage = stage;
  }
}

function validateScope(scope: PseudonymScope) {
  if (!scope.scopeId.trim()) {
    throw new PrivacyBoundaryError("configuration", "Privacy processing is not configured for this document.");
  }
  if (scope.scopeSecret.length < 32) {
    throw new PrivacyBoundaryError("configuration", "Privacy processing is not configured for this environment.");
  }
}

function digest(scope: PseudonymScope, value: string, length: number) {
  return createHmac("sha256", scope.scopeSecret).update(value).digest("hex").slice(0, length).toUpperCase();
}

export function getPrivacyScopeId(userId: string, documentId: string) {
  return `${userId}/document/${documentId}`;
}

export function getPrivacyScopeSecret(environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.PRIVACY_PSEUDONYM_KEY;
  if (!secret || secret.length < 32) {
    throw new PrivacyBoundaryError("configuration", "Privacy processing is not configured for this environment.");
  }
  return secret;
}

export function getStablePseudonym(detection: Pick<PiiDetection, "normalizedValue" | "type">, scope: PseudonymScope) {
  validateScope(scope);
  const scopeTag = digest(scope, `scope\u0000${scope.scopeId}`, 10);
  const entityTag = digest(scope, `entity\u0000${scope.scopeId}\u0000${detection.type}\u0000${detection.normalizedValue}`, 10);
  return `[${TOKEN_LABELS[detection.type]}_${scopeTag}_${entityTag}]`;
}

function assertDetections(text: string, detections: PiiDetection[]) {
  const ordered = [...detections].sort((left, right) => left.start - right.start || left.end - right.end);
  let previousEnd = -1;
  for (const detection of ordered) {
    if (
      !Number.isInteger(detection.start) ||
      !Number.isInteger(detection.end) ||
      detection.start < 0 ||
      detection.end <= detection.start ||
      detection.end > text.length ||
      detection.start < previousEnd ||
      text.slice(detection.start, detection.end) !== detection.value
    ) {
      throw new PrivacyBoundaryError("query", "Privacy transformation could not be completed safely.");
    }
    previousEnd = detection.end;
  }
  return ordered;
}

export function toProviderSafeText(
  text: string,
  scope: PseudonymScope,
  detections: PiiDetection[] = detectDeterministicPii(text)
): ProviderSafeProjection {
  const ordered = assertDetections(text, detections);
  const tokens = new Set<string>();
  let output = text;
  for (const detection of [...ordered].reverse()) {
    const token = getStablePseudonym(detection, scope);
    tokens.add(token);
    output = `${output.slice(0, detection.start)}${token}${output.slice(detection.end)}`;
  }
  return { text: output, tokens: Array.from(tokens).sort() };
}

export function toProviderSafeQuery(text: string, scopes: PseudonymScope[]): ProviderSafeProjection {
  if (scopes.length === 0) {
    throw new PrivacyBoundaryError("query", "Privacy query transformation has no authorised document scope.");
  }
  const detections = assertDetections(text, detectDeterministicPii(text));
  const tokens = new Set<string>();
  let output = text;
  for (const detection of [...detections].reverse()) {
    const replacements = scopes.map((scope) => getStablePseudonym(detection, scope));
    replacements.forEach((token) => tokens.add(token));
    output = `${output.slice(0, detection.start)}${replacements.join(" ")}${output.slice(detection.end)}`;
  }
  return { text: output, tokens: Array.from(tokens).sort() };
}

export function toProviderSafeJsonValue(value: unknown, scope: PseudonymScope): unknown {
  if (typeof value === "string") return toProviderSafeText(value, scope).text;
  if (Array.isArray(value)) return value.map((item) => toProviderSafeJsonValue(item, scope));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toProviderSafeJsonValue(item, scope)]));
  }
  return value;
}

export function collectOriginalDeterministicIdentifiers(values: string[]) {
  return Array.from(
    new Set(values.flatMap((value) => detectDeterministicPii(value).map((detection) => detection.value)).filter(Boolean))
  );
}

export function assertProviderPayloadExcludes(payload: unknown, forbiddenValues: readonly string[], stage: "embedding" | "generation") {
  const serialized = JSON.stringify(payload);
  if (forbiddenValues.some((value) => value.length > 0 && serialized.includes(value))) {
    throw new PrivacyBoundaryError(stage, `Privacy ${stage} boundary validation failed.`);
  }
  return payload;
}

const PSEUDONYM_PATTERN = /\[(?:AADHAAR|ACCOUNT|EMAIL|GOVERNMENT_ID|IDENTIFIER|IFSC|IP_ADDRESS|PAN|PAYMENT_CARD|PHONE|SENSITIVE_URL)_[A-F0-9]{10}_[A-F0-9]{10}\]/g;

export function getPseudonyms(value: string) {
  return Array.from(new Set(value.match(PSEUDONYM_PATTERN) ?? []));
}

export function assertOnlyAllowedPseudonyms(value: string, allowedTokens: readonly string[]) {
  const allowed = new Set(allowedTokens);
  if (getPseudonyms(value).some((token) => !allowed.has(token))) {
    throw new PrivacyBoundaryError("generation", "Generated output contained an unknown privacy token.");
  }
  return value;
}
