import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export function BrandMark({ className, markClassName, textClassName }: BrandMarkProps) {
  return (
    <span className={cn("flex h-10 items-center gap-3", className)}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[4px] border border-current/15 bg-current",
          markClassName
        )}
        aria-hidden="true"
      >
        <svg className="size-5 shrink-0 text-current" viewBox="0 0 24 24" fill="none">
          <path d="M7.5 4.5v15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M10 6.5h6.25c1.25 0 2.25 1 2.25 2.25v8.5c0 .7-.55 1.25-1.25 1.25H10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M11.75 9.5h4.25M11.75 12.5h3.25" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" opacity="0.72" />
          <path
            d="M5.25 7.25c1.25 0 2.25-1 2.25-2.25M5.25 16.75c1.25 0 2.25 1 2.25 2.25"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className={cn("text-xl font-semibold leading-none tracking-tight", textClassName)}>Vector</span>
    </span>
  );
}
