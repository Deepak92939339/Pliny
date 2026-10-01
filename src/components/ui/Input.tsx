import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

interface InputProps extends React.ComponentProps<"input"> {
  icon?: React.ReactNode;
  endIcon?: React.ReactNode;
  error?: string | boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, icon, endIcon, error, id, ...props },
  ref
) {
  const hasError = Boolean(error);
  const errorMessage = typeof error === "string" ? error : undefined;

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        {icon && (
          <div className="pointer-events-none absolute left-3 flex items-center justify-center text-[var(--ink-500)] [&_svg]:size-4">
            {icon}
          </div>
        )}
        <InputPrimitive
          ref={ref}
          id={id}
          type={type}
          data-slot="input"
          aria-invalid={hasError ? "true" : undefined}
          className={cn(
            "h-10 w-full min-w-0 rounded-md border border-[var(--rule-strong)] bg-[var(--paper-1)] px-3 text-sm text-[var(--ink-900)] transition-colors duration-150 outline-none placeholder:text-[var(--ink-500)]",
            "focus-visible:border-[var(--accent-ink)] focus-visible:outline-none",
            hasError && "border-[var(--danger)] text-[var(--danger-ink)] focus-visible:border-[var(--danger)]",
            icon && "pl-9",
            endIcon && "pr-9",
            className
          )}
          {...props}
        />
        {endIcon && (
          <div className="absolute right-3 flex items-center justify-center text-[var(--ink-500)] [&_svg]:size-4">
            {endIcon}
          </div>
        )}
      </div>
      {errorMessage && (
        <p className="mt-1.5 text-xs text-[var(--danger-ink)]" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";

export { Input, type InputProps };
