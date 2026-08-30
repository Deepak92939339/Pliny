"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, PanelLeft } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { NewWorkspaceDialog } from "@/components/dashboard/NewWorkspaceDialog";
import { DocumentProcessButton } from "@/components/workspace/DocumentProcessButton";
import { DocumentUploadDropzone } from "@/components/workspace/DocumentUploadDropzone";
import { logout } from "@/lib/auth/actions";
import { getFileKindLabel, inferSupportedFileKind } from "@/lib/document-processing/fileKinds";
import { cn } from "@/lib/utils";
import type { CollectionListItem, DocumentListItem, DocumentStatus } from "@/types";

export type WorkspaceSidebarRecent = {
  collectionId: string;
  collectionName: string;
  createdAt: string;
  message: string;
};

type DocumentSidebarProps = {
  collection: CollectionListItem;
  collections?: CollectionListItem[];
  recents?: WorkspaceSidebarRecent[];
  userEmail?: string | null;
};

type DocumentManagementPanelProps = {
  collectionId: string;
  documents: DocumentListItem[];
  documentsError?: string | null;
  onCollapse: () => void;
};

function getPageLabel(pages: number) {
  if (pages <= 0) {
    return "Pages pending";
  }

  return `${pages} ${pages === 1 ? "page" : "pages"}`;
}

