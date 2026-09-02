import { createHmac } from "node:crypto";
import type { PiiDetection, PiiEntityType, PseudonymMappingEntry, PseudonymScope, PseudonymizedText } from "./types.ts";

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

export type Pseudonymizer = {
  getMapping(): PseudonymMappingEntry[];
  pseudonymize(text: string, detections: PiiDetection[]): PseudonymizedText;
};

function validateScope(scope: PseudonymScope) {
  if (!scope.scopeId.trim()) throw new Error("A pseudonym scope id is required.");
  if (scope.scopeSecret.length < 32) throw new Error("The pseudonym scope secret must contain at least 32 characters.");
}

function getScopeTag(scope: PseudonymScope) {
  return createHmac("sha256", scope.scopeSecret).update(scope.scopeId).digest("hex").slice(0, 16).toUpperCase();
}

function assertDetections(text: string, detections: PiiDetection[]) {
  const ordered = [...detections].sort((left, right) => left.start - right.start || left.end - right.end);
  let previousEnd = -1;
  for (const detection of ordered) {
    if (!Number.isInteger(detection.start) || !Number.isInteger(detection.end) || detection.start < 0 || detection.end <= detection.start || detection.end > text.length) {
      throw new Error("PII detection offsets are invalid.");
    }
    if (detection.start < previousEnd) throw new Error("PII detections must not overlap.");
    if (text.slice(detection.start, detection.end) !== detection.value) throw new Error("PII detection value does not match its source offsets.");
    previousEnd = detection.end;
  }
  return ordered;
}

export function createPseudonymizer(scope: PseudonymScope): Pseudonymizer {
  validateScope(scope);
  const scopeTag = getScopeTag(scope);
  const mappingByEntity = new Map<string, PseudonymMappingEntry>();
  const nextIndexByType = new Map<PiiEntityType, number>();

  function getOrCreateMapping(detection: PiiDetection) {
    const key = `${detection.type}\u0000${detection.normalizedValue}`;
    const existing = mappingByEntity.get(key);
    if (existing) return existing;
    const nextIndex = (nextIndexByType.get(detection.type) ?? 0) + 1;
    nextIndexByType.set(detection.type, nextIndex);
    const token = `[${TOKEN_LABELS[detection.type]}_${scopeTag}_${String(nextIndex).padStart(3, "0")}]`;
    const entry = {
      normalizedValue: detection.normalizedValue,
      originalValue: detection.value,
      token,
      type: detection.type,
    } satisfies PseudonymMappingEntry;
    mappingByEntity.set(key, entry);
    return entry;
  }

  return {
    getMapping() {
      return Array.from(mappingByEntity.values()).map((entry) => ({ ...entry }));
    },
    pseudonymize(text, detections) {
      const ordered = assertDetections(text, detections);
      const replacements = ordered.map((detection) => ({
        detection,
        mapping: getOrCreateMapping(detection),
      }));
      let output = text;
      for (const { detection, mapping } of replacements.reverse()) {
        output = `${output.slice(0, detection.start)}${mapping.token}${output.slice(detection.end)}`;
      }
      return { mapping: this.getMapping(), text: output };
    },
  };
}

export function reconstructPseudonyms(
  text: string,
  mapping: PseudonymMappingEntry[],
  options: { allowedTypes?: readonly PiiEntityType[] } = {}
) {
  const allowedTypes = new Set(options.allowedTypes ?? []);
  if (allowedTypes.size === 0) return text;
  let reconstructed = text;
  for (const entry of mapping) {
    if (!allowedTypes.has(entry.type)) continue;
    reconstructed = reconstructed.split(entry.token).join(entry.originalValue);
  }
  return reconstructed;
}
