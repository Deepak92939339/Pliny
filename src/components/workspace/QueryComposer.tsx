"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type QueryComposerProps = {
  isSearching?: boolean;
  onSubmit: (query: string) => void;
};

export function QueryComposer({ isSearching = false, onSubmit }: QueryComposerProps) {
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedQuery = query.trim();
  const canSubmit = Boolean(trimmedQuery) && !isSearching;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [query]);

  function submitQuery() {
    if (!trimmedQuery || isSearching) {
      return;
    }

    onSubmit(trimmedQuery);
    setQuery("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuery();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || isSearching) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitQuery();
  }

  return (
    <div className="shrink-0 border-t border-transparent px-4 pb-6 pt-3 dark:border-[color:var(--editorial-border-soft)] dark:bg-[var(--editorial-page)]">
      <div className="mx-auto max-w-[720px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-black/[0.08] bg-[#FFFEFA]/90 p-2.5 shadow-[0_1px_10px_rgba(12,20,39,0.04)] focus-within:border-[#BA5C3D]/40 focus-within:ring-2 focus-within:ring-[#BA5C3D]/10 dark:border-[color:var(--editorial-border)] dark:bg-[var(--editorial-card)] dark:shadow-[0_14px_36px_rgba(0,0,0,0.24)]"
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Attach document"
              disabled
              className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[color:var(--editorial-muted)] opacity-50"
              title="Attach from the document panel"
            >
              <Plus className="size-[18px]" aria-hidden="true" />
            </button>
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="max-h-36 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2.5 text-[15px] leading-6 text-[color:var(--editorial-ink)] outline-none placeholder:text-[color:var(--editorial-muted)]"
              placeholder="Ask about your documents…"
            />
            <button
              type="submit"
              aria-label="Send question"
              disabled={!canSubmit}
              className={cn(
                "mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/30 disabled:pointer-events-none",
                canSubmit
                  ? "border-[#0C1427] bg-[#0C1427] text-white hover:bg-[#17213A] dark:border-[#D07A5F] dark:bg-[#D07A5F] dark:text-[#0B0B0A] dark:hover:bg-[#E0A083]"
                  : "border-black/[0.08] bg-black/[0.045] text-[color:var(--editorial-muted)] dark:border-[color:var(--editorial-border-soft)] dark:bg-[var(--editorial-panel)]"
              )}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
        <p className="mt-2 text-center text-xs text-[color:var(--editorial-muted)]">
          Vector searches your uploaded documents only
        </p>
      </div>
    </div>
  );
}
