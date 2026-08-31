"use client";

import { useState } from "react";
import { AnalysisRecord } from "@/components/workspace/AnalysisRecord";
import { DocumentManagementPanel, DocumentSidebar, type WorkspaceSidebarRecent } from "@/components/workspace/DocumentSidebar";
import { QueryComposer } from "@/components/workspace/QueryComposer";
import { SourceInspector, SourceSheet } from "@/components/workspace/SourceInspector";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { downloadMarkdownFile } from "@/lib/export/browserReportExport";
import { buildChatTranscriptMarkdown, getTranscriptMarkdownFilename } from "@/lib/export/reportExport";
import { ChevronLeft } from "lucide-react";
import type { ChatResponse, CollectionListItem, DocumentListItem, RetrievalReason, SearchChunkResult, WorkspaceSearchResult } from "@/types";

type WorkspaceViewProps = {
  chatError?: string | null;
  collection?: CollectionListItem;
  collections?: CollectionListItem[];
  documents?: DocumentListItem[];
  documentsError?: string | null;
  errorMessage?: string;
  initialMessages?: WorkspaceSearchResult[];
  userEmail?: string | null;
  userId?: string;
};

type SearchErrorResponse = {
  error?: string;
};

type ActiveSourceContext = {
  retrievalReason?: RetrievalReason;
  selectedSourceIndex: number;
  sources: SearchChunkResult[];
};

async function readChatResponse(response: Response): Promise<ChatResponse & SearchErrorResponse> {
  try {
    return (await response.json()) as ChatResponse & SearchErrorResponse;
  } catch {
    return {
      answer: "",
      citations: [],
      collectionId: "",
      metadata: {
        maxOutputTokens: 0,
        model: "unknown",
        modelReason: "Response could not be parsed.",
        retrievalReason: "no_chunks_found",
      },
      question: "",
      sources: [],
      status: "answered",
    };
  }
}

function getFriendlyChatError(error?: string) {
  if (!error) {
    return "Unable to answer from this workspace right now.";
  }

  if (error.includes("AI is disabled")) {
    return "AI is disabled for this environment. Turn it on locally before asking Claude.";
  }

  if (error.includes("local test request limit")) {
    return "You have reached the local test request limit. Wait a minute, then try again.";
  }

  if (error.includes("cost limit")) {
    return "This question is too large for the current cost limit. Try a shorter question.";
  }

  return error;
}

function toWorkspaceCopy(message: string) {
  return message.replaceAll("Project", "Workspace").replaceAll("project", "workspace");
}

function getUniqueSources(sources: SearchChunkResult[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (seen.has(source.id)) {
      return false;
    }

    seen.add(source.id);
    return true;
  });
}

function getActiveSourceContext(results: WorkspaceSearchResult[], selectedSource: SearchChunkResult | null): ActiveSourceContext {
  if (!selectedSource) {
    return {
      selectedSourceIndex: -1,
      sources: [],
    };
  }

  const owningResult = [...results]
    .reverse()
    .find(
      (result) =>
        result.sources.some((source) => source.id === selectedSource.id) ||
        result.citations.some((citation) => citation.source.id === selectedSource.id)
    );

  if (!owningResult) {
    return {
      selectedSourceIndex: 0,
      sources: [selectedSource],
    };
  }

  const citedSources = getUniqueSources(owningResult.citations.map((citation) => citation.source).filter(Boolean));
  const sources = citedSources.length > 0 ? citedSources : getUniqueSources(owningResult.sources);
  const selectedSourceIndex = Math.max(
    sources.findIndex((source) => source.id === selectedSource.id),
    0
  );

  return {
    retrievalReason: owningResult.retrievalReason,
    selectedSourceIndex,
    sources: sources.length > 0 ? sources : [selectedSource],
  };
}

