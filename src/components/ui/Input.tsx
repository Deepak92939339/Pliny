import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-[color:var(--editorial-border)] bg-[var(--editorial-card)] px-3 py-1 text-base text-[color:var(--editorial-ink)] shadow-inner shadow-black/10 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[color:var(--editorial-ink)] placeholder:text-[color:var(--editorial-muted)] focus-visible:border-[#BA5C3D]/45 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--editorial-panel)] disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
