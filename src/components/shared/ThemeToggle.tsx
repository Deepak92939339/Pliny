"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  tone?: "default" | "editorial";
};

export function ThemeToggle({ tone = "default" }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = mounted ? resolvedTheme === "dark" : true;
  const isLight = !isDark;
  const isEditorial = tone === "editorial";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isEditorial) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 outline-none shadow-inner transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/20",
          isDark ? "border-[color:var(--editorial-border)] bg-[var(--editorial-card)]" : "border-[#D5D2C8] bg-[#EBE9E2]"
        )}
      >
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ease-out will-change-transform",
            isDark && "translate-x-6"
          )}
        >
          {isDark ? (
            <Moon className="size-3.5 text-[#0B0B0A]" aria-hidden="true" />
          ) : (
            <Sun className="size-3.5 text-[#BA5C3D]" aria-hidden="true" />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={cn(
        "relative inline-flex h-11 w-20 shrink-0 items-center rounded-full border p-1 outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        "border-[color:var(--editorial-border)] bg-[var(--editorial-panel)] text-[color:var(--editorial-muted)] shadow-sm shadow-black/20 hover:border-[#BA5C3D]/30 focus-visible:border-[#BA5C3D]/50 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/15"
      )}
    >
      <span className="absolute left-3 flex items-center text-zinc-500">
        <Moon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="absolute right-3 flex items-center text-zinc-500">
        <Sun className="size-3.5" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "relative z-10 flex size-9 items-center justify-center rounded-full border transition-transform duration-200 ease-out will-change-transform",
          "border-[color:var(--editorial-border)] bg-[var(--editorial-card)] text-[color:var(--editorial-rust)] shadow-sm shadow-black/20",
          isLight && "translate-x-9 bg-white text-[#BA5C3D] shadow-slate-200/70"
        )}
      >
        {isLight ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
      </span>
    </button>
  );
}
