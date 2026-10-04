import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-[var(--danger)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--ink-900)] bg-[var(--ink-900)] text-[var(--paper-2)] hover:opacity-90 [a]:hover:bg-[var(--ink-900)]",
        default:
          "border-[var(--ink-900)] bg-[var(--ink-900)] text-[var(--paper-2)] hover:opacity-90 [a]:hover:bg-[var(--ink-900)]",
        secondary:
          "border-[var(--rule)] bg-[var(--paper-1)] text-[var(--ink-900)] hover:border-[var(--rule-strong)] hover:bg-[var(--paper-0)]",
        outline:
          "border-[var(--rule)] bg-[var(--paper-1)] text-[var(--ink-900)] hover:border-[var(--rule-strong)] hover:bg-[var(--paper-0)]",
        ghost:
          "text-[var(--ink-700)] hover:bg-[var(--paper-0)] hover:text-[var(--ink-900)]",
        destructive:
          "border border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger-ink)] hover:bg-[var(--danger)]/20",
        link: "border-0 bg-transparent text-[var(--accent-ink)] hover:text-[var(--accent)] hover:underline p-0 h-auto font-medium",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 gap-2 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        default: "h-10 gap-2 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2.5 px-5 text-sm font-semibold [&_svg:not([class*='size-'])]:size-4",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref
) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
});

Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
