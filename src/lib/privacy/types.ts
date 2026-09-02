export const PRIVACY_MODES = ["standard", "privacy_minimised"] as const;

export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export type PrivacyModeDescriptor = {
  mode: PrivacyMode;
  policyVersion: string;
};

export const PRIVACY_POLICY_VERSION = "deterministic-v1";

export function captureDocumentPrivacyPolicy(mode: PrivacyMode): PrivacyModeDescriptor {
  return {
    mode,
    policyVersion: mode === "privacy_minimised" ? PRIVACY_POLICY_VERSION : "standard",
  };
}

export type PiiEntityType =
  | "aadhaar"
  | "bank_account"
  | "custom"
  | "email"
  | "government_id"
  | "ifsc"
  | "ip_address"
  | "pan"
  | "payment_card"
  | "phone"
  | "sensitive_url";

export type PiiDetection = {
  confidence: "high";
  end: number;
  normalizedValue: string;
  ruleId: string;
  start: number;
  type: PiiEntityType;
  value: string;
};

export type CustomPiiPattern = {
  id: string;
  pattern: RegExp;
  type: "custom" | "government_id";
};

export type PiiDetectionOptions = {
  customPatterns?: CustomPiiPattern[];
};

export interface PiiDetector {
  detect(text: string, options?: PiiDetectionOptions): PiiDetection[];
}

export type PseudonymMappingEntry = {
  normalizedValue: string;
  originalValue: string;
  token: string;
  type: PiiEntityType;
};

export type PseudonymizedText = {
  mapping: PseudonymMappingEntry[];
  text: string;
};

export type PseudonymScope = {
  scopeId: string;
  scopeSecret: string;
};

export type ProviderSafeProjection = {
  text: string;
  tokens: string[];
};
