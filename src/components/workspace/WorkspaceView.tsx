"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, FileText, Menu, PanelLeft } from "lucide-react";
import { AskSurface } from "@/components/workspace/AskSurface";
import { DocumentsSurface } from "@/components/workspace/DocumentsSurface";
import { SourceInspector, SourceSheet } from "@/components/workspace/SourceInspector";
import { downloadMarkdownFile } from "@/lib/export/browserReportExport";
import { buildChatTranscriptMarkdown, getTranscriptMarkdownFilename } from "@/lib/export/reportExport";
import { logout } from "@/lib/auth/actions";
import { PROCESSING_BOUNDARY_PARAGRAPHS, PROCESSING_BOUNDARY_TITLE } from "@/lib/privacy/disclosure";
import type {
  ChatResponse,
  CollectionListItem,
  DocumentListItem,
  RetrievalReason,
  SearchChunkResult,
  WorkspaceSearchResult,
} from "@/types";
import styles from "./WorkspaceView.module.css";

type WorkspaceViewProps = {
  chatError?: string | null;
  chatNotice?: string | null;
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

// B8: type moved here when the dormant DocumentSidebar.tsx (panel + sidebar) was removed.
type WorkspaceSidebarRecent = {
  collectionId: string;
  collectionName: string;
  createdAt: string;
  message: string;
};

type MenuKey = "account-header" | "account-side" | "switcher" | "mode";

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

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getInitial(value?: string | null) {
  return value?.trim().charAt(0).toUpperCase() || "U";
}

function getWorkspaceInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "P";
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function formatRecentStamp(value: string) {
  const time = (date: Date) =>
    new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (value === "Just now") {
    return `Today · ${time(new Date())}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Today";
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  const day =
    dayDifference === 0
      ? "Today"
      : dayDifference === 1
        ? "Yesterday"
        : new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
  return `${day} · ${time(date)}`;
}

export function WorkspaceView({
  chatError,
  chatNotice,
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
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const menuTriggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuWraps = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    function handleChange(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
      if (!event.matches) {
        setIsDrawerOpen(false);
      }
    }
    setIsMobile(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openMenu) {
        const key = openMenu;
        setOpenMenu(null);
        menuTriggers.current[key]?.focus();
        return;
      }
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, isDrawerOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const activeMenu: MenuKey = openMenu;
    function onDown(event: MouseEvent) {
      const wrap = menuWraps.current[activeMenu];
      if (wrap && !wrap.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    asideRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isDrawerOpen]);

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
  const visibleCollections = collections.length > 0 ? collections : [collection];
  const isPrivacyMinimised = collection.defaultProcessingMode === "privacy_minimised";
  const modeLabelShort = isPrivacyMinimised ? "Privacy-minimised" : "Standard";
  const statusChip = `${documents.length} DOCUMENTS · ${isPrivacyMinimised ? "PRIVACY-MINIMISED" : "STANDARD"}`;
  const accountInitial = getInitial(userEmail);
  const workspaceInitials = getWorkspaceInitials(collection.name);
  const collapsedEffective = isCollapsed && !isMobile;

  function toggleMenu(key: MenuKey) {
    setOpenMenu((current) => (current === key ? null : key));
  }

  function closeDrawerWithFocus() {
    setIsDrawerOpen(false);
    hamburgerRef.current?.focus();
  }

  function openDocumentsFromSide() {
    setIsDocumentPanelOpen(true);
    if (isMobile) {
      closeDrawerWithFocus();
    }
  }

  function closeDocuments() {
    setIsDocumentPanelOpen(false);
  }

  function scrollToComposer() {
    const revealComposer = () => {
      const node = canvasScrollRef.current;
      if (node) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      }
      document.getElementById("ask-surface-composer")?.focus({ preventScroll: true });
    };

    if (isDocumentPanelOpen) {
      setIsDocumentPanelOpen(false);
      window.requestAnimationFrame(() => window.requestAnimationFrame(revealComposer));
    } else {
      revealComposer();
    }
    if (isMobile) {
      closeDrawerWithFocus();
    }
  }

  function handleSelectSource(source: SearchChunkResult) {
    setSelectedSource(source);
    setIsSourceInspectorOpen(true);
    // B8 (D11): collapse retuned 1024 → 900 to match the approved shell breakpoint.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches) {
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
    if (!open && typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches) {
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

  function renderAccountMenu() {
    return (
      <div role="menu" aria-label="Account" className={styles.accountMenu}>
        <p className={styles.menuEmail} title={userEmail ?? undefined}>{userEmail ?? "Signed in"}</p>
        <Link href="/dashboard" role="menuitem" className={styles.menuItem} onClick={() => setOpenMenu(null)}>
          All workspaces
        </Link>
        <form action={logout} className={styles.menuForm}>
          <button type="submit" role="menuitem" className={styles.menuItem}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <button
            ref={hamburgerRef}
            type="button"
            className={styles.hamburger}
            aria-expanded={isDrawerOpen}
            aria-controls="workspace-sidebar"
            aria-label={isDrawerOpen ? "Close workspace navigation" : "Open workspace navigation"}
            onClick={() => setIsDrawerOpen((open) => !open)}
          >
            <Menu className={styles.icon} aria-hidden="true" />
          </button>
          <Link href="/dashboard" className={styles.brand}>
            Pliny
          </Link>
          <nav className={styles.crumb} aria-label="Breadcrumb">
            <Link href="/dashboard" className={styles.crumbLink}>
              All workspaces
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">/</span>
            <span className={styles.crumbCurrent} aria-current="page" title={collection.name}>
              {truncateText(collection.name, 28)}
            </span>
          </nav>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.statusChip}>{statusChip}</span>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={searchResults.length === 0}
            onClick={handleExportTranscript}
          >
            Export transcript
          </button>
          <div className={styles.menuWrap} ref={(el) => { menuWraps.current.mode = el; }}>
            <button
              ref={(el) => { menuTriggers.current.mode = el; }}
              type="button"
              className={styles.modeBtn}
              aria-haspopup="dialog"
              aria-expanded={openMenu === "mode"}
              aria-controls="processing-boundary-popover"
              onClick={() => toggleMenu("mode")}
            >
              {modeLabelShort}
              <ChevronDown className={styles.icon} aria-hidden="true" />
            </button>
            {openMenu === "mode" ? (
              <div id="processing-boundary-popover" role="dialog" aria-label="Processing boundary" className={styles.popover}>
                <h2 className={styles.popoverTitle}>{PROCESSING_BOUNDARY_TITLE}</h2>
                <p className={styles.popoverBody}>{PROCESSING_BOUNDARY_PARAGRAPHS[0]}</p>
                <p className={styles.popoverStrong}>{PROCESSING_BOUNDARY_PARAGRAPHS[1]}</p>
                <Link href="/privacy" className={styles.popoverLink}>
                  Data Privacy details
                </Link>
              </div>
            ) : null}
          </div>
          <div className={styles.menuWrap} ref={(el) => { menuWraps.current["account-header"] = el; }}>
            <button
              ref={(el) => { menuTriggers.current["account-header"] = el; }}
              type="button"
              className={styles.accountBtn}
              aria-haspopup="menu"
              aria-expanded={openMenu === "account-header"}
              aria-label="Open account menu"
              onClick={() => toggleMenu("account-header")}
            >
              <span className={styles.avatar} aria-hidden="true">{accountInitial}</span>
              <ChevronDown className={styles.icon} aria-hidden="true" />
            </button>
            {openMenu === "account-header" ? renderAccountMenu() : null}
          </div>
        </div>
      </header>

      <div className={styles.shellBody}>
        {isDrawerOpen ? (
          <div className={styles.scrim} aria-hidden="true" onClick={closeDrawerWithFocus} />
        ) : null}

        <aside
          id="workspace-sidebar"
          ref={asideRef}
          tabIndex={-1}
          aria-label="Workspace sidebar"
          className={`${styles.sidebar} ${collapsedEffective ? styles.sidebarCollapsed : ""} ${isDrawerOpen ? styles.sidebarOpen : ""}`}
        >
          {collapsedEffective ? (
            <div className={styles.railCol}>
              <button
                type="button"
                className={styles.railBtn}
                aria-label="Expand sidebar"
                onClick={() => setIsCollapsed(false)}
              >
                <PanelLeft className={`${styles.icon} ${styles.iconFlip}`} aria-hidden="true" />
              </button>
              <span className={styles.railChip} title={collection.name}>
                {workspaceInitials}
              </span>
              <button
                type="button"
                className={styles.railBtn}
                aria-label="Open documents panel"
                onClick={() => setIsDocumentPanelOpen(true)}
              >
                <FileText className={styles.icon} aria-hidden="true" />
              </button>
              <div className={styles.railFoot} ref={(el) => { menuWraps.current["account-side"] = el; }}>
                <button
                  ref={(el) => { menuTriggers.current["account-side"] = el; }}
                  type="button"
                  className={styles.railAvatarBtn}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "account-side"}
                  aria-label="Open account menu"
                  onClick={() => toggleMenu("account-side")}
                >
                  <span className={styles.avatar} aria-hidden="true">{accountInitial}</span>
                </button>
                {openMenu === "account-side" ? renderAccountMenu() : null}
              </div>
            </div>
          ) : (
            <div className={styles.sideExpanded}>
              <div className={styles.sideTop}>
                <button
                  type="button"
                  className={styles.collapseBtn}
                  aria-label="Collapse sidebar"
                  onClick={() => setIsCollapsed(true)}
                >
                  <PanelLeft className={styles.icon} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.switcherWrap} ref={(el) => { menuWraps.current.switcher = el; }}>
                <button
                  ref={(el) => { menuTriggers.current.switcher = el; }}
                  type="button"
                  className={styles.switcherBtn}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "switcher"}
                  aria-controls="workspace-switcher-menu"
                  onClick={() => toggleMenu("switcher")}
                >
                  <span className={styles.switcherName} title={collection.name}>
                    {truncateText(collection.name, 24)}
                  </span>
                  <ChevronDown className={styles.icon} aria-hidden="true" />
                </button>
                {openMenu === "switcher" ? (
                  <div id="workspace-switcher-menu" role="menu" aria-label="Workspaces" className={styles.switcherMenu}>
                    {visibleCollections.map((workspace) => (
                      <Link
                        key={workspace.id}
                        href={`/collection/${workspace.id}`}
                        role="menuitem"
                        aria-current={workspace.id === collection.id ? "page" : undefined}
                        className={`${styles.switcherItem} ${workspace.id === collection.id ? styles.switcherItemActive : ""}`}
                      >
                        <span className={styles.switcherName} title={workspace.name}>
                          {truncateText(workspace.name, 24)}
                        </span>
                        <span className={styles.switcherCount}>{workspace.documentCount} docs</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <nav className={styles.sideNav} aria-label="Workspace">
                <p className={styles.sideLabel}>Workspace</p>
                <button
                  type="button"
                  className={`${styles.navRow} ${isDocumentPanelOpen ? styles.navRowActive : ""}`}
                  aria-current={isDocumentPanelOpen ? "true" : undefined}
                  onClick={openDocumentsFromSide}
                >
                  Documents
                  <span className={styles.navRowChip}>{documents.length}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.navRow} ${isDocumentPanelOpen ? "" : styles.navRowActive}`}
                  aria-current={isDocumentPanelOpen ? undefined : "true"}
                  onClick={scrollToComposer}
                >
                  Ask a question
                </button>
                <p className={styles.sideLabel}>Recent questions</p>
                {sidebarRecents.length > 0 ? (
                  sidebarRecents.map((recent) => (
                    <Link
                      key={`${recent.collectionId}-${recent.createdAt}`}
                      href={`/collection/${recent.collectionId}`}
                      className={styles.recentLink}
                      onClick={() => setIsDrawerOpen(false)}
                    >
                      <span className={styles.recentText} title={recent.message}>
                        {truncateText(recent.message, 42)}
                      </span>
                      <span className={styles.recentStamp}>{formatRecentStamp(recent.createdAt)}</span>
                    </Link>
                  ))
                ) : (
                  <p className={styles.recentEmpty}>No questions yet</p>
                )}
              </nav>
              <div className={styles.sideFoot}>
                <span className={styles.avatar} aria-hidden="true">{accountInitial}</span>
                <span className={styles.sideFootId}>
                  <span className={styles.sideEmail} title={userEmail ?? undefined}>
                    {userEmail ?? "Signed in"}
                  </span>
                  <form action={logout}>
                    <button type="submit" className={styles.signOutLink}>
                      Sign out
                    </button>
                  </form>
                </span>
              </div>
            </div>
          )}
        </aside>

        <div className={styles.workRow}>
          {isDocumentPanelOpen ? (
            <DocumentsSurface
              collectionId={collection.id}
              collectionName={collection.name}
              defaultProcessingMode={collection.defaultProcessingMode}
              documents={documents}
              documentsError={documentsError}
              onBack={closeDocuments}
            />
          ) : (
            <>
          <AskSurface
            chatError={chatError}
            chatNotice={chatNotice}
            collectionId={collection.id}
            collectionName={collection.name}
            documents={documents}
            documentsError={documentsError}
            isSearching={isSearching}
            pendingQuestion={pendingQuestion}
            results={searchResults}
            scrollRef={canvasScrollRef}
            searchError={searchError}
            selectedSourceId={selectedSource?.id}
            onAsk={handleSearch}
            onOpenDocuments={openDocumentsFromSide}
            onSelectSource={handleSelectSource}
          />
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
          ) : (
            <button
              type="button"
              aria-label="Show documents panel"
              onClick={() => setIsDocumentPanelOpen(true)}
              className={styles.revealBtn}
            >
              <ChevronLeft className={styles.icon} aria-hidden="true" />
            </button>
          )}
            </>
          )}
        </div>
      </div>

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
