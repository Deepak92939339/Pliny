import { buildUntrustedEvidenceEnvelope } from "../privacy/promptBoundary.ts";
import {
  assertProviderPayloadExcludes,
  collectOriginalDeterministicIdentifiers,
  getPrivacyScopeId,
  getPseudonyms,
  toProviderSafeJsonValue,
  toProviderSafeQuery,
  toProviderSafeText,
} from "../privacy/providerSafeText.ts";
import type { PseudonymScope } from "../privacy/types.ts";
import type { RetrievalReason, SearchChunkResult } from "../../types/index.ts";

export type PrivacyGenerationBoundary = {
  allowedPseudonyms: string[];
  chunks: SearchChunkResult[];
  forbiddenOriginalIdentifiers: string[];
  question: string;
};

function getScope(userId: string, documentId: string, scopeSecret: string): PseudonymScope {
  return { scopeId: getPrivacyScopeId(userId, documentId), scopeSecret };
}

function getGenericLocation(chunk: SearchChunkResult) {
  if (chunk.pageNumber > 0) return `Page ${chunk.pageNumber}`;
  return `Chunk ${chunk.chunkIndex + 1}`;
}

function getDocumentAliases(chunks: SearchChunkResult[]) {
  const aliases = new Map<string, string>();
  for (const chunk of chunks) {
    if (!aliases.has(chunk.documentId)) aliases.set(chunk.documentId, `Document ${aliases.size + 1}`);
  }
  return aliases;
}

export function preparePrivacyGenerationBoundary({
  chunks,
  documentIds,
  question,
  scopeSecret,
  userId,
}: {
  chunks: SearchChunkResult[];
  documentIds: string[];
  question: string;
  scopeSecret: string;
  userId: string;
}): PrivacyGenerationBoundary {
  const uniqueDocumentIds = Array.from(new Set([...documentIds, ...chunks.map((chunk) => chunk.documentId)])).filter(Boolean);
  const scopes = uniqueDocumentIds.map((documentId) => getScope(userId, documentId, scopeSecret));
  const safeQuestion = toProviderSafeQuery(question, scopes);
  const safeChunks = chunks.map((chunk) => {
    const scope = getScope(userId, chunk.documentId, scopeSecret);
    const safeContent = chunk.providerSafeContent?.trim() || toProviderSafeText(chunk.content, scope).text;
    const safeMetadata = chunk.providerSafeMetadata ?? (toProviderSafeJsonValue(chunk.metadata ?? {}, scope) as SearchChunkResult["metadata"]);
    return {
      ...chunk,
      providerSafeContent: safeContent,
      providerSafeMetadata: safeMetadata,
    };
  });
  const forbiddenOriginalIdentifiers = collectOriginalDeterministicIdentifiers([
    question,
    ...chunks.flatMap((chunk) => [chunk.content, chunk.filename, chunk.locationLabel ?? ""]),
  ]);
  const allowedPseudonyms = Array.from(
    new Set([
      ...safeQuestion.tokens,
      ...safeChunks.flatMap((chunk) => getPseudonyms(chunk.providerSafeContent ?? "")),
    ])
  ).sort();
  return {
    allowedPseudonyms,
    chunks: safeChunks,
    forbiddenOriginalIdentifiers,
    question: safeQuestion.text,
  };
}

export function buildPrivacyGenerationPrompt({
  chunks,
  question,
  retrievalReason,
  requiredDocumentIds = [],
}: {
  chunks: SearchChunkResult[];
  question: string;
  retrievalReason: RetrievalReason;
  requiredDocumentIds?: string[];
}) {
  const aliasesByDocument = getDocumentAliases(chunks);
  const evidenceEnvelope = buildUntrustedEvidenceEnvelope(
    chunks.map((chunk, index) => ({
      chunkId: chunk.id,
      content: chunk.providerSafeContent ?? "",
      documentAlias: aliasesByDocument.get(chunk.documentId) ?? `Document ${index + 1}`,
      location: getGenericLocation(chunk),
      sourceId: `s.${index + 1}`,
    }))
  );
  const requiredAliases = requiredDocumentIds
    .map((documentId) => aliasesByDocument.get(documentId))
    .filter((alias): alias is string => Boolean(alias));
  const coverageInstruction =
    requiredAliases.length > 1
      ? `This is a bounded multi-document question. Cite qualifying evidence from every required alias (${requiredAliases.join(", ")}); otherwise return exactly INSUFFICIENT_EVIDENCE.`
      : "";
  return [
    "<question>",
    question,
    "</question>",
    `Retrieval mode: ${retrievalReason}.`,
    coverageInstruction,
    evidenceEnvelope,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGenerationProviderPayload({
  maxTokens,
  model,
  prompt,
  system,
  temperature,
}: {
  maxTokens: number;
  model: string;
  prompt: string;
  system: string;
  temperature: number;
}) {
  return {
    max_tokens: maxTokens,
    messages: [{ content: prompt, role: "user" as const }],
    model,
    system,
    temperature,
  };
}

export function buildCitationRepairProviderPayload({
  draftAnswer,
  maxTokens,
  model,
  prompt,
  system,
}: {
  draftAnswer: string;
  maxTokens: number;
  model: string;
  prompt: string;
  system: string;
}) {
  return buildGenerationProviderPayload({
    maxTokens,
    model,
    prompt: `${prompt}\n\n<draft_answer>\n${draftAnswer}\n</draft_answer>\n\nRepair citations using only the supplied source IDs.`,
    system,
    temperature: 0,
  });
}

export function assertPrivacyGenerationPayload(payload: unknown, boundary: PrivacyGenerationBoundary) {
  return assertProviderPayloadExcludes(payload, boundary.forbiddenOriginalIdentifiers, "generation");
}
