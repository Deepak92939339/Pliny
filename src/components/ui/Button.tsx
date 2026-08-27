import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:border-[#BA5C3D]/55 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/18 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-[#0C1427] bg-[#0C1427] text-[#FCFBF8] shadow-sm shadow-black/10 hover:bg-[#17213A] dark:border-[#D07A5F] dark:bg-[#D07A5F] dark:text-[#0B0B0A] dark:hover:bg-[#E0A083] [a]:hover:bg-[#17213A]",
        outline:
          "border-[color:var(--editorial-border)] bg-[var(--editorial-card)] text-[color:var(--editorial-ink)] hover:border-[#BA5C3D]/35 hover:bg-[var(--editorial-panel)] aria-expanded:bg-[var(--editorial-panel)]",
        secondary:
          "border-[color:var(--editorial-border)] bg-[var(--editorial-panel)] text-[color:var(--editorial-ink)] hover:border-[#BA5C3D]/35 hover:bg-[var(--editorial-card)] aria-expanded:bg-[var(--editorial-card)]",
        ghost:
          "text-[color:var(--editorial-muted)] hover:bg-[var(--editorial-panel)] hover:text-[color:var(--editorial-ink)] aria-expanded:bg-[var(--editorial-panel)]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-[color:var(--editorial-rust-strong)] underline-offset-4 hover:text-[color:var(--editorial-rust)] hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-7 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-10",
        "icon-xs":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
