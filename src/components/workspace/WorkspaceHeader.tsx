"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { PROCESSING_BOUNDARY_PARAGRAPHS, PROCESSING_BOUNDARY_TITLE } from "@/lib/privacy/disclosure";

type WorkspaceHeaderProps = {
  canExportTranscript?: boolean;
  documentCount: number;
  onExportTranscript?: () => void;
  userEmail?: string | null;
  workspaceName: string;
};

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getDocumentCountLabel(count: number) {
  return `${count} ${count === 1 ? "document" : "documents"}`;
}

function getInitial(value?: string | null) {
  return value?.trim().charAt(0).toUpperCase() || "U";
}

export function WorkspaceHeader({ canExportTranscript = false, documentCount, onExportTranscript, userEmail, workspaceName }: WorkspaceHeaderProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isBoundaryOpen, setIsBoundaryOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-4 text-[color:var(--editorial-ink)]">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-medium leading-5" title={workspaceName}>
          {truncateText(workspaceName, 32)}
        </h1>
        <p className="text-[11px] leading-4 text-[color:var(--editorial-muted)]">{getDocumentCountLabel(documentCount)}</p>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        {onExportTranscript ? (
          <button
            type="button"
            disabled={!canExportTranscript}
            onClick={onExportTranscript}
            className="hidden rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25 sm:inline-flex"
          >
            Export transcript
          </button>
        ) : null}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isBoundaryOpen}
            aria-controls="processing-boundary-popover"
            onClick={() => {
              setIsBoundaryOpen((current) => !current);
              setIsAccountOpen(false);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] px-2.5 text-xs font-medium text-[color:var(--editorial-muted)] transition-colors hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/25"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Processing boundary
          </button>
          {isBoundaryOpen ? (
            <div
              id="processing-boundary-popover"
              role="dialog"
              aria-label="Processing boundary"
              className="fixed left-4 right-4 top-14 z-40 rounded-lg border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] p-4 shadow-lg shadow-[rgba(72,48,31,0.10)] sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-[340px]"
            >
              <h2 className="text-sm font-semibold text-[color:var(--editorial-ink)]">{PROCESSING_BOUNDARY_TITLE}</h2>
              <p className="mt-2 text-xs leading-5 text-[color:var(--editorial-muted)]">{PROCESSING_BOUNDARY_PARAGRAPHS[0]}</p>
              <p className="mt-2 text-xs font-medium leading-5 text-[color:var(--editorial-ink-soft)]">{PROCESSING_BOUNDARY_PARAGRAPHS[1]}</p>
              <Link href="/privacy" className="mt-3 inline-flex text-xs font-medium text-[color:var(--editorial-rust-strong)] underline-offset-2 hover:underline">
                Data Privacy details
              </Link>
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isAccountOpen}
            aria-label="Open account menu"
            onClick={() => {
              setIsAccountOpen((current) => !current);
              setIsBoundaryOpen(false);
            }}
            className="flex size-8 items-center justify-center rounded-full bg-[#BA5C3D] text-sm font-semibold !text-white outline-none hover:bg-[#A8421F] focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
          >
            {getInitial(userEmail)}
          </button>
          {isAccountOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-10 z-30 w-56 rounded-lg border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-card)] p-2 shadow-lg shadow-[rgba(72,48,31,0.08)]"
            >
              <p className="truncate px-2 py-2 text-xs text-[color:var(--editorial-muted)]" title={userEmail ?? undefined}>
                {userEmail ?? "Signed in"}
              </p>
              <form action={logout}>
                <button
                  type="submit"
                  role="menuitem"
                  className="w-full rounded-md px-2 py-2 text-left text-xs font-medium text-[color:var(--editorial-ink)] hover:bg-[var(--editorial-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
