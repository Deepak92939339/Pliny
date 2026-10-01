"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { buttonVariants } from "@/components/ui/Button";
import { LandingInfoDialog } from "@/components/landing/LandingInfoDialog";
import { landingInfoPages } from "@/components/landing/infoContent";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  variant?: "marketing" | "info";
  className?: string;
}

export function SiteHeader({ variant = "marketing", className }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 border-b border-[var(--rule)] bg-[var(--paper-2)]/95 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[var(--container-page)] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Pliny home"
          className="shrink-0 text-[var(--ink-900)] transition-colors hover:text-[var(--accent-ink)]"
        >
          <BrandMark
            markClassName="size-6"
            textClassName="dm-editorial-display text-xl font-semibold"
          />
        </Link>

        {variant === "marketing" ? (
          <>
            {/* Center Desktop Navigation */}
            <nav
              className="hidden items-center gap-6 text-[13px] font-medium text-[var(--ink-700)] md:flex"
              aria-label="Main navigation"
            >
              {landingInfoPages.map((page) => (
                <LandingInfoDialog key={page.key} page={page} />
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:text-[var(--accent)]"
              >
                Sign in
              </Link>
              <Link
                href="/access"
                className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
              >
                Request access
              </Link>
              <button
                ref={menuTriggerRef}
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--rule)] text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-0)] md:hidden"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-panel"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                {mobileMenuOpen ? (
                  <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Menu className="size-4" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Mobile Dropdown Panel */}
            {mobileMenuOpen && (
              <div
                ref={menuPanelRef}
                id="mobile-nav-panel"
                className="absolute right-4 top-16 z-50 grid w-64 gap-1 rounded-lg border border-[var(--rule-strong)] bg-[var(--paper-1)] p-2 shadow-[var(--shadow-2)] md:hidden"
              >
                {landingInfoPages.map((page) => (
                  <LandingInfoDialog
                    key={page.key}
                    page={page}
                    triggerClassName="w-full px-3 py-2 text-left text-sm hover:bg-[var(--paper-0)] rounded-md"
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-500)] transition-colors hover:text-[var(--accent-ink)]"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Back home</span>
          </Link>
        )}
      </div>
    </header>
  );
}
