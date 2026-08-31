"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LandingInfoPage } from "./infoContent";

export function LandingInfoDialog({ page, triggerClassName }: { page: LandingInfoPage; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function focusDialog() {
    document.querySelector<HTMLElement>('[data-slot="dialog-content"]')?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(focusDialog, 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    window.setTimeout(nextOpen ? focusDialog : () => triggerRef.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            className={cn("rounded-sm text-left transition-colors hover:text-[#8D3F28] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25", triggerClassName)}
          />
        }
      >
        {page.label}
      </DialogTrigger>
      <DialogContent showCloseButton={false} initialFocus aria-modal="true" className="max-w-[min(30rem,calc(100%-2rem))] gap-6 p-6 sm:p-7">
        <DialogHeader className="pr-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BA5C3D]">Pliny / {page.label}</p>
          <DialogTitle className="dm-editorial-display text-[30px] leading-[1.05] tracking-[-0.035em]">{page.title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-6 text-[#596170]">
            A concise view of what is active in this release.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 border-y border-[#E5E0D8] py-5 text-[13px] leading-5 text-[#394152]">
          {page.summary.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#BA5C3D]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-4">
          <Link href={page.href} className="text-[13px] font-semibold text-[#8D3F28] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">
            {page.key === "about" ? "Read the full story" : "Read full details"}
          </Link>
          <DialogClose className="rounded-sm px-2 py-1.5 text-[13px] font-semibold text-[#596170] hover:bg-[#F5F0E8] hover:text-[#0C1427] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">
            Close
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