export function WorkspaceView({
  chatError,
  collection,
  collections = [],
  documents = [],
  documentsError,
  errorMessage,
  initialMessages = [],
  userEmail,
}: WorkspaceViewProps) {
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[]>(initialMessages);
  const [selectedSource, setSelectedSource] = useState<SearchChunkResult | null>(null);
  const [isSourceInspectorOpen, setIsSourceInspectorOpen] = useState(false);
  const [isSourceSheetOpen, setIsSourceSheetOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(true);

  if (errorMessage) {
    return (
      <main className="dm-page flex min-h-screen items-center justify-center px-6">
        <section className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--editorial-ink)]">Unable to load workspace</h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--editorial-muted)]">{toWorkspaceCopy(errorMessage)}</p>
        </section>
      </main>
    );
  }

  if (!collection) {
    return null;
  }

  const latestUserQuestion = [...searchResults].reverse().find((result) => result.question.trim().length > 0);
  const sidebarRecents: WorkspaceSidebarRecent[] = latestUserQuestion
    ? [
        {
          collectionId: collection.id,
          collectionName: collection.name,
          createdAt: latestUserQuestion.createdAt,
          message: latestUserQuestion.question,
        },
      ]
    : [];
  const activeSourceContext = getActiveSourceContext(searchResults, selectedSource);

  function handleSelectSource(source: SearchChunkResult) {
    setSelectedSource(source);
    setIsSourceInspectorOpen(true);

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setIsSourceSheetOpen(true);
    }
  }

  function handleCloseSourceInspector() {
    setIsSourceInspectorOpen(false);
    setIsSourceSheetOpen(false);
  }

  function handleExportTranscript() {
    const generatedAt = new Date().toISOString();
    const markdown = buildChatTranscriptMarkdown({
      generatedAt,
      results: searchResults,
      workspaceName: collection?.name,
    });

    downloadMarkdownFile(getTranscriptMarkdownFilename(collection?.name, generatedAt), markdown);
  }

  function handleSourceSheetOpenChange(open: boolean) {
    setIsSourceSheetOpen(open);

    if (!open && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setIsSourceInspectorOpen(false);
    }
  }

  async function handleSearch(query: string) {
    if (!collection) {
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSelectedSource(null);
    setIsSourceInspectorOpen(false);
    setIsSourceSheetOpen(false);
    setPendingQuestion(query);

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          collection_id: collection.id,
          message: query,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = await readChatResponse(response);

      if (!response.ok) {
        setSearchError(getFriendlyChatError(result.error));
        return;
      }

      const resultIdentity = {
        answer: result.answer,
        citations: result.citations ?? [],
        collectionId: result.collectionId,
        id: globalThis.crypto?.randomUUID?.() ?? `client-result-${collection.id}-${query.length}-${result.answer.length}`,
        metadata: result.metadata,
        question: result.question || query,
        retrievalReason: result.metadata.retrievalReason,
        sources: result.sources ?? [],
        createdAt: "Just now",
      };
      const nextSearchResult: WorkspaceSearchResult =
        result.status === "insufficient_evidence"
          ? {
              ...resultIdentity,
              closestMatches: result.closestMatches ?? [],
              missingEvidence: result.missingEvidence ?? [],
              reason: result.reason ?? "The available evidence could not be verified for this question.",
              status: "insufficient_evidence",
            }
          : {
              ...resultIdentity,
              status: "answered",
            };

      setSearchResults((currentResults) => [...currentResults, nextSearchResult]);
    } catch {
      setSearchError("Unable to answer from this workspace right now. Check the server logs if this keeps happening.");
    } finally {
      setIsSearching(false);
      setPendingQuestion(null);
    }
  }

  return (
    <main className="dm-page flex h-screen w-screen overflow-hidden text-[color:var(--editorial-ink)]">
      <DocumentSidebar
        collection={collection}
        collections={collections.length > 0 ? collections : [collection]}
        recents={sidebarRecents}
        userEmail={userEmail}
      />
      <section className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceHeader
          canExportTranscript={searchResults.length > 0}
          documentCount={documents.length}
          userEmail={userEmail}
          workspaceName={collection.name}
          onExportTranscript={handleExportTranscript}
        />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--editorial-page)] lg:min-w-[400px]">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
              <div className="mx-auto flex min-h-full max-w-[820px] flex-col">
                {chatError || documentsError || searchError ? (
                  <div className="mb-6 rounded-xl border border-[#BA5C3D]/20 bg-[#BA5C3D]/10 px-4 py-3 text-sm leading-6 text-[color:var(--editorial-rust-strong)]">
                    {searchError ?? chatError ?? documentsError}
                  </div>
                ) : null}

                {searchResults.length === 0 && !pendingQuestion ? (
                  <div className="flex flex-1 items-center justify-center px-4 text-center">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--editorial-ink-soft)]">Ask a question about your documents</p>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--editorial-muted)]">
                        Upload files, then ask for summaries, clauses, comparisons, or citations.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-10 py-4">
                    {searchResults.map((result, index) => (
                      <AnalysisRecord
                        key={`${result.id}-${result.createdAt}-${index}`}
                        result={result}
                        selectedSourceId={selectedSource?.id}
                        workspaceName={collection.name}
                        onSelectSource={handleSelectSource}
                      />
                    ))}
                    {pendingQuestion ? (
                      <div className="space-y-6">
                        <div className="flex justify-end">
                          <div className="max-w-[70%] rounded-2xl border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-panel)] px-4 py-3 text-[15px] leading-6 text-[color:var(--editorial-ink)] shadow-[0_8px_22px_rgba(72,48,31,0.05)]">
                            {pendingQuestion}
                          </div>
                        </div>
                        <TypingIndicator />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <QueryComposer isSearching={isSearching} onSubmit={handleSearch} />
          </section>
          {isSourceInspectorOpen ? (
            <SourceInspector
              retrievalReason={activeSourceContext.retrievalReason}
              selectedSource={selectedSource}
              selectedSourceIndex={activeSourceContext.selectedSourceIndex}
              sources={activeSourceContext.sources}
              workspaceName={collection.name}
              onClose={handleCloseSourceInspector}
              onSelectSource={handleSelectSource}
            />
          ) : isDocumentPanelOpen ? (
            <DocumentManagementPanel
              collectionId={collection.id}
              documents={documents}
              documentsError={documentsError}
              onCollapse={() => setIsDocumentPanelOpen(false)}
            />
          ) : (
            <button
              type="button"
              aria-label="Show documents panel"
              onClick={() => setIsDocumentPanelOpen(true)}
              className="absolute right-3 top-3 hidden size-8 items-center justify-center rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] text-[color:var(--editorial-muted)] shadow-sm shadow-[rgba(72,48,31,0.05)] hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 lg:flex"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
      <SourceSheet
        open={isSourceSheetOpen}
        retrievalReason={activeSourceContext.retrievalReason}
        selectedSource={selectedSource}
        workspaceName={collection.name}
        onOpenChange={handleSourceSheetOpenChange}
      />
    </main>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Pliny is typing">
      <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--editorial-muted)]" />
      <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--editorial-muted)] [animation-delay:120ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--editorial-muted)] [animation-delay:240ms]" />
    </div>
  );
}