export function DocumentManagementPanel({
  collectionId,
  documents,
  documentsError,
  onCollapse,
}: DocumentManagementPanelProps) {
  return (
    <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-black/[0.08] bg-[#F7F7F5]/70 text-[color:var(--editorial-ink)] dark:border-[color:var(--editorial-border)] dark:bg-[var(--editorial-panel)] dark:shadow-[-16px_0_36px_rgba(0,0,0,0.16)] lg:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.08] px-3 dark:border-[color:var(--editorial-border-soft)]">
        <h2 className="text-[13px] font-medium text-[color:var(--editorial-ink)]">Documents</h2>
        <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[11px] leading-none text-[color:var(--editorial-muted)] dark:border-[color:var(--editorial-border)] dark:bg-[var(--surface-2)]">
          {documents.length}
        </span>
        <button
          type="button"
          aria-label="Collapse documents panel"
          onClick={onCollapse}
          className="ml-auto flex size-8 items-center justify-center rounded-md text-[color:var(--editorial-muted)] hover:bg-black/[0.04] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 border-b border-black/[0.08] p-3 dark:border-[color:var(--editorial-border-soft)]">
        <DocumentUploadDropzone collectionId={collectionId} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {documentsError ? (
          <p className="px-2 py-3 text-[13px] leading-5 text-[color:var(--editorial-destructive)]">Unable to load documents.</p>
        ) : documents.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div>
              <p className="text-[13px] font-medium text-[color:var(--editorial-ink-soft)]">No documents yet</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--editorial-muted)]">
                Drop PDFs, DOCX, XLSX, CSV, Markdown, or text files to start. Legacy .xls files are not supported.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {documents.map((document) => (
              <DocumentPanelRow key={document.id} document={document} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function DocumentPanelRow({ document }: { document: DocumentListItem }) {
  const filename = getSafeFilename(document.filename);
  const status = getSafeDocumentStatus(document.status);
  const pageCount = getSafePageCount(document.pageCount);
  const statusLine = getCompactDocumentStatus(status);
  const pageLabel = status === "ready" && pageCount > 0 ? getPageLabel(pageCount) : null;
  const kindLabel = getFileKindLabel(inferSupportedFileKind(filename));

  return (
    <article
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-black/[0.035] dark:hover:bg-[var(--surface-2)]"
      title={status === "failed" ? document.errorMessage ?? "Needs retry" : filename}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-5 text-[color:var(--editorial-ink)]" title={filename}>
          {filename}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[color:var(--editorial-muted)]">
          <span className="shrink-0 rounded border border-black/10 bg-black/[0.025] px-1.5 py-px font-medium text-[10px] leading-3 text-[color:var(--editorial-muted)] dark:border-[color:var(--editorial-border)] dark:bg-[var(--surface-3)]">
            {kindLabel}
          </span>
          <DocumentStatusMarker status={status} />
          <span
            className={cn(
              "min-w-0 truncate",
              status === "failed" ? "text-[#9A5A3E] dark:text-[#D6A18D]" : "text-[color:var(--editorial-muted)]"
            )}
          >
            {statusLine ?? pageLabel ?? "Ready"}
          </span>
        </p>
      </div>
      <div className="min-h-6 shrink-0 pt-0.5 text-right">
        {status === "failed" ? (
          <DocumentProcessButton documentId={document.id} label="Retry" />
        ) : null}
      </div>
    </article>
  );
}

function getSafeFilename(filename: string | null | undefined) {
  return typeof filename === "string" && filename.trim().length > 0 ? filename.trim() : "Untitled document";
}

function getSafePageCount(pageCount: number | null | undefined) {
  return typeof pageCount === "number" && Number.isFinite(pageCount) ? pageCount : 0;
}

function getSafeDocumentStatus(status: DocumentStatus | string | null | undefined): DocumentStatus {
  if (status === "processing" || status === "ready" || status === "failed") {
    return status;
  }

  return "processing";
}

function getCompactDocumentStatus(status: DocumentStatus) {
  if (status === "processing") {
    return "Processing";
  }

  if (status === "failed") {
    return "Needs retry";
  }

  return null;
}

function DocumentStatusMarker({ status }: { status: DocumentStatus }) {
  if (status === "processing") {
    return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-500/75" aria-hidden="true" />;
  }

  if (status === "failed") {
    return <span className="size-1.5 shrink-0 rounded-full bg-[#BA5C3D]/70" aria-hidden="true" />;
  }

  return null;
}

export function DocumentSidebar({
  collection,
  collections = [collection],
  recents = [],
  userEmail,
}: DocumentSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const visibleCollections = collections.length > 0 ? collections : [collection];
  const visibleRecents = recents.slice(0, 8);

  return (
    <aside
      className={cn(
        "hidden h-full min-h-0 shrink-0 flex-col border-r border-black/[0.08] bg-[#F7F7F5] text-[color:var(--editorial-ink)] dark:border-[color:var(--editorial-border)] dark:bg-[var(--editorial-panel)] md:flex",
        isCollapsed ? "w-14" : "w-[260px]"
      )}
    >
      {isCollapsed ? (
        <div className="flex h-full flex-col items-center px-2 py-3">
          <Link href="/dashboard" aria-label="Pliny dashboard" className="flex size-10 items-center justify-center rounded-md hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]">
            <BrandMark
              className="h-8 gap-0"
              markClassName="size-8 border-transparent bg-[#0C1427] text-[#FCFBF8] dark:bg-[#F1EDE6] dark:text-[#0B0B0A]"
              textClassName="sr-only"
            />
          </Link>
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={() => setIsCollapsed(false)}
            className="mt-3 flex size-9 items-center justify-center rounded-md text-[color:var(--editorial-muted)] hover:bg-black/[0.04] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]"
          >
            <PanelLeft className="size-4 rotate-180" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-3 pb-4 pt-3">
            <div className="flex items-center gap-2">
              <Link href="/dashboard" aria-label="Pliny dashboard" className="min-w-0 flex-1 rounded-md px-1 py-1 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]">
                <BrandMark
                  className="h-8 gap-2.5"
                  markClassName="size-8 border-transparent bg-[#0C1427] text-[#FCFBF8] dark:bg-[#F1EDE6] dark:text-[#0B0B0A]"
                  textClassName="text-[15px] font-semibold text-[color:var(--editorial-ink)]"
                />
              </Link>
              <button
                type="button"
                aria-label="Collapse sidebar"
                onClick={() => setIsCollapsed(true)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-[color:var(--editorial-muted)] hover:bg-black/[0.04] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]"
              >
                <PanelLeft className="size-4" aria-hidden="true" />
              </button>
            </div>

            <NewWorkspaceDialog
              label="New Workspace"
              size="default"
              variant="outline"
              className="mt-4 h-9 w-full justify-start rounded-lg border-black/10 bg-transparent px-3 text-sm font-medium text-[color:var(--editorial-ink)] shadow-none hover:bg-black/[0.04] dark:border-[color:var(--editorial-border-soft)] dark:hover:bg-[var(--editorial-card)]"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <SidebarSection label="Workspaces">
              {visibleCollections.length > 0 ? (
                <div className="space-y-0.5">
                  {visibleCollections.map((workspace) => {
                    const isActive = workspace.id === collection.id;

                    return (
                      <Link
                        key={workspace.id}
                        href={`/collection/${workspace.id}`}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "block truncate rounded-md border-l-2 px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35",
                          isActive
                            ? "border-[#BA5C3D] bg-black/[0.04] font-medium text-[color:var(--editorial-ink)] dark:bg-[#D07A5F]/10"
                            : "border-transparent text-[color:var(--editorial-muted)] hover:bg-black/[0.035] hover:text-[color:var(--editorial-ink)] dark:hover:bg-[var(--editorial-card)]"
                        )}
                        title={workspace.name}
                      >
                        {truncateText(workspace.name, 24)}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="px-3 text-xs text-[color:var(--editorial-muted)]">No workspaces yet</p>
              )}
            </SidebarSection>

            <SidebarSection label="Recent">
              {visibleRecents.length > 0 ? (
                <div className="space-y-0.5">
                  {visibleRecents.map((recent) => (
                    <Link
                      key={`${recent.collectionId}-${recent.createdAt}-${recent.message}`}
                      href={`/collection/${recent.collectionId}`}
                      className="block rounded-md px-3 py-2 transition-colors hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35 dark:hover:bg-[var(--editorial-card)]"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-[color:var(--editorial-ink)]" title={recent.collectionName}>
                          {truncateText(recent.collectionName, 24)}
                        </span>
                        <span className="shrink-0 text-[11px] text-[color:var(--editorial-muted)]">{formatRecentDate(recent.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--editorial-muted)]" title={recent.message}>
                        {truncateText(recent.message, 40)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-3 text-xs text-[color:var(--editorial-muted)]">No recent chats</p>
              )}
            </SidebarSection>
          </div>

          <div className="shrink-0 border-t border-black/[0.08] px-4 py-4 dark:border-[color:var(--editorial-border-soft)]">
            <p className="truncate text-xs text-[color:var(--editorial-muted)]" title={userEmail ?? undefined}>
              {userEmail ?? "Signed in"}
            </p>
            <form action={logout} className="mt-2">
              <button
                type="submit"
                className="text-xs font-medium text-[color:var(--editorial-muted)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </aside>
  );
}

function SidebarSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--editorial-muted)]">
        {label}
      </h2>
      {children}
    </section>
  );
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatRecentDate(value: string) {
  if (value === "Just now") {
    return "Today";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "Today";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(date);
}
