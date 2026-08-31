import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-[#BA5C3D]/50 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/15 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-[#BA5C3D]/25 bg-[var(--editorial-rust-soft)] text-[color:var(--editorial-rust-strong)] [a]:hover:bg-[var(--editorial-rust-soft)]",
        secondary:
          "border-[color:var(--editorial-border)] bg-[var(--editorial-panel)] text-[color:var(--editorial-ink-soft)] [a]:hover:bg-[var(--editorial-card)]",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        outline:
          "border-[color:var(--editorial-border)] bg-transparent text-[color:var(--editorial-muted)] [a]:hover:bg-[var(--editorial-panel)] [a]:hover:text-[color:var(--editorial-ink)]",
        ghost:
          "text-[color:var(--editorial-muted)] hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)]",
        link: "text-[color:var(--editorial-rust-strong)] underline-offset-4 hover:text-[color:var(--editorial-rust)] hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
