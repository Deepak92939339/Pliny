/**
 * WP2 (audit-r1): identifier extraction for exact-ID retrieval.
 *
 * Live-audit finding: questions like "What is the severity of incident
 * INC-5517?" failed because the lexical query was flooded by the generic
 * prefix ("inc" matched every row) and the row's identifier lost its
 * adjacency ("inc OR 5517"). extractIdentifiers recognises structured
 * identifiers so they can be searched as quoted phrases instead.
 *
 * Identifiers are:
 *  - tokens that start with 2+ letters, then mix letters/digits/separators
 *    (- _ /), and contain at least one digit anywhere:
 *    INC-5517, CTR-2026-00417-B, SKU-VX-88213, RISK-MATRIX-R7, POL-IND-CAP-12
 *  - purely numeric tokens of 4+ digits: 2026, 55170, 12345678
 *
 * Non-identifiers: "Q3", "v2", "A1", plain words, 1-3 digit numbers.
 */
const IDENTIFIER_TOKEN_PATTERN = /\b[A-Za-z]{2,}[-_/A-Za-z0-9]*\d[A-Za-z0-9-_/]*\b/g;
const NUMERIC_IDENTIFIER_PATTERN = /\b\d{4,}\b/g;

export function extractIdentifiers(query: string): string[] {
  if (!query || query.length === 0) {
    return [];
  }

  const found: string[] = [];
  const seen = new Set<string>();

  IDENTIFIER_TOKEN_PATTERN.lastIndex = 0;
  const alphaMatches = Array.from(query.matchAll(IDENTIFIER_TOKEN_PATTERN));

  for (const match of alphaMatches) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      found.push(match[0]);
    }
  }

  // Purely numeric identifiers — but skip numbers that are part of an
  // alphanumeric identifier already captured above (the "5517" inside
  // "INC-5517" is not a separate identifier).
  const alphaSpans = alphaMatches.map((match) => [match.index ?? -1, (match.index ?? -1) + match[0].length] as const);
  NUMERIC_IDENTIFIER_PATTERN.lastIndex = 0;

  for (const match of query.matchAll(NUMERIC_IDENTIFIER_PATTERN)) {
    const start = match.index ?? -1;
    const end = start + match[0].length;
    const insideAlphaIdentifier = alphaSpans.some(([alphaStart, alphaEnd]) => start >= alphaStart && end <= alphaEnd);

    if (!insideAlphaIdentifier && !seen.has(match[0])) {
      seen.add(match[0]);
      found.push(match[0]);
    }
  }

  return found;
}

/**
 * Leading alpha head of an identifier ("inc" of INC-5517, "ctr" of
 * CTR-2026-00417-B). Used to keep generic prefix fragments out of the loose
 * OR terms when they only occur as part of an identifier.
 */
export function getIdentifierHead(identifier: string): string {
  return identifier.match(/^[A-Za-z]{2,}/)?.[0] ?? "";
}
