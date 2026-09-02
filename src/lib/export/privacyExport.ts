import type { SearchChunkResult, WorkspaceSearchResult } from "../../types/index.ts";

export function getPrivacySafeExportQuestion(result: WorkspaceSearchResult) {
  return result.privacyMode === "privacy_minimised"
    ? result.providerSafeQuestion?.trim() || "Privacy-minimised question"
    : result.question;
}

export function getPrivacySafeExportAnswer(result: WorkspaceSearchResult) {
  return result.privacyMode === "privacy_minimised"
    ? result.providerSafeAnswer?.trim() || "Privacy-minimised answer unavailable."
    : result.answer;
}

export function getPrivacySafeExportWorkspaceName(
  workspaceName: string | undefined,
  results: readonly WorkspaceSearchResult[]
) {
  return results.some((result) => result.privacyMode === "privacy_minimised") ? "Workspace" : workspaceName;
}

export function getPrivacySafeExportSource(
  source: SearchChunkResult,
  documentAlias: string,
  privacyMinimised: boolean
) {
  if (!privacyMinimised) {
    return {
      content: source.content,
      documentName: source.filename,
      locationLabel: source.locationLabel,
    };
  }
  return {
    content: source.providerSafeContent ?? "",
    documentName: documentAlias,
    locationLabel:
      typeof source.pageNumber === "number" && source.pageNumber > 0
        ? `p. ${source.pageNumber}`
        : `chunk ${source.chunkIndex + 1}`,
  };
}
