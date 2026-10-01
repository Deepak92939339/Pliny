import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        neutral:
          "rounded-full border-[var(--rule)] bg-[var(--paper-0)] text-[var(--ink-700)] px-2.5 py-0.5 text-xs",
        accent:
          "rounded-full border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-ink)] px-2.5 py-0.5 text-xs",
        ok:
          "rounded-full border-[var(--ok)]/30 bg-[var(--ok-soft)] text-[var(--ok-ink)] px-2.5 py-0.5 text-xs",
        danger:
          "rounded-full border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger-ink)] px-2.5 py-0.5 text-xs",
        "mono-label":
          "rounded-sm border-[var(--rule-strong)] bg-[var(--paper-0)] font-mono text-[11px] font-semibold tracking-wide text-[var(--ink-700)] px-1.5 py-0.5",
        // Backward-compatible aliases
        default:
          "rounded-full border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-ink)] px-2.5 py-0.5 text-xs",
        secondary:
          "rounded-full border-[var(--rule)] bg-[var(--paper-0)] text-[var(--ink-700)] px-2.5 py-0.5 text-xs",
        destructive:
          "rounded-full border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger-ink)] px-2.5 py-0.5 text-xs",
        outline:
          "rounded-full border-[var(--rule)] bg-transparent text-[var(--ink-500)] px-2.5 py-0.5 text-xs",
        ghost:
          "rounded-full border-transparent bg-transparent text-[var(--ink-500)] px-2.5 py-0.5 text-xs hover:bg-[var(--paper-0)]",
        link: "border-0 bg-transparent text-[var(--accent-ink)] hover:underline p-0 text-xs",
      },
      size: {
        sm: "text-[11px] px-2 py-0.5",
        md: "text-xs px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = "neutral", size = "md", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants, type BadgeProps };
