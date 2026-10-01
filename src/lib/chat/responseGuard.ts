/**
 * WP6 (audit-r1): unverified answer text must never leave the server.
 *
 * Previously the route only replaced the draft with the refusal for
 * multi-document scopes; a single-document scope that failed the final
 * evidence check still carried the generated text in the API response, in
 * chat history and in exports. The decision now lives here so it is testable
 * in isolation: ANY insufficient-evidence outcome returns the refusal text
 * and no citations, regardless of how many documents are in scope.
 */

export function resolveVerifiedResponseAnswer({
  answer,
  isInsufficientEvidence,
  noContextAnswer,
}: {
  answer: string;
  isInsufficientEvidence: boolean;
  noContextAnswer: string;
}): string {
  return isInsufficientEvidence ? noContextAnswer : answer;
}

export function resolveVerifiedResponseCitations<T>({
  citations,
  isInsufficientEvidence,
}: {
  citations: T[];
  isInsufficientEvidence: boolean;
}): T[] {
  return isInsufficientEvidence ? [] : citations;
}
