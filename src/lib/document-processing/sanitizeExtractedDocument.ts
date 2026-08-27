import { countWords, normalizeExtractedText, type ExtractedDocument, type ExtractedUnit } from "./types.ts";

export type SanitizationEvent = {
  documentId: string;
  length: number;
  offset: number;
  ruleId: "control_character" | "source_delimiter" | "prompt_injection_pattern" | "zero_width_character";
};

export type SanitizedExtractedDocument = {
  document: ExtractedDocument;
  events: SanitizationEvent[];
};

type SanitizationRule = {
  id: SanitizationEvent["ruleId"];
  pattern: RegExp;
  replacement: string;
};

const SANITIZATION_RULES: SanitizationRule[] = [
  {
    id: "source_delimiter",
    pattern: /<\/?source\b[^>]*>/gi,
    replacement: "[source delimiter removed]",
  },
  {
    id: "prompt_injection_pattern",
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|messages?)\b/gi,
    replacement: "[instruction-like text removed]",
  },
  {
    id: "prompt_injection_pattern",
    pattern: /\b(?:reveal|show|print|output|leak)\s+(?:the\s+)?(?:system prompt|developer message|hidden instructions?)\b/gi,
    replacement: "[instruction-like text removed]",
  },
  {
    id: "prompt_injection_pattern",
    pattern: /\b(?:you are now|act as|roleplay as)\s+(?:the\s+)?(?:system|developer|assistant)\b/gi,
    replacement: "[instruction-like text removed]",
  },
];

function isUnsafeControlCharacter(char: string) {
  const codePoint = char.codePointAt(0) ?? 0;

  return (codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) || (codePoint >= 127 && codePoint <= 159);
}

function isZeroWidthCharacter(char: string) {
  return /[\u200B-\u200D\u2060\uFEFF]/u.test(char);
}

function sanitizeText(text: string, documentId: string, events: SanitizationEvent[]) {
  let sanitized = "";
  let offset = 0;

  for (const char of text) {
    const length = char.length;

    if (isUnsafeControlCharacter(char)) {
      events.push({ documentId, length, offset, ruleId: "control_character" });
      offset += length;
      continue;
    }

    if (isZeroWidthCharacter(char)) {
      events.push({ documentId, length, offset, ruleId: "zero_width_character" });
      offset += length;
      continue;
    }

    sanitized += char;
    offset += length;
  }

  for (const rule of SANITIZATION_RULES) {
    sanitized = sanitized.replace(rule.pattern, (match, ...args: unknown[]) => {
      const offsetValue = args.at(-2);
      const matchOffset = typeof offsetValue === "number" ? offsetValue : 0;

      events.push({
        documentId,
        length: match.length,
        offset: matchOffset,
        ruleId: rule.id,
      });

      return rule.replacement;
    });
  }

  return sanitized;
}

function sanitizeUnit(unit: ExtractedUnit, documentId: string, events: SanitizationEvent[]): ExtractedUnit {
  return {
    ...unit,
    text: sanitizeText(unit.text, documentId, events),
  };
}

export function sanitizeExtractedDocument(document: ExtractedDocument, documentId: string): SanitizedExtractedDocument {
  const events: SanitizationEvent[] = [];
  const units = document.units.map((unit) => sanitizeUnit(unit, documentId, events));
  const plainText = normalizeExtractedText(sanitizeText(document.plainText, documentId, events));

  return {
    document: {
      ...document,
      charCount: plainText.length,
      plainText,
      units,
      wordCount: countWords(plainText),
    },
    events,
  };
}
